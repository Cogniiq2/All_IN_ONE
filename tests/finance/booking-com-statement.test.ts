/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM FINANCE STATEMENT — parser, arithmetic, identity, matching,
 * reconciliation, aggregation. Pure; no database. The database half is
 * tests/integration/booking-com-statement.test.ts.
 *
 * The fixture has the live export's exact headers and totals, with fake
 * reservation numbers, guests and payout IDs.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ADAPTERS, adapterSpec, detectAdapter, offeredAdapters, stageCsv, type StagedOtaSettlement } from '@/lib/finance/import/adapters';
import { parseCsv, parseDateLoose } from '@/lib/finance/import/csv';
import { BOOKING_COM_STATEMENT_HEADERS, parseStatementAmount, parseStatementRow, settlementContentString, settlementIdentityKey } from '@/lib/finance/import/booking-com-statement';
import {
  compareGross, effectiveFeePercent, filterSettlements, groupPayouts, matchReservation, previewSettlements, reconState, summarizeSettlements,
  type ReservationCandidate, type SettlementRow,
} from '@/lib/finance/settlements';

const FIXTURE = readFileSync(path.resolve(__dirname, 'fixtures', 'booking-com-finance-statement.sanitized.csv'), 'utf8');
const HEADER = FIXTURE.split('\n')[0];
const LINES = FIXTURE.trim().split('\n').slice(1);

const stage = (text: string) => stageCsv('booking_com_finance_statement', text);
const settlements = (r: Awaited<ReturnType<typeof stage>>) => r.rows.filter((x) => x.status === 'valid').map((x) => x.parsed as StagedOtaSettlement);
const total = (rows: StagedOtaSettlement[], k: 'grossCents' | 'commissionCents' | 'paymentServiceFeeCents' | 'netCents' | 'sourceCommissionCents' | 'sourcePaymentServiceFeeCents') => rows.reduce((s, r) => s + r[k], 0);
const csvWith = (...rows: string[]) => [HEADER, ...rows].join('\n');

/* ── 1. The sanitized real-format fixture ─────────────────────────────── */

describe('the sanitized fixture', () => {
  it('has exactly the live export’s fifteen headers, in order, and five rows', () => {
    const csv = parseCsv(FIXTURE);
    expect(csv.headers).toEqual([...BOOKING_COM_STATEMENT_HEADERS]);
    expect(csv.rows).toHaveLength(5);
    expect(csv.malformed).toEqual([]);
  });

  it('carries only fictitious reservation numbers and payout IDs', () => {
    const csv = parseCsv(FIXTURE);
    for (const r of csv.rows) {
      expect(r['Booking number']).toMatch(/^99900000\d\d$/);
      expect(r['Payout ID']).toMatch(/^TESTPAYOUT\d{4}$/);
    }
  });
});

/* ── 2. Parser ─────────────────────────────────────────────────────────── */

