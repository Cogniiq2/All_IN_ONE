/**
 * ══════════════════════════════════════════════════════════════════════════
 * GUEST MESSAGING — the internal endpoint the automation platform uses, and
 * the exactly-once effect behind it.
 *
 * The pump delivers at least once; the ledger guarantees one send. Proven
 * here through the real route with the real HMAC: a claimed message, a
 * redelivered event, a concurrent worker, a cancelled booking, a template
 * that cannot render, a test transport where it is and is not allowed.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, holdBooking, signedHeaders, startHarness, waitFor, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); await h.sync(); process.env.APP_ENV = 'local'; });

async function messages(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  return h.call('POST', '/api/internal/messages', raw, await signedHeaders(raw));
}

async function outbox(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  return h.call('POST', '/api/internal/outbox', raw, await signedHeaders(raw));
}

async function confirmed() {
  const { reference } = await holdBooking(h);
  await approveOrder(h, reference, false);
  await h.call('POST', '/api/booking/payment/capture', { reference });
  await waitFor(h, reference, (r) => r.status === 'confirmed');
  return reference;
}

describe('the messages endpoint', () => {
  it('refuses an unsigned request with 401 and no body', async () => {
    const r = await h.call('POST', '/api/internal/messages', { action: 'prepare', kind: 'booking_confirmation', reference: 'BLG-AAAAAA' });
    expect(r.status).toBe(401);
    expect(r.body).toBeNull();
  });

  it('prepares a rendered confirmation once, then reports already_sent — exactly one send per booking', async () => {
    const reference = await confirmed();
    const claimed = await messages({ action: 'prepare', kind: 'booking_confirmation', reference });
    expect(claimed.status).toBe(200);
    expect(claimed.body.outcome).toBe('claimed');
    expect(claimed.body.message.to).toBe('ada@example.com');
    expect(claimed.body.message.subject).toContain(reference);
    expect(claimed.body.message.text).toContain('Ada');
    expect(claimed.body.message.text).not.toContain('{{');
    expect(claimed.body.message.templateId).toBe('booking_confirmation.de');

    // A second worker while the first holds the lease.
    const concurrent = await messages({ action: 'prepare', kind: 'booking_confirmation', reference });
    expect(concurrent.body.outcome).toBe('in_progress');

    const done = await messages({ action: 'complete', deliveryId: claimed.body.deliveryId, outcome: 'sent', provider: 'smtp', providerMessageId: '<msg-1@example>' });
    expect(done.body.recorded).toBe(true);

    // The event is redelivered (lease lapsed elsewhere, pump re-run): nothing to send.
    const again = await messages({ action: 'prepare', kind: 'booking_confirmation', reference });
    expect(again.body.outcome).toBe('already_sent');
    expect(h.sql(`select count(*) from bolagio_message_deliveries where reference='${reference}' and kind='booking_confirmation'`)).toBe('1');
    expect(h.sql(`select status || ':' || provider || ':' || provider_message_id || ':' || destination_masked from bolagio_message_deliveries where reference='${reference}'`)).toBe('sent:smtp:<msg-1@example>:a***@example.com');
    // No message body is stored anywhere.
    expect(h.sql(`select count(*) from bolagio_message_deliveries where to_jsonb(bolagio_message_deliveries)::text ilike '%Guten Tag%'`)).toBe('0');
  });

  it('a failed send is retried after its backoff, and a non-retryable one needs an operator', async () => {
    const reference = await confirmed();
    const first = await messages({ action: 'prepare', kind: 'prearrival', reference });
    expect(first.body.outcome).toBe('claimed');
    await messages({ action: 'complete', deliveryId: first.body.deliveryId, outcome: 'failed', provider: 'smtp', error: 'SMTP 450 try later' });
    const waiting = await messages({ action: 'prepare', kind: 'prearrival', reference });
    expect(waiting.body.outcome).toBe('backoff');
    h.sql(`update bolagio_message_deliveries set next_attempt_at = now() - interval '1 second' where id = '${first.body.deliveryId}'`);
    const second = await messages({ action: 'prepare', kind: 'prearrival', reference });
    expect(second.body.outcome).toBe('claimed');
    expect(second.body.attempt).toBe(2);
    await messages({ action: 'complete', deliveryId: second.body.deliveryId, outcome: 'failed', provider: 'smtp', error: 'bounce', retryable: false });
    const stuck = await messages({ action: 'prepare', kind: 'prearrival', reference });
    expect(stuck.body.outcome).toBe('not_retryable');
  });

  it('a cancelled booking suppresses every pending guest message and refuses new ones', async () => {
    const reference = await confirmed();
    const { cancelBooking } = await import('@/lib/booking/cancellation');
    const { createLogger } = await import('@/lib/booking/logger');
    const { findIntentByReference } = await import('@/lib/booking/repository');
    const result = await cancelBooking((await findIntentByReference(reference))!, { actor: 'admin@example.com', authorized: true, refundCents: 0 }, createLogger());
    expect(result.outcome).toBe('cancelled');
    const r = await messages({ action: 'prepare', kind: 'checkin', reference });
    expect(r.body.outcome).toBe('suppressed');
    expect(h.sql(`select count(*) from bolagio_message_deliveries where status = 'sending'`)).toBe('0');
  });

  it('a template that cannot render sends nothing and records a non-retryable failure', async () => {
    const reference = await confirmed();
    const saved = process.env.MESSAGING_CONTACT_EMAIL;
    delete process.env.MESSAGING_CONTACT_EMAIL;
    try {
      const r = await messages({ action: 'prepare', kind: 'booking_confirmation', reference });
      expect(r.body.outcome).toBe('not_retryable');
      expect(r.body.reason).toContain('contactEmail');
      expect(h.sql(`select status || ':' || retryable from bolagio_message_deliveries`)).toBe('failed:false');
    } finally {
      process.env.MESSAGING_CONTACT_EMAIL = saved;
    }
  });

  it('a test transport may report sent locally, but not where a real guest could exist', async () => {
    const reference = await confirmed();
    const a = await messages({ action: 'prepare', kind: 'checkout', reference });
    expect((await messages({ action: 'complete', deliveryId: a.body.deliveryId, outcome: 'sent', provider: 'test', providerMessageId: 'test-1' })).body.recorded).toBe(true);
    expect(h.sql(`select status from bolagio_message_deliveries where kind='checkout'`)).toBe('sent');

    process.env.APP_ENV = 'staging';
    const b = await messages({ action: 'prepare', kind: 'review_request', reference });
    expect(b.body.outcome).toBe('claimed');
    const refused = await messages({ action: 'complete', deliveryId: b.body.deliveryId, outcome: 'sent', provider: 'test' });
    expect(refused.body.refused).toBe('test_completion_refused');
    expect(h.sql(`select status || ':' || retryable from bolagio_message_deliveries where kind='review_request'`)).toBe('failed:false');
  });

  it('renders English for an English-speaking guest', async () => {
    const stay = { checkIn: '2027-12-01', checkOut: '2027-12-03' };
    const created = await h.call('POST', '/api/booking/intent', { unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0, guest: { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', phone: '+1 555 0100', locale: 'en' }, attemptId: 'en-1' });
    const reference = created.body.intent.reference;
    await approveOrder(h, reference, false);
    await h.call('POST', '/api/booking/payment/capture', { reference });
    await waitFor(h, reference, (r) => r.status === 'confirmed');
    const r = await messages({ action: 'prepare', kind: 'booking_confirmation', reference });
    expect(r.body.message.templateId).toBe('booking_confirmation.en');
    expect(r.body.message.subject).toContain('confirmed');
    expect(r.body.message.text).toContain('Dear Grace');
  });
});

describe('the outbox pump contract, end to end', () => {
  it('claim → prepare → complete → ack, with the event acknowledged exactly once', async () => {
    const reference = await confirmed();
    const claim = await outbox({ action: 'claim', worker: 'n8n-bolagio', limit: 20 });
    expect(claim.status).toBe(200);
    const event = claim.body.events.find((e: any) => e.type === 'booking.confirmed' && e.reference === reference);
    expect(event).toBeTruthy();
    expect(JSON.stringify(event)).not.toContain('ada@example.com');
    const prepared = await messages({ action: 'prepare', kind: 'booking_confirmation', reference, eventId: event.id });
    expect(prepared.body.outcome).toBe('claimed');
    await messages({ action: 'complete', deliveryId: prepared.body.deliveryId, outcome: 'sent', provider: 'smtp', providerMessageId: 'm1' });
    const ack = await outbox({ action: 'ack', worker: 'n8n-bolagio', eventId: event.id });
    expect(ack.body.acknowledged).toBe(true);
    const twice = await outbox({ action: 'ack', worker: 'n8n-bolagio', eventId: event.id });
    expect(twice.body.acknowledged).toBe(false);
    expect(h.sql(`select outbox_event_id from bolagio_message_deliveries where reference='${reference}'`)).toBe(event.id);
    expect(h.sql(`select signal from bolagio_integration_health where provider='n8n' order by signal`)).toContain('last_ack');
  });
});
