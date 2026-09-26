/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FINANCE PIPELINE — booking and payment facts reach the ledger by
 * themselves, once, and a failure on the way is visible and recovered.
 *
 * Against the real schema (migration 20260927 applied by the stack), the
 * real routes and the PayPal / Beds24 simulators:
 *
 *   • a state change queues finance work in its own transaction (trigger)
 *   • the reconcile pass drains it: revenue and cash appear exactly once
 *   • a duplicate webhook stores one event and posts one payment
 *   • a refund from the saga and its webhook collapse onto one cash fact;
 *     a dashboard refund (webhook only) is recorded as cash, never as a
 *     guessed revenue reversal; partial refunds are exact
 *   • finance failing after a successful payment leaves the booking paid,
 *     records the failure, and the next pass catches up
 *   • history with no queue row is found by the catch-up; a backfill re-run
 *     writes nothing twice
 *   • a Beds24 (Booking.com) reservation is stored as a reservation and never
 *     becomes a booking intent or a ledger fact
 *   • the pipeline status view and the Finance health card say all of it
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, holdBooking, startHarness, SYNC_SECRET, waitFor, type Harness } from './harness';
import { cancelBooking } from '@/lib/booking/cancellation';
import { executeRefund } from '@/lib/booking/refunds';
import { createLogger } from '@/lib/booking/logger';
import { findIntentByReference } from '@/lib/booking/repository';

let h: Harness;
const logger = createLogger();

beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => {
  await h.resetDb();
  await h.sync();
  process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'false';
  delete process.env.FINANCE_INGESTION_BATCH;
});

const count = (table: string, where = 'true') => Number(h.sql(`select count(*) from ${table} where ${where}`));
const queueState = (intentId: string) => h.sql(`select coalesce((select state from bolagio_finance_ingestion_queue where intent_id = '${intentId}'), 'absent')`);

async function paidStay(stay?: { checkIn: string; checkOut: string }) {
  const { reference } = await holdBooking(h, stay);
  await approveOrder(h, reference, false);
  await h.call('POST', '/api/booking/payment/capture', { reference });
  await waitFor(h, reference, (r) => r.status === 'confirmed');
  return (await findIntentByReference(reference))!;
}

async function pass(options: { backfill?: boolean; limit?: number } = {}) {
  const { runFinanceIngestionPass } = await import('@/lib/finance/commands');
  return runFinanceIngestionPass({ actor: 'system:test', ...options });
}

describe('event-driven ingestion', () => {
  it('a paid booking is queued in its own transaction and reaches the ledger once through the reconcile pass', async () => {
    const intent = await paidStay();
    // Queued by the trigger when the booking was paid/confirmed — before any finance code ran.
    expect(queueState(intent.id)).toBe('pending');
    expect(count('bolagio_finance_transactions')).toBe(0);

    const report = await h.reconcile();
    expect(report.operations?.finance).toMatchObject({ mode: 'queue', claimed: 1, revenuePosted: 1, paymentsRecorded: 1, errors: 0 });
    expect(queueState(intent.id)).toBe('done');
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}' and kind = 'revenue'`)).toBe(1);
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}' and direction = 'in'`)).toBe(1);
    expect(h.sql(`select amount_cents from bolagio_finance_payments where booking_intent_id = '${intent.id}'`)).toBe(String(intent.quotedTotalCents));

    // Further passes: nothing claimed, nothing posted twice.
    const again = await h.reconcile();
    expect(again.operations?.finance).toMatchObject({ claimed: 0, revenuePosted: 0, paymentsRecorded: 0 });
    expect(count('bolagio_finance_transactions')).toBe(1);
    expect(count('bolagio_finance_payments')).toBe(1);

    // The ledger's VAT figure is derived from the new facts.
    const { loadVat } = await import('@/lib/finance/queries');
    const vat = await loadVat(intent.checkOut.slice(0, 7));
    expect(vat.ok).toBe(true);
    const status = JSON.parse(h.sql(`select row_to_json(s) from bolagio_finance_pipeline_status s`));
    expect(status).toMatchObject({ queue_pending: 0, queue_failed: 0, ledger_gaps: 0, revenue_intents: 1, booking_revenue_posted: 1 });
  });

  it('a duplicate PayPal webhook stores one event and posts one payment', async () => {
    await h.paypal.config({ autoWebhook: 'duplicate' });
    const intent = await paidStay();
    const events = (await h.paypal.state()).events.filter((e: { type: string }) => e.type === 'PAYMENT.CAPTURE.COMPLETED');
    await h.paypal.webhook({ eventId: events[0].id, count: 3 });
    expect(count('bolagio_payment_events', `event_type = 'PAYMENT.CAPTURE.COMPLETED'`)).toBe(1);
    await h.reconcile();
    await h.reconcile();
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}'`)).toBe(1);
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}'`)).toBe(1);
  });

  it('a late webhook for an already-captured payment changes nothing in the ledger', async () => {
    const intent = await paidStay();
    await h.reconcile();
    const captureId = (await h.paypal.state()).captures[0].id;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.COMPLETED', resourceOverride: { status: 'COMPLETED' } });
    await h.reconcile();
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}'`)).toBe(1);
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}'`)).toBe(1);
  });

  it('a failed payment is never revenue and never cash', async () => {
    const { reference } = await holdBooking(h);
    await approveOrder(h, reference);
    await h.paypal.mode('capture', 'decline');
    const declined = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(declined.status).toBe(502);
    await h.reconcile();
    const intent = (await findIntentByReference(reference))!;
    expect(intent.status).toBe('payment_failed');
    expect(count('bolagio_finance_transactions')).toBe(0);
    expect(count('bolagio_finance_payments')).toBe(0);
  });
});

