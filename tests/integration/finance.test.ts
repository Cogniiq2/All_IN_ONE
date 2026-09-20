/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE — the subledger against the real schema, fed by the real booking
 * core. What is proven here: a paid stay becomes a revenue fact and a cash
 * fact that reconcile by themselves; a refund becomes a negative posting and
 * an outgoing payment; expenses, imports, period locks, tax stages, invoice
 * issuing and exports obey the database's rules; and the finance domain never
 * writes a booking row.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, holdBooking, intentRow, startHarness, waitFor, type Harness } from './harness';
import { cancelBooking } from '@/lib/booking/cancellation';
import { executeRefund } from '@/lib/booking/refunds';
import { createLogger } from '@/lib/booking/logger';
import { findIntentByReference } from '@/lib/booking/repository';

let h: Harness;
const logger = createLogger();
const OP = 'ops@example.com';
const SB = 'steuerberater@example.com';

beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => {
  await h.resetDb();
  await h.sync();
  process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'false';
  for (const k of ['INVOICE_ISSUER_LEGAL_NAME', 'INVOICE_ISSUER_ADDRESS', 'INVOICE_ISSUER_TAX_ID', 'INVOICE_SERIES', 'INVOICE_SMALL_BUSINESS']) delete process.env[k];
});

async function paidStay(stay?: { checkIn: string; checkOut: string }) {
  const { reference } = await holdBooking(h, stay);
  await approveOrder(h, reference, false);
  await h.call('POST', '/api/booking/payment/capture', { reference });
  await waitFor(h, reference, (r) => r.status === 'confirmed');
  return (await findIntentByReference(reference))!;
}

const count = (table: string, where = 'true') => Number(h.sql(`select count(*) from ${table} where ${where}`));

