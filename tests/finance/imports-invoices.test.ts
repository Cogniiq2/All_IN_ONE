import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, parseDateLoose, toCsv } from '@/lib/finance/import/csv';
import { ADAPTERS, detectAdapter, stageCsv } from '@/lib/finance/import/adapters';
import { buildCreditNote, buildDraft, canIssue, invoiceRequirements, taxCodeForComponent, totalsByRate, type StayForInvoice } from '@/lib/finance/invoices';
import { EMPTY_FINANCE_CONFIG, type FinanceConfigSnapshot } from '@/lib/finance/config-shape';
import { capturePayment, expectedTurnoverCost, refundPosting, revenuePosting, type BookingFact } from '@/lib/finance/ingestion-rules';
import { ACCEPTED_MIME, RETENTION_CLASSES, detectStructuredFormat, retainUntil, retentionClassFor, sha256Hex } from '@/lib/finance/documents';
import { eInvoiceGate, isDomesticB2B, toEInvoiceModel } from '@/lib/finance/e-invoice';
import { datevGate, proposeDatevRows } from '@/lib/finance/export/datev';
import type { CategoryRow } from '@/lib/finance/rows';
import { line, tx } from './factories';

/* ---------- CSV ---------- */

describe('csv parser', () => {
  it('detects the delimiter, tolerates BOM/CRLF and RFC 4180 quoting, and reports malformed rows', () => {
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a\tb')).toBe('\t');
    const csv = parseCsv('﻿Name;Amount\r\n"Müller; Sohn";"1.234,56"\r\n"say ""hi""";1\r\nonly-one-field\r\n');
    expect(csv.headers).toEqual(['Name', 'Amount']);
    expect(csv.rows[0]).toEqual({ Name: 'Müller; Sohn', Amount: '1.234,56' });
    expect(csv.rows[1].Name).toBe('say "hi"');
    expect(csv.malformed).toEqual([4]);
  });

  it('round-trips through toCsv with German-Excel-friendly semicolons', () => {
    const text = toCsv(['a', 'b'], [['x;y', 12], ['plain', null]]);
    expect(text.startsWith('﻿')).toBe(true);
    const back = parseCsv(text);
    expect(back.rows).toEqual([{ a: 'x;y', b: '12' }, { a: 'plain', b: '' }]);
  });

  it('parses ISO, German and slash dates and rejects the rest', () => {
    expect(parseDateLoose('2026-03-05T10:00')).toBe('2026-03-05');
    expect(parseDateLoose('5.3.2026')).toBe('2026-03-05');
    expect(parseDateLoose('05/03/2026')).toBe('2026-03-05');
    expect(parseDateLoose('March 5')).toBeNull();
  });
});

/* ---------- adapters ---------- */