describe('parsing the statement', () => {
  it('stages all five rows as valid, exact to the cent', async () => {
    const r = await stage(FIXTURE);
    expect(r).toMatchObject({ rejected: null, rowCount: 5, validRows: 5, errorRows: 0, duplicateRows: 0, readiness: 'validated', adapterVersion: '1.0' });
    const first = settlements(r)[0];
    expect(first).toMatchObject({
      target: 'ota_settlement', provider: 'booking_com', rowType: 'Reservation', bookingNumber: '9990000001', checkIn: '2026-09-04', checkOut: '2026-09-06',
      reservationStatus: 'ok', paymentStatus: 'by_booking', paymentsServiceProvider: 'Booking.com B.V.', currency: 'EUR',
      grossCents: 41280, commissionCents: 5944, paymentServiceFeeCents: 578, netCents: 34758, sourceCommissionCents: -5944, sourcePaymentServiceFeeCents: -578,
      payoutId: 'TESTPAYOUT0001', payoutDate: '2026-09-08', identityKey: 'booking_com|9990000001|TESTPAYOUT0001|reservation',
    });
    expect(first.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads LF, CRLF and a UTF-8 BOM identically', async () => {
    const lf = settlements(await stage(FIXTURE.replace(/\r\n/g, '\n')));
    const crlf = settlements(await stage(FIXTURE.replace(/\r?\n/g, '\r\n')));
    const bom = settlements(await stage(`﻿${FIXTURE.replace(/\r?\n/g, '\r\n')}`));
    expect(crlf).toEqual(lf);
    expect(bom).toEqual(lf);
    expect(lf).toHaveLength(5);
  });

  it('honours CSV quoting: a comma inside a quoted guest name is not a column', async () => {
    expect(LINES[1]).toContain('"Mustermann, Erika"');
    const r = await stage(FIXTURE);
    expect(r.rows[1]).toMatchObject({ status: 'valid' });
    expect((r.rows[1].parsed as StagedOtaSettlement).bookingNumber).toBe('9990000002');
    const quotedAmount = await stage(csvWith(LINES[0].replace('412.80', '"412.80"')));
    expect(settlements(quotedAmount)[0].grossCents).toBe(41280);
  });

  it('never stores the guest name: redacted in the raw row, absent from the parsed one', async () => {
    const r = await stage(FIXTURE);
    for (const row of r.rows) {
      expect(row.raw['Guest name']).toBe('[redacted]');
      expect(JSON.stringify(row)).not.toMatch(/Test Guest|Mustermann|Erika/);
    }
  });

  it('reads textual English dates, including Booking.com’s "Sept"', () => {
    expect(parseDateLoose('11 Sept 2026')).toBe('2026-09-11');
    expect(parseDateLoose('13 Sept 2026')).toBe('2026-09-13');
    expect(parseDateLoose('15 Sept 2026')).toBe('2026-09-15');
    expect(parseDateLoose('1 Sep 2026')).toBe('2026-09-01');
    expect(parseDateLoose('30 September 2026')).toBe('2026-09-30');
    expect(parseDateLoose('2 Jan 2027')).toBe('2027-01-02');
    expect(parseDateLoose('Sept 11, 2026')).toBe('2026-09-11');
    expect(parseDateLoose('11 sept. 2026')).toBe('2026-09-11');
  });

  it('refuses a calendar day that does not exist, and a month it does not know', () => {
    expect(parseDateLoose('31 Sept 2026')).toBeNull();
    expect(parseDateLoose('29 Feb 2027')).toBeNull();
    expect(parseDateLoose('29 Feb 2028')).toBe('2028-02-29');
    expect(parseDateLoose('11 Septembre 2026')).toBeNull();
    expect(parseDateLoose('2026-02-30')).toBeNull();
    expect(parseDateLoose('31.04.2026')).toBeNull();
    // The existing formats are unchanged.
    expect(parseDateLoose('2026-03-05T10:00')).toBe('2026-03-05');
    expect(parseDateLoose('5.3.2026')).toBe('2026-03-05');
    expect(parseDateLoose('March 5')).toBeNull();
  });

  it('keeps a payout DATE a date on every server: no Date object is built from the text, so no time zone can shift it', () => {
    const tz = process.env.TZ;
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Berlin']) {
      process.env.TZ = zone;
      expect(parseDateLoose('15 Sept 2026')).toBe('2026-09-15');
    }
    process.env.TZ = tz;
  });

  it('converts money exactly: negative commission and fee, thousands separators, never a float', () => {
    expect(parseStatementAmount('2492.16')).toBe(249216);
    expect(parseStatementAmount('-358.96')).toBe(-35896);
    expect(parseStatementAmount('-34.89')).toBe(-3489);
    expect(parseStatementAmount('2,492.16')).toBe(249216);
    expect(parseStatementAmount('0.29')).toBe(29);
    expect(parseStatementAmount('0.57')).toBe(57);
    expect(parseStatementAmount('1.10')).toBe(110);
    expect(parseStatementAmount('100')).toBe(10000);
    expect(parseStatementAmount('12.5')).toBe(1250);
    expect(parseStatementAmount('EUR 12.50', 'EUR')).toBe(1250);
    expect(parseStatementAmount('€12.50')).toBe(1250);
    expect(parseStatementAmount('−34.89')).toBe(-3489);
  });

  it('refuses a money shape it would have to guess at', () => {
    for (const bad of ['12.345', '12,50', '1.234,56', '(34.89)', 'abc', '', '1,23', '--5.00', '5.00-', '1e3']) expect(parseStatementAmount(bad), bad).toBeNull();
  });

  it('accepts EUR and refuses any other currency as unsupported, kept as an error row, never read as euros', async () => {
    const r = await stage(csvWith(LINES[0], LINES[1].replace(',EUR,', ',USD,'), LINES[2].replace(',EUR,', ',eur,')));
    expect(r.rows.map((x) => x.status)).toEqual(['valid', 'error', 'valid']);
    expect(r.rows[1].error).toMatch(/USD is not supported/);
    expect((r.rows[2].parsed as StagedOtaSettlement).currency).toBe('EUR');
  });

  it('rejects the whole file when a required header is missing, naming it', async () => {
    const r = await stage(FIXTURE.replace('Payments Service Fee', 'Service Fee'));
    expect(r.rejected).toMatch(/missing column Payments Service Fee/);
    expect(r.rowCount).toBe(0);
  });

  it('flags malformed money, a malformed date and a malformed CSV row — and repairs none of them', async () => {
    const r = await stage(csvWith(
      LINES[0].replace('412.80', '412.805'),
      LINES[1].replace('11 Sept 2026', '31 Sept 2026'),
      LINES[2].replace(',ok,', ',ok,extra,'),
      LINES[3],
    ));
    expect(r.rows.map((x) => [x.rowNo, x.status])).toEqual([[2, 'error'], [3, 'error'], [5, 'valid'], [4, 'error']]);
    // Every row number is distinct — the batch stores them under a unique key.
    expect(new Set(r.rows.map((x) => x.rowNo)).size).toBe(4);
    expect(r.rows[0].error).toMatch(/Amount "412.805" is not an amount/);
    expect(r.rows[1].error).toMatch(/Check-in is not a date/);
    expect(r.rows[3].error).toMatch(/Field count/);
  });

  it('flags a row whose Amount, Commission and Fee do not add up to Net, with the numbers', async () => {
    const r = await stage(csvWith(LINES[0].replace('347.58', '347.59')));
    expect(r.rows[0].status).toBe('error');
    expect(r.rows[0].error).toMatch(/does not equal Net \(34759 cents\); off by -1 cents\. Not repaired\./);
  });

  it('refuses shapes not seen in a live export rather than guessing their meaning', async () => {
    const r = await stage(csvWith(
      LINES[0].replace(/^Reservation/, 'Adjustment'),
      LINES[1].replace('-86.17', '86.17').replace('503.85', '675.89'),
      LINES[2].replace('TESTPAYOUT0002', ''),
      LINES[3].replace('9990000004', 'ABC-123'),
      LINES[4].replace('20 Sept 2026', '17 Sept 2026'),
    ));
    expect(r.rows.map((x) => x.error)).toEqual([
      expect.stringMatching(/Row type "Adjustment" has not been validated/),
      expect.stringMatching(/Commission is positive/),
      expect.stringMatching(/Payout ID is empty: the row is not settled yet/),
      expect.stringMatching(/Booking number is not a Booking.com reservation number/),
      expect.stringMatching(/Checkout is not after check-in/),
    ]);
  });

  it('bounds a field’s length, and treats a formula-looking cell as plain data that fails validation', async () => {
    expect(parseStatementRow({ ...Object.fromEntries(BOOKING_COM_STATEMENT_HEADERS.map((h) => [h, 'x'])), 'Payments service provider': 'x'.repeat(201) })).toMatchObject({ ok: false, error: expect.stringMatching(/longer than 200/) });
    const r = await stage(csvWith(LINES[0].replace('412.80', '=1+1')));
    expect(r.rows[0]).toMatchObject({ status: 'error', error: expect.stringMatching(/Amount "=1\+1" is not an amount/) });
    const status = await stage(csvWith(LINES[0].replace(',ok,', ',=HYPERLINK("x"),')));
    expect(status.rows[0].status).toBe('error');
  });
});

