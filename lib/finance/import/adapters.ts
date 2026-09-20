/**
 * ══════════════════════════════════════════════════════════════════════════
 * IMPORT ADAPTERS — parse, validate, stage. Never post.
 *
 * Each adapter turns a CSV into STAGED rows with a status per row. The
 * runner writes them to `bolagio_finance_import_rows`; a person previews;
 * only then does `importBatch` post transactions/payments through the
 * command functions, which are idempotent on the row's provider reference.
 *
 * Production-readiness is a property of each adapter, declared here and
 * shown in the UI:
 *   validated     the format is BoLaGio's own, or was validated against a
 *                 real statement — safe to use
 *   experimental  built from documented column names, NOT validated against
 *                 a real export; the header check is strict and the UI says
 *                 "experimental" on every screen that shows it
 *
 * Adapters:
 *   bolagio_bank_csv        our own documented bank template (validated)
 *   bolagio_expenses_csv    our own documented expense template (validated)
 *   paypal_activity         PayPal "Activity download" (experimental)
 *   booking_com_reservations Booking.com reservations statement (experimental)
 *   booking_com_payouts     Booking.com payout report (experimental)
 * ══════════════════════════════════════════════════════════════════════════
 */

import { parseDecimalToCents } from '@/lib/finance/money';
import { parseCsv, parseDateLoose, type ParsedCsv } from '@/lib/finance/import/csv';

export type AdapterId = 'bolagio_bank_csv' | 'bolagio_expenses_csv' | 'paypal_activity' | 'booking_com_reservations' | 'booking_com_payouts';
export type AdapterReadiness = 'validated' | 'experimental';

export interface StagedPayment {
  target: 'payment';
  direction: 'in' | 'out';
  source: 'paypal' | 'booking_com_payout' | 'bank';
  providerReference: string;
  amountCents: number;
  feeCents: number;
  currency: string;
  occurredAt: string;
  valueDate: string | null;
  counterpartyLabel: string | null;
  referenceText: string | null;
  bookingReference: string | null;
  kind: 'receipt' | 'refund' | 'payout' | 'disbursement' | 'fee' | 'transfer' | 'tax' | 'unknown';
}

export interface StagedExpense {
  target: 'expense';
  sourceReference: string;
  bookedOn: string;
  invoiceDate: string | null;
  dueOn: string | null;
  counterpartyName: string;
  counterpartyCountry: string | null;
  counterpartyVatId: string | null;
  supplierInvoiceNo: string | null;
  description: string;
  categoryHint: string | null;
  unitSlug: string | null;
  netCents: number;
  vatCents: number;
  grossCents: number;
  currency: string;
}

export interface StagedRevenue {
  target: 'revenue';
  sourceReference: string;
  channel: 'booking_com';
  bookingReference: string;
  unitHint: string | null;
  checkIn: string;
  checkOut: string;
  grossCents: number;
  commissionCents: number | null;
  status: string;
  /**
   * The statement says this reservation was cancelled or a no-show, yet it
   * carries a price. That price is a cancellation charge, not a night sold:
   * whether it is a taxable supply or untaxed compensation (echter
   * Schadensersatz) is exactly the kind of question this system parks for
   * the adviser instead of answering at 7 %.
   */
  cancelled: boolean;
  currency: string;
  guestLabel: string | null;
}

export type StagedRow = StagedPayment | StagedExpense | StagedRevenue;

export interface StagingResult {
  adapter: AdapterId;
  adapterVersion: string;
  readiness: AdapterReadiness;
  headers: string[];
  rows: Array<{ rowNo: number; raw: Record<string, string>; parsed: StagedRow | null; status: 'valid' | 'error' | 'duplicate'; error: string | null }>;
  rowCount: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  /** Fatal: the file is not this format. */
  rejected: string | null;
}

export interface AdapterSpec {
  id: AdapterId;
  label: string;
  readiness: AdapterReadiness;
  version: string;
  sourceType: 'bank_csv' | 'supplier_csv' | 'paypal_activity' | 'booking_com_reservations' | 'booking_com_payouts';
  requiredHeaders: string[];
  description: string;
}