describe('import adapters', () => {
  it('only the BoLaGio templates and the live-validated Booking.com statement are validated; the assumed Booking.com formats are retired', () => {
    const readiness = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.readiness]));
    expect(readiness).toEqual({ bolagio_bank_csv: 'validated', bolagio_expenses_csv: 'validated', paypal_activity: 'experimental', booking_com_finance_statement: 'validated', booking_com_reservations: 'retired', booking_com_payouts: 'retired' });
  });

  it('detects an adapter by required headers and rejects a file of the wrong shape', async () => {
    expect(detectAdapter(['Buchungstag', 'Betrag', 'Verwendungszweck', 'Extra'])?.id).toBe('bolagio_bank_csv');
    expect(detectAdapter(['foo'])).toBeNull();
    const r = await stageCsv('bolagio_bank_csv', 'Datum;Betrag\n1;2\n');
    expect(r.rejected).toMatch(/missing column/);
    expect(r.rowCount).toBe(0);
  });

  it('stages a bank statement: signed German decimals, booking reference extraction, tax and payout kinds, in-file duplicates', async () => {
    const text = [
      'Buchungstag;Valuta;Betrag;Auftraggeber/Empfaenger;Verwendungszweck;Transaktions-ID',
      '03.03.2026;03.03.2026;300,00;Guest;Ueberweisung BLG-AAA111;T1',
      '04.03.2026;;-1.234,56;Finanzkasse Bayreuth;USt 02/2026;T2',
      '05.03.2026;;2.500,00;Booking.com B.V.;Payout 12345;T3',
      '05.03.2026;;2.500,00;Booking.com B.V.;Payout 12345;T3',
      'kein datum;;10,00;X;Y;T4',
      '06.03.2026;;0,00;X;Y;T5',
    ].join('\n');
    const r = await stageCsv('bolagio_bank_csv', text);
    expect(r.rejected).toBeNull();
    expect({ valid: r.validRows, error: r.errorRows, dup: r.duplicateRows }).toEqual({ valid: 3, error: 2, dup: 1 });
    const rows = r.rows.filter((x) => x.status === 'valid').map((x) => x.parsed!);
    expect(rows[0]).toMatchObject({ target: 'payment', direction: 'in', amountCents: 30000, bookingReference: 'BLG-AAA111', kind: 'receipt', providerReference: 'T1', occurredAt: '2026-03-03T12:00:00+02:00' });
    expect(rows[1]).toMatchObject({ direction: 'out', amountCents: 123456, kind: 'tax' });
    expect(rows[2]).toMatchObject({ kind: 'payout', amountCents: 250000 });
    expect(r.rows.find((x) => x.rowNo === 6)?.error).toMatch(/not a date/);
  });

  it('a bank row without a transaction id gets a deterministic hash key so re-imports are duplicates', async () => {
    const text = 'Buchungstag;Betrag;Verwendungszweck\n01.03.2026;10,00;Miete\n';
    const a = await stageCsv('bolagio_bank_csv', text);
    const b = await stageCsv('bolagio_bank_csv', text);
    const key = (r: typeof a) => (r.rows[0].parsed as { providerReference: string }).providerReference;
    expect(key(a)).toMatch(/^row:[0-9a-f]{64}$/);
    expect(key(a)).toBe(key(b));
  });

  it('stages expenses and refuses a row whose Netto + USt does not equal Brutto', async () => {
    const text = [
      'Datum;Rechnungsdatum;Faellig;Lieferant;Land;USt-ID;Rechnungsnummer;Beschreibung;Kategorie;Einheit;Netto;USt;Brutto',
      '02.03.2026;01.03.2026;15.03.2026;Cleaning GmbH;DE;DE123;R-1;Reinigung;cleaning;studio-1;100,00;19,00;119,00',
      '02.03.2026;;;Cleaning GmbH;DE;;R-2;Reinigung;;;100,00;19,00;120,00',
      '02.03.2026;;;;DE;;R-3;x;;;;;10,00',
    ].join('\n');
    const r = await stageCsv('bolagio_expenses_csv', text);
    expect(r.validRows).toBe(1);
    expect(r.errorRows).toBe(2);
    expect(r.rows[0].parsed).toMatchObject({ target: 'expense', counterpartyName: 'Cleaning GmbH', netCents: 10000, vatCents: 1900, grossCents: 11900, dueOn: '2026-03-15', invoiceDate: '2026-03-01', categoryHint: 'cleaning', unitSlug: 'studio-1' });
    expect(r.rows[1].error).toMatch(/does not equal Brutto/);
    expect(r.rows[2].error).toMatch(/Lieferant is empty/);
  });

  it('PayPal activity: only completed movements become cash facts; fees and refunds are typed', async () => {
    const text = [
      'Date,Time,Type,Status,Currency,Gross,Fee,Net,Transaction ID,Invoice Number',
      '01/03/2026,10:00:00,Express Checkout Payment,Completed,EUR,"300,00","-8,50","291,50",CAP1,BLG-AAA111',
      '02/03/2026,10:00:00,Payment Refund,Completed,EUR,"-156,00","0,00","-156,00",REF1,',
      '03/03/2026,10:00:00,Express Checkout Payment,Pending,EUR,"10,00","0,00","10,00",CAP2,',
    ].join('\n');
    const r = await stageCsv('paypal_activity', text);
    expect(r.readiness).toBe('experimental');
    expect(r.validRows).toBe(2);
    expect(r.rows[0].parsed).toMatchObject({ source: 'paypal', direction: 'in', amountCents: 30000, feeCents: 850, bookingReference: 'BLG-AAA111', kind: 'receipt' });
    expect(r.rows[1].parsed).toMatchObject({ direction: 'out', amountCents: 15600, kind: 'refund' });
    expect(r.rows[2].error).toMatch(/not Completed/);
  });

  it('Booking.com reservations reduce the guest to an initial and reject check-out before check-in', async () => {
    const text = [
      'Book number;Check-in;Check-out;Status;Price;Commission amount;Guest name(s);Rooms',
      '1234567890;2026-03-01;2026-03-04;ok;450,00;67,50;Erika Mustermann;Studio 1',
      '1234567891;2026-03-04;2026-03-04;ok;450,00;67,50;Erika Mustermann;Studio 1',
    ].join('\n');
    const r = await stageCsv('booking_com_reservations', text);
    expect(r.rows[0].parsed).toMatchObject({ target: 'revenue', channel: 'booking_com', grossCents: 45000, commissionCents: 6750, guestLabel: 'M.', sourceReference: 'bcom:1234567890' });
    expect(JSON.stringify(r.rows[0].parsed)).not.toContain('Erika');
    expect(r.rows[1].error).toMatch(/not after check-in/);
  });
});

