/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CANONICAL STATE MACHINES.
 *
 * Two of them, deliberately: what the RESERVATION is doing and what the MONEY
 * is doing are different facts that diverge at the worst possible moment.
 *
 *     payment = 'paid'   AND   booking = 'paid_unfinalized'
 *
 * — the guest's money is ours and Beds24 has not been told. A single status
 * column cannot express that, and a system that cannot express a situation
 * will resolve it by guessing.
 *
 * ── This file is a MIRROR, not the authority ─────────────────────────────
 * The authority is `bolagio_transition_allowed()` in
 * supabase/migrations/20260917110000_booking_core_hardening.sql, enforced by a
 * trigger on every UPDATE. This file exists so the application can reject an
 * illegal move before spending a round trip, and so the tests can enumerate
 * the machine exhaustively. The two are kept in step by
 * `tests/state-machine.test.ts`, which asserts this table matches the SQL
 * table shape-for-shape.
 *
 * If they ever disagree, the database wins. That is the point of putting it
 * there.
 *
 * This module is import-safe from a client component: types and pure
 * functions, no secrets, no provider names.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── Booking states ────────────────────────────────────────────────────── */

export const BOOKING_STATES = [
  /* — the happy path, in order — */
  'draft',                    // the row exists; nothing has been validated
  'quoted',                   // a live Beds24 offer is attached and priced
  'locking',                  // the local range is reserved; no external call yet
  'hold_created',             // Beds24 holds the nights. THE "held" STATE.
  'payment_session_created',  // a provider order exists
  'awaiting_payment',         // the guest is at the provider
  'payment_pending',          // the provider says PENDING, not settled
  'paid',                     // a verified capture. Money has moved.
  'finalizing',               // updating the existing Beds24 booking
  'confirmed',                // Beds24 read back and verified. Done.

  /* — failure and recovery — */
  'quote_expired',            // the quote aged out before the guest acted
  'unavailable',              // Beds24 says the nights are gone
  'hold_failed',              // Beds24 answered, and the answer was no
  'payment_failed',           // the provider denied the capture
  'payment_cancelled',        // the guest abandoned at the provider
  'expired',                  // the hold lease ran out, unpaid
  'releasing',                // cancelling the Beds24 hold
  'released',                 // the release was VERIFIED at Beds24
  'release_failed',           // we asked, and do not know if it worked
  'paid_unfinalized',         // paid; Beds24 has not been updated yet
  'finalization_failed',      // paid; updating Beds24 failed
  'manual_review',            // a human must decide
  'cancelled',                // terminal, and only reachable once nothing is held
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

/**
 * States that hold the local date range.
 *
 * Mirrors `bolagio_status_reserves()`. The list is defined by NEGATION for the
 * same reason the SQL is: a state added later is reserving by default, and
 * being wrong in that direction costs one unsold night rather than a guest
 * their holiday.
 */
const NON_RESERVING = new Set<BookingState>([
  'draft',
  'quoted',
  'quote_expired',
  'unavailable',
  'hold_failed',
  'released',
  'cancelled',
]);

export function reservesInventory(state: BookingState): boolean {
  return !NON_RESERVING.has(state);
}

/**
 * States in which a Beds24 reservation may exist and has not been verifiably
 * released. Nothing may mark the local range free while a booking is in one of
 * these without first reading Beds24.
 */
export function mayHoldExternalBooking(state: BookingState): boolean {
  return reservesInventory(state) && state !== 'locking';
}

/** The one state that may be announced to a guest as a confirmed reservation. */
export function isConfirmed(state: BookingState): boolean {
  return state === 'confirmed';
}

/**
 * States where the guest's money is ours, whatever the reservation says.
 *
 * Read before ANY release. A booking in one of these is never given back to
 * inventory by a timer, a sweep or a webhook — only by a human.
 */
export function isPaidSide(state: BookingState): boolean {
  return (
    state === 'paid' ||
    state === 'finalizing' ||
    state === 'confirmed' ||
    state === 'paid_unfinalized' ||
    state === 'finalization_failed'
  );
}

export const BOOKING_TRANSITIONS: Readonly<Record<BookingState, readonly BookingState[]>> = {
  draft: ['quoted', 'unavailable', 'quote_expired', 'cancelled'],
  // Re-quoting is the one legitimate same-state write: it genuinely rewrites
  // the authoritative total.
  quoted: ['quoted', 'locking', 'quote_expired', 'unavailable', 'cancelled'],
  quote_expired: ['quoted', 'cancelled'],
  unavailable: ['quoted', 'cancelled'],

  // From `locking` the only ways out are: we got the hold, Beds24 said no, or
  // we must unwind. There is no path to payment that skips the hold.
  locking: ['hold_created', 'hold_failed', 'unavailable', 'releasing', 'manual_review'],
  hold_failed: ['quoted', 'cancelled', 'manual_review'],

  hold_created: [
    'payment_session_created', 'awaiting_payment', 'payment_pending', 'paid',
    'payment_failed', 'payment_cancelled', 'expired', 'releasing', 'manual_review',
  ],
  payment_session_created: [
    'awaiting_payment', 'payment_pending', 'paid', 'payment_failed',
    'payment_cancelled', 'expired', 'releasing', 'manual_review',
  ],
  awaiting_payment: [
    'payment_pending', 'paid', 'payment_failed', 'payment_cancelled',
    'expired', 'releasing', 'manual_review',
  ],
  payment_pending: ['paid', 'payment_failed', 'payment_cancelled', 'expired', 'releasing', 'manual_review'],

  // A failed payment may be retried while the hold still stands, and a late
  // verified capture must still be able to win.
  payment_failed: ['payment_session_created', 'awaiting_payment', 'paid', 'expired', 'releasing', 'manual_review'],
  payment_cancelled: ['payment_session_created', 'awaiting_payment', 'paid', 'expired', 'releasing', 'manual_review'],

  // `expired → paid` is legal on purpose. A capture that lands after we gave
  // up must win; the alternative is keeping a guest's money and telling them
  // their booking expired.
  expired: ['paid', 'releasing', 'manual_review'],

  paid: ['finalizing', 'paid_unfinalized', 'confirmed', 'manual_review'],
  finalizing: ['confirmed', 'finalization_failed', 'paid_unfinalized', 'manual_review'],
  paid_unfinalized: ['finalizing', 'confirmed', 'finalization_failed', 'manual_review'],
  finalization_failed: ['finalizing', 'confirmed', 'paid_unfinalized', 'manual_review'],

  // NOT `confirmed → cancelled`. A confirmed reservation leaves through
  // releasing → released → cancelled, so a cancellation can never free the
  // local range before Beds24 has been dealt with.
  confirmed: ['releasing', 'manual_review'],

  releasing: ['released', 'release_failed', 'manual_review'],
  release_failed: ['releasing', 'released', 'manual_review'],
  released: ['cancelled', 'manual_review'],

  manual_review: ['confirmed', 'finalizing', 'releasing', 'released', 'paid_unfinalized', 'cancelled'],
  cancelled: [],
};

export type TransitionOutcome = 'applied' | 'noop' | 'illegal';

export function canTransition(from: BookingState, to: BookingState): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: BookingState): boolean {
  return BOOKING_TRANSITIONS[state].length === 0;
}

