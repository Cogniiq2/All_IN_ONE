/**
 * ══════════════════════════════════════════════════════════════════════════
 * GUEST INVOICES — § 14 UStG, and nothing that guesses.
 *
 * `invoiceRequirements` lists what § 14 Abs. 4 UStG demands on an invoice
 * and checks a draft against it; `buildDraft` turns a paid stay (plus any
 * minibar sales) into lines with a tax code per line; `canIssue` is the
 * fail-closed gate: no issuer identity, no tax id, no decided tax code on
 * every line, no series → no invoice. Numbers are drawn only at issue time
 * from `bolagio_next_invoice_number` (gapless per series), by the command in
 * `commands.ts`.
 *
 * Nothing here sends anything, renders a PDF, or touches the payment
 * provider. E-invoice (XRechnung / ZUGFeRD) generation is behind the gate in
 * `lib/finance/e-invoice.ts`.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { splitGross, type Cents } from '@/lib/finance/money';
import { requireTaxCode, taxCode as taxCodeOf } from '@/lib/finance/tax-codes';
import type { FinanceConfigSnapshot } from '@/lib/finance/config-shape';

export interface DraftLine {
  lineNo: number;
  description: string;
  quantity: number;
  category: string;
  taxCode: string;
  rateBp: number;
  netCents: Cents;
  vatCents: Cents;
  grossCents: Cents;
}

export interface InvoiceDraft {
  kind: 'invoice' | 'credit_note';
  recipient: { name: string; address: string | null; company: string | null; vatId: string | null; country: string | null };
  bookingIntentId: string | null;
  bookingReference: string | null;
  unitId: string | null;
  serviceFrom: string | null;
  serviceTo: string | null;
  currency: string;
  lines: DraftLine[];
  netCents: Cents;
  vatCents: Cents;
  grossCents: Cents;
  correctsInvoiceId?: string | null;
}

/** § 14 Abs. 4 UStG mandatory contents, as checks. */
export interface Requirement {
  code: string;
  legal: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export function invoiceRequirements(draft: InvoiceDraft, config: FinanceConfigSnapshot): Requirement[] {
  const undecided = draft.lines.filter((l) => taxCodeOf(l.taxCode)?.reviewRequired);
  const sumsOk = draft.lines.every((l) => l.grossCents === l.netCents + l.vatCents) && draft.netCents === draft.lines.reduce((s, l) => s + l.netCents, 0) && draft.vatCents === draft.lines.reduce((s, l) => s + l.vatCents, 0);
  return [
    { code: 'issuer_name_address', legal: '§ 14 Abs. 4 Nr. 1', label: 'Full name and address of the issuer', ok: Boolean(config.issuerLegalName && config.issuerAddress) },
    { code: 'recipient_name_address', legal: '§ 14 Abs. 4 Nr. 1', label: 'Full name and address of the recipient', ok: Boolean(draft.recipient.name && draft.recipient.address), detail: draft.recipient.address ? undefined : 'The booking has no postal address on record.' },
    { code: 'tax_id', legal: '§ 14 Abs. 4 Nr. 2', label: 'Steuernummer or USt-IdNr of the issuer', ok: Boolean(config.issuerTaxIdConfigured) },
    { code: 'issue_date', legal: '§ 14 Abs. 4 Nr. 3', label: 'Issue date', ok: true, detail: 'Set at issue time.' },
    { code: 'number', legal: '§ 14 Abs. 4 Nr. 4', label: 'Sequential unique invoice number', ok: Boolean(config.invoiceSeries), detail: config.invoiceSeries ? `Series ${config.invoiceSeries}, drawn gaplessly at issue.` : 'No series configured (INVOICE_SERIES).' },
    { code: 'quantity_description', legal: '§ 14 Abs. 4 Nr. 5', label: 'Quantity and description of each supply', ok: draft.lines.length > 0 && draft.lines.every((l) => l.description.trim() !== '' && l.quantity > 0) },
    { code: 'service_date', legal: '§ 14 Abs. 4 Nr. 6', label: 'Date or period of the supply', ok: Boolean(draft.serviceFrom && draft.serviceTo) },
    { code: 'net_by_rate', legal: '§ 14 Abs. 4 Nr. 7', label: 'Net amount per rate, with any agreed reduction', ok: sumsOk },
    { code: 'rate_and_vat', legal: '§ 14 Abs. 4 Nr. 8', label: 'Applicable rate and VAT amount per line (or exemption note)', ok: undecided.length === 0, detail: undecided.length ? `${undecided.length} line(s) under a review-required code.` : undefined },
    { code: 'small_business', legal: '§ 19 UStG', label: 'Small-business status decided (regular taxation assumed)', ok: config.smallBusinessScheme === false, detail: config.smallBusinessScheme === null ? 'Not decided.' : undefined },
    { code: 'retention', legal: '§ 14b UStG', label: 'Copy retained (registry + document)', ok: true, detail: 'The issued invoice is stored as a document (8 years).' },
  ];
}

export interface IssueGate {
  ready: boolean;
  blockers: Requirement[];
}

export function canIssue(draft: InvoiceDraft, config: FinanceConfigSnapshot): IssueGate {
  const reqs = invoiceRequirements(draft, config);
  return { ready: reqs.every((r) => r.ok), blockers: reqs.filter((r) => !r.ok) };
}

export interface StayForInvoice {
  intentId: string;
  reference: string;
  unitId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  guestName: string;
  guestAddress: string | null;
  guestCountry: string | null;
  company: string | null;
  companyVatId: string | null;
  /** The quote components as charged: gross each with the tax category Beds24 gave. */
  components: Array<{ code: string; label: string; amountCents: Cents; taxCategory?: string }>;
}

export interface MinibarForInvoice {
  description: string;
  quantity: number;
  unitPriceCents: Cents;
  taxCode: string;
}

/** Map a quote component's tax category to a tax code; ancillary charges stay review-required until decided. */
export function taxCodeForComponent(taxCategory: string | undefined, accommodationCode = 'DE_ACCOMMODATION_REDUCED'): string {
  switch (taxCategory) {
    case 'accommodation': return accommodationCode;
    case 'service': return 'DE_ANCILLARY_REVIEW';
    case 'city_tax': return 'DE_REVIEW_REQUIRED';
    case 'deposit': return 'DE_OUTSIDE_SCOPE';
    default: return 'DE_REVIEW_REQUIRED';
  }
}

export function buildDraft(stay: StayForInvoice, minibar: MinibarForInvoice[] = [], config: FinanceConfigSnapshot): InvoiceDraft {
  const lines: DraftLine[] = [];
  let n = 0;
  for (const c of stay.components) {
    n += 1;
    const code = taxCodeForComponent(c.taxCategory, config.accommodationTaxCode ?? 'DE_ACCOMMODATION_REDUCED');
    const meta = requireTaxCode(code);
    const split = splitGross(c.amountCents, meta.rateBp);
    lines.push({ lineNo: n, description: c.taxCategory === 'accommodation' ? `${c.label} · ${stay.unitName} · ${stay.nights} night${stay.nights === 1 ? '' : 's'} (${stay.checkIn} – ${stay.checkOut})` : c.label, quantity: c.taxCategory === 'accommodation' ? stay.nights : 1, category: c.taxCategory === 'accommodation' ? 'accommodation_revenue' : 'accommodation_ancillary', taxCode: code, rateBp: meta.rateBp, netCents: split.net, vatCents: split.vat, grossCents: split.gross });
  }
  for (const m of minibar) {
    n += 1;
    const meta = requireTaxCode(m.taxCode);
    const gross = m.unitPriceCents * m.quantity;
    const split = splitGross(gross, meta.rateBp);
    lines.push({ lineNo: n, description: `Minibar · ${m.description}`, quantity: m.quantity, category: 'minibar_sales', taxCode: m.taxCode, rateBp: meta.rateBp, netCents: split.net, vatCents: split.vat, grossCents: split.gross });
  }
  return {
    kind: 'invoice',
    recipient: { name: stay.guestName, address: stay.guestAddress, company: stay.company, vatId: stay.companyVatId, country: stay.guestCountry },
    bookingIntentId: stay.intentId, bookingReference: stay.reference, unitId: stay.unitId, serviceFrom: stay.checkIn, serviceTo: stay.checkOut, currency: stay.currency,
    lines, netCents: lines.reduce((s, l) => s + l.netCents, 0), vatCents: lines.reduce((s, l) => s + l.vatCents, 0), grossCents: lines.reduce((s, l) => s + l.grossCents, 0),
  };
}

/** A credit note mirrors an issued invoice (whole or a subset of lines) with negative amounts. */
export function buildCreditNote(original: InvoiceDraft & { id: string }, lineNos: number[] | null, reason: string): InvoiceDraft {
  const lines = original.lines.filter((l) => !lineNos || lineNos.includes(l.lineNo)).map((l, i) => ({ ...l, lineNo: i + 1, description: `Credit: ${l.description}`, netCents: -l.netCents, vatCents: -l.vatCents, grossCents: -l.grossCents }));
  return { ...original, kind: 'credit_note', correctsInvoiceId: original.id, lines, netCents: lines.reduce((s, l) => s + l.netCents, 0), vatCents: lines.reduce((s, l) => s + l.vatCents, 0), grossCents: lines.reduce((s, l) => s + l.grossCents, 0), recipient: { ...original.recipient }, bookingReference: original.bookingReference ? `${original.bookingReference} · ${reason.slice(0, 60)}` : reason.slice(0, 80) };
}

/** Sum by rate for the invoice footer (§ 14 Abs. 4 Nr. 7, 8). */
export function totalsByRate(lines: readonly DraftLine[]): Array<{ rateBp: number; netCents: Cents; vatCents: Cents; grossCents: Cents; label: string }> {
  const m = new Map<number, { net: Cents; vat: Cents; gross: Cents }>();
  for (const l of lines) {
    const cur = m.get(l.rateBp) ?? { net: 0, vat: 0, gross: 0 };
    cur.net += l.netCents; cur.vat += l.vatCents; cur.gross += l.grossCents;
    m.set(l.rateBp, cur);
  }
  return Array.from(m.entries()).sort(([a], [b]) => b - a).map(([rateBp, v]) => ({ rateBp, netCents: v.net, vatCents: v.vat, grossCents: v.gross, label: `${rateBp / 100} %` }));
}