/* ---------- invoices (§ 14 UStG) ---------- */

const CONFIGURED: FinanceConfigSnapshot = { ...EMPTY_FINANCE_CONFIG, issuerLegalName: 'BoLaGio GmbH', issuerAddress: 'Musterstraße 1, 95444 Bayreuth', issuerTaxIdConfigured: true, issuerTaxIdKind: 'ust_idnr', issuerTaxIdMasked: 'DE•••••••89', invoiceSeries: 'BLG', smallBusinessScheme: false, accommodationTaxCode: 'DE_ACCOMMODATION_REDUCED' };
const stay: StayForInvoice = { intentId: 'i-1', reference: 'BLG-AAA111', unitId: 'u-1', unitName: 'Studio 1', checkIn: '2026-03-07', checkOut: '2026-03-10', nights: 3, currency: 'EUR', guestName: 'Guest', guestAddress: 'Somewhere 2, 10115 Berlin', guestCountry: 'DE', company: null, companyVatId: null, components: [{ code: 'accommodation', label: 'Accommodation', amountCents: 30000, taxCategory: 'accommodation' }] };

describe('guest invoices', () => {
  it('maps quote components to tax codes; ancillaries and city tax stay review-required, deposits are outside scope', () => {
    expect(taxCodeForComponent('accommodation')).toBe('DE_ACCOMMODATION_REDUCED');
    expect(taxCodeForComponent('service')).toBe('DE_ANCILLARY_REVIEW');
    expect(taxCodeForComponent('city_tax')).toBe('DE_REVIEW_REQUIRED');
    expect(taxCodeForComponent('deposit')).toBe('DE_OUTSIDE_SCOPE');
    expect(taxCodeForComponent(undefined)).toBe('DE_REVIEW_REQUIRED');
  });

  it('builds a draft whose lines split gross into net + 7 % VAT exactly and whose header sums equal the lines', () => {
    const d = buildDraft(stay, [{ description: 'Water 0.5 l', quantity: 2, unitPriceCents: 250, taxCode: 'DE_BEVERAGE_STANDARD' }], CONFIGURED);
    expect(d.lines).toHaveLength(2);
    expect(d.lines[0]).toMatchObject({ quantity: 3, taxCode: 'DE_ACCOMMODATION_REDUCED', rateBp: 700, grossCents: 30000, netCents: 28037, vatCents: 1963, category: 'accommodation_revenue' });
    expect(d.lines[1]).toMatchObject({ grossCents: 500, rateBp: 1900, netCents: 420, vatCents: 80, category: 'minibar_sales' });
    for (const l of d.lines) expect(l.netCents + l.vatCents).toBe(l.grossCents);
    expect(d.netCents + d.vatCents).toBe(d.grossCents);
    expect(d.grossCents).toBe(30500);
    const totals = totalsByRate(d.lines);
    expect(totals.map((t) => t.label)).toEqual(['19 %', '7 %']);
    expect(totals[1]).toMatchObject({ netCents: 28037, vatCents: 1963 });
  });

  it('fails closed: without issuer, tax id and series nothing can be issued; each blocker cites § 14 Abs. 4', () => {
    const gate = canIssue(buildDraft(stay, [], EMPTY_FINANCE_CONFIG), EMPTY_FINANCE_CONFIG);
    expect(gate.ready).toBe(false);
    const codes = gate.blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['issuer_name_address', 'tax_id', 'number', 'small_business']));
    for (const b of gate.blockers) expect(b.legal).toMatch(/§ (14|19)/);
  });

  it('is ready with a full configuration and a domestic recipient with an address', () => {
    const gate = canIssue(buildDraft(stay, [], CONFIGURED), CONFIGURED);
    expect(gate.blockers.map((b) => b.code)).toEqual([]);
    expect(gate.ready).toBe(true);
  });

  it('blocks a draft with a review-required line or a recipient without a postal address', () => {
    const withService = buildDraft({ ...stay, components: [...stay.components, { code: 'cleaning', label: 'Final cleaning', amountCents: 5000, taxCategory: 'service' }] }, [], CONFIGURED);
    const g1 = canIssue(withService, CONFIGURED);
    expect(g1.ready).toBe(false);
    expect(g1.blockers.map((b) => b.code)).toEqual(['rate_and_vat']);
    const g2 = canIssue(buildDraft({ ...stay, guestAddress: null }, [], CONFIGURED), CONFIGURED);
    expect(g2.blockers.map((b) => b.code)).toEqual(['recipient_name_address']);
  });

  it('a tampered draft whose header does not equal its lines fails the net-by-rate check', () => {
    const d = buildDraft(stay, [], CONFIGURED);
    const reqs = invoiceRequirements({ ...d, netCents: d.netCents + 1 }, CONFIGURED);
    expect(reqs.find((r) => r.code === 'net_by_rate')?.ok).toBe(false);
  });

  it('a credit note mirrors the chosen lines with negative amounts and references the original', () => {
    const d = buildDraft(stay, [{ description: 'Water', quantity: 1, unitPriceCents: 250, taxCode: 'DE_BEVERAGE_STANDARD' }], CONFIGURED);
    const cn = buildCreditNote({ ...d, id: 'inv-1' }, [2], 'Minibar not consumed');
    expect(cn.kind).toBe('credit_note');
    expect(cn.correctsInvoiceId).toBe('inv-1');
    expect(cn.lines).toHaveLength(1);
    expect(cn.lines[0]).toMatchObject({ lineNo: 1, grossCents: -250, netCents: -210, vatCents: -40 });
    expect(cn.grossCents).toBe(-250);
    expect(cn.bookingReference).toContain('Minibar not consumed');
    const full = buildCreditNote({ ...d, id: 'inv-1' }, null, 'Cancelled');
    expect(full.grossCents).toBe(-d.grossCents);
  });
});