/* ── 3. Arithmetic ─────────────────────────────────────────────────────── */

describe('the fixture totals', () => {
  it('equal the real file exactly: gross 249216, commission 35896, fee 3489, net 209831', async () => {
    const rows = settlements(await stage(FIXTURE));
    expect(total(rows, 'grossCents')).toBe(249216);
    expect(total(rows, 'commissionCents')).toBe(35896);
    expect(total(rows, 'paymentServiceFeeCents')).toBe(3489);
    expect(total(rows, 'netCents')).toBe(209831);
    expect(total(rows, 'sourceCommissionCents')).toBe(-35896);
    expect(total(rows, 'sourcePaymentServiceFeeCents')).toBe(-3489);
    // 2492.16 − 358.96 − 34.89 = 2098.31, per row and in total
    expect(249216 - 35896 - 3489).toBe(209831);
    for (const r of rows) expect(r.grossCents - r.commissionCents - r.paymentServiceFeeCents).toBe(r.netCents);
  });

  it('has exactly three payout IDs, grouped as three payouts', async () => {
    const rows = settlements(await stage(FIXTURE));
    expect(new Set(rows.map((r) => r.payoutId)).size).toBe(3);
    const preview = previewSettlements(rows, []);
    expect(preview.payouts.map((p) => [p.payoutId, p.lines, p.netCents])).toEqual([
      ['TESTPAYOUT0003', 2, 93770], ['TESTPAYOUT0002', 2, 81303], ['TESTPAYOUT0001', 1, 34758],
    ]);
    expect(preview.payouts.reduce((s, p) => s + p.netCents, 0)).toBe(209831);
    expect(preview.summary).toMatchObject({ lines: 5, payouts: 3, grossCents: 249216, totalFeesCents: 39385, netCents: 209831 });
  });

  it('computes the effective total fee on integer cents', () => {
    expect(effectiveFeePercent({ grossCents: 249216, commissionCents: 35896, paymentServiceFeeCents: 3489 })).toBeCloseTo(15.8036, 3);
    expect(effectiveFeePercent({ grossCents: 0, commissionCents: 0, paymentServiceFeeCents: 0 })).toBeNull();
  });
});