describe('refunds', () => {
  it('a saga refund and its PAYMENT.CAPTURE.REFUNDED webhook collapse onto ONE outgoing payment and one reversal', async () => {
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
    const intent = await paidStay();
    await h.reconcile();
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    const result = await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger);
    expect(result.outcome).toBe('completed');
    const refundId = h.sql(`select refund_id from bolagio_booking_intents where id = '${intent.id}'`);
    // The provider's own webhook for the same refund, delivered (twice) after the saga recorded it.
    const captureId = (await h.paypal.state()).captures[0].id;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: refundId, status: 'COMPLETED' }, count: 2 });

    await h.reconcile();
    await h.reconcile();
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe(1);
    expect(h.sql(`select provider_reference || '|' || amount_cents from bolagio_finance_payments where booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe(`${refundId}|${intent.quotedTotalCents}`);
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}' and kind = 'refund'`)).toBe(1);
    // Revenue + refund net to zero; nothing counted twice.
    expect(h.sql(`select sum(gross_cents) from bolagio_finance_transactions where booking_intent_id = '${intent.id}' and status = 'posted'`)).toBe('0');
    expect(h.sql(`select sum(case when direction = 'in' then amount_cents else -amount_cents end) from bolagio_finance_payments where booking_intent_id = '${intent.id}'`)).toBe('0');
  });

  it('a PARTIAL refund from the PayPal dashboard is recorded as exactly that cash, with no guessed revenue reversal', async () => {
    const intent = await paidStay();
    await h.reconcile();
    const captureId = (await h.paypal.state()).captures[0].id;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-DASH-PART', status: 'COMPLETED', amount: { value: '50.00', currency_code: 'EUR' } } });
    // The verified event queued the booking by itself.
    expect(queueState(intent.id)).toBe('pending');
    await h.reconcile();
    expect(h.sql(`select direction || '|' || kind || '|' || amount_cents || '|' || provider_reference from bolagio_finance_payments where booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe('out|refund|5000|SIM-REF-DASH-PART');
    // A dashboard refund is a person's decision about the stay: the revenue stands until someone decides.
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}' and kind = 'refund'`)).toBe(0);
    // Redelivery of the same refund event: still one row.
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-DASH-PART', status: 'COMPLETED', amount: { value: '50.00', currency_code: 'EUR' } } });
    await h.reconcile();
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe(1);
  });

  it('two partial dashboard refunds are two cash facts; a full refund afterwards is a third, and the sum is exact', async () => {
    const intent = await paidStay();
    await h.reconcile();
    const captureId = (await h.paypal.state()).captures[0].id;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-P1', status: 'COMPLETED', amount: { value: '20.00', currency_code: 'EUR' } } });
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-P2', status: 'COMPLETED', amount: { value: '30.00', currency_code: 'EUR' } } });
    await h.reconcile();
    expect(h.sql(`select sum(amount_cents) from bolagio_finance_payments where booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe('5000');
    const rest = intent.quotedTotalCents! - 5000;
    await h.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.REFUNDED', resourceOverride: { id: 'SIM-REF-P3', status: 'COMPLETED', amount: { value: (rest / 100).toFixed(2), currency_code: 'EUR' } } });
    await h.reconcile();
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}' and direction = 'out'`)).toBe(3);
    expect(h.sql(`select sum(case when direction = 'in' then amount_cents else -amount_cents end) from bolagio_finance_payments where booking_intent_id = '${intent.id}'`)).toBe('0');
  });
});