describe('booking facts → finance facts', () => {
  it('posts revenue on check-out and the PayPal capture as a cash fact, matches them by R1, and is idempotent', async () => {
    const intent = await paidStay();
    const { ingestBookingFacts } = await import('@/lib/finance/commands');
    const bookingRowsBefore = h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_booking_intents t`);

    const first = await ingestBookingFacts({ actor: 'system:test' });
    expect(first.errors).toEqual([]);
    expect(first.revenuePosted).toBe(1);
    expect(first.paymentsRecorded).toBe(1);
    expect(first.matches).toBe(1);

    const tx = JSON.parse(h.sql(`select row_to_json(t) from (select kind, booked_on, service_from, service_to, channel, booking_reference, gross_cents, net_cents, vat_cents, reconciliation_state, payment_state, review_state, source_reference from bolagio_finance_transactions where booking_intent_id = '${intent.id}') t`));
    expect(tx).toMatchObject({ kind: 'revenue', booked_on: intent.checkOut, service_from: intent.checkIn, channel: 'direct', booking_reference: intent.reference, gross_cents: intent.quotedTotalCents, reconciliation_state: 'matched', payment_state: 'paid', source_reference: `booking:${intent.id}` });
    expect(Number(tx.net_cents) + Number(tx.vat_cents)).toBe(Number(tx.gross_cents));
    const lines = JSON.parse(h.sql(`select json_agg(l order by line_no) from (select line_no, category, tax_code, rate_bp, gross_cents, classification from bolagio_finance_transaction_lines where transaction_id = (select id from bolagio_finance_transactions where booking_intent_id = '${intent.id}')) l`));
    expect(lines[0]).toMatchObject({ category: 'accommodation_revenue', tax_code: 'DE_ACCOMMODATION_REDUCED', rate_bp: 700, classification: 'auto_verified' });
    expect(lines.reduce((s: number, l: { gross_cents: number }) => s + Number(l.gross_cents), 0)).toBe(intent.quotedTotalCents);

    const pay = JSON.parse(h.sql(`select row_to_json(p) from (select direction, source, provider_reference, amount_cents, reconciliation_state, kind from bolagio_finance_payments where booking_intent_id = '${intent.id}') p`));
    expect(pay).toMatchObject({ direction: 'in', source: 'paypal', amount_cents: intent.quotedTotalCents, reconciliation_state: 'matched', kind: 'receipt' });
    expect(pay.provider_reference).toBe((await intentRow(h, intent.reference))!.payment_capture_id);
    expect(h.sql(`select rule || '|' || confidence || '|' || matched_by from bolagio_finance_reconciliations`)).toBe('R1 booking-key exact|exact|system:test');

    // Second pass: nothing new, nothing duplicated, no booking row touched.
    const second = await ingestBookingFacts({ actor: 'system:test' });
    expect(second).toMatchObject({ revenuePosted: 0, paymentsRecorded: 0, refundsPosted: 0, matches: 0, errors: [] });
    expect(count('bolagio_finance_transactions')).toBe(1);
    expect(count('bolagio_finance_payments')).toBe(1);
    expect(h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_booking_intents t`)).toBe(bookingRowsBefore);
    expect(h.sql(`select signal from bolagio_integration_health where provider = 'finance' order by observed_at desc limit 1`)).toBe('booking_ingestion.success');
  });

  it('a completed refund becomes a negative posting pro-rata over the original lines plus an outgoing payment, matched by R1', async () => {
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
    const intent = await paidStay();
    const { ingestBookingFacts } = await import('@/lib/finance/commands');
    await ingestBookingFacts({ actor: 'system:test' });
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    const result = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(result.outcome).toBe('completed');

    const r = await ingestBookingFacts({ actor: 'system:test' });
    expect(r.errors).toEqual([]);
    expect(r.refundsPosted).toBe(1);
    expect(r.paymentsRecorded).toBe(1);
    expect(r.matches).toBe(1);
    const refund = JSON.parse(h.sql(`select row_to_json(t) from (select kind, gross_cents, reconciliation_state, document_state, source_reference from bolagio_finance_transactions where booking_intent_id = '${intent.id}' and kind = 'refund') t`));
    expect(refund).toMatchObject({ kind: 'refund', gross_cents: -intent.quotedTotalCents!, reconciliation_state: 'matched', document_state: 'not_required' });
    expect(refund.source_reference).toMatch(/^refund:SIM-REF-/);
    expect(h.sql(`select direction || '|' || kind || '|' || amount_cents from bolagio_finance_payments where booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe(`out|refund|${intent.quotedTotalCents}`);
    // The original revenue stays as posted: corrections are new rows, never edits.
    expect(h.sql(`select gross_cents from bolagio_finance_transactions where booking_intent_id = '${intent.id}' and kind = 'revenue'`)).toBe(String(intent.quotedTotalCents));
    expect(h.sql(`select coalesce(sum(gross_cents), 0) from bolagio_finance_transactions where booking_intent_id = '${intent.id}' and status = 'posted'`)).toBe('0');
  });

  it('the operations pass runs the ingestion and reports it without failing the pass', async () => {
    await paidStay();
    const report = await h.reconcile();
    expect(report.operations?.finance).toMatchObject({ revenuePosted: 1, paymentsRecorded: 1, errors: 0 });
    expect(count('bolagio_finance_transactions')).toBe(1);
  });

  it('the booking page and the finance overview read the same facts', async () => {
    const intent = await paidStay();
    const { ingestBookingFacts } = await import('@/lib/finance/commands');
    await ingestBookingFacts({ actor: 'system:test' });
    const { loadFinanceForBooking, loadFinanceOverview, loadFinanceHealth, loadTransactions } = await import('@/lib/finance/queries');
    const panel = await loadFinanceForBooking(intent.id);
    expect(panel.ok && panel.data.transactions.map((t) => t.kind)).toEqual(['revenue']);
    expect(panel.ok && panel.data.payments).toHaveLength(1);
    const overview = await loadFinanceOverview();
    expect(overview.ok).toBe(true);
    const health = await loadFinanceHealth();
    expect(['healthy', 'attention']).toContain(health.status);
    const list = await loadTransactions({ page: 1, pageSize: 20 });
    expect(list.ok && list.data.total).toBe(1);
  });
});

describe('expenses, overrides and period locks', () => {
  it('posts a manual expense, records a reclassification as an override row, and refuses a rate change by an operator', async () => {
    const { postManualExpense, reclassifyLine } = await import('@/lib/finance/commands');
    const r = await postManualExpense({
      bookedOn: '2026-03-05', invoiceDate: '2026-03-01', dueOn: '2026-03-15', counterpartyName: 'Cleaning GmbH', counterpartyId: null, counterpartyCountry: 'DE', counterpartyVatId: null,
      supplierInvoiceNo: 'R-2026-17', description: 'Cleaning March', note: null, documentId: null,
      lines: [{ category: 'cleaning', description: 'Turnovers', taxCode: 'DE_STANDARD', netCents: 10000, vatCents: 1900, unitId: null, allocationMethod: 'unallocated', inputVatTreatment: 'deductible', assetState: 'none' }],
    }, OP, []);
    expect(r.created).toBe(true);
    expect(h.sql(`select gross_cents || '|' || document_state || '|' || review_state from bolagio_finance_transactions where id = '${r.id}'`)).toBe('11900|missing|reviewed');
    const again = await postManualExpense({ bookedOn: '2026-03-05', invoiceDate: '2026-03-01', dueOn: '2026-03-15', counterpartyName: 'Cleaning GmbH', counterpartyId: null, counterpartyCountry: 'DE', counterpartyVatId: null, supplierInvoiceNo: 'R-2026-17', description: 'Cleaning March', note: null, documentId: null, lines: [{ category: 'cleaning', description: 'Turnovers', taxCode: 'DE_STANDARD', netCents: 10000, vatCents: 1900, unitId: null, allocationMethod: 'unallocated', inputVatTreatment: 'deductible', assetState: 'none' }] }, OP, []);
    expect(again.created).toBe(false);
    expect(again.id).toBe(r.id);

    const lineId = h.sql(`select id from bolagio_finance_transaction_lines where transaction_id = '${r.id}'`);
    const ok = await reclassifyLine(lineId, { category: 'laundry' }, 'it was the laundry invoice', OP) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(h.sql(`select category || '|' || classification from bolagio_finance_transaction_lines where id = '${lineId}'`)).toBe('laundry|reviewed');
    expect(h.sql(`select field || '|' || old_value || '>' || new_value from bolagio_finance_overrides where target_type = 'line' and target_id = '${lineId}'`)).toBe('category|cleaning>laundry');
    // A rate change alters the money: it is a reversal + repost, never a reclassification — for anyone.
    const refused = await reclassifyLine(lineId, { tax_code: 'DE_REDUCED' }, 'try', OP) as { ok: boolean; code?: string };
    expect(refused).toMatchObject({ ok: false, code: 'RATE_CHANGE_NEEDS_REVERSAL' });
    const refusedSb = await reclassifyLine(lineId, { tax_code: 'DE_REDUCED' }, 'try', SB, true) as { ok: boolean; code?: string };
    expect(refusedSb.ok).toBe(false);
    const asAccountant = await reclassifyLine(lineId, { category: 'cleaning' }, 'confirmed on the invoice', SB, true) as { ok: boolean };
    expect(asAccountant.ok).toBe(true);
    expect(h.sql(`select classification || '|' || category from bolagio_finance_transaction_lines where id = '${lineId}'`)).toBe('accountant_locked|cleaning');
    expect(h.sql(`select gross_cents from bolagio_finance_transactions where id = '${r.id}'`)).toBe('11900');
    // Once accountant-locked, an operator cannot touch the line any more.
    const locked = await reclassifyLine(lineId, { category: 'laundry' }, 'undo', OP) as { ok: boolean; code?: string };
    expect(locked).toMatchObject({ ok: false, code: 'ACCOUNTANT_LOCKED' });
  });

  it('a reversal keeps the original, links both rows, and a locked period refuses new postings and reclassifications', async () => {
    const { postManualExpense, reverseTransaction, reclassifyLine, setPeriodStatus } = await import('@/lib/finance/commands');
    const input = { bookedOn: '2024-01-10', invoiceDate: null, dueOn: null, counterpartyName: 'Stadtwerke', counterpartyId: null, counterpartyCountry: 'DE', counterpartyVatId: null, supplierInvoiceNo: 'SW-1', description: 'Electricity', note: null, documentId: null, lines: [{ category: 'electricity', description: 'Jan', taxCode: 'DE_STANDARD', netCents: 5000, vatCents: 950, unitId: null, allocationMethod: 'unallocated', inputVatTreatment: 'deductible', assetState: 'none' as const }] };
    const a = await postManualExpense(input, OP, []);
    const b = await postManualExpense({ ...input, supplierInvoiceNo: 'SW-2' }, OP, []);
    const rev = await reverseTransaction(a.id, 'duplicate of SW-2', OP) as { ok: boolean; reversal_id?: string };
    expect(rev.ok).toBe(true);
    expect(h.sql(`select status || '|' || coalesce(reversed_by::text, '') from bolagio_finance_transactions where id = '${a.id}'`)).toBe(`reversed|${rev.reversal_id}`);
    expect(h.sql(`select kind || '|' || gross_cents || '|' || correction_of from bolagio_finance_transactions where id = '${rev.reversal_id}'`)).toBe(`expense|-5950|${a.id}`);
    // The reversal is dated today (the original period may be closed); the original keeps its date and turns `reversed`.
    expect(count('bolagio_finance_transactions', "booked_on >= '2024-01-01' and booked_on < '2024-02-01' and status = 'posted'")).toBe(1);
    expect(h.sql(`select booked_on >= current_date - 1 from bolagio_finance_transactions where id = '${rev.reversal_id}'`)).toBe('t');
    expect(h.sql(`select coalesce(sum(gross_cents), 0) from bolagio_finance_transactions where status = 'posted' and kind = 'expense'`)).toBe('5950');

    const notAccountant = await setPeriodStatus('2024-01', 'locked', OP, false) as { ok: boolean; code?: string };
    expect(notAccountant.ok).toBe(false);
    const locked = await setPeriodStatus('2024-01', 'locked', SB, true, 'UStVA filed') as { ok: boolean };
    expect(locked.ok).toBe(true);
    await expect(postManualExpense({ ...input, supplierInvoiceNo: 'SW-3' }, OP, [])).rejects.toThrow(/locked/);
    const lineId = h.sql(`select id from bolagio_finance_transaction_lines where transaction_id = '${b.id}'`);
    await expect(reclassifyLine(lineId, { category: 'water' }, 'late', OP)).rejects.toThrow(/locked/);
    expect(count('bolagio_finance_transactions')).toBe(3);
    // Nothing can be deleted, whatever the role.
    expect(() => h.sql(`delete from bolagio_finance_transactions where id = '${b.id}'`)).toThrow();
  });
});

describe('imports', () => {
  const bank = [
    'Buchungstag;Valuta;Betrag;Auftraggeber/Empfaenger;Verwendungszweck;Transaktions-ID',
    '03.03.2026;03.03.2026;300,00;Guest;Ueberweisung BLG-ZZZ999;T-1',
    '04.03.2026;;-1.234,56;Finanzkasse Bayreuth;USt 02/2026;T-2',
    'nope;;10,00;x;y;T-3',
  ].join('\n');

  it('stages a bank statement, commits the valid rows as payments once, and refuses the same file twice', async () => {
    const { stageImport, commitImport } = await import('@/lib/finance/commands');
    const staged = await stageImport('bolagio_bank_csv', 'march.csv', bank, OP);
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(staged).toMatchObject({ rowCount: 3, validRows: 2, errorRows: 1, readiness: 'validated' });
    expect(h.sql(`select status || '|' || row_count || '|' || valid_rows || '|' || error_rows from bolagio_finance_import_batches where id = '${staged.batchId}'`)).toBe('validated|3|2|1');
    const committed = await commitImport(staged.batchId, OP);
    expect(committed).toMatchObject({ posted: 2, skipped: 1, errors: [] });
    expect(h.sql(`select string_agg(direction || ':' || amount_cents || ':' || kind, ',' order by amount_cents) from bolagio_finance_payments where import_batch_id = '${staged.batchId}'`)).toBe('in:30000:receipt,out:123456:tax');
    expect(h.sql(`select status from bolagio_finance_import_batches where id = '${staged.batchId}'`)).toBe('imported');
    await expect(commitImport(staged.batchId, OP)).rejects.toThrow(/imported/);
    expect(count('bolagio_finance_payments')).toBe(2);
    const dup = await stageImport('bolagio_bank_csv', 'march-again.csv', bank, OP);
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.reason).toBe('duplicate_file');
    const wrong = await stageImport('bolagio_expenses_csv', 'not-expenses.csv', 'Buchungstag;Betrag;Verwendungszweck\n01.03.2026;10,00;x\n', OP);
    expect(!wrong.ok && wrong.reason).toBe('rejected');
    expect(count('bolagio_finance_import_batches', "status = 'rejected'")).toBe(1);
  });
});

describe('tax stages and reserves', () => {
  it('records system estimates, lets the accountant stage govern, and never lets a later system estimate overwrite it', async () => {
    const { postManualExpense, recordSystemTaxEstimates, recordTaxStage } = await import('@/lib/finance/commands');
    await postManualExpense({ bookedOn: '2026-02-10', invoiceDate: null, dueOn: null, counterpartyName: 'Cleaning GmbH', counterpartyId: null, counterpartyCountry: 'DE', counterpartyVatId: null, supplierInvoiceNo: 'C-1', description: 'Feb', note: null, documentId: null, lines: [{ category: 'cleaning', description: 'Feb', taxCode: 'DE_STANDARD', netCents: 10000, vatCents: 1900, unitId: null, allocationMethod: 'unallocated', inputVatTreatment: 'deductible', assetState: 'none' }] }, OP, []);
    const run = await recordSystemTaxEstimates('system:test', '2026-03-20');
    expect(run.recorded).toBeGreaterThan(0);
    expect(run.vatPeriods.length).toBeGreaterThan(0);
    expect(count('bolagio_finance_tax_estimates', "stage = 'system_estimate'")).toBe(run.recorded);
    const vatPeriod = run.vatPeriods[0];
    const period = JSON.parse(h.sql(`select row_to_json(p) from (select id, starts_on, ends_on, status from bolagio_finance_tax_periods where tax_type = 'vat' and period_key = '${vatPeriod}') p`));
    expect(period.status).toBe('estimated');

    const reviewed = await recordTaxStage({ taxType: 'vat', periodKey: vatPeriod, startsOn: period.starts_on, endsOn: period.ends_on, stage: 'accountant_reviewed', amountCents: -1234, basis: { source: 'adviser' }, rulesVersion: 'adviser', actor: SB, asAccountant: true }) as { ok: boolean };
    expect(reviewed.ok).toBe(true);
    const byOperator = await recordTaxStage({ taxType: 'vat', periodKey: vatPeriod, startsOn: period.starts_on, endsOn: period.ends_on, stage: 'filed', amountCents: -1234, basis: {}, rulesVersion: 'x', actor: OP }) as { ok: boolean };
    expect(byOperator.ok).toBe(false);

    const before = count('bolagio_finance_tax_estimates');
    await recordSystemTaxEstimates('system:test', '2026-03-21');
    const { supabaseFinanceSource } = await import('@/lib/finance/source-supabase');
    const { governingStage } = await import('@/lib/finance/tax/reserve');
    const estimates = (await supabaseFinanceSource().taxEstimates()).filter((e) => e.tax_period_id === period.id);
    const g = governingStage(estimates.map((e) => ({ ...e, computedAt: e.computed_at, stage: e.stage as 'system_estimate' })));
    expect(g?.stage).toBe('accountant_reviewed');
    expect(g?.amount_cents).toBe(-1234);
    expect(count('bolagio_finance_tax_estimates')).toBeGreaterThanOrEqual(before);
    expect(h.sql(`select status from bolagio_finance_tax_periods where tax_type = 'vat' and period_key = '${vatPeriod}'`)).toBe('reviewed');
  });
});

describe('guest invoices', () => {
  const stayFor = (intent: Awaited<ReturnType<typeof paidStay>>) => ({
    intentId: intent.id, reference: intent.reference, unitId: intent.unitId, unitName: 'Schulstraße I', checkIn: intent.checkIn, checkOut: intent.checkOut, nights: 3, currency: 'EUR',
    guestName: 'Guest', guestAddress: 'Somewhere 2, 10115 Berlin', guestCountry: 'DE', company: null, companyVatId: null,
    components: [{ code: 'accommodation', label: 'Accommodation', amountCents: intent.quotedTotalCents!, taxCategory: 'accommodation' as const }],
  });

  it('a draft is never issued without the issuer configuration; with it, numbers are gapless and the copy is registered', async () => {
    const intent = await paidStay();
    const { createInvoiceDraft, issueInvoice } = await import('@/lib/finance/commands');
    const { id } = await createInvoiceDraft(stayFor(intent), OP);
    expect(h.sql(`select status || '|' || coalesce(number::text, '-') from bolagio_finance_invoices where id = '${id}'`)).toBe('draft|-');
    const blocked = await issueInvoice(id, OP);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.reason).toBe('blocked');
    expect(!blocked.ok && blocked.blockers!.join(' ')).toMatch(/§ 14 Abs\. 4 Nr\. 1/);
    expect(h.sql(`select status from bolagio_finance_invoices where id = '${id}'`)).toBe('draft');

    Object.assign(process.env, { INVOICE_ISSUER_LEGAL_NAME: 'BoLaGio GmbH', INVOICE_ISSUER_ADDRESS: 'Teststraße 1, 95444 Bayreuth', INVOICE_ISSUER_TAX_ID: 'DE999999999', INVOICE_SERIES: 'TST', INVOICE_SMALL_BUSINESS: 'false' });
    const issued = await issueInvoice(id, OP);
    expect(issued.ok).toBe(true);
    expect(issued.ok && issued.number).toBe('TST-000001');
    const row = JSON.parse(h.sql(`select row_to_json(i) from (select status, series, number, issuer_tax_id_masked, document_id from bolagio_finance_invoices where id = '${id}') i`));
    expect(row).toMatchObject({ status: 'issued', series: 'TST', number: 1 });
    expect(row.issuer_tax_id_masked).not.toContain('999999999');
    expect(row.document_id).toBeTruthy();
    expect(h.sql(`select document_type || '|' || retention_class || '|' || retain_until from bolagio_finance_documents where id = '${row.document_id}'`)).toMatch(/^guest_invoice\|invoice\|\d{4}-12-31$/);
    // Issued rows are frozen; a second issue is refused; the next number follows without a gap.
    const again = await issueInvoice(id, OP);
    expect(!again.ok && again.reason).toBe('not_draft');
    expect(() => h.sql(`update bolagio_finance_invoices set gross_cents = 1 where id = '${id}'`)).toThrow();
    const second = await createInvoiceDraft(stayFor(intent), OP);
    const issued2 = await issueInvoice(second.id, OP);
    expect(issued2.ok && issued2.number).toBe('TST-000002');
  });
});

describe('minibar and exports', () => {
  it('a minibar sale posts a revenue fact with the product price and reduces the stock; exports are registered with their hash', async () => {
    const intent = await paidStay();
    const { recordMinibarMovement, recordExport } = await import('@/lib/finance/commands');
    const productId = h.sql(`insert into bolagio_minibar_products (sku, name, purchase_cost_cents, selling_price_cents, tax_code) values ('WATER-05', 'Mineral water 0.5 l', 45, 250, 'DE_BEVERAGE_STANDARD') returning id`);
    const purchase = await recordMinibarMovement({ product_id: productId, movement: 'purchase', quantity: 24, occurred_on: '2026-03-01', source_reference: 'minibar:test:purchase' }, OP) as { ok: boolean };
    expect(purchase.ok).toBe(true);
    const sale = await recordMinibarMovement({ product_id: productId, movement: 'sale', quantity: -2, occurred_on: '2026-03-08', unit_id: intent.unitId, booking_intent_id: intent.id, booking_reference: intent.reference, channel: 'direct', source_reference: 'minibar:test:sale' }, OP) as { ok: boolean; transaction_id?: string };
    expect(sale.ok).toBe(true);
    expect(h.sql(`select on_hand from bolagio_minibar_stock where product_id = '${productId}'`)).toBe('22');
    expect(h.sql(`select kind || '|' || gross_cents || '|' || source_type from bolagio_finance_transactions where source_reference = 'minibar:test:sale'`)).toBe('revenue|500|minibar');
    expect(h.sql(`select kind || '|' || net_cents || '|' || payment_state from bolagio_finance_transactions where source_reference = 'minibar:test:sale:cogs'`)).toBe('cogs|90|not_applicable');
    const dup = await recordMinibarMovement({ product_id: productId, movement: 'sale', quantity: -2, occurred_on: '2026-03-08', source_reference: 'minibar:test:sale' }, OP) as { ok: boolean; created?: boolean };
    expect(dup.created ?? false).toBe(false);
    expect(h.sql(`select on_hand from bolagio_minibar_stock where product_id = '${productId}'`)).toBe('22');

    const exp = await recordExport({ kind: 'transaction_ledger', from: '2026-03-01', to: '2026-04-01', format: 'csv', version: '2026.09.1', generator: 'bolagio-control-finance', rowCount: 1, text: 'a;b\r\n1;2\r\n', actor: OP });
    expect(exp.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(h.sql(`select export_kind || '|' || row_count || '|' || sha256 from bolagio_finance_exports where id = '${exp.id}'`)).toBe(`transaction_ledger|1|${exp.sha256}`);
  });
});

describe('access', () => {
  it('finance tables and functions are unreachable for anon and authenticated roles', async () => {
    const tables = h.sql(`select string_agg(tablename, ',') from pg_tables where schemaname = 'public' and (tablename like 'bolagio_finance_%' or tablename like 'bolagio_minibar_%')`).split(',');
    expect(tables.length).toBeGreaterThanOrEqual(28);
    for (const t of tables) {
      expect(h.sql(`select relrowsecurity from pg_class where relname = '${t}'`), t).toBe('t');
      expect(h.sql(`select count(*) from information_schema.role_table_grants where table_name = '${t}' and grantee in ('anon', 'authenticated')`), t).toBe('0');
    }
    expect(h.sql(`select count(*) from information_schema.role_routine_grants where routine_name like 'bolagio_finance_%' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).toBe('0');
  });
});