/* ── 6. Identity (the in-file half; the database half is the integration test) ── */

describe('row identity', () => {
  it('is stable across files and free of the guest name', async () => {
    const a = settlements(await stage(FIXTURE))[3];
    const b = settlements(await stage(csvWith(LINES[3].replace('Test Guest Delta', 'Someone Else'))))[0];
    expect(b.identityKey).toBe(a.identityKey);
    expect(b.contentSha256).toBe(a.contentSha256);
    expect(settlementIdentityKey(a)).not.toMatch(/Guest/);
  });

  it('changes the content hash, not the identity, when Booking.com changes a figure', async () => {
    const a = settlements(await stage(FIXTURE))[1];
    const b = settlements(await stage(csvWith(LINES[1].replace('598.40,-86.17,-8.38,503.85', '618.40,-89.05,-8.66,520.69'))))[0];
    expect(b.identityKey).toBe(a.identityKey);
    expect(b.contentSha256).not.toBe(a.contentSha256);
  });

  it('keeps several reservations under one payout as distinct lines', async () => {
    const rows = settlements(await stage(FIXTURE)).filter((r) => r.payoutId === 'TESTPAYOUT0002');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.identityKey)).size).toBe(2);
  });

  it('marks an exact repeat within a file as a duplicate, but a same-identity row with different figures as an error on BOTH rows', async () => {
    const dup = await stage(csvWith(LINES[0], LINES[0]));
    expect(dup.rows.map((r) => r.status)).toEqual(['valid', 'duplicate']);
    expect(dup).toMatchObject({ validRows: 1, duplicateRows: 1, errorRows: 0 });
    const conflict = await stage(csvWith(LINES[0], LINES[0].replace('412.80,-59.44,-5.78,347.58', '400.00,-59.44,-5.78,334.78')));
    expect(conflict.rows.map((r) => r.status)).toEqual(['error', 'error']);
    expect(conflict).toMatchObject({ validRows: 0, errorRows: 2 });
    expect(conflict.rows[0].error).toMatch(/same reservation, payout and row type with different figures/);
  });

  it('builds the content string from financial fields only', async () => {
    const a = settlements(await stage(FIXTURE))[0];
    expect(settlementContentString(a)).toBe('booking_com|9990000001|TESTPAYOUT0001|reservation|2026-09-04|2026-09-06|EUR|41280|-5944|-578|34758|2026-09-08|ok|by_booking');
  });
});

