/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM FINANCE STATEMENT — against the real schema.
 *
 * The sanitized fixture (real headers, fake guests and numbers, the real
 * totals) is staged, previewed and committed through the real command layer
 * into the real migrations. What is proven here:
 *
 *   • the totals are exact to the cent and three payouts are three groups
 *   • matching is by Booking.com number only — a guest whose NAME matches a
 *     statement row but whose number does not stays unmatched
 *   • a gross discrepancy is recorded; the reservation is never written
 *   • the same file is refused; an overlapping export writes nothing twice;
 *     an amended line is held, then accepted by reversal, never by edit
 *   • no payment (cash fact) is created: the payout is the bank's
 *   • no guest name is stored anywhere
 *   • the database refuses edits and deletes of the evidence
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { startHarness, type Harness } from './harness';

let h: Harness;
const OP = 'ops@example.com';
const FIXTURE = readFileSync(path.resolve(__dirname, '..', 'finance', 'fixtures', 'booking-com-finance-statement.sanitized.csv'), 'utf8');
const HEADER = FIXTURE.split('\n')[0];
const LINES = FIXTURE.trim().split('\n').slice(1);

beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => {
  await h.resetDb();
  h.sql('truncate bolagio_reservations cascade');
});

const count = (table: string, where = 'true') => Number(h.sql(`select count(*) from ${table} where ${where}`));
const sum = (expr: string, table: string, where = 'true') => Number(h.sql(`select coalesce(sum(${expr}), 0) from ${table} where ${where}`));
const unit = (slug: string) => h.sql(`select id from bolagio_units where slug = '${slug}'`);

function reservation(ref: string | null, externalId: string, totalCents: number | null, opts: { slug?: string; lastName?: string } = {}) {
  h.sql(`insert into bolagio_reservations (unit_id, external_booking_id, source, channel_reference, provider_status, status_class, check_in, check_out, currency, total_amount_cents, guest_last_name)
         values ('${unit(opts.slug ?? 'schulstrasse-i')}', '${externalId}', 'booking_com', ${ref ? `'${ref}'` : 'null'}, 'confirmed', 'active', '2026-09-11', '2026-09-13', 'EUR', ${totalCents ?? 'null'}, ${opts.lastName ? `'${opts.lastName}'` : 'null'})`);
}

async function stage(text: string, filename = 'statement.csv') {
  const { stageImport } = await import('@/lib/finance/commands');
  return stageImport('booking_com_finance_statement', filename, text, OP);
}

async function stageAndCommit(text: string, filename = 'statement.csv') {
  const staged = await stage(text, filename);
  if (!staged.ok) throw new Error(`stage refused: ${staged.detail}`);
  const { commitImport } = await import('@/lib/finance/commands');
  return { staged, commit: await commitImport(staged.batchId, OP) };
}

/** Local reservations for the fixture: exact, discrepancy, name-only (no number), ambiguous ×2, exact. */
function seedReservations() {
  reservation('9990000001', 'B24-1', 41280);
  reservation('9990000002', 'B24-2', 59000, { slug: 'schulstrasse-ii' });
  // Same guest name as fixture row 3, a DIFFERENT channel reference: must never match row 3.
  reservation('1234567890', 'B24-3', 36720, { lastName: 'Test Guest Gamma' });
  reservation('9990000004', 'B24-4a', 68976);
  reservation('9990000004', 'B24-4b', 68976, { slug: 'schulstrasse-ii' });
  reservation('9990000005', 'B24-5', 42400);
}

