/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE STATE MACHINES.
 *
 * Exhaustive rather than illustrative: every state is enumerated and every
 * pair is classified, so a state added later without a transition row is a
 * failing test rather than a booking that can never leave `draft`.
 *
 * ── What these tests cannot prove ────────────────────────────────────────
 * That the DATABASE agrees. The authority is
 * `bolagio_transition_allowed()`; this file is the mirror. The two are kept
 * honest by `tests/sql/concurrency.sql`, which exercises the SQL table
 * directly — run it with `./scripts/db-test.sh`.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import {
  applyTransition,
  BOOKING_STATES,
  BOOKING_TRANSITIONS,
  canTransition,
  canTransitionPayment,
  isConfirmed,
  isPaidSide,
  isPaymentSettled,
  isTerminal,
  mayHoldExternalBooking,
  mayInvolveMoney,
  PAYMENT_STATES,
  reservesInventory,
  type BookingState,
  type PaymentState,
} from '@/lib/booking/states';
import { isHoldExpired, isQuoteExpired } from '@/lib/booking/state-machine';

describe('booking state machine — shape', () => {
  it('gives every state a transition row', () => {
    for (const state of BOOKING_STATES) {
      expect(BOOKING_TRANSITIONS[state], `${state} has no transition row`).toBeDefined();
    }
  });

  it('never names a target that is not a state', () => {
    const known = new Set<string>(BOOKING_STATES);
    for (const [from, targets] of Object.entries(BOOKING_TRANSITIONS)) {
      for (const to of targets) {
        expect(known.has(to), `${from} -> ${to} names an unknown state`).toBe(true);
      }
    }
  });

  it('has exactly one terminal state', () => {
    const terminal = BOOKING_STATES.filter(isTerminal);
    expect(terminal).toEqual(['cancelled']);
  });
});

describe('booking state machine — the happy path', () => {
  const PATH: BookingState[] = [
    'draft', 'quoted', 'locking', 'hold_created', 'payment_session_created',
    'awaiting_payment', 'payment_pending', 'paid', 'finalizing', 'confirmed',
  ];

  it('walks end to end', () => {
    for (let i = 0; i < PATH.length - 1; i += 1) {
      expect(canTransition(PATH[i], PATH[i + 1]), `${PATH[i]} -> ${PATH[i + 1]}`).toBe(true);
    }
  });

  it('never walks backwards', () => {
    for (let i = 1; i < PATH.length; i += 1) {
      expect(canTransition(PATH[i], PATH[i - 1]), `${PATH[i]} -> ${PATH[i - 1]}`).toBe(false);
    }
  });

  it('cannot reach payment without a hold', () => {
    // The ordering the whole overbooking model rests on: money is never taken
    // for nights that are not already blocked at the channel manager.
    expect(canTransition('quoted', 'payment_session_created')).toBe(false);
    expect(canTransition('quoted', 'paid')).toBe(false);
    expect(canTransition('locking', 'paid')).toBe(false);
    expect(canTransition('draft', 'hold_created')).toBe(false);
  });
});

describe('booking state machine — reserving inventory', () => {
  /*
   * The single most consequential predicate in the system. Anything that might
   * still hold a Beds24 booking reserves the local range; freeing it early is
   * how a database advertises a night Booking.com has already sold.
   */
  const RESERVING: BookingState[] = [
    'locking', 'hold_created', 'payment_session_created', 'awaiting_payment',
    'payment_pending', 'paid', 'finalizing', 'confirmed', 'paid_unfinalized',
    'finalization_failed', 'releasing', 'release_failed', 'expired',
    'payment_failed', 'payment_cancelled', 'manual_review',
  ];
  const FREE: BookingState[] = [
    'draft', 'quoted', 'quote_expired', 'unavailable', 'hold_failed', 'released', 'cancelled',
  ];

  it.each(RESERVING)('%s reserves', (state) => {
    expect(reservesInventory(state)).toBe(true);
  });

  it.each(FREE)('%s does not reserve', (state) => {
    expect(reservesInventory(state)).toBe(false);
  });

  it('classifies every state', () => {
    expect([...RESERVING, ...FREE].sort()).toEqual([...BOOKING_STATES].sort());
  });

  it('keeps reserving after a FAILED release', () => {
    // The regression from the previous implementation: a failed release used to
    // leave the booking in a non-reserving state while Beds24 still held the
    // nights.
    expect(reservesInventory('release_failed')).toBe(true);
    expect(reservesInventory('released')).toBe(false);
  });

  it('keeps reserving after the lease runs out', () => {
    // `expired` means the guest ran out of time, not that Beds24 gave the
    // nights back. Only a verified release does that.
    expect(reservesInventory('expired')).toBe(true);
  });

  it('never lets a reserving state reach cancelled directly', () => {
    for (const state of BOOKING_STATES) {
      if (!reservesInventory(state)) continue;
      // `manual_review` is the deliberate exception: a human has looked.
      if (state === 'manual_review') continue;
      expect(canTransition(state, 'cancelled'), `${state} -> cancelled`).toBe(false);
    }
  });

  it('knows which states may hold a Beds24 booking', () => {
    // `locking` reserves locally but has made no external call yet.
    expect(mayHoldExternalBooking('locking')).toBe(false);
    expect(mayHoldExternalBooking('hold_created')).toBe(true);
    expect(mayHoldExternalBooking('release_failed')).toBe(true);
    expect(mayHoldExternalBooking('released')).toBe(false);
  });
});