describe('failure and catch-up', () => {
  it('finance failing after a successful payment leaves the booking paid, records the failure, and the next pass catches up', async () => {
    const intent = await paidStay();
    // Make the revenue posting impossible: the check-out month is locked.
    const month = intent.checkOut.slice(0, 7);
    h.sql(`insert into bolagio_finance_periods (period_key, starts_on, ends_on, status, locked_at, locked_by)
           values ('${month}', '${month}-01', (date '${month}-01' + interval '1 month')::date, 'locked', now(), 'test')
           on conflict (period_key) do update set status = 'locked'`);

    const r = await h.reconcile();
    // The booking and the payment are untouched by the finance failure.
    expect((await findIntentByReference(intent.reference))!.status).toBe('confirmed');
    expect(r.operations?.finance?.errors).toBeGreaterThan(0);
    expect(queueState(intent.id)).toBe('failed');
    expect(h.sql(`select last_error from bolagio_finance_ingestion_queue where intent_id = '${intent.id}'`)).toMatch(new RegExp(`${intent.reference} \\(revenue\\)`));
    // The cash fact is independent of the P&L and was recorded anyway.
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}'`)).toBe(1);
    expect(h.sql(`select signal from bolagio_integration_health where provider = 'finance' and signal like 'booking_ingestion.%' order by observed_at desc limit 1`)).toBe('booking_ingestion.failure');

    const { loadFinanceHealth } = await import('@/lib/finance/queries');
    const health = await loadFinanceHealth();
    expect(health.status).toBe('degraded');
    expect(health.facts.find((f) => f.label === 'ingestion failures')?.value).toBe('1');
    expect(health.summary).toMatch(/failed to post/);

    // Fixed: the period reopens; the retry comes due; one pass posts the revenue once.
    h.sql(`update bolagio_finance_periods set status = 'open', locked_at = null, locked_by = null where period_key = '${month}'`);
    h.sql(`update bolagio_finance_ingestion_queue set next_attempt_at = now() where intent_id = '${intent.id}'`);
    await h.reconcile();
    expect(queueState(intent.id)).toBe('done');
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}' and kind = 'revenue'`)).toBe(1);
    expect(count('bolagio_finance_payments', `booking_intent_id = '${intent.id}'`)).toBe(1);
  });

  it('a booking whose trigger never queued it (history, or a lost queue row) is found by the scheduled catch-up', async () => {
    const intent = await paidStay();
    h.sql(`delete from bolagio_finance_ingestion_queue`);
    const status = JSON.parse(h.sql(`select row_to_json(s) from bolagio_finance_pipeline_status s`));
    expect(status.ledger_gaps).toBe(1);
    const r = await pass();
    expect(r).toMatchObject({ mode: 'queue', enqueued: 1, claimed: 1, revenuePosted: 1, paymentsRecorded: 1 });
    expect(count('bolagio_finance_transactions', `booking_intent_id = '${intent.id}'`)).toBe(1);
    expect(JSON.parse(h.sql(`select row_to_json(s) from bolagio_finance_pipeline_status s`)).ledger_gaps).toBe(0);
  });
});