/**
 * What a requested move means, given where the booking is.
 *
 * Pure, so every webhook ordering can be tested without a database. The
 * idempotency rule comes first and unconditionally: a repeated delivery of an
 * already-honoured callback is a success, not a conflict.
 */
export function applyTransition(from: BookingState, to: BookingState): TransitionOutcome {
  if (from === to) return to === 'quoted' ? 'applied' : 'noop';
  return canTransition(from, to) ? 'applied' : 'illegal';
}

/* ── Payment states ────────────────────────────────────────────────────── */

export const PAYMENT_STATES = [
  'not_created',
  'order_created',
  'approved',
  'capture_pending',
  'paid',
  'denied',
  'cancelled',
  'refunded',
  'partially_refunded',
  'disputed',
  /**
   * We could not determine what the provider did. NEVER treated as paid and
   * NEVER treated as unpaid — it is an input to reconciliation and a hard
   * block on releasing inventory.
   */
  'unknown',
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

const PAYMENT_TRANSITIONS: Readonly<Record<PaymentState, readonly PaymentState[]>> = {
  // A verified webhook can teach us about an order whose creation response we
  // never received. Refusing to learn it would mean holding a guest's money in
  // a booking our own column calls unpaid.
  not_created: ['order_created', 'approved', 'capture_pending', 'paid', 'denied', 'cancelled'],
  order_created: ['approved', 'capture_pending', 'paid', 'denied', 'cancelled'],
  approved: ['capture_pending', 'paid', 'denied', 'cancelled'],
  capture_pending: ['paid', 'denied', 'cancelled'],
  paid: ['refunded', 'partially_refunded', 'disputed'],
  denied: ['order_created'],
  cancelled: ['order_created'],
  refunded: ['disputed'],
  partially_refunded: ['refunded', 'disputed'],
  disputed: ['refunded', 'partially_refunded', 'paid'],
  unknown: [...PAYMENT_STATES],
};

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return true;
  // Any state may fall INTO 'unknown': discovering a second capture, or a
  // provider answer we cannot resolve, genuinely destroys what we thought we
  // knew. Refusing that edge would force the code to keep asserting 'paid'
  // while holding evidence that contradicts it.
  if (to === 'unknown') return true;
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** The only payment state that means money is actually ours. */
export function isPaymentSettled(state: PaymentState): boolean {
  return state === 'paid' || state === 'partially_refunded' || state === 'disputed';
}

/**
 * Is there ANY evidence that money may be involved?
 *
 * The lease check reads this before releasing an expired hold. It is
 * deliberately pessimistic: `capture_pending` and `unknown` both count, because
 * the cost of being wrong is cancelling a stay the guest has paid for.
 */
export function mayInvolveMoney(state: PaymentState): boolean {
  return state !== 'not_created' && state !== 'order_created' && state !== 'cancelled' && state !== 'denied';
}