/* ── 4. Matching ─────────────────────────────────────────────────────── */

const cand = (over: Partial<ReservationCandidate>): ReservationCandidate => ({
  id: 'r1', unit_id: 'u1', channel_reference: '9990000001', source: 'booking_com', provider_status: 'confirmed', status_class: 'active', check_in: '2026-09-04', check_out: '2026-09-06', currency: 'EUR', total_amount_cents: 41280, ...over,
});

describe('matching a statement line to a local reservation', () => {
  it('matches exactly one reservation by its Booking.com number', () => {
    expect(matchReservation('9990000001', [cand({})])).toMatchObject({ state: 'matched', candidates: 1, reservation: { id: 'r1' } });
    expect(matchReservation(' 9990000001 ', [cand({ channel_reference: '9990000001 ' })]).state).toBe('matched');
  });

  it('is unmatched when no reservation carries the number, and the line is kept', async () => {
    expect(matchReservation('9990000001', [])).toMatchObject({ state: 'unmatched', reservation: null, candidates: 0 });
    const rows = settlements(await stage(FIXTURE));
    const p = previewSettlements(rows, []);
    expect(p.lines).toHaveLength(5);
    expect(p.lines.every((l) => l.state === 'unmatched')).toBe(true);
    expect(p.summary).toMatchObject({ unmatched: 5, grossCents: 249216 });
  });

  it('is ambiguous — and chooses nothing — when two reservations carry the number', () => {
    const m = matchReservation('9990000001', [cand({ id: 'a' }), cand({ id: 'b', unit_id: 'u2' })]);
    expect(m).toEqual({ state: 'ambiguous', reservation: null, candidates: 2 });
  });

  it('never matches on anything but the number: same dates, unit and amount with another number stay unmatched', () => {
    // A candidate identical in every diagnostic field — but a different Booking.com number.
    expect(matchReservation('9990000001', [cand({ channel_reference: '1234567890' })]).state).toBe('unmatched');
    // A sloppy source that returns an unrelated row cannot widen a match.
    expect(matchReservation('9990000001', [cand({ channel_reference: null })]).state).toBe('unmatched');
    expect(matchReservation('', [cand({ channel_reference: '' })]).state).toBe('unmatched');
  });

  it('has no guest field to match on at all', () => {
    // The candidate type carries no name, email or phone: a name-based match is not expressible.
    const keys = Object.keys(cand({}));
    expect(keys.some((k) => /guest|name|email|phone/i.test(k))).toBe(false);
  });
});

/* ── 5. Reconciliation ───────────────────────────────────────────────── */

