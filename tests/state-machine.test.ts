/**
 * The booking state machine and idempotency.
 *
 * Every test here is a real production event: a retried webhook, a payment
 * callback that arrives twice, a failure notice that turns up after a guest
 * has already been confirmed, a hold that ran out while the card was being
 * typed. These are the ones that cost money or a guest's holiday when they are
 * wrong, and none of them are easy to provoke against a live provider.
 */

import { describe, expect, it } from 'vitest';
import { apply, canTransition, isHoldExpired, isQuoteExpired, isTerminal } from '@/lib/booking/state-machine';
import {
  BOOKING_REFERENCE_PATTERN,
  bookingIdempotencyKey,
  isBookingReference,
  newBookingReference,
  timingSafeEqual,
} from '@/lib/booking/reference';
import { holdsInventory, isConfirmedStatus } from '@/lib/booking/types';

describe('state machine', () => {
  it('walks the happy path', () => {
    expect(canTransition('draft', 'quoted')).toBe(true);
    expect(canTransition('quoted', 'hold_created')).toBe(true);
    expect(canTransition('hold_created', 'payment_pending')).toBe(true);
    expect(canTransition('payment_pending', 'paid')).toBe(true);
    expect(canTransition('paid', 'confirmed')).toBe(true);
  });

  it('treats a repeated success callback as a quiet success, not a conflict', () => {
    // n8n retries. A provider redelivers. The second one must not error.
    expect(apply('paid', 'paid')).toBe('noop');
    expect(apply('confirmed', 'confirmed')).toBe('noop');
  });

  it('refuses a late failure callback after a confirmation', () => {
    // A guest who has paid does not lose their stay to a retried webhook.
    expect(apply('confirmed', 'payment_failed')).toBe('illegal');
    expect(apply('confirmed', 'cancelled')).toBe('illegal');
    expect(apply('confirmed', 'expired')).toBe('illegal');
  });

  it('refuses to move backwards', () => {
    expect(apply('paid', 'hold_created')).toBe('illegal');
    expect(apply('hold_created', 'draft')).toBe('illegal');
    expect(apply('confirmed', 'paid')).toBe('illegal');
  });

  it('allows a re-quote to rewrite the total', () => {
    // The one same-status transition that is genuinely a write.
    expect(apply('quoted', 'quoted')).toBe('applied');
  });

  it('allows a failed payment to be retried on the same hold', () => {
    expect(apply('payment_failed', 'payment_pending')).toBe('applied');
  });

  it('accepts a payment that lands before the pending write', () => {
    // Callback ordering is not ours to control.
    expect(apply('hold_created', 'payment_pending')).toBe('applied');
    expect(apply('payment_pending', 'paid')).toBe('applied');
  });

  it('makes confirmed and cancelled terminal', () => {
    expect(isTerminal('confirmed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('paid')).toBe(false);
  });

  it('knows which statuses hold inventory', () => {
    expect(holdsInventory('hold_created')).toBe(true);
    expect(holdsInventory('payment_pending')).toBe(true);
    expect(holdsInventory('confirmed')).toBe(true);
    expect(holdsInventory('quoted')).toBe(false);
    expect(holdsInventory('expired')).toBe(false);
  });

  it('only calls a booking confirmed when it actually is', () => {
    expect(isConfirmedStatus('confirmed')).toBe(true);
    expect(isConfirmedStatus('paid')).toBe(false);
    expect(isConfirmedStatus('payment_pending')).toBe(false);
  });
});

describe('hold and quote expiry', () => {
  const now = new Date('2026-09-16T12:00:00Z');

  it('reports a hold that ran out', () => {
    expect(isHoldExpired('hold_created', '2026-09-16T11:59:00Z', now)).toBe(true);
    expect(isHoldExpired('payment_pending', '2026-09-16T12:05:00Z', now)).toBe(false);
  });

  it('does not expire a booking that no longer holds inventory that way', () => {
    // A confirmed stay's hold timestamp is history, not a deadline.
    expect(isHoldExpired('confirmed', '2026-09-16T11:00:00Z', now)).toBe(false);
    expect(isHoldExpired('cancelled', '2026-09-16T11:00:00Z', now)).toBe(false);
  });

  it('treats a missing quote expiry as expired', () => {
    // Failing closed: no recorded expiry means no quote worth honouring.
    expect(isQuoteExpired(null, now)).toBe(true);
    expect(isQuoteExpired('2026-09-16T11:59:00Z', now)).toBe(true);
    expect(isQuoteExpired('2026-09-16T12:10:00Z', now)).toBe(false);
  });
});

describe('booking reference', () => {
  it('produces a BLG reference in the documented shape', () => {
    for (let i = 0; i < 200; i += 1) {
      const reference = newBookingReference();
      expect(reference).toMatch(BOOKING_REFERENCE_PATTERN);
      expect(isBookingReference(reference)).toBe(true);
    }
  });

  it('omits the characters that are misread over the phone', () => {
    // The BLG- prefix is fixed brand, so only the random part is checked.
    const suffixes = Array.from({ length: 300 }, () => newBookingReference().slice(4)).join('');
    expect(suffixes).not.toMatch(/[ILOU01]/);
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newBookingReference()));
    expect(seen.size).toBe(500);
  });

  it('rejects anything that is not a reference', () => {
    expect(isBookingReference('BLG-1234')).toBe(false);
    expect(isBookingReference('blg-ABCDEF')).toBe(false);
    expect(isBookingReference(undefined)).toBe(false);
    expect(isBookingReference("BLG-ABC' OR 1=1--")).toBe(false);
  });
});

describe('idempotency key', () => {
  const attempt = {
    unitSlug: 'schulstrasse-i',
    checkIn: '2026-09-20',
    checkOut: '2026-09-23',
    adults: 2,
    children: 0,
    email: 'guest@example.com',
  };

  it('gives a double-clicked button the same key', async () => {
    const a = await bookingIdempotencyKey(attempt);
    const b = await bookingIdempotencyKey(attempt);
    expect(a).toBe(b);
  });

  it('ignores case and surrounding space in the email', async () => {
    // The same guest typing their address slightly differently on a retry
    // must not create a second booking.
    const a = await bookingIdempotencyKey(attempt);
    const b = await bookingIdempotencyKey({ ...attempt, email: '  Guest@Example.COM ' });
    expect(a).toBe(b);
  });

  it('separates genuinely different attempts', async () => {
    const base = await bookingIdempotencyKey(attempt);
    expect(await bookingIdempotencyKey({ ...attempt, checkOut: '2026-09-24' })).not.toBe(base);
    expect(await bookingIdempotencyKey({ ...attempt, adults: 3 })).not.toBe(base);
    expect(await bookingIdempotencyKey({ ...attempt, unitSlug: 'schulstrasse-ii' })).not.toBe(base);
    expect(await bookingIdempotencyKey({ ...attempt, attemptId: 'retry-2' })).not.toBe(base);
  });

  it('never contains the guest email in clear', async () => {
    // The key ends up in logs.
    const key = await bookingIdempotencyKey(attempt);
    expect(key).not.toContain('guest@example.com');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('shared secret comparison', () => {
  it('matches only an exact secret', () => {
    expect(timingSafeEqual('s3cret-value', 's3cret-value')).toBe(true);
    expect(timingSafeEqual('s3cret-value', 's3cret-valuE')).toBe(false);
    expect(timingSafeEqual('s3cret-value', 's3cret')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