describe('booking state machine — money is never given back', () => {
  const PAID: BookingState[] = [
    'paid', 'finalizing', 'confirmed', 'paid_unfinalized', 'finalization_failed',
  ];

  it.each(PAID)('%s is on the paid side', (state) => {
    expect(isPaidSide(state)).toBe(true);
  });

  it('never routes a paid booking to a non-reserving state', () => {
    for (const state of PAID) {
      for (const target of BOOKING_TRANSITIONS[state]) {
        expect(reservesInventory(target), `${state} -> ${target} frees inventory`).toBe(true);
      }
    }
  });

  it('accepts a capture that arrives after we gave up', () => {
    // Otherwise we keep the money and tell the guest their booking expired.
    expect(canTransition('expired', 'paid')).toBe(true);
    expect(canTransition('payment_failed', 'paid')).toBe(true);
    expect(canTransition('payment_cancelled', 'paid')).toBe(true);
  });

  it('confirms only from a paid state', () => {
    for (const state of BOOKING_STATES) {
      if (!canTransition(state, 'confirmed')) continue;
      expect(
        isPaidSide(state) || state === 'manual_review',
        `${state} -> confirmed without payment`
      ).toBe(true);
    }
  });

  it('announces confirmation for exactly one state', () => {
    expect(BOOKING_STATES.filter(isConfirmed)).toEqual(['confirmed']);
  });
});

describe('booking state machine — applyTransition', () => {
  it('treats a repeat as a quiet success', () => {
    // PayPal retries. n8n retries. A guest refreshes. The second delivery of an
    // already-honoured outcome is a success, not a conflict.
    expect(applyTransition('confirmed', 'confirmed')).toBe('noop');
    expect(applyTransition('paid', 'paid')).toBe('noop');
  });

  it('re-quotes rather than no-opping', () => {
    // The one legitimate same-state write: it rewrites the authoritative total.
    expect(applyTransition('quoted', 'quoted')).toBe('applied');
  });

  it('refuses a late failure after a confirmation', () => {
    // A guest who has paid does not lose their stay to a retried webhook.
    expect(applyTransition('confirmed', 'payment_failed')).toBe('illegal');
    expect(applyTransition('confirmed', 'expired')).toBe('illegal');
    expect(applyTransition('confirmed', 'cancelled')).toBe('illegal');
  });

  it('refuses anything out of cancelled', () => {
    for (const state of BOOKING_STATES) {
      if (state === 'cancelled') continue;
      expect(applyTransition('cancelled', state)).toBe('illegal');
    }
  });
});

describe('payment state machine', () => {
  it('gives every state a row', () => {
    for (const state of PAYMENT_STATES) {
      expect(canTransitionPayment(state, state)).toBe(true);
    }
  });

  it('lets any state fall into unknown', () => {
    // Discovering a second capture destroys what we thought we knew. Refusing
    // this edge would force the code to keep asserting 'paid' while holding
    // evidence that contradicts it.
    for (const state of PAYMENT_STATES) {
      expect(canTransitionPayment(state, 'unknown'), `${state} -> unknown`).toBe(true);
    }
  });

  it('learns about an order whose creation response was lost', () => {
    expect(canTransitionPayment('not_created', 'paid')).toBe(true);
    expect(canTransitionPayment('not_created', 'approved')).toBe(true);
  });

  it('never walks back from paid to unpaid', () => {
    const unpaid: PaymentState[] = ['not_created', 'order_created', 'approved', 'capture_pending', 'denied', 'cancelled'];
    for (const state of unpaid) {
      expect(canTransitionPayment('paid', state), `paid -> ${state}`).toBe(false);
    }
  });

  it('treats only settled money as settled', () => {
    expect(isPaymentSettled('paid')).toBe(true);
    // PENDING is PayPal saying the money MAY arrive. It is not money.
    expect(isPaymentSettled('capture_pending')).toBe(false);
    expect(isPaymentSettled('approved')).toBe(false);
    expect(isPaymentSettled('unknown')).toBe(false);
  });

  it('is pessimistic about whether money may be involved', () => {
    // Read before releasing an expired hold. Wrong in the permissive direction
    // means cancelling a stay the guest paid for.
    expect(mayInvolveMoney('capture_pending')).toBe(true);
    expect(mayInvolveMoney('approved')).toBe(true);
    expect(mayInvolveMoney('unknown')).toBe(true);
    expect(mayInvolveMoney('paid')).toBe(true);

    expect(mayInvolveMoney('not_created')).toBe(false);
    expect(mayInvolveMoney('order_created')).toBe(false);
    expect(mayInvolveMoney('denied')).toBe(false);
    expect(mayInvolveMoney('cancelled')).toBe(false);
  });
});

describe('leases and quotes', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const past = '2026-09-17T11:45:00Z';
  const future = '2026-09-17T12:15:00Z';

  it('reports an elapsed lease only for states that are waiting on one', () => {
    expect(isHoldExpired('hold_created', past, now)).toBe(true);
    expect(isHoldExpired('payment_pending', past, now)).toBe(true);
    expect(isHoldExpired('hold_created', future, now)).toBe(false);
  });

  it('never reports a lease elapsed for a paid booking', () => {
    // Even with an ancient lease. The money landed; the clock is irrelevant.
    expect(isHoldExpired('paid', past, now)).toBe(false);
    expect(isHoldExpired('confirmed', past, now)).toBe(false);
    expect(isHoldExpired('paid_unfinalized', past, now)).toBe(false);
  });

  it('treats a missing quote expiry as expired', () => {
    // Fail closed: a quote we cannot date is a quote we will not honour.
    expect(isQuoteExpired(null)).toBe(true);
    expect(isQuoteExpired(undefined)).toBe(true);
    expect(isQuoteExpired(past, now)).toBe(true);
    expect(isQuoteExpired(future, now)).toBe(false);
  });
});