/* ---------- ingestion rules ---------- */

const fact = (over: Partial<BookingFact> = {}): BookingFact => ({
  intentId: 'i-1', reference: 'BLG-AAA111', unitId: 'u-1', source: 'direct', status: 'paid', paymentStatus: 'paid', checkIn: '2026-03-07', checkOut: '2026-03-10', currency: 'EUR',
  quotedTotalCents: 31300, paidAmountCents: 31300, paidCurrency: 'EUR', paymentCaptureId: 'CAP-1', paymentProvider: 'paypal', paidAt: '2026-02-20T10:00:00Z', confirmedAt: '2026-02-20T10:00:05Z',
  refundState: null, refundId: null, refundedAmountCents: 0, refundCompletedAt: null, cancellationCompletedAt: null,
  components: [{ code: 'accommodation', label: { de: 'Unterkunft', en: 'Accommodation' }, amountCents: 30000, taxCategory: 'accommodation' }, { code: 'cleaning', label: 'Final cleaning', amountCents: 1300, taxCategory: 'service' }], ...over,
});

describe('booking → finance ingestion rules', () => {
  it('recognises revenue on check-out with an idempotent source reference and one line per component', () => {
    const p = revenuePosting(fact())!;
    expect(p.header).toMatchObject({ kind: 'revenue', booked_on: '2026-03-10', service_from: '2026-03-07', channel: 'direct', source_reference: 'booking:i-1', review_state: 'needs_review', payment_state: 'unpaid' });
    expect(p.lines).toHaveLength(2);
    expect(p.lines[0]).toMatchObject({ category: 'accommodation_revenue', tax_code: 'DE_ACCOMMODATION_REDUCED', gross_cents: 30000, net_cents: 28037, vat_cents: 1963, classification: 'auto_verified', description: 'Accommodation' });
    expect(p.lines[1]).toMatchObject({ category: 'accommodation_ancillary', tax_code: 'DE_ANCILLARY_REVIEW', classification: 'needs_review' });
    expect(revenuePosting(fact({ source: 'bookingcom' }))!.header.channel).toBe('booking_com');
  });

  it('posts nothing for a stay that is not yet a revenue fact or has no positive components', () => {
    expect(revenuePosting(fact({ status: 'pending_payment' }))).toBeNull();
    expect(revenuePosting(fact({ status: 'cancelled' }))).toBeNull();
    expect(revenuePosting(fact({ components: [] }))).toBeNull();
    expect(revenuePosting(fact({ components: [{ code: 'x', label: 'x', amountCents: 100, mandatory: false }] }))).toBeNull();
  });

  it('turns a capture into a cash fact keyed by the PayPal capture id, and only for paid states', () => {
    expect(capturePayment(fact())).toMatchObject({ direction: 'in', source: 'paypal', provider_reference: 'CAP-1', amount_cents: 31300, kind: 'receipt', booking_reference: 'BLG-AAA111', value_date: '2026-02-20' });
    expect(capturePayment(fact({ paymentCaptureId: null }))).toBeNull();
    expect(capturePayment(fact({ paymentStatus: 'authorized' }))).toBeNull();
    expect(JSON.stringify(capturePayment(fact()))).not.toMatch(/@|guest name/i);
  });

  it('allocates a partial refund pro-rata over the original lines with the largest-remainder method, never over-refunding', () => {
    const original = [
      { line_no: 1, category: 'accommodation_revenue', description: 'Accommodation', tax_code: 'DE_ACCOMMODATION_REDUCED', rate_bp: 700, gross_cents: 30000, unit_id: 'u-1' },
      { line_no: 2, category: 'accommodation_ancillary', description: 'Final cleaning', tax_code: 'DE_ANCILLARY_REVIEW', rate_bp: 0, gross_cents: 1300, unit_id: 'u-1' },
    ];
    const r = refundPosting(fact({ refundState: 'completed', refundId: 'REF-1', refundedAmountCents: 15650, refundCompletedAt: '2026-03-12T08:00:00Z' }), original)!;
    expect(r.header).toMatchObject({ kind: 'refund', booked_on: '2026-03-12', source_reference: 'refund:REF-1', document_state: 'not_required' });
    expect(r.header.description).toContain('partial');
    expect(r.lines.reduce((s, l) => s + (l.gross_cents as number), 0)).toBe(-15650);
    expect(r.lines.every((l) => (l.gross_cents as number) < 0)).toBe(true);
    expect(r.payment).toMatchObject({ direction: 'out', provider_reference: 'REF-1', amount_cents: 15650, kind: 'refund' });
    const over = refundPosting(fact({ refundState: 'completed', refundId: 'REF-2', refundedAmountCents: 99999 }), original)!;
    expect(over.lines.reduce((s, l) => s + (l.gross_cents as number), 0)).toBe(-31300);
    expect(over.header.description).toContain('full');
    expect(over.header.review_state).toBe('needs_review');
    expect(refundPosting(fact({ refundState: 'pending', refundId: 'REF-3', refundedAmountCents: 100 }), original)).toBeNull();
  });

  it('an expected cleaning cost is an expectation, never an expense, and needs a policy', () => {
    const t = { id: 't-1', intent_id: 'i-1', unit_id: 'u-1', departure: '2026-03-10', reference: 'BLG-AAA111' };
    expect(expectedTurnoverCost(t, null)).toBeNull();
    expect(expectedTurnoverCost(t, { expectedNetCents: 0, supplierId: null, taxCode: 'DE_STANDARD' })).toBeNull();
    expect(expectedTurnoverCost(t, { expectedNetCents: 4500, supplierId: 'cp-1', taxCode: 'DE_STANDARD' })).toMatchObject({ turnover_id: 't-1', expected_net_cents: 4500, state: 'expected', expected_tax_code: 'DE_STANDARD' });
  });
});

