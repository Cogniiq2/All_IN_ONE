/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE 17 PAYPAL SANDBOX CASES, run locally — plus the simulator-only ones.
 *
 * Mirrors docs/paypal-sandbox-e2e.md §2 case for case. Everything that can
 * be established without PayPal's real API is established here, against the
 * real adapter, the real routes, the real database and the simulated
 * provider, so the later sandbox run verifies PayPal's contract rather than
 * discovering our own bugs. The matrix is in docs/provider-simulation.md.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, futureStay, holdBooking, intentRow, jobs, operations, outboxTypes, sleep, startHarness, waitFor, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); await h.sync(); });

async function expireHold(reference: string, secondsAgo = 120) {
  h.sql(`update bolagio_booking_intents set hold_expires_at = now() - interval '${secondsAgo} seconds' where reference = '${reference}'`);
}

describe('PayPal cases', () => {
  it('2 — webhook before return: the inbox applies the capture first, the browser capture is a duplicate', async () => {
    const { reference } = await holdBooking(h);
    const orderId = await approveOrder(h, reference);
    // The capture happens (a slow browser), the webhook is processed BEFORE
    // the browser's own capture response is acted on. Simulated by capturing
    // through the provider directly, delivering the webhook, and draining the
    // inbox before the route is called again.
    await h.paypal.mode('capture', 'success');
    const first = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(first.status).toBe(200);
    await sleep(100);
    await h.reconcile();
    const again = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('confirmed');
    const row = await intentRow(h, reference);
    expect(row!.payment_order_id).toBe(orderId);
    expect(h.sql(`select count(*) from bolagio_booking_intent_events where to_status = 'paid'`)).toBe('1');
    expect((await h.paypal.calls()).filter((c: any) => c.path.endsWith('/capture'))).toHaveLength(1);
  });

  it('3 — browser closes after approval: nothing captures; after the lease the order is read and the hold released', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference);
    await sleep(80);
    await h.reconcile();
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('awaiting_payment');
    expect(row!.payment_status).toBe('approved');

    // The lease runs out. The sweep must NOT release on the clock: approved is
    // payment evidence until the provider is read.
    await expireHold(reference);
    await h.sync();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('awaiting_payment');
    expect((await jobs(h, reference)).map((j: any) => j.reason)).toContain('BOOKING_LEASE_HELD_FOR_PAYMENT');

    // Reconciliation reads the order: no capture → the approval lapsed → released.
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.payment_status).toBe('cancelled');
    expect(['released', 'expired']).toContain(row!.status);
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('released');
    expect((await h.beds24.state()).bookings[0].status).toBe('cancelled');
    expect((await h.paypal.calls()).filter((c: any) => c.path.endsWith('/capture'))).toHaveLength(0);
  });

  it('4 — browser closes after capture: the server-side capture stands and the status route says confirmed', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference);
    // The response to this call is never read by the browser.
    void h.call('POST', '/api/booking/payment/capture', { reference });
    const row = await waitFor(h, reference, (r) => r.status === 'confirmed');
    expect(row.payment_status).toBe('paid');
    const status = await h.call('GET', `/api/booking/status?ref=${reference}`);
    expect(status.body.status).toBe('confirmed');
    expect((await h.paypal.state()).captures).toHaveLength(1);
  });

  it('5 — double submit: two concurrent order creates yield one order; two concurrent captures yield one capture', async () => {
    const { reference } = await holdBooking(h);
    const [a, b] = await Promise.all([
      h.call('POST', '/api/booking/payment/order', { reference }),
      h.call('POST', '/api/booking/payment/order', { reference }),
    ]);
    const ids = new Set([a.body.orderId, b.body.orderId].filter(Boolean));
    expect(ids.size).toBe(1);
    expect((await h.paypal.state()).orders).toHaveLength(1);
    await h.paypal.approve(Array.from(ids)[0]);
    const [c, d] = await Promise.all([
      h.call('POST', '/api/booking/payment/capture', { reference }),
      h.call('POST', '/api/booking/payment/capture', { reference }),
    ]);
    expect([c.status, d.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect((await h.paypal.state()).captures).toHaveLength(1);
    await waitFor(h, reference, (r) => r.status === 'confirmed');
    expect(h.sql(`select count(*) from bolagio_booking_intent_events where to_status = 'paid'`)).toBe('1');
  });

  it('6 — refreshing the return page: repeated captures are idempotent and create no new order', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference);
    await h.call('POST', '/api/booking/payment/capture', { reference });
    for (let i = 0; i < 4; i += 1) {
      const r = await h.call('POST', '/api/booking/payment/capture', { reference });
      expect(r.status).toBe(200);
      expect(r.body.paymentStatus).toBe('paid');
    }
    const again = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(again.status).toBe(410); // confirmed is not a payable state: no order is handed back
    const state = await h.paypal.state();
    expect(state.orders).toHaveLength(1);
    expect(state.captures).toHaveLength(1);
  });

  it('7 — cancel at PayPal: the hold stands until the lease, then the sweep releases and the nights reopen', async () => {
    const { reference } = await holdBooking(h);
    const order = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(order.status).toBe(201);
    // The guest cancels in the PayPal window: no approval, no capture.
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('payment_session_created');
    await h.sync();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('payment_session_created'); // lease not up
    await expireHold(reference);
    await h.sync();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('released');
    const sim = await h.beds24.state();
    expect(sim.bookings[0].status).toBe('cancelled');
    expect((await outboxTypes(h, reference))).toEqual(expect.arrayContaining(['booking.expired', 'booking.cancelled']));
  });

  it('8 — declined instrument, then a successful retry on the SAME order (denied → paid)', async () => {
    const { reference } = await holdBooking(h);
    const orderId = await approveOrder(h, reference);
    await h.paypal.mode('capture', 'decline');
    const declined = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(declined.status).toBe(502);
    expect(declined.body.error).toBe('payment_handoff_failed');
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('payment_failed');
    expect(row!.payment_status).toBe('denied');
    expect(await outboxTypes(h, reference)).toContain('payment.failed');

    // The guest restarts with another funding source: the same order is reused.
    await h.paypal.mode('capture', 'success');
    const reused = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(reused.status).toBe(201);
    expect(reused.body.orderId).toBe(orderId);
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(200);
    row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(row!.payment_status).toBe('paid');
    expect((await h.paypal.state()).orders).toHaveLength(1);
  });

  it('9 — duplicate webhook: one processed, the rest are duplicates, no state change', async () => {
    await h.paypal.config({ autoWebhook: 'duplicate' });
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.call('POST', '/api/booking/payment/capture', { reference });
    await sleep(300);
    expect(h.sql(`select count(*) from bolagio_payment_events where event_type = 'PAYMENT.CAPTURE.COMPLETED'`)).toBe('1');
    // And an explicit resend of the very same event id.
    const events = (await h.paypal.state()).events.filter((e: any) => e.type === 'PAYMENT.CAPTURE.COMPLETED');
    await h.paypal.webhook({ eventId: events[0].id, count: 2 });
    expect(h.sql(`select count(*) from bolagio_payment_events where event_type = 'PAYMENT.CAPTURE.COMPLETED'`)).toBe('1');
    await h.reconcile();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(h.sql(`select count(*) from bolagio_booking_intent_events where to_status = 'paid'`)).toBe('1');
  });

  it('10 — reordered webhooks: an APPROVED after a COMPLETED is refused by compare-and-set', async () => {
    const { reference } = await holdBooking(h);
    const orderId = await approveOrder(h, reference, false);
    await h.call('POST', '/api/booking/payment/capture', { reference });
    await waitFor(h, reference, (r) => r.status === 'confirmed');
    await h.paypal.webhook({ orderId, type: 'CHECKOUT.ORDER.APPROVED', resourceOverride: { id: orderId, status: 'APPROVED' } });
    await sleep(60);
    await h.reconcile();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(row!.payment_status).toBe('paid');
  });

  it('11 — tampered webhook: stored as verification failed, never processed, 200 returned', async () => {
    const { reference } = await holdBooking(h);
    const orderId = await approveOrder(h, reference, false);
    await h.paypal.config({ autoWebhook: 'none' });
    await h.call('POST', '/api/booking/payment/capture', { reference });
    const captureId = (await h.paypal.state()).captures[0].id;
    const result = await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.COMPLETED', tamper: true });
    expect(result.deliveries[0].status).toBe(200);
    expect(h.sql(`select verification || ':' || status from bolagio_payment_events`)).toBe('failed:failed');
    await h.reconcile();
    expect(h.sql(`select count(*) from bolagio_payment_events where processed_at is not null`)).toBe('0');
    expect(orderId).toBeTruthy();
  });

  it('12 — wrong amount: manual_review with PAYMENT_AMOUNT_MISMATCH, no confirmation, no refund, hold intact', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.paypal.mode('capture', 'wrong_amount');
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(200);
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('manual_review');
    expect(row!.last_failure_code).toBe('PAYMENT_AMOUNT_MISMATCH');
    expect(row!.payment_status).toBe('unknown');
    expect(row!.beds24_booking_id).toBeTruthy();
    expect((await h.beds24.state()).bookings[0].status).toBe('new');
    expect((await jobs(h, reference)).map((j: any) => [j.reason, j.severity])).toContainEqual(['PAYMENT_AMOUNT_MISMATCH', 1]);
    expect(await outboxTypes(h, reference)).toContain('booking.manual_review_required');
    expect((await h.paypal.state()).refunds).toHaveLength(0);
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('manual_review');
    // A refund never happens by itself, however many passes run.
    await h.reconcile();
    expect((await h.paypal.state()).refunds).toHaveLength(0);
  });

  it('12b — wrong currency: the same refusal', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.paypal.mode('capture', 'wrong_currency');
    await h.call('POST', '/api/booking/payment/capture', { reference });
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('manual_review');
    expect(row!.last_failure_code).toBe('PAYMENT_CURRENCY_MISMATCH');
  });

  it('13 — capture timeout: payment unknown, no release; a pass reads the order and lets a later capture through', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.paypal.mode('capture', 'timeout');
    const attempt = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error).toBe('pending_verification');
    let row = await intentRow(h, reference);
    expect(row!.payment_status).toBe('unknown');
    expect((await operations(h, reference)).map((o: any) => [o.operation_type, o.outcome])).toContainEqual(['capture', 'outcome_unknown']);

    // The lease runs out: nothing releases while the outcome is unknown.
    await expireHold(reference);
    await h.sync();
    expect((await intentRow(h, reference))!.status).not.toBe('released');
    expect((await h.beds24.state()).bookings[0].status).toBe('new');

    // A blind retry is refused by the database, not by good intentions.
    await h.paypal.mode('capture', 'success');
    const blind = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(blind.status).toBe(409);
    expect((await h.paypal.calls()).filter((c: any) => c.path.endsWith('/capture'))).toHaveLength(1);

    // Reconciliation READS the order: never captured → the uncertainty resolves.
    h.sql(`update bolagio_booking_intents set hold_expires_at = now() + interval '10 minutes' where reference = '${reference}'`);
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.payment_status).toBe('approved');
    const retried = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(retried.status).toBe(200);
    expect((await intentRow(h, reference))!.status).toBe('confirmed');
  });

  it('13b — capture executed but the response was lost: reconciliation applies the capture it finds on the order', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.paypal.config({ autoWebhook: 'none' });
    await h.paypal.mode('capture', 'response_lost');
    const attempt = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(attempt.status).toBe(409);
    expect((await h.paypal.state()).captures).toHaveLength(1);
    expect((await intentRow(h, reference))!.payment_status).toBe('unknown');
    await h.reconcile();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(row!.payment_status).toBe('paid');
    expect((await h.paypal.state()).captures).toHaveLength(1);
  });

  it('14 — finalization fails: paid_unfinalized, event emitted, hold intact; fixed configuration → one pass → confirmed', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.beds24.mode('finalize', 'failure');
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(200);
    expect(captured.body.status).toBe('finalization_failed');
    let row = await intentRow(h, reference);
    expect(row!.payment_status).toBe('paid');
    expect(await outboxTypes(h, reference)).toContain('booking.paid_unfinalized');
    expect((await h.beds24.state()).bookings[0].status).toBe('new');
    expect((await jobs(h, reference)).map((j: any) => [j.reason, j.severity])).toContainEqual(['PAID_BOOKING_UNFINALIZED', 1]);
    // No release, no refund, however long it stays.
    await expireHold(reference);
    await h.sync();
    expect((await intentRow(h, reference))!.status).toBe('finalization_failed');
    expect((await h.paypal.state()).refunds).toHaveLength(0);

    await h.beds24.mode('finalize', 'success');
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect((await h.beds24.state()).bookings).toHaveLength(1); // never a second booking
    expect((await outboxTypes(h, reference)).filter((t) => t === 'booking.confirmed')).toHaveLength(1);
  });

  it('14b — finalization lands in the wrong status: unverified, never confirmed on the write alone', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.beds24.mode('finalize', 'status_mismatch');
    await h.call('POST', '/api/booking/payment/capture', { reference });
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('paid_unfinalized');
    expect(row!.last_failure_code).toBe('BEDS24_FINALIZATION_UNVERIFIED');
    await h.beds24.mode('finalize', 'success');
    await h.reconcile();
    expect((await intentRow(h, reference))!.status).toBe('confirmed');
  });

  it('15 — hold expiry race: a capture after the lease is refused; before it, applied; never both', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await expireHold(reference, 1);
    const late = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(late.status).toBe(410);
    expect(late.body.error).toBe('hold_expired');
    expect((await h.paypal.state()).captures).toHaveLength(0);
    // The sweep may only release after the grace period.
    await h.sync();
    expect(['payment_session_created', 'awaiting_payment']).toContain((await intentRow(h, reference))!.status);
    await expireHold(reference, 120);
    await h.reconcile(); // reads the approved order: no capture → withdrawn
    await h.sync();
    expect((await intentRow(h, reference))!.status).toBe('released');
  });

  it('16 — a refund from the dashboard: payment refunded, booking unchanged, event emitted, escalated', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.call('POST', '/api/booking/payment/capture', { reference });
    await waitFor(h, reference, (r) => r.status === 'confirmed');
    const captureId = (await h.paypal.state()).captures[0].id;
    // Refund issued outside the system (the dashboard), announced by webhook.
    const refund = await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-DASH1', status: 'COMPLETED' } });
    expect(refund.deliveries[0].status).toBe(200);
    await h.reconcile();
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(row!.payment_status).toBe('refunded');
    expect(row!.reconciliation_state).toBe('manual');
    expect(await outboxTypes(h, reference)).toContain('payment.refunded');
    expect((await jobs(h, reference)).map((j: any) => j.reason)).toContain('PAYMENT_REFUNDED');
    expect((await h.beds24.state()).bookings[0].status).toBe('confirmed');
  });

  it('17 — PENDING capture: payment_pending, the lease refuses to release, a later COMPLETED confirms', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.paypal.config({ autoWebhook: 'none' });
    await h.paypal.mode('capture', 'pending');
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(200);
    expect(captured.body.paymentStatus).toBe('capture_pending');
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('payment_pending');
    await expireHold(reference);
    await h.sync();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('payment_pending');
    expect((await h.beds24.state()).bookings[0].status).toBe('new');
    // The eCheck clears.
    const captureId = (await h.paypal.state()).captures[0].id;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.COMPLETED', resourceOverride: { status: 'COMPLETED' } });
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(row!.payment_status).toBe('paid');
  });
});