describe('statement gross against local gross', () => {
  it('equal gross → reconciled', () => {
    const g = compareGross(41280, 'EUR', cand({}));
    expect(g).toEqual({ state: 'exact', localGrossCents: 41280, localCurrency: 'EUR', deltaCents: 0 });
    expect(reconState('matched', g.state)).toBe('reconciled');
  });

  it('different gross → discrepancy with the delta, statement − local', () => {
    const g = compareGross(59840, 'EUR', cand({ total_amount_cents: 59000 }));
    expect(g).toEqual({ state: 'discrepancy', localGrossCents: 59000, localCurrency: 'EUR', deltaCents: 840 });
    expect(reconState('matched', g.state)).toBe('discrepancy');
    expect(compareGross(59000, 'EUR', cand({ total_amount_cents: 59840 })).deltaCents).toBe(-840);
  });

  it('does not overwrite either side: the reservation object is left exactly as it was', () => {
    const r = cand({ total_amount_cents: 59000 });
    const before = JSON.stringify(r);
    compareGross(59840, 'EUR', r);
    previewSettlements([{ bookingNumber: '9990000001', payoutId: 'P', payoutDate: '2026-09-08', currency: 'EUR', grossCents: 59840, commissionCents: 1, paymentServiceFeeCents: 1, netCents: 59838 }], [r]);
    expect(JSON.stringify(r)).toBe(before);
  });

  it('a local reservation without an amount, or in another currency, is never "reconciled"', () => {
    expect(compareGross(41280, 'EUR', cand({ total_amount_cents: null })).state).toBe('no_local_gross');
    expect(compareGross(41280, 'EUR', cand({ currency: 'CHF' }))).toMatchObject({ state: 'discrepancy', deltaCents: null });
    expect(compareGross(41280, 'EUR', null).state).toBe('not_applicable');
  });

  it('honours an explicitly configured tolerance, and defaults to none', () => {
    expect(compareGross(41281, 'EUR', cand({})).state).toBe('discrepancy');
    expect(compareGross(41281, 'EUR', cand({}), 1).state).toBe('exact');
  });
});

/* ── 9. Aggregates, filters, payout groups ───────────────────────────── */

function row(over: Partial<SettlementRow>): SettlementRow {
  return {
    id: 'x', provider: 'booking_com', identity_key: 'k', content_sha256: 'c', row_type: 'Reservation', booking_number: '9990000001', payout_id: 'P1', payout_date: '2026-09-08',
    check_in: '2026-09-04', check_out: '2026-09-06', currency: 'EUR', gross_cents: 10000, commission_cents: 1500, payment_service_fee_cents: 140, net_cents: 8360,
    source_commission_cents: -1500, source_payment_service_fee_cents: -140, reservation_status: 'ok', payment_status: 'by_booking', payments_service_provider: 'Booking.com B.V.',
    reservation_id: 'r', unit_id: 'u1', match_state: 'matched', match_candidates: 1, local_gross_cents: 10000, local_currency: 'EUR', gross_delta_cents: 0, gross_state: 'exact',
    matched_at: null, amendment_state: 'current', supersedes_id: null, ledger_state: 'posted', revenue_transaction_id: null, commission_transaction_id: null, fee_transaction_id: null,
    import_batch_id: 'b', import_row_id: null, created_by: 'x', created_at: '2026-09-09T00:00:00Z', ...over,
  };
}