/* ---------- documents & retention ---------- */

describe('documents and retention', () => {
  it('classifies document types into retention classes with the statutory periods', () => {
    expect(retentionClassFor('supplier_invoice')).toBe('invoice');
    expect(retentionClassFor('guest_invoice')).toBe('invoice');
    expect(retentionClassFor('bank_statement')).toBe('accounting_voucher');
    expect(retentionClassFor('tax_notice')).toBe('tax_notice');
    expect(retentionClassFor('whatever')).toBe('other');
    expect(RETENTION_CLASSES.invoice.years).toBe(8);
    expect(RETENTION_CLASSES.annual_accounts.years).toBe(10);
    expect(RETENTION_CLASSES.business_letter.years).toBe(6);
    expect(RETENTION_CLASSES.invoice.basis).toMatch(/§ 14b/);
  });

  it('runs the retention period from the end of the calendar year (§ 147 Abs. 4 AO)', () => {
    expect(retainUntil('2026-03-05', 'invoice')).toBe('2034-12-31');
    expect(retainUntil('2026-12-31', 'annual_accounts')).toBe('2036-12-31');
    expect(retainUntil('2026-01-01', 'technical_log')).toBeNull();
  });

  it('hashes bytes to a stable SHA-256 and sniffs structured e-invoices without claiming validity', async () => {
    const h = await sha256Hex(new TextEncoder().encode('abc'));
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(detectStructuredFormat('application/pdf', '%PDF-1.7 ... factur-x.xml ...')).toBe('zugferd');
    expect(detectStructuredFormat('application/pdf', '%PDF-1.7')).toBe('pdf_only');
    expect(detectStructuredFormat('application/xml', '<Invoice xmlns:cbc="urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0">')).toBe('xrechnung');
    expect(detectStructuredFormat('application/xml', '<rsm:CrossIndustryInvoice>')).toBe('zugferd');
    expect(detectStructuredFormat('application/xml', '<foo/>')).toBe('other_xml');
    expect(detectStructuredFormat('image/png', '')).toBe('none');
    expect(ACCEPTED_MIME.has('application/zip')).toBe(false);
  });
});