describe('backfill', () => {
  it('ingests every historical booking in bounded batches, skips what exists, and is safely re-runnable', async () => {
    const stays = [];
    for (let i = 0; i < 3; i += 1) {
      const start = new Date(Date.now() + (40 + i * 5) * 86_400_000).toISOString().slice(0, 10);
      const end = new Date(Date.now() + (42 + i * 5) * 86_400_000).toISOString().slice(0, 10);
      stays.push(await paidStay({ checkIn: start, checkOut: end }));
    }
    // One of them already reached the ledger before the backfill.
    const { ingestBookingFacts } = await import('@/lib/finance/commands');
    await ingestBookingFacts({ actor: 'system:test', intentIds: [stays[0].id] });
    // Simulate history that predates the queue: no queue rows at all.
    h.sql(`delete from bolagio_finance_ingestion_queue`);
    const before = h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_booking_intents t`);

    const first = await pass({ backfill: true, limit: 1 });
    expect(first.enqueued).toBe(2);          // the one already posted has no gap and is not queued
    expect(first.claimed).toBe(1);
    const second = await pass({ limit: 5 });
    expect(second.claimed).toBe(1);
    expect(count('bolagio_finance_transactions', `kind = 'revenue'`)).toBe(3);
    expect(count('bolagio_finance_payments', `direction = 'in'`)).toBe(3);

    // Re-run the backfill: nothing is missing, nothing is queued, nothing is written.
    const rerun = await pass({ backfill: true });
    expect(rerun).toMatchObject({ enqueued: 0, claimed: 0, revenuePosted: 0, paymentsRecorded: 0 });
    expect(count('bolagio_finance_transactions')).toBe(3);
    // Finance consumed the booking facts; it never rewrote them.
    expect(h.sql(`select md5(string_agg(t::text, '' order by id)) from bolagio_booking_intents t`)).toBe(before);
  });

  it('the backfill endpoint requires the scheduler secret and reports what is left', async () => {
    await paidStay();
    h.sql(`delete from bolagio_finance_ingestion_queue`);
    const refused = await h.call('POST', '/api/booking/finance/backfill', {});
    expect(refused.status).toBe(401);
    const ok = await h.call('POST', '/api/booking/finance/backfill', { limit: 10 }, { 'x-bolagio-signature': SYNC_SECRET });
    expect(ok.status).toBe(200);
    expect(ok.body.pass).toMatchObject({ mode: 'queue', enqueued: 1, claimed: 1, revenuePosted: 1 });
    expect(ok.body.pipeline).toMatchObject({ queue_pending: 0, ledger_gaps: 0 });
    expect(JSON.stringify(ok.body)).not.toMatch(/@example\.com/);
  });
});

describe('Beds24 reservations stay reservations', () => {
  it('a Booking.com reservation is stored in bolagio_reservations and never becomes a booking intent or a ledger fact', async () => {
    const arrival = new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 10);
    const departure = new Date(Date.now() + 73 * 86_400_000).toISOString().slice(0, 10);
    // A reservation made at the channel, as Beds24 lists it.
    const sim = h.beds24.url;
    const created = await fetch(`${sim}/bookings`, { method: 'POST', headers: { 'content-type': 'application/json', token: 'sim-beds24-token' }, body: JSON.stringify([{ roomId: 731147, propertyId: 354659, status: 'confirmed', arrival, departure, numAdult: 2, numChild: 0, price: 612.4, referer: 'Booking.com' }]) });
    expect(created.status).toBe(200);
    const intentsBefore = count('bolagio_booking_intents');

    const sync = await h.call('POST', '/api/booking/reservations/sync', {}, { 'x-bolagio-signature': SYNC_SECRET });
    expect(sync.status).toBe(200);
    expect(count('bolagio_reservations', `check_in = '${arrival}'`)).toBe(1);
    expect(h.sql(`select coalesce(direct_intent_id::text, 'none') from bolagio_reservations where check_in = '${arrival}'`)).toBe('none');

    await h.reconcile();
    await pass({ backfill: true });
    expect(count('bolagio_booking_intents')).toBe(intentsBefore);
    expect(count('bolagio_finance_ingestion_queue')).toBe(0);
    expect(count('bolagio_finance_transactions')).toBe(0);
    expect(count('bolagio_finance_payments')).toBe(0);
    expect(JSON.parse(h.sql(`select row_to_json(s) from bolagio_finance_pipeline_status s`)).reservations).toBeGreaterThanOrEqual(1);
  });
});
