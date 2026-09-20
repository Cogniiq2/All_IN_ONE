/**
 * ══════════════════════════════════════════════════════════════════════════
 * CANCELLATION AND REFUND — cases A to M, through the real sagas.
 *
 * The database tests (tests/sql/completion.sql) prove the invariants; these
 * prove the SAGAS drive the simulated providers to the right end state and
 * stop where they must: an authorised paid cancellation releases at Beds24
 * and records a refund decision but sends no refund unless the gate is on;
 * an unknown release keeps the dates protected; an unknown refund is read
 * back from the order; a second refund is refused.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, holdBooking, intentRow, jobs, operations, outboxTypes, startHarness, waitFor, type Harness } from './harness';
import { cancelBooking } from '@/lib/booking/cancellation';
import { executeRefund } from '@/lib/booking/refunds';
import { createLogger } from '@/lib/booking/logger';
import { findIntentByReference } from '@/lib/booking/repository';

let h: Harness;
const logger = createLogger();
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); await h.sync(); process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'false'; });

async function confirmedBooking() {
  const { reference } = await holdBooking(h);
  await approveOrder(h, reference, false);
  await h.call('POST', '/api/booking/payment/capture', { reference });
  await waitFor(h, reference, (r) => r.status === 'confirmed');
  return (await findIntentByReference(reference))!;
}

describe('unpaid cancellations', () => {
  it('A — nothing held: cancelled outright, no provider call', async () => {
    const stay = { checkIn: '2027-11-10', checkOut: '2027-11-12' };
    h.sql(`insert into bolagio_booking_intents (reference, unit_id, check_in, check_out, adults, idempotency_key, currency)
           select 'BLG-CANAAA', id, '${stay.checkIn}', '${stay.checkOut}', 2, 'k-a', 'EUR' from bolagio_units where slug='schulstrasse-i'`);
    const intent = (await findIntentByReference('BLG-CANAAA'))!;
    const result = await cancelBooking(intent, { actor: 'op@example.com', reason: 'guest changed plans' }, logger);
    expect(result.outcome).toBe('cancelled');
    expect((await intentRow(h, 'BLG-CANAAA'))!.status).toBe('cancelled');
    expect((await h.beds24.calls()).filter((c: any) => c.method === 'POST')).toHaveLength(0);
  });

  it('B — held, unpaid: released at Beds24, verified, cancelled; a repeat is idempotent (L)', async () => {
    const { reference } = await holdBooking(h);
    const intent = (await findIntentByReference(reference))!;
    const result = await cancelBooking(intent, { actor: 'op@example.com', reason: 'guest called' }, logger);
    expect(result.outcome).toBe('cancelled');
    const row = await intentRow(h, reference);
    expect(row!.status).toBe('cancelled');
    expect(row!.cancellation_completed_at).not.toBeNull();
    expect(row!.cancellation_requested_by).toBe('op@example.com');
    expect((await h.beds24.state()).bookings[0].status).toBe('cancelled');
    expect(await outboxTypes(h, reference)).toEqual(expect.arrayContaining(['booking.cancellation_requested', 'booking.cancelled']));
    const again = await cancelBooking((await findIntentByReference(reference))!, { actor: 'other@example.com' }, logger);
    expect(again.outcome).toBe('already_cancelled');
    expect((await h.beds24.calls()).filter((c: any) => c.method === 'POST' && c.body?.[0]?.status === 'cancelled')).toHaveLength(1);
  });

  it('C — declined payment: releasable without authorisation', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, false);
    await h.paypal.mode('capture', 'decline');
    await h.call('POST', '/api/booking/payment/capture', { reference });
    expect((await intentRow(h, reference))!.payment_status).toBe('denied');
    const result = await cancelBooking((await findIntentByReference(reference))!, { actor: 'op@example.com' }, logger);
    expect(result.outcome).toBe('cancelled');
    expect((await h.beds24.state()).bookings[0].status).toBe('cancelled');
  });

  it('B′ — an approved order is payment evidence: refused without authorisation, released with it', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference, true);
    await new Promise((r) => setTimeout(r, 100));
    await h.reconcile(); // processes CHECKOUT.ORDER.APPROVED → payment_status approved
    expect((await intentRow(h, reference))!.payment_status).toBe('approved');
    const intent = (await findIntentByReference(reference))!;
    const refused = await cancelBooking(intent, { actor: 'op@example.com' }, logger);
    expect(refused.outcome).toBe('refused');
    expect(refused.outcome === 'refused' && refused.code).toBe('AUTHORIZATION_REQUIRED');
    expect((await intentRow(h, reference))!.status).toBe('awaiting_payment');
    const ok = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true }, logger);
    expect(ok.outcome).toBe('cancelled');
    expect((await intentRow(h, reference))!.cancellation_authorized_by).toBe('admin@example.com');
  });

  it('F/G — release outcome unknown: dates stay protected; reconciliation finishes the cancellation later', async () => {
    const { reference } = await holdBooking(h);
    await h.beds24.mode('release', 'response_lost');
    const result = await cancelBooking((await findIntentByReference(reference))!, { actor: 'op@example.com' }, logger);
    expect(result.outcome).toBe('release_pending');
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('release_failed');
    expect(row!.cancellation_requested_at).not.toBeNull();
    expect(row!.cancellation_completed_at).toBeNull();
    expect(h.sql(`select bolagio_status_reserves(status) from bolagio_booking_intents where reference='${reference}'`)).toBe('t');
    await h.beds24.mode('release', 'success');
    await h.reconcile();
    row = await intentRow(h, reference);
    expect(row!.status).toBe('cancelled');
    expect(row!.cancellation_completed_at).not.toBeNull();
  });
});

describe('paid cancellations', () => {
  it('D/H — confirmed and paid: refused without authorisation and without a refund decision; with both, released and cancelled, no refund sent', async () => {
    const intent = await confirmedBooking();
    const noAuth = await cancelBooking(intent, { actor: 'op@example.com' }, logger);
    expect(noAuth.outcome === 'refused' && noAuth.code).toBe('AUTHORIZATION_REQUIRED');
    const noDecision = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true }, logger);
    expect(noDecision.outcome === 'refused' && noDecision.code).toBe('REFUND_DECISION_REQUIRED');
    expect((await intentRow(h, intent.reference))!.status).toBe('confirmed');

    const ok = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, reason: 'no-show policy', refundCents: 0 }, logger);
    expect(ok.outcome).toBe('cancelled');
    const row = await intentRow(h, intent.reference);
    expect(row!.status).toBe('cancelled');
    expect(row!.refund_state).toBe('not_required');
    expect(row!.payment_status).toBe('paid');
    expect((await h.beds24.state()).bookings[0].status).toBe('cancelled');
    expect((await h.paypal.state()).refunds).toHaveLength(0);
    // Its turnover is voided and announced.
    await h.reconcile();
    expect(h.sql(`select status from bolagio_turnovers`)).toBe('');
  });

  it('I — refund required is RECORDED, never executed while the gate is off', async () => {
    const intent = await confirmedBooking();
    const ok = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    expect(ok.outcome).toBe('cancelled');
    const row = await intentRow(h, intent.reference);
    expect(row!.refund_state).toBe('required');
    expect(row!.refund_required_cents).toBe(intent.quotedTotalCents);
    const refused = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(refused.outcome).toBe('refused');
    expect(refused.outcome === 'refused' && refused.code).toBe('EXECUTION_DISABLED');
    expect((await h.paypal.state()).refunds).toHaveLength(0);
    expect((await intentRow(h, intent.reference))!.refund_state).toBe('required');
  });

  it('I′ — a decided refund done by hand at the provider settles the ledger through the REFUNDED webhook, once', async () => {
    const intent = await confirmedBooking();
    const ok = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    expect(ok.outcome).toBe('cancelled');
    expect((await intentRow(h, intent.reference))!.refund_state).toBe('required');
    const captureId = (await h.paypal.state()).captures[0].id;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-MANUAL1', status: 'COMPLETED' } });
    await h.reconcile();
    const row = await intentRow(h, intent.reference);
    expect(row!.refund_state).toBe('completed');
    expect(row!.refund_id).toBe('SIM-REF-MANUAL1');
    expect(row!.payment_status).toBe('refunded');
    expect(row!.status).toBe('cancelled');
    // One event, one fact: the webhook branch did not emit a second payment.refunded.
    expect(h.sql(`select count(*) from bolagio_outbox_events where reference='${intent.reference}' and event_type='payment.refunded'`)).toBe('1');
    expect(h.sql(`select count(*) from bolagio_reconciliation_jobs where reason='PAYMENT_REFUNDED'`)).toBe('0');
  });

  it('J — refund executed (gate on): completed with the provider refund id; the REFUNDED webhook is a duplicate', async () => {
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
    const intent = await confirmedBooking();
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    const result = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(result.outcome).toBe('completed');
    const row = await intentRow(h, intent.reference);
    expect(row!.refund_state).toBe('completed');
    expect(row!.refund_id).toMatch(/^SIM-REF-/);
    expect(row!.refunded_amount_cents).toBe(intent.quotedTotalCents);
    expect(row!.payment_status).toBe('refunded');
    expect((await outboxTypes(h, intent.reference)).filter((t) => t === 'payment.refunded')).toHaveLength(1);
    // The provider's own REFUNDED webhook arrives afterwards: recorded once.
    await new Promise((r) => setTimeout(r, 120));
    await h.reconcile();
    expect((await outboxTypes(h, intent.reference)).filter((t) => t === 'payment.refunded')).toHaveLength(1);
    // M — a second execution is refused; the provider saw exactly one refund.
    const again = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(again.outcome).toBe('refused');
    expect(again.outcome === 'refused' && again.code).toBe('REFUND_ALREADY_COMPLETED');
    expect((await h.paypal.state()).refunds).toHaveLength(1);
  });

  it('K — refund response lost: unknown, a severity-1 job, then the order read-back completes it', async () => {
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
    const intent = await confirmedBooking();
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    await h.paypal.config({ autoWebhook: 'none' });
    await h.paypal.mode('refund', 'response_lost');
    const result = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(result.outcome).toBe('unknown');
    let row = await intentRow(h, intent.reference);
    expect(row!.refund_state).toBe('unknown');
    expect((await jobs(h, intent.reference)).map((j: any) => [j.reason, j.severity])).toContainEqual(['PAYMENT_REFUND_UNCERTAIN', 1]);
    expect((await operations(h, intent.reference)).find((o: any) => o.operation_type === 'refund')!.outcome).toBe('outcome_unknown');
    // A retry is refused while unresolved: no second refund is sent.
    await h.paypal.mode('refund', 'success');
    const retry = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(retry.outcome).toBe('refused');
    expect((await h.paypal.state()).refunds).toHaveLength(1);
    // Reconciliation reads the order and finds the completed refund.
    await h.reconcile();
    row = await intentRow(h, intent.reference);
    expect(row!.refund_state).toBe('completed');
    expect(row!.refund_id).toBe((await h.paypal.state()).refunds[0].id);
    expect(row!.payment_status).toBe('refunded');
    expect((await jobs(h, intent.reference)).find((j: any) => j.reason === 'PAYMENT_REFUND_UNCERTAIN')!.status).toBe('resolved');
  });

  it('K′ — refund timed out and never executed: read-back finds no refund, the job keeps waiting, nothing is sent blind', async () => {
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
    const intent = await confirmedBooking();
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: 1000 }, logger);
    await h.paypal.mode('refund', 'timeout');
    const result = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(result.outcome).toBe('unknown');
    await h.paypal.mode('refund', 'success');
    await h.reconcile();
    expect((await intentRow(h, intent.reference))!.refund_state).toBe('unknown');
    expect((await h.paypal.state()).refunds).toHaveLength(0);
  });

  it('refund refused by the provider: failed, escalated, and retryable only through an explicit reset', async () => {
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
    const intent = await confirmedBooking();
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: 500 }, logger);
    await h.paypal.mode('refund', 'rejected');
    const result = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(result.outcome).toBe('failed');
    expect((await intentRow(h, intent.reference))!.refund_state).toBe('failed');
    expect((await jobs(h, intent.reference)).map((j: any) => j.reason)).toContain('PAYMENT_REFUND_FAILED');
    const again = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(again.outcome).toBe('refused');
  });

  it('E — a paid cancellation whose Beds24 release is unknown keeps the dates protected and finishes later', async () => {
    const intent = await confirmedBooking();
    await h.beds24.mode('release', 'timeout');
    const result = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: 0 }, logger);
    expect(result.outcome).toBe('release_pending');
    let row = await intentRow(h, intent.reference);
    expect(row!.status).toBe('release_failed');
    expect(row!.payment_status).toBe('paid');
    await h.beds24.mode('release', 'success');
    await h.reconcile();
    row = await intentRow(h, intent.reference);
    expect(row!.status).toBe('cancelled');
  });

  it('never auto-refunds and never releases a paid booking without a person, whatever fails', async () => {
    const intent = await confirmedBooking();
    // A failing finalization-style condition cannot arise on a confirmed
    // booking; the sweeps run and nothing moves.
    h.sql(`update bolagio_booking_intents set hold_expires_at = now() - interval '1 hour' where reference='${intent.reference}'`);
    await h.sync();
    await h.reconcile();
    const row = await intentRow(h, intent.reference);
    expect(row!.status).toBe('confirmed');
    expect((await h.paypal.state()).refunds).toHaveLength(0);
    expect((await h.beds24.state()).bookings[0].status).toBe('confirmed');
  });
});