describe('stage and preview', () => {
  it('stages the five real-format rows, stores no guest name, and previews exact totals and three payouts', async () => {
    seedReservations();
    const staged = await stage(FIXTURE);
    expect(staged).toMatchObject({ ok: true, rowCount: 5, validRows: 5, errorRows: 0, duplicateRows: 0, readiness: 'validated' });
    if (!staged.ok) return;
    expect(h.sql(`select source_type || '|' || adapter || '|' || adapter_version || '|' || status from bolagio_finance_import_batches`)).toBe('booking_com_finance_statement|booking_com_finance_statement|1.0|validated');
    // Guest names never reach the database, not even in the staged raw row.
    expect(Number(h.sql(`select count(*) from bolagio_finance_import_rows where raw::text ilike '%Guest%Alpha%' or raw::text ilike '%Mustermann%' or parsed::text ilike '%Guest%'`))).toBe(0);
    expect(h.sql(`select distinct raw->>'Guest name' from bolagio_finance_import_rows`)).toBe('[redacted]');

    const { loadImportBatch } = await import('@/lib/finance/queries');
    const view = await loadImportBatch(staged.batchId);
    expect(view.ok).toBe(true);
    if (!view.ok || !view.data?.settlement) throw new Error('no settlement view');
    const { summary, lines, payouts } = view.data.settlement.preview;
    expect(summary).toMatchObject({ lines: 5, grossCents: 249216, commissionCents: 35896, paymentServiceFeeCents: 3489, netCents: 209831, totalFeesCents: 39385, payouts: 3, matched: 3, unmatched: 1, ambiguous: 1, discrepancies: 1 });
    expect(payouts).toHaveLength(3);
    expect(Object.fromEntries(lines.map((l) => [l.line.bookingNumber, l.state]))).toEqual({ '9990000001': 'reconciled', '9990000002': 'discrepancy', '9990000003': 'unmatched', '9990000004': 'ambiguous', '9990000005': 'reconciled' });
    // Nothing is posted at staging.
    expect(count('bolagio_finance_ota_settlements')).toBe(0);
    expect(count('bolagio_finance_transactions')).toBe(0);
  });

  it('refuses a file that is not the format, and refuses retired adapters for new uploads', async () => {
    const r = await stage(FIXTURE.replace('Payments Service Fee', 'PSP Fee'));
    expect(r).toMatchObject({ ok: false, reason: 'rejected' });
    const { stageImport } = await import('@/lib/finance/commands');
    expect(await stageImport('booking_com_payouts', 'p.csv', 'Payout date,Payout amount,Payout ID\n2026-09-15,1.00,X', OP)).toMatchObject({ ok: false, reason: 'rejected' });
  });
});