describe('dashboard aggregation', () => {
  const rows = [
    row({ id: '1', booking_number: '1000001', payout_id: 'P1' }),
    row({ id: '2', booking_number: '1000002', payout_id: 'P2', payout_date: '2026-09-15', unit_id: 'u2', gross_state: 'discrepancy', gross_delta_cents: 500, local_gross_cents: 9500 }),
    row({ id: '3', booking_number: '1000003', payout_id: 'P2', payout_date: '2026-09-15', match_state: 'unmatched', reservation_id: null, unit_id: null, gross_state: 'not_applicable', local_gross_cents: null, gross_delta_cents: null }),
    row({ id: '4', booking_number: '1000004', payout_id: 'P3', payout_date: '2026-10-02', check_out: '2026-09-30', match_state: 'ambiguous', reservation_id: null, unit_id: null, match_candidates: 2, gross_state: 'not_applicable', gross_delta_cents: null }),
    // An amendment awaiting review and a superseded original are never summed.
    row({ id: '5', booking_number: '1000001', payout_id: 'P1', amendment_state: 'conflict', supersedes_id: '1', gross_cents: 99999, net_cents: 99999 - 1640 }),
    row({ id: '6', booking_number: '1000009', payout_id: 'P1', amendment_state: 'superseded', gross_cents: 77777, net_cents: 77777 - 1640 }),
  ];

  it('sums current lines only — no amendment and no superseded line doubles a reservation', () => {
    expect(summarizeSettlements(rows)).toMatchObject({ lines: 4, grossCents: 40000, commissionCents: 6000, paymentServiceFeeCents: 560, totalFeesCents: 6560, netCents: 33440, payouts: 3, matched: 2, unmatched: 1, ambiguous: 1, discrepancies: 1, grossDeltaCents: 500 });
    expect(summarizeSettlements(rows).effectiveFeeRatio).toBeCloseTo(6560 / 40000, 12);
  });

  it('filters by period on the payout date or on check-out, by unit, by payout and by state', () => {
    const ids = (f: Parameters<typeof filterSettlements>[1]) => filterSettlements(rows, f).map((r) => r.id);
    expect(ids({ from: '2026-09-01', to: '2026-10-01' })).toEqual(['1', '2', '3']);
    expect(ids({ from: '2026-09-01', to: '2026-10-01', basis: 'checkout' })).toEqual(['1', '2', '3', '4']);
    expect(ids({ unitId: 'u2' })).toEqual(['2']);
    expect(ids({ payoutId: 'P2' })).toEqual(['2', '3']);
    expect(ids({ state: 'reconciled' })).toEqual(['1']);
    expect(ids({ state: 'discrepancy' })).toEqual(['2']);
    expect(ids({ state: 'unmatched' })).toEqual(['3']);
    expect(ids({ state: 'ambiguous' })).toEqual(['4']);
    expect(ids({ state: 'amendment' })).toEqual(['5']);
    // Filter totals follow the filter.
    expect(summarizeSettlements(filterSettlements(rows, { payoutId: 'P2' }))).toMatchObject({ lines: 2, grossCents: 20000, netCents: 16720, payouts: 1 });
  });

  it('groups payouts by ID — never one payout per reservation — and flags the ones needing attention', () => {
    const groups = groupPayouts(rows);
    expect(groups.map((g) => [g.payoutId, g.lines, g.grossCents, g.netCents, g.state])).toEqual([
      ['P3', 1, 10000, 8360, 'attention'], ['P2', 2, 20000, 16720, 'attention'], ['P1', 1, 10000, 8360, 'reconciled'],
    ]);
    expect(groups.find((g) => g.payoutId === 'P2')!.bookingNumbers).toEqual(['1000002', '1000003']);
  });

  it('flags a payout whose lines disagree on the date', () => {
    const g = groupPayouts([row({ id: 'a' }), row({ id: 'b', booking_number: '1000002', payout_date: '2026-09-09' })]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ dateConflict: true, state: 'attention', lines: 2 });
  });
});

/* ── Adapter registry ─────────────────────────────────────────────────── */

describe('the adapter registry', () => {
  it('declares the finance statement validated and version 1.0, with the guest name redacted', () => {
    expect(adapterSpec('booking_com_finance_statement')).toMatchObject({ readiness: 'validated', version: '1.0', sourceType: 'booking_com_finance_statement', redactColumns: ['Guest name'] });
  });

  it('detects the statement from its header line, and never detects a retired adapter', () => {
    expect(detectAdapter(parseCsv(HEADER).headers)?.id).toBe('booking_com_finance_statement');
    expect(detectAdapter(['Book number', 'Check-in', 'Check-out', 'Status', 'Price', 'Commission amount'])).toBeNull();
    expect(detectAdapter(['Payout date', 'Payout amount', 'Payout ID'])).toBeNull();
  });

  it('offers no retired adapter for a new upload, but still resolves it for historical batches', () => {
    expect(offeredAdapters().map((a) => a.id)).not.toContain('booking_com_payouts');
    expect(offeredAdapters().map((a) => a.id)).not.toContain('booking_com_reservations');
    expect(ADAPTERS.find((a) => a.id === 'booking_com_payouts')?.readiness).toBe('retired');
    expect(adapterSpec('booking_com_reservations').label).toMatch(/retired/);
  });
});