export const ADAPTERS: readonly AdapterSpec[] = [
  { id: 'bolagio_bank_csv', label: 'Bank statement (BoLaGio template)', readiness: 'validated', version: '1.0', sourceType: 'bank_csv', requiredHeaders: ['Buchungstag', 'Betrag', 'Verwendungszweck'], description: 'Columns: Buchungstag; Valuta (optional); Betrag (signed, German decimal); Auftraggeber/Empfaenger; Verwendungszweck; Transaktions-ID (optional, else a hash of the row). Export any bank CSV into this shape.' },
  { id: 'bolagio_expenses_csv', label: 'Expenses (BoLaGio template)', readiness: 'validated', version: '1.0', sourceType: 'supplier_csv', requiredHeaders: ['Datum', 'Lieferant', 'Brutto', 'Beschreibung'], description: 'Columns: Datum; Rechnungsdatum; Faellig; Lieferant; Land; USt-ID; Rechnungsnummer; Beschreibung; Kategorie; Einheit; Netto; USt; Brutto.' },
  { id: 'paypal_activity', label: 'PayPal activity download', readiness: 'experimental', version: '0.1', sourceType: 'paypal_activity', requiredHeaders: ['Date', 'Type', 'Gross', 'Fee', 'Net', 'Transaction ID'], description: 'PayPal → Activity → Download, "all transactions" CSV, English headers. Not validated against a live download; check the preview.' },
  { id: 'booking_com_reservations', label: 'Booking.com reservation statement', readiness: 'experimental', version: '0.1', sourceType: 'booking_com_reservations', requiredHeaders: ['Book number', 'Check-in', 'Check-out', 'Status', 'Price', 'Commission amount'], description: 'Extranet → Reservations → Download, CSV. Not validated against a live export; the header check is strict.' },
  { id: 'booking_com_payouts', label: 'Booking.com payout report', readiness: 'experimental', version: '0.1', sourceType: 'booking_com_payouts', requiredHeaders: ['Payout date', 'Payout amount', 'Payout ID'], description: 'Extranet → Finance → Payouts, CSV. Not validated against a live export.' },
];

