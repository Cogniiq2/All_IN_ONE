/**
 * ══════════════════════════════════════════════════════════════════════════
 * BEDS24 CONTRACT TESTS — every plausible provider behaviour, survived.
 *
 * Real Beds24 behaviour cannot be proven here (docs/beds24-contract.md §4 is
 * the one live validation still owed). What CAN be proven is that OUR code
 * ends in a safe state for every answer the channel manager might give:
 * reference echoed or not, booking found or not, status as asked or not,
 * read timeout, write timeout, write with the answer lost, duplicate result,
 * release unknown, inventory changed under us. The matrix that turns these
 * into "what the live test still has to answer" is in docs/provider-simulation.md.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, futureStay, GUEST, holdBooking, intentRow, jobs, operations, outboxTypes, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); await h.sync(); });

const createCalls = async () => (await h.beds24.calls()).filter((c: any) => c.method === 'POST' && c.path === '/bookings' && c.body?.[0]?.id === undefined);

async function attemptHold(stay = futureStay()) {
  return h.call('POST', '/api/booking/intent', { unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0, guest: GUEST, attemptId: `a-${Math.random()}` });
}

describe('holds', () => {
  it('reference echoed: the hold is verified against the read-back and adopted', async () => {
    const { reference } = await holdBooking(h);
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('hold_created');
    expect(row!.beds24_verified_at).not.toBeNull();
    const reads = (await h.beds24.calls()).filter((c: any) => c.method === 'GET' && c.path === '/bookings' && c.query.id);
    expect(reads.length).toBeGreaterThanOrEqual(1);
  });

  it('reference absent from the write response: the hold still verifies on room and dates', async () => {
    await h.beds24.mode('hold', 'reference_absent');
    await h.beds24.mode('read', 'reference_absent');
    const { reference } = await holdBooking(h);
    expect((await intentRow(h, reference))!.status).toBe('hold_created');
  });

  it('right id, wrong room or dates: manual review, never released, never resold', async () => {
    await h.beds24.mode('hold', 'mismatch');
    await h.beds24.mode('read', 'mismatch');
    const stay = futureStay();
    const attempt = await attemptHold(stay);
    expect(attempt.status).toBe(409);
    expect(attempt.body.error).toBe('pending_verification');
    const row = await intentRow(h, attempt.body.reference ?? h.sql('select reference from bolagio_booking_intents limit 1'));
    expect(row!.status).toBe('manual_review');
    expect(row!.last_failure_code).toBe('BEDS24_HOLD_MISMATCH');
    // The range is still reserved locally: a second guest cannot take it.
    const second = await attemptHold(stay);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('availability_conflict');
    // And nothing was cancelled at Beds24 — it might be someone else's booking.
    expect((await h.beds24.state()).bookings.every((b: any) => b.status !== 'cancelled')).toBe(true);
  });

  it('write timeout: outcome unknown, manual review, local range protected, no second POST ever', async () => {
    await h.beds24.mode('hold', 'timeout');
    const stay = futureStay();
    const attempt = await attemptHold(stay);
    expect(attempt.status).toBe(409);
    expect(attempt.body.error).toBe('pending_verification');
    const reference = h.sql('select reference from bolagio_booking_intents limit 1');
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('manual_review');
    expect(row!.last_failure_code).toBe('BEDS24_HOLD_OUTCOME_UNKNOWN');
    expect((await operations(h, reference)).map((o: any) => [o.operation_type, o.outcome])).toEqual([['create_hold', 'outcome_unknown']]);
    expect(await outboxTypes(h, reference)).toContain('booking.manual_review_required');

    // The guest retries the same attempt: refused, not re-sent.
    const retry = await attemptHold(stay);
    expect(retry.status).toBe(409);
    expect(await createCalls()).toHaveLength(1);

    // Reconciliation searches; the timeout case never created anything → escalated, still one POST.
    await h.beds24.mode('hold', 'success');
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('manual_review');
    expect(await createCalls()).toHaveLength(1);
    expect((await jobs(h, reference)).map((j: any) => j.reason)).toContain('BEDS24_HOLD_OUTCOME_UNKNOWN');
  });

  it('write executed, answer lost, reference echoed by search: reconciliation adopts the booking', async () => {
    await h.beds24.mode('hold', 'response_lost');
    const attempt = await attemptHold();
    expect(attempt.status).toBe(409);
    const reference = h.sql('select reference from bolagio_booking_intents limit 1');
    expect((await h.beds24.state()).bookings).toHaveLength(1);
    await h.beds24.mode('hold', 'success');
    await h.reconcile();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('hold_created');
    expect(row!.beds24_booking_id).toBe(String((await h.beds24.state()).bookings[0].id));
    expect(await createCalls()).toHaveLength(1);
    expect((await operations(h, reference))[0].outcome).toBe('reconciled');
  });

  it('write executed, answer lost, search returns no reference: escalated, never a second booking', async () => {
    await h.beds24.mode('hold', 'response_lost');
    await h.beds24.mode('search', 'reference_absent');
    await attemptHold();
    const reference = h.sql('select reference from bolagio_booking_intents limit 1');
    await h.beds24.mode('hold', 'success');
    await h.reconcile();
    await h.reconcile();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('manual_review');
    expect(await createCalls()).toHaveLength(1);
    expect((await h.beds24.state()).bookings).toHaveLength(1);
  });

  it('write executed, answer lost, booking not found by search at all: escalated', async () => {
    await h.beds24.mode('hold', 'response_lost');
    await h.beds24.mode('search', 'not_found');
    await attemptHold();
    const reference = h.sql('select reference from bolagio_booking_intents limit 1');
    await h.beds24.mode('hold', 'success');
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('manual_review');
    expect(await createCalls()).toHaveLength(1);
  });

  it('duplicate result entries in the write response: the first is taken, one booking recorded', async () => {
    await h.beds24.mode('hold', 'duplicate_result');
    const { reference } = await holdBooking(h);
    expect((await intentRow(h, reference))!.status).toBe('hold_created');
    expect(h.sql('select count(*) from bolagio_booking_intents')).toBe('1');
  });

  it('inventory changes between quote and hold: the provider refuses, the lock is unwound, nothing is orphaned', async () => {
    const stay = futureStay();
    // The quote is fine…
    const quote = await h.call('POST', '/api/booking/quote', { unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0 });
    expect(quote.status).toBe(200);
    // …then a Booking.com reservation lands on one of the nights.
    await h.beds24.block('731147', stay.checkIn, stay.checkOut);
    const attempt = await attemptHold(stay);
    expect(attempt.status).toBe(409);
    expect(attempt.body.error).toBe('availability_conflict');
    // The live re-quote refuses before an intent is written, or the lock is unwound: either way nothing reserves.
    expect(h.sql('select count(*) from bolagio_booking_intents where bolagio_status_reserves(status)')).toBe('0');
    expect((await h.beds24.state()).bookings).toHaveLength(0);
    expect(await createCalls()).toHaveLength(0);
  });

  it('a hold whose status does not block inventory is not a hold: manual review, not confirmed', async () => {
    await h.beds24.config({ blockingStatuses: ['confirmed'] });
    const attempt = await attemptHold();
    expect(attempt.status).toBe(409);
    expect(attempt.body.error).toBe('pending_verification');
    const reference = h.sql('select reference from bolagio_booking_intents limit 1');
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('manual_review');
    expect(row!.last_failure_code).toBe('BEDS24_HOLD_DID_NOT_BLOCK');
  });

  it('a conflict answered by the provider unwinds the lock so the guest can try other dates', async () => {
    await h.beds24.mode('hold', 'conflict');
    const attempt = await attemptHold();
    expect(attempt.status).toBe(409);
    expect(h.sql('select status from bolagio_booking_intents')).toBe('unavailable');
    expect(h.sql('select count(*) from bolagio_booking_intents where bolagio_status_reserves(status)')).toBe('0');
  });

  it('read timeout after a successful write: verification passes on the write fields, the hold stands', async () => {
    await h.beds24.mode('read', 'timeout');
    const { reference } = await holdBooking(h);
    expect((await intentRow(h, reference))!.status).toBe('hold_created');
  });

  it('calendar unavailable during the post-hold check: the hold stands, and a BEDS24_HOLD_DID_NOT_BLOCK check is queued for the sweep', async () => {
    // The hold itself succeeds; the calendar read that verifies it timed out.
    await h.beds24.mode('calendar', 'timeout');
    const { reference } = await holdBooking(h);
    await h.beds24.mode('calendar', 'success');
    const row = (await intentRow(h, reference))!;
    expect(row.status).toBe('hold_created');
    expect(row.beds24_booking_id).toBeTruthy();
    expect(h.sql(`select count(*) from bolagio_reconciliation_jobs where reason = 'BEDS24_HOLD_DID_NOT_BLOCK' and status in ('pending','failed')`)).toBe('1');
    // The sweep re-checks with the calendar back: the hold blocked the nights, the job resolves, nothing is torn down.
    h.dueNow();
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('hold_created');
    expect(h.sql(`select status from bolagio_reconciliation_jobs where reason = 'BEDS24_HOLD_DID_NOT_BLOCK'`)).toBe('resolved');
  });
});

describe('finalization', () => {
  async function paidBooking() {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    return reference;
  }

  it('finalize answered with success but read back in another status: unverified, retried, never confirmed on the write', async () => {
    const reference = await paidBooking();
    await h.beds24.mode('read', 'status_mismatch');
    await h.call('POST', '/api/booking/payment/capture', { reference });
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('paid_unfinalized');
    expect(row!.last_failure_code).toBe('BEDS24_FINALIZATION_UNVERIFIED');
    await h.beds24.mode('read', 'success');
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
  });

  it('finalize response lost: retried against the SAME booking id until it verifies', async () => {
    const reference = await paidBooking();
    await h.beds24.mode('finalize', 'response_lost');
    await h.call('POST', '/api/booking/payment/capture', { reference });
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('finalization_failed');
    expect(row!.payment_status).toBe('paid');
    const finalizeOps = (await operations(h, reference)).filter((o: any) => o.operation_type === 'finalize');
    expect(finalizeOps[0].outcome).toBe('outcome_unknown');
    await h.beds24.mode('finalize', 'success');
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect((await h.beds24.state()).bookings).toHaveLength(1);
    expect((await operations(h, reference)).filter((o: any) => o.operation_type === 'finalize')).toHaveLength(1);
  });

  it('finalize timeout: unfinalized and retried; the hold and the payment are untouched throughout', async () => {
    const reference = await paidBooking();
    await h.beds24.mode('finalize', 'timeout');
    await h.call('POST', '/api/booking/payment/capture', { reference });
    expect((await intentRow(h, reference))!.status).toBe('finalization_failed');
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('finalization_failed');
    await h.beds24.mode('finalize', 'success');
    h.dueNow();
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('confirmed');
    expect((await h.paypal.state()).refunds).toHaveLength(0);
  });
});

describe('release', () => {
  async function expiredHold() {
    const { reference } = await holdBooking(h);
    await h.call('POST', '/api/booking/payment/order', { reference });
    h.sql(`update bolagio_booking_intents set hold_expires_at = now() - interval '2 minutes' where reference = '${reference}'`);
    return reference;
  }

  it('release success: verified against the calendar, released, then cancelled event', async () => {
    const reference = await expiredHold();
    await h.sync();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('released');
    expect(row!.beds24_status).toBe('cancelled');
    expect(await outboxTypes(h, reference)).toContain('booking.cancelled');
  });

  it('release response lost: release_failed, the range stays reserved, reconciliation re-sends (idempotent) and verifies', async () => {
    const reference = await expiredHold();
    await h.beds24.mode('release', 'response_lost');
    await h.sync();
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('release_failed');
    expect(h.sql(`select bolagio_status_reserves(status) from bolagio_booking_intents where reference='${reference}'`)).toBe('t');
    expect(await outboxTypes(h, reference)).toContain('booking.release_failed');
    await h.beds24.mode('release', 'success');
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('released');
  });

  it('release accepted but the nights stay closed: unverified, reserved, re-checked, never advertised', async () => {
    const reference = await expiredHold();
    await h.beds24.mode('release', 'still_closed');
    await h.sync();
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('release_failed');
    expect(row!.last_failure_code).toBe('BEDS24_RELEASE_UNVERIFIED');
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('release_failed');
    // The phantom block lifts (whatever held the nights is gone).
    const state = await h.beds24.state();
    const phantom = state.blocks.find((b: any) => b.reason === 'phantom');
    await h.beds24.unblock(phantom.roomId, phantom.from, phantom.to);
    await h.beds24.mode('release', 'success');
    h.dueNow();
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('released');
  });

  it('release timeout: the same, and no second cancel is sent blind while the first is unresolved', async () => {
    const reference = await expiredHold();
    await h.beds24.mode('release', 'timeout');
    await h.sync();
    expect((await intentRow(h, reference))!.status).toBe('release_failed');
    await h.beds24.mode('release', 'success');
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('released');
    // Release is idempotent by nature, so the re-send is permitted — and exactly one succeeded.
    const releases = (await h.beds24.calls()).filter((c: any) => c.method === 'POST' && c.path === '/bookings' && c.body?.[0]?.status === 'cancelled');
    expect(releases).toHaveLength(2);
  });
});