describe('commit', () => {
  it('records five settlement lines and three payouts, posts statement revenue, commission and fee without a payment, and never writes a reservation', async () => {
    seedReservations();
    const before = h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_reservations t`);
    const { commit } = await stageAndCommit(FIXTURE);
    expect(commit).toMatchObject({ posted: 5, errors: [], alreadyImported: 0, amendments: 0 });

    expect(count('bolagio_finance_ota_settlements')).toBe(5);
    expect(count('bolagio_finance_ota_payouts')).toBe(3);
    expect(sum('gross_cents', 'bolagio_finance_ota_settlements')).toBe(249216);
    expect(sum('commission_cents', 'bolagio_finance_ota_settlements')).toBe(35896);
    expect(sum('payment_service_fee_cents', 'bolagio_finance_ota_settlements')).toBe(3489);
    expect(sum('net_cents', 'bolagio_finance_ota_settlements')).toBe(209831);
    // The file's own signs are kept beside the normalised costs.
    expect(sum('source_commission_cents', 'bolagio_finance_ota_settlements')).toBe(-35896);
    expect(sum('source_payment_service_fee_cents', 'bolagio_finance_ota_settlements')).toBe(-3489);
    // Payout groups from the view, current lines only.
    expect(h.sql(`select string_agg(payout_id || ':' || lines || ':' || net_cents, ',' order by payout_id) from bolagio_finance_ota_payout_totals`)).toBe('TESTPAYOUT0001:1:34758,TESTPAYOUT0002:2:81303,TESTPAYOUT0003:2:93770');
    expect(h.sql(`select distinct bank_state from bolagio_finance_ota_payouts`)).toBe('awaiting_bank');

    // Matching, by number only.
    const match = Object.fromEntries(h.sql(`select booking_number || '=' || match_state || '/' || gross_state || '/' || coalesce(gross_delta_cents::text, '-') from bolagio_finance_ota_settlements`).split('\n').map((l) => l.split('=')));
    expect(match).toEqual({ '9990000001': 'matched/exact/0', '9990000002': 'matched/discrepancy/840', '9990000003': 'unmatched/not_applicable/-', '9990000004': 'ambiguous/not_applicable/-', '9990000005': 'matched/exact/0' });
    expect(h.sql(`select match_candidates from bolagio_finance_ota_settlements where booking_number = '9990000004'`)).toBe('2');
    expect(h.sql(`select reservation_id is null from bolagio_finance_ota_settlements where booking_number = '9990000003'`)).toBe('t');

    // Ledger: statement gross, commission and fee — each once, all parked for VAT review.
    expect(sum('gross_cents', 'bolagio_finance_transactions', `kind = 'revenue' and source_system = 'booking_com_statement'`)).toBe(249216);
    expect(sum('gross_cents', 'bolagio_finance_transactions', `kind = 'commission' and source_system = 'booking_com_statement'`)).toBe(35896);
    expect(sum('gross_cents', 'bolagio_finance_transactions', `kind = 'fee' and source_system = 'booking_com_statement'`)).toBe(3489);
    expect(count('bolagio_finance_transactions')).toBe(15);
    expect(h.sql(`select distinct tax_code from bolagio_finance_transaction_lines`)).toBe('DE_REVIEW_REQUIRED');
    expect(h.sql(`select distinct classification from bolagio_finance_transaction_lines`)).toBe('needs_review');
    expect(h.sql(`select distinct payment_state || '/' || reconciliation_state from bolagio_finance_transactions`)).toBe('not_applicable/not_applicable');
    // No cash fact: the payout is recorded once, from the bank.
    expect(count('bolagio_finance_payments')).toBe(0);
    expect(count('bolagio_finance_ota_settlements', `ledger_state <> 'posted'`)).toBe(0);
    // The reservation table is untouched.
    expect(h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_reservations t`)).toBe(before);
    // No guest name anywhere in finance.
    expect(Number(h.sql(`select count(*) from bolagio_finance_transactions where description ilike '%Guest%' or coalesce(note, '') ilike '%Guest%'`))).toBe(0);
    // Performance reads bolagio_reservations; finance posting changed nothing there, so nothing can double.
    expect(count('bolagio_reservations')).toBe(6);
  });

  it('refuses the same bytes twice, and an overlapping export writes nothing twice', async () => {
    seedReservations();
    await stageAndCommit(FIXTURE);
    expect(await stage(FIXTURE, 'again.csv')).toMatchObject({ ok: false, reason: 'duplicate_file' });

    // September–October: the last two September lines again plus one new line in a new payout.
    const overlap = [HEADER, LINES[3], LINES[4], 'Reservation,9990000006,2 Oct 2026,5 Oct 2026,Test Guest Zeta,Booking.com B.V.,ok,EUR,by_booking,300.00,-45.00,-4.20,250.80,6 Oct 2026,TESTPAYOUT0004'].join('\r\n');
    const { commit } = await stageAndCommit(overlap, 'sept-oct.csv');
    expect(commit).toMatchObject({ posted: 1, alreadyImported: 2, amendments: 0, errors: [] });
    expect(count('bolagio_finance_ota_settlements')).toBe(6);
    expect(count('bolagio_finance_ota_payouts')).toBe(4);
    expect(count('bolagio_finance_transactions', `kind = 'revenue'`)).toBe(6);
    expect(sum('gross_cents', 'bolagio_finance_ota_settlements')).toBe(249216 + 30000);
    expect(h.sql(`select string_agg(status, ',' order by row_no) from bolagio_finance_import_rows where batch_id = (select id from bolagio_finance_import_batches where filename = 'sept-oct.csv')`)).toBe('skipped,skipped,imported');
    // The skipped rows point at the line that already exists.
    expect(count('bolagio_finance_import_rows', `status = 'skipped' and settlement_id is not null`)).toBe(2);
  });

  it('holds an amended line beside the original, posts nothing for it, and accepting it reverses the original rather than editing it', async () => {
    seedReservations();
    await stageAndCommit(FIXTURE);
    const originalTx = h.sql(`select revenue_transaction_id from bolagio_finance_ota_settlements where booking_number = '9990000002'`);
    // Booking.com re-issues row 2 with a changed amount (same reservation, same payout).
    const amended = [HEADER, LINES[1].replace('598.40,-86.17,-8.38,503.85', '618.40,-89.05,-8.66,520.69')].join('\n');
    const { commit } = await stageAndCommit(amended, 'amended.csv');
    expect(commit).toMatchObject({ posted: 0, amendments: 1, alreadyImported: 0, errors: [] });
    expect(h.sql(`select string_agg(amendment_state || ':' || ledger_state, ',' order by created_at) from bolagio_finance_ota_settlements where booking_number = '9990000002'`)).toBe('current:posted,conflict:not_posted');
    // Totals still count one version.
    expect(sum('gross_cents', 'bolagio_finance_ota_settlements', `amendment_state = 'current'`)).toBe(249216);
    expect(count('bolagio_finance_transactions')).toBe(15);

    const conflictId = h.sql(`select id from bolagio_finance_ota_settlements where amendment_state = 'conflict'`);
    const { acceptSettlementAmendment } = await import('@/lib/finance/commands');
    // A reason is required by the database itself, not only by the form.
    await expect(acceptSettlementAmendment(conflictId, '   ', OP)).rejects.toThrow(/reason/);
    expect(h.sql(`select amendment_state from bolagio_finance_ota_settlements where id = '${conflictId}'`)).toBe('conflict');
    expect(await acceptSettlementAmendment(conflictId, 'Booking.com corrected the price', OP)).toMatchObject({ ok: true });
    // Accepting twice finds nothing to accept.
    expect(await acceptSettlementAmendment(conflictId, 'again', OP)).toMatchObject({ ok: false, code: 'NOT_AN_AMENDMENT' });

    expect(h.sql(`select string_agg(amendment_state, ',' order by created_at) from bolagio_finance_ota_settlements where booking_number = '9990000002'`)).toBe('superseded,current');
    expect(h.sql(`select status from bolagio_finance_transactions where id = '${originalTx}'`)).toBe('reversed');
    expect(count('bolagio_finance_transactions', `status = 'reversal'`)).toBe(3);
    expect(sum('gross_cents', 'bolagio_finance_ota_settlements', `amendment_state = 'current'`)).toBe(249216 + 2000);
    // Ledger: revenue net of reversal equals the current statement gross.
    expect(sum('gross_cents', 'bolagio_finance_transactions', `kind = 'revenue'`)).toBe(249216 + 2000);
    expect(sum('gross_cents', 'bolagio_finance_transactions', `kind = 'commission'`)).toBe(35896 + 288);
  });

  it('re-matches after the reservation history arrives, writing only the match — never the reservation or the figures', async () => {
    await stageAndCommit(FIXTURE);
    expect(count('bolagio_finance_ota_settlements', `match_state = 'unmatched'`)).toBe(5);
    const figures = h.sql(`select md5(string_agg(gross_cents || ':' || commission_cents || ':' || net_cents, ',' order by booking_number)) from bolagio_finance_ota_settlements`);
    reservation('9990000003', 'B24-late', 36720);
    const before = h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_reservations t`);
    const { rematchSettlements } = await import('@/lib/finance/commands');
    const report = await rematchSettlements(OP);
    expect(report).toMatchObject({ scanned: 5, changed: 1, matched: 1, unmatched: 4, ambiguous: 0, errors: [] });
    expect(h.sql(`select match_state || '/' || gross_state from bolagio_finance_ota_settlements where booking_number = '9990000003'`)).toBe('matched/exact');
    expect(h.sql(`select md5(string_agg(gross_cents || ':' || commission_cents || ':' || net_cents, ',' order by booking_number)) from bolagio_finance_ota_settlements`)).toBe(figures);
    expect(h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_reservations t`)).toBe(before);
  });

  it('does not post revenue a second time where the retired adapter already posted it', async () => {
    h.sql(`select bolagio_finance_post_transaction(
      jsonb_build_object('kind','revenue','booked_on','2026-09-06','currency','EUR','description','legacy','channel','booking_com','booking_reference','9990000001',
        'source_type','import','source_system','booking_com_reservations','source_reference','bcom:9990000001','review_state','needs_review','document_state','complete','payment_state','unpaid','reconciliation_state','unmatched'),
      jsonb_build_array(jsonb_build_object('line_no',1,'category','accommodation_revenue','tax_code','DE_REVIEW_REQUIRED','rate_bp',0,'net_cents',41280,'vat_cents',0,'gross_cents',41280,'classification','needs_review')), 'test')`);
    await stageAndCommit(FIXTURE);
    expect(h.sql(`select ledger_state from bolagio_finance_ota_settlements where booking_number = '9990000001'`)).toBe('legacy_posted');
    expect(count('bolagio_finance_transactions', `kind = 'revenue' and booking_reference = '9990000001'`)).toBe(1);
  });

  it('refuses a line whose payout ID is already recorded for another date', async () => {
    await stageAndCommit(FIXTURE);
    const clash = [HEADER, 'Reservation,9990000009,1 Oct 2026,3 Oct 2026,Someone,Booking.com B.V.,ok,EUR,by_booking,100.00,-15.00,-1.40,83.60,1 Oct 2026,TESTPAYOUT0001'].join('\n');
    const { commit } = await stageAndCommit(clash, 'clash.csv');
    expect(commit.posted).toBe(0);
    expect(commit.errors[0]).toMatch(/payout TESTPAYOUT0001 is recorded for 2026-09-08/);
    expect(count('bolagio_finance_ota_settlements', `booking_number = '9990000009'`)).toBe(0);
  });
});