export function adapterSpec(id: AdapterId): AdapterSpec {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown adapter ${id}`);
  return a;
}

/** Choose an adapter by headers, or null when nothing fits. */
export function detectAdapter(headers: string[]): AdapterSpec | null {
  const set = new Set(headers.map((h) => h.trim()));
  return ADAPTERS.find((a) => a.requiredHeaders.every((h) => set.has(h))) ?? null;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function stageCsv(adapterId: AdapterId, text: string): Promise<StagingResult> {
  const spec = adapterSpec(adapterId);
  const csv = parseCsv(text);
  const base: StagingResult = { adapter: spec.id, adapterVersion: spec.version, readiness: spec.readiness, headers: csv.headers, rows: [], rowCount: 0, validRows: 0, errorRows: 0, duplicateRows: 0, rejected: null };
  const missing = spec.requiredHeaders.filter((h) => !csv.headers.includes(h));
  if (missing.length > 0) return { ...base, rejected: `Not a ${spec.label} file: missing column${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.` };
  const seen = new Set<string>();
  const out = base;
  const push = (rowNo: number, raw: Record<string, string>, parsed: StagedRow | null, error: string | null) => {
    let status: 'valid' | 'error' | 'duplicate' = parsed && !error ? 'valid' : 'error';
    const key = parsed ? (parsed.target === 'payment' ? `${parsed.source}:${parsed.providerReference}` : parsed.sourceReference) : null;
    if (key) {
      if (seen.has(key)) status = 'duplicate';
      seen.add(key);
    }
    out.rows.push({ rowNo, raw, parsed, status, error: status === 'duplicate' ? 'Duplicate of an earlier row in this file.' : error });
    out.rowCount += 1;
    if (status === 'valid') out.validRows += 1; else if (status === 'error') out.errorRows += 1; else out.duplicateRows += 1;
  };
  for (let idx = 0; idx < csv.rows.length; idx += 1) {
    const raw = csv.rows[idx];
    const rowNo = idx + 2;
    try {
      const parsed = await parseRow(spec, raw, csv);
      push(rowNo, raw, parsed.row, parsed.error);
    } catch (cause) {
      push(rowNo, raw, null, cause instanceof Error ? cause.message : 'unparseable');
    }
  }
  for (const line of csv.malformed) push(line, {}, null, 'Field count does not match the header.');
  return out;
}

async function parseRow(spec: AdapterSpec, r: Record<string, string>, csv: ParsedCsv): Promise<{ row: StagedRow | null; error: string | null }> {
  void csv;
  switch (spec.id) {
    case 'bolagio_bank_csv': {
      const date = parseDateLoose(r.Buchungstag);
      const amount = parseDecimalToCents(r.Betrag);
      if (!date) return { row: null, error: 'Buchungstag is not a date.' };
      if (amount === null || amount === 0) return { row: null, error: 'Betrag is not a non-zero amount.' };
      const ref = (r['Transaktions-ID'] ?? '').trim() || `row:${await sha256Hex(`${date}|${amount}|${r.Verwendungszweck}|${r['Auftraggeber/Empfaenger'] ?? ''}`)}`;
      const purpose = r.Verwendungszweck ?? '';
      const booking = /BLG-[0-9A-Z]{6}/.exec(purpose.toUpperCase())?.[0] ?? null;
      const kind: StagedPayment['kind'] = /finanzamt|finanzkasse|stadtkasse/i.test(`${r['Auftraggeber/Empfaenger']} ${purpose}`) ? 'tax' : /booking\.com/i.test(`${r['Auftraggeber/Empfaenger']} ${purpose}`) ? 'payout' : amount > 0 ? 'receipt' : 'disbursement';
      return { row: { target: 'payment', direction: amount > 0 ? 'in' : 'out', source: 'bank', providerReference: ref, amountCents: Math.abs(amount), feeCents: 0, currency: 'EUR', occurredAt: `${date}T12:00:00+02:00`, valueDate: parseDateLoose(r.Valuta ?? '') ?? null, counterpartyLabel: (r['Auftraggeber/Empfaenger'] ?? '').slice(0, 200) || null, referenceText: purpose.slice(0, 300) || null, bookingReference: booking, kind }, error: null };
    }
    case 'bolagio_expenses_csv': {
      const date = parseDateLoose(r.Datum);
      const gross = parseDecimalToCents(r.Brutto);
      if (!date) return { row: null, error: 'Datum is not a date.' };
      if (gross === null) return { row: null, error: 'Brutto is not an amount.' };
      const net = parseDecimalToCents(r.Netto ?? '');
      const vat = parseDecimalToCents(r.USt ?? '');
      if (net !== null && vat !== null && net + vat !== gross) return { row: null, error: `Netto + USt (${net + vat}) does not equal Brutto (${gross}).` };
      if (!r.Lieferant?.trim()) return { row: null, error: 'Lieferant is empty.' };
      const exCurrency = (r.Waehrung ?? 'EUR').trim().toUpperCase() || 'EUR';
      if (exCurrency !== 'EUR') return { row: null, error: `Waehrung ${exCurrency} is not EUR; nothing here converts currency.` };
      const key = `expense:${await sha256Hex(`${r.Lieferant}|${r.Rechnungsnummer ?? ''}|${date}|${gross}`)}`;
      return { row: { target: 'expense', sourceReference: key, bookedOn: date, invoiceDate: parseDateLoose(r.Rechnungsdatum ?? '') ?? date, dueOn: parseDateLoose(r.Faellig ?? '') ?? null, counterpartyName: r.Lieferant.trim(), counterpartyCountry: (r.Land ?? '').trim().toUpperCase().slice(0, 2) || null, counterpartyVatId: (r['USt-ID'] ?? '').trim() || null, supplierInvoiceNo: (r.Rechnungsnummer ?? '').trim() || null, description: (r.Beschreibung ?? '').trim() || r.Lieferant.trim(), categoryHint: (r.Kategorie ?? '').trim() || null, unitSlug: (r.Einheit ?? '').trim() || null, netCents: net ?? (vat === null ? gross : gross - vat), vatCents: vat ?? (net === null ? 0 : gross - net), grossCents: gross, currency: 'EUR' }, error: null };
    }
    case 'paypal_activity': {
      const date = parseDateLoose(r.Date);
      const gross = parseDecimalToCents(r.Gross);
      const fee = parseDecimalToCents(r.Fee) ?? 0;
      const id = (r['Transaction ID'] ?? '').trim();
      if (!date || gross === null || !id) return { row: null, error: 'Date, Gross or Transaction ID missing.' };
      const type = (r.Type ?? '').toLowerCase();
      const status = (r.Status ?? 'Completed').toLowerCase();
      if (status && status !== 'completed') return { row: null, error: `Status "${r.Status}" is not Completed; only completed movements are cash facts.` };
      const kind: StagedPayment['kind'] = /refund/.test(type) ? 'refund' : /fee/.test(type) ? 'fee' : /withdraw|transfer/.test(type) ? 'transfer' : gross > 0 ? 'receipt' : 'disbursement';
      const ppCurrency = (r.Currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      if (ppCurrency !== 'EUR') return { row: null, error: `Currency ${ppCurrency} is not EUR; nothing here converts currency.` };
      const time = (r.Time ?? '12:00:00').trim();
      return { row: { target: 'payment', direction: gross > 0 ? 'in' : 'out', source: 'paypal', providerReference: id, amountCents: Math.abs(gross), feeCents: Math.abs(fee), currency: ppCurrency, occurredAt: `${date}T${time}+02:00`, valueDate: date, counterpartyLabel: (r.Name ?? '').trim().slice(0, 200) || null, referenceText: ((r['Invoice Number'] ?? '') + ' ' + (r.Note ?? '') + ' ' + (r.Subject ?? '')).trim().slice(0, 300) || null, bookingReference: /BLG-[0-9A-Z]{6}/.exec(`${r['Invoice Number']} ${r.Note} ${r.Subject}`.toUpperCase())?.[0] ?? null, kind }, error: null };
    }
    case 'booking_com_reservations': {
      const ci = parseDateLoose(r['Check-in']);
      const co = parseDateLoose(r['Check-out']);
      const price = parseDecimalToCents(r.Price);
      const commission = parseDecimalToCents(r['Commission amount']);
      const book = (r['Book number'] ?? '').trim();
      if (!book || !ci || !co || price === null) return { row: null, error: 'Book number, Check-in, Check-out or Price missing.' };
      if (co <= ci) return { row: null, error: 'Check-out is not after check-in.' };
      const status = (r.Status ?? '').toLowerCase();
      const cancelled = /cancel|no.?show/.test(status);
      if (cancelled && price === 0) return { row: null, error: `Status "${r.Status}" with no price: nothing to post.` };
      const currency = (r.Currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      if (currency !== 'EUR') return { row: null, error: `Currency ${currency} is not EUR. Nothing here converts currency, and every report sums cents as euros — post this reservation by hand at the rate you booked it.` };
      // An unreadable commission must not become a silent zero: the cost is
      // real and dropping it overstates the margin on every OTA stay.
      const commissionRaw = (r['Commission amount'] ?? '').trim();
      if (commissionRaw && commission === null) return { row: null, error: `Commission amount "${commissionRaw}" is not an amount.` };
      return { row: { target: 'revenue', sourceReference: `bcom:${book}`, channel: 'booking_com', bookingReference: book, unitHint: (r['Rooms'] ?? r['Unit type'] ?? r['Room type'] ?? '').trim() || null, checkIn: ci, checkOut: co, grossCents: price, commissionCents: commission, status: status || 'ok', cancelled, currency, guestLabel: (r['Guest name(s)'] ?? r['Booker'] ?? '').split(' ').filter(Boolean).slice(-1).map((s) => s.slice(0, 1) + '.').join('') || null }, error: null };
    }
    case 'booking_com_payouts': {
      const date = parseDateLoose(r['Payout date']);
      const amount = parseDecimalToCents(r['Payout amount']);
      const id = (r['Payout ID'] ?? '').trim();
      if (!date || amount === null || amount === 0 || !id) return { row: null, error: 'Payout date, amount or ID missing.' };
      const poCurrency = (r.Currency ?? 'EUR').trim().toUpperCase() || 'EUR';
      if (poCurrency !== 'EUR') return { row: null, error: `Currency ${poCurrency} is not EUR; nothing here converts currency.` };
      return { row: { target: 'payment', direction: amount > 0 ? 'in' : 'out', source: 'booking_com_payout', providerReference: id, amountCents: Math.abs(amount), feeCents: 0, currency: poCurrency, occurredAt: `${date}T12:00:00+02:00`, valueDate: date, counterpartyLabel: 'Booking.com', referenceText: (r['Reservations'] ?? r['Reference'] ?? '').slice(0, 300) || null, bookingReference: null, kind: 'payout' }, error: null };
    }
    default:
      return { row: null, error: 'unknown adapter' };
  }
}