/* ---------- gates: e-invoice and DATEV ---------- */

describe('e-invoice and DATEV gates', () => {
  it('e-invoice generation stays closed unless the flag AND a validator are configured', () => {
    expect(eInvoiceGate(false, false).enabled).toBe(false);
    expect(eInvoiceGate(true, false).reasons).toHaveLength(1);
    expect(eInvoiceGate(false, true).reasons[0]).toMatch(/FINANCE_EINVOICE_GENERATION_ENABLED/);
    expect(eInvoiceGate(true, true)).toEqual({ enabled: true, reasons: [] });
  });

  it('maps a draft to the EN 16931 core model with a per-rate VAT breakdown and the right type code', () => {
    const d = buildDraft(stay, [{ description: 'Water', quantity: 2, unitPriceCents: 250, taxCode: 'DE_BEVERAGE_STANDARD' }], CONFIGURED);
    const m = toEInvoiceModel(d, { number: 'BLG-00001', issueDate: '2026-03-10', seller: { name: 'BoLaGio GmbH', address: 'Bayreuth', vatId: null, taxNumber: null, country: 'DE' } });
    expect(m.typeCode).toBe('380');
    expect(m.lines[0]).toMatchObject({ unitCode: 'DAY', quantity: 3, vatCategory: 'S', ratePercent: 7 });
    expect(m.vatBreakdown).toHaveLength(2);
    expect(m.vatBreakdown.reduce((s, b) => s + b.taxCents, 0)).toBe(d.vatCents);
    expect(m.totals.dueCents).toBe(d.grossCents);
    expect(toEInvoiceModel(buildCreditNote({ ...d, id: 'x' }, null, 'r'), { number: 'BLG-00002', issueDate: '2026-03-11', seller: m.seller }).typeCode).toBe('381');
    expect(isDomesticB2B({ name: 'x', address: null, company: 'Firma', vatId: null, country: 'DE' })).toBe(true);
    expect(isDomesticB2B({ name: 'x', address: null, company: null, vatId: null, country: 'DE' })).toBe(false);
    expect(isDomesticB2B({ name: 'x', address: null, company: 'SA', vatId: 'FR1', country: 'FR' })).toBe(false);
  });

  const cat = (code: string, over: Partial<CategoryRow> = {}): CategoryRow => ({ code, label: code, pl_group: 'direct_cost', kind: 'expense', default_tax_code: 'DE_STANDARD', asset_candidate: false, requires_unit: false, datev_account_skr03: null, datev_account_skr04: null, datev_confirmed: false, sort_order: 1, active: true, ...over });

  it('the DATEV gate stays closed without the flag, a Kontenrahmen and adviser-confirmed accounts for every used category', () => {
    const cats = [cat('cleaning', { datev_account_skr03: '4900', datev_confirmed: true }), cat('laundry')];
    const closed = datevGate({ flagEnabled: false, categories: cats, usedCategories: new Set(['cleaning', 'laundry']), skr: null });
    expect(closed.enabled).toBe(false);
    expect(closed.reasons).toHaveLength(3);
    expect(closed.reasons[2]).toMatch(/laundry/);
    expect(datevGate({ flagEnabled: true, categories: cats, usedCategories: new Set(['cleaning']), skr: 'SKR03' }).enabled).toBe(true);
    expect(datevGate({ flagEnabled: true, categories: cats, usedCategories: new Set(['cleaning']), skr: 'SKR04' }).enabled).toBe(false);
  });

  it('row proposals carry explicit blockers and never a value the adviser has not confirmed', () => {
    const t = tx({ id: 'tx-d', kind: 'expense', booked_on: '2026-03-05', supplier_invoice_no: 'R-1', counterparty_label: 'Cleaning GmbH', document_state: 'missing' });
    const rows = proposeDatevRows([{ ...line({ transaction_id: 'tx-d', category: 'cleaning', tax_code: 'DE_STANDARD', gross_cents: 11900 }), transaction: t }, { ...line({ transaction_id: 'tx-d', category: 'laundry', tax_code: 'DE_REVIEW_REQUIRED', gross_cents: 500 }), transaction: t }], [cat('cleaning', { datev_account_skr03: '4900', datev_confirmed: true }), cat('laundry')], 'SKR03');
    expect(rows[0]).toMatchObject({ umsatz: '119,00', sollHaben: 'S', konto: '4900', belegdatum: '0503', belegfeld1: 'R-1', blockers: ['document missing'] });
    expect(rows[1].blockers).toEqual(expect.arrayContaining(['no SKR03 account for laundry', 'account not confirmed by the adviser', 'tax code not exportable', 'document missing']));
  });
});