describe('the database guards the evidence', () => {
  it('refuses to change a recorded figure or to delete a line, and keeps one current line per identity', async () => {
    await stageAndCommit(FIXTURE);
    expect(() => h.sql(`update bolagio_finance_ota_settlements set gross_cents = gross_cents + 1 where booking_number = '9990000001'`)).toThrow(/immutable/);
    expect(() => h.sql(`delete from bolagio_finance_ota_settlements where booking_number = '9990000001'`)).toThrow(/never deleted/);
    expect(() => h.sql(`update bolagio_finance_ota_settlements set amendment_state = 'superseded' where booking_number = '9990000001'`)).toThrow(/amendment state/);
    expect(() => h.sql(`delete from bolagio_finance_ota_payouts`)).toThrow(/never deleted/);
    expect(() => h.sql(`update bolagio_finance_ota_settlements set commission_cents = 1 where booking_number = '9990000001'`)).toThrow();
    // Match columns may change (that is what re-matching does).
    h.sql(`update bolagio_finance_ota_settlements set match_state = 'unmatched', reservation_id = null, unit_id = null, gross_state = 'not_applicable', gross_delta_cents = null, local_gross_cents = null where booking_number = '9990000001'`);
    // Browser roles read nothing.
    expect(h.sql(`select has_table_privilege('anon', 'bolagio_finance_ota_settlements', 'select')::text || has_table_privilege('authenticated', 'bolagio_finance_ota_payouts', 'select')::text`)).toBe('falsefalse');
    expect(h.sql(`select has_function_privilege('anon', 'bolagio_finance_record_ota_settlement(jsonb,text)', 'execute')::text`)).toBe('false');
    expect(h.sql(`select relrowsecurity::text from pg_class where relname = 'bolagio_finance_ota_settlements'`)).toBe('true');
  });
});