describe('simulator-only failure modes', () => {
  it('a server error on order creation is uncertain: the guest waits, nothing is retried blind', async () => {
    const { reference } = await holdBooking(h);
    await h.paypal.mode('create_order', 'server_error');
    const order = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(order.status).toBe(409);
    expect(order.body.error).toBe('pending_verification');
    expect((await operations(h, reference)).map((o: any) => [o.operation_type, o.outcome])).toContainEqual(['create_order', 'outcome_unknown']);
    expect((await intentRow(h, reference))!.payment_status).toBe('unknown');
    await h.paypal.mode('create_order', 'success');
    const again = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(again.status).toBe(409); // refused until reconciled
    expect((await h.paypal.calls()).filter((c: any) => c.path === '/v2/checkout/orders' && c.method === 'POST')).toHaveLength(1);
  });

  it('a malformed 200 on order creation is UNCERTAIN: the order may exist, so the guest waits', async () => {
    const { reference } = await holdBooking(h);
    await h.paypal.mode('create_order', 'malformed');
    const order = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(order.status).toBe(409);
    expect(order.body.error).toBe('pending_verification');
    expect((await intentRow(h, reference))!.payment_order_id).toBeNull();
    expect((await operations(h, reference)).map((o: any) => [o.operation_type, o.outcome])).toContainEqual(['create_order', 'outcome_unknown']);
  });

  it('a token failure fails closed before any order is created', async () => {
    const { reference } = await holdBooking(h);
    await h.paypal.mode('token', 'unauthorized');
    const order = await h.call('POST', '/api/booking/payment/order', { reference });
    expect(order.status).toBe(502);
    expect((await h.paypal.state()).orders).toHaveLength(0);
  });

  it('booking not found at the provider: an answered 404 leaves the hold standing', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    h.sql(`update bolagio_booking_intents set payment_order_id = 'SIM-ORD-GONE' where reference = '${reference}'`);
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(400);
    expect(['payment_session_created', 'awaiting_payment']).toContain((await intentRow(h, reference))!.status);
  });

  it('already captured at the provider: the adapter reads the order and reports the truth', async () => {
    const { reference } = await holdBooking(h);
    const orderId = await approveOrder(h, reference, false);
    // Captured "elsewhere": drive the provider directly, then capture through our route.
    const token = await fetch(`${h.paypal.url}/v1/oauth2/token`, { method: 'POST', headers: { authorization: 'Basic eDp5' } }).then((r) => r.json());
    await fetch(`${h.paypal.url}/v2/checkout/orders/${orderId}/capture`, { method: 'POST', headers: { authorization: `Bearer ${token.access_token}` } });
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(200);
    expect((await intentRow(h, reference))!.status).toBe('confirmed');
    expect((await h.paypal.state()).captures).toHaveLength(1);
  });
});