describe('the finance screen', () => {
  it('shows the same totals, filters by payout and state, and groups payouts', async () => {
    seedReservations();
    await stageAndCommit(FIXTURE);
    const { loadBookingComFinance } = await import('@/lib/finance/queries');
    const all = await loadBookingComFinance({ from: '2026-09-01', to: '2026-10-01' }, { basis: 'payout' });
    if (!all.ok) throw new Error(all.error);
    expect(all.data.summary).toMatchObject({ grossCents: 249216, commissionCents: 35896, paymentServiceFeeCents: 3489, netCents: 209831, payouts: 3, matched: 3, unmatched: 1, ambiguous: 1, discrepancies: 1 });
    expect(all.data.summary.effectiveFeeRatio).toBeCloseTo(39385 / 249216, 12);
    expect(all.data.payouts.map((p) => [p.payoutId, p.lines, p.netCents, p.bankState])).toEqual([
      ['TESTPAYOUT0003', 2, 93770, 'awaiting_bank'], ['TESTPAYOUT0002', 2, 81303, 'awaiting_bank'], ['TESTPAYOUT0001', 1, 34758, 'awaiting_bank'],
    ]);
    const one = await loadBookingComFinance({ from: '2026-09-01', to: '2026-10-01' }, { payoutId: 'TESTPAYOUT0002' });
    if (!one.ok) throw new Error(one.error);
    expect(one.data.summary).toMatchObject({ lines: 2, grossCents: 96560, netCents: 81303, payouts: 1 });
    const unmatched = await loadBookingComFinance({ from: '2026-09-01', to: '2026-10-01' }, { state: 'unmatched' });
    if (!unmatched.ok) throw new Error(unmatched.error);
    expect(unmatched.data.rows.map((r) => r.booking_number)).toEqual(['9990000003']);
    const byCheckout = await loadBookingComFinance({ from: '2026-09-15', to: '2026-10-01' }, { basis: 'checkout' });
    if (!byCheckout.ok) throw new Error(byCheckout.error);
    expect(byCheckout.data.rows.map((r) => r.booking_number).sort()).toEqual(['9990000004', '9990000005']);
    const unitTotals = await loadBookingComFinance({ from: '2026-09-01', to: '2026-10-01' }, { unitId: unit('schulstrasse-ii') });
    if (!unitTotals.ok) throw new Error(unitTotals.error);
    expect(unitTotals.data.rows.map((r) => r.booking_number)).toEqual(['9990000002']);
  });

  it('the existing booking ingestion finds nothing to post from a statement import', async () => {
    seedReservations();
    await stageAndCommit(FIXTURE);
    const { ingestBookingFacts } = await import('@/lib/finance/commands');
    const report = await ingestBookingFacts({ actor: 'system:test' });
    expect(report).toMatchObject({ scanned: 0, revenuePosted: 0, paymentsRecorded: 0 });
    expect(count('bolagio_finance_transactions')).toBe(15);
  });
});
