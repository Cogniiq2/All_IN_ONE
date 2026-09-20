/**
 * ══════════════════════════════════════════════════════════════════════════
 * HOW DOMAIN STATES ARE SHOWN.
 *
 * One mapping per vocabulary: booking state, payment state, external
 * operation outcome, queue job status, booking source. Each entry says how a
 * state is named, which visual tone it takes and, in one sentence, what it
 * means to the person reading it.
 *
 * ── What this file must never do ─────────────────────────────────────────
 * Decide anything. Whether a state reserves inventory or means money has
 * moved is asked of `lib/booking/states.ts`, which is the mirror of the
 * database's own definition. This file only describes; it never redefines.
 *
 * ── Unknown states ───────────────────────────────────────────────────────
 * A value this file has not met — an enum member added after it was written
 * — falls through to a neutral "Unknown" entry. It is never presented as
 * healthy, and never breaks a page.
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  BOOKING_STATES,
  PAYMENT_STATES,
  isPaidSide,
  isPaymentSettled,
  mayInvolveMoney,
  reservesInventory,
  type BookingState,
  type PaymentState,
} from '@/lib/booking/states';

/** Visual tone. Semantic, not a colour: the stylesheet maps each to a colour. */
export type Tone = 'neutral' | 'muted' | 'progress' | 'positive' | 'caution' | 'critical';

/** A small glyph that carries the meaning alongside the colour, never instead of it. */
export type Glyph = 'ring' | 'dot' | 'check' | 'clock' | 'lock' | 'alert' | 'dash' | 'question' | 'arrow';

export interface StatePresentation {
  label: string;
  tone: Tone;
  glyph: Glyph;
  /** One sentence an operator can act on. */
  summary: string;
}

const UNKNOWN: StatePresentation = {
  label: 'Unknown',
  tone: 'neutral',
  glyph: 'question',
  summary: 'This value is not recognised by the interface. Treat it with caution and check the record directly.',
};

/* ── Booking state ─────────────────────────────────────────────────────── */

const BOOKING: Readonly<Record<BookingState, StatePresentation>> = {
  draft: { label: 'Draft', tone: 'muted', glyph: 'dash', summary: 'The attempt exists; nothing has been validated or reserved.' },
  quoted: { label: 'Quoted', tone: 'muted', glyph: 'dash', summary: 'A live offer is attached. Nothing is reserved yet.' },
  locking: { label: 'Locking', tone: 'progress', glyph: 'clock', summary: 'The local date range is reserved while the channel manager is asked for a hold.' },
  hold_created: { label: 'Held', tone: 'progress', glyph: 'lock', summary: 'Nights are blocked at the channel manager and the guest has not yet paid.' },
  payment_session_created: { label: 'Payment opened', tone: 'progress', glyph: 'clock', summary: 'A payment order exists. The hold stands until the lease runs out.' },
  awaiting_payment: { label: 'Awaiting payment', tone: 'progress', glyph: 'clock', summary: 'The guest is at the payment provider.' },
  payment_pending: { label: 'Payment pending', tone: 'progress', glyph: 'clock', summary: 'The provider reports PENDING — not settled. Do not treat as paid.' },
  paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'A verified capture. The channel manager is now being updated.' },
  finalizing: { label: 'Finalizing', tone: 'progress', glyph: 'clock', summary: 'Paid, and the channel manager booking is being promoted right now.' },
  confirmed: { label: 'Confirmed', tone: 'positive', glyph: 'check', summary: 'Paid, and the channel manager booking was read back and verified.' },
  quote_expired: { label: 'Quote expired', tone: 'muted', glyph: 'dash', summary: 'The offer aged out before the guest acted. Nothing is reserved.' },
  unavailable: { label: 'Unavailable', tone: 'muted', glyph: 'dash', summary: 'The channel manager said the nights were gone. Nothing was created.' },
  hold_failed: { label: 'Hold refused', tone: 'muted', glyph: 'dash', summary: 'The channel manager answered no. Nothing is reserved.' },
  payment_failed: { label: 'Payment failed', tone: 'caution', glyph: 'alert', summary: 'The capture was denied. The hold still stands and may be retried or released by the lease.' },
  payment_cancelled: { label: 'Payment cancelled', tone: 'caution', glyph: 'alert', summary: 'The guest abandoned the payment. The hold still stands until the lease runs out.' },
  expired: { label: 'Expired', tone: 'caution', glyph: 'clock', summary: 'The hold lease ran out unpaid. The external hold may still exist until released.' },
  releasing: { label: 'Releasing', tone: 'progress', glyph: 'clock', summary: 'The channel manager hold is being cancelled.' },
  released: { label: 'Released', tone: 'muted', glyph: 'check', summary: 'The release was verified at the channel manager. The nights are free.' },
  release_failed: { label: 'Release failed', tone: 'caution', glyph: 'alert', summary: 'We asked the channel manager to cancel and do not know whether it did. The nights are still treated as taken.' },
  paid_unfinalized: { label: 'Paid — not finalized', tone: 'critical', glyph: 'alert', summary: 'The guest has paid and the channel manager has not been told. The hold is intact; a person should watch this until it confirms.' },
  finalization_failed: { label: 'Finalization failed', tone: 'critical', glyph: 'alert', summary: 'The guest has paid and promoting the channel manager booking failed. The hold is intact. Reconciliation retries against the same booking.' },
  manual_review: { label: 'Manual review', tone: 'critical', glyph: 'alert', summary: 'The system could not decide what is true. A person must, using the lifecycle and payment record.' },
  cancelled: { label: 'Cancelled', tone: 'muted', glyph: 'dash', summary: 'Terminal. Reached only once nothing was held.' },
};

export function isBookingState(value: unknown): value is BookingState {
  return typeof value === 'string' && (BOOKING_STATES as readonly string[]).includes(value);
}

export function bookingStatePresentation(state: string): StatePresentation {
  return isBookingState(state) ? BOOKING[state] : UNKNOWN;
}

/* ── Payment state ─────────────────────────────────────────────────────── */

const PAYMENT: Readonly<Record<PaymentState, StatePresentation>> = {
  not_created: { label: 'No order', tone: 'muted', glyph: 'dash', summary: 'No payment order exists.' },
  order_created: { label: 'Order created', tone: 'muted', glyph: 'dash', summary: 'An order exists; the guest has not approved it.' },
  approved: { label: 'Approved', tone: 'progress', glyph: 'clock', summary: 'The guest approved at the provider; nothing is captured yet.' },
  capture_pending: { label: 'Capture pending', tone: 'progress', glyph: 'clock', summary: 'Capture requested; the provider says PENDING. Not settled.' },
  paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'Capture completed. Money has moved.' },
  denied: { label: 'Denied', tone: 'caution', glyph: 'alert', summary: 'The provider refused the capture.' },
  cancelled: { label: 'Cancelled', tone: 'muted', glyph: 'dash', summary: 'The guest abandoned the payment.' },
  refunded: { label: 'Refunded', tone: 'neutral', glyph: 'arrow', summary: 'Fully refunded at the provider.' },
  partially_refunded: { label: 'Partly refunded', tone: 'neutral', glyph: 'arrow', summary: 'Partly refunded at the provider.' },
  disputed: { label: 'Disputed', tone: 'critical', glyph: 'alert', summary: 'A dispute is open at the provider. A person must handle it.' },
  unknown: { label: 'Outcome unknown', tone: 'critical', glyph: 'question', summary: 'The provider outcome could not be determined. Never treated as paid or unpaid; nothing is released while this stands.' },
};

export function isPaymentState(value: unknown): value is PaymentState {
  return typeof value === 'string' && (PAYMENT_STATES as readonly string[]).includes(value);
}

export function paymentStatePresentation(state: string): StatePresentation {
  return isPaymentState(state) ? PAYMENT[state] : UNKNOWN;
}

/* ── Domain facts, asked of the domain ─────────────────────────────────── */

/**
 * The four questions the booking header answers. Each is delegated to the
 * canonical predicates; an unrecognised state answers "unknown" rather than
 * either yes or no.
 */
export interface BookingFacts {
  /** Is the local date range reserved? */
  inventoryHeld: boolean | 'unknown';
  /** Is the guest's money ours? */
  paid: boolean | 'unknown';
  /** Might money be involved at all — the pessimistic reading the lease uses. */
  moneyMayBeInvolved: boolean | 'unknown';
  /** Is the channel manager booking verified in its final state? */
  externallyFinalized: boolean | 'unknown';
  /** Does a person need to decide something? */
  needsHuman: boolean;
}

export function bookingFacts(status: string, paymentStatus: string): BookingFacts {
  const knownStatus = isBookingState(status);
  const knownPayment = isPaymentState(paymentStatus);
  return {
    inventoryHeld: knownStatus ? reservesInventory(status) : 'unknown',
    paid: knownPayment ? isPaymentSettled(paymentStatus) : knownStatus ? isPaidSide(status) : 'unknown',
    moneyMayBeInvolved: knownPayment ? mayInvolveMoney(paymentStatus) : 'unknown',
    externallyFinalized: knownStatus ? status === 'confirmed' : 'unknown',
    needsHuman:
      !knownStatus ||
      !knownPayment ||
      status === 'manual_review' ||
      status === 'paid_unfinalized' ||
      status === 'finalization_failed' ||
      status === 'release_failed' ||
      paymentStatus === 'unknown' ||
      paymentStatus === 'disputed',
  };
}

/* ── External operation outcome ────────────────────────────────────────── */

const OPERATION: Readonly<Record<string, StatePresentation>> = {
  in_flight: { label: 'In flight', tone: 'progress', glyph: 'clock', summary: 'The request was sent and no answer has been recorded yet.' },
  succeeded: { label: 'Succeeded', tone: 'positive', glyph: 'check', summary: 'The provider answered and the answer was yes.' },
  failed: { label: 'Failed', tone: 'caution', glyph: 'alert', summary: 'The provider answered and the answer was no. Nothing was created.' },
  outcome_unknown: { label: 'Outcome unknown', tone: 'critical', glyph: 'question', summary: 'The request may or may not have taken effect. It must not be retried until the provider has been read.' },
  reconciled: { label: 'Reconciled', tone: 'positive', glyph: 'check', summary: 'An uncertain outcome that a later read of the provider resolved.' },
};

export function operationOutcomePresentation(outcome: string): StatePresentation {
  return OPERATION[outcome] ?? UNKNOWN;
}

/* ── Queue job status (outbox, payment inbox, reconciliation) ──────────── */

const JOB: Readonly<Record<string, StatePresentation>> = {
  pending: { label: 'Pending', tone: 'neutral', glyph: 'dot', summary: 'Waiting to be claimed.' },
  claimed: { label: 'Claimed', tone: 'progress', glyph: 'clock', summary: 'A worker holds a lease on it.' },
  succeeded: { label: 'Delivered', tone: 'positive', glyph: 'check', summary: 'Processed successfully.' },
  resolved: { label: 'Resolved', tone: 'positive', glyph: 'check', summary: 'Resolved.' },
  failed: { label: 'Failed', tone: 'caution', glyph: 'alert', summary: 'The last attempt failed; it will be retried with backoff.' },
  exhausted: { label: 'Exhausted', tone: 'critical', glyph: 'alert', summary: 'Every automatic attempt has been used. It stays visible until a person acts.' },
};

export function jobStatusPresentation(status: string): StatePresentation {
  return JOB[status] ?? UNKNOWN;
}

/* ── Reconciliation state on the booking row ───────────────────────────── */

const RECONCILIATION: Readonly<Record<string, StatePresentation>> = {
  ok: { label: 'In step', tone: 'positive', glyph: 'check', summary: 'No open reconciliation on this booking.' },
  pending: { label: 'Pending', tone: 'progress', glyph: 'clock', summary: 'Reconciliation is queued or in progress.' },
  failed: { label: 'Failed', tone: 'caution', glyph: 'alert', summary: 'The last reconciliation attempt did not resolve it. It will be retried.' },
  manual: { label: 'Manual', tone: 'critical', glyph: 'alert', summary: 'Escalated to a person. Automation has stopped for this booking.' },
};

export function reconciliationStatePresentation(state: string): StatePresentation {
  return RECONCILIATION[state] ?? UNKNOWN;
}

/* ── Booking source ────────────────────────────────────────────────────── */

const SOURCE: Readonly<Record<string, { label: string; short: string }>> = {
  direct: { label: 'Direct', short: 'DIR' },
  booking_com: { label: 'Booking.com', short: 'BDC' },
  airbnb: { label: 'Airbnb', short: 'ABB' },
  manual: { label: 'Manual', short: 'MAN' },
};

export function sourcePresentation(source: string): { label: string; short: string } {
  return SOURCE[source] ?? { label: 'Unknown', short: '???' };
}

/* ── Operations error codes ────────────────────────────────────────────── */

/**
 * A short, human title per operational code. Falls back to the code itself,
 * which is still a closed vocabulary and still queryable.
 */
const CODE_TITLE: Readonly<Record<string, string>> = {
  BEDS24_HOLD_OUTCOME_UNKNOWN: 'Channel-manager hold outcome unknown',
  BEDS24_HOLD_REJECTED: 'Channel-manager hold refused',
  BEDS24_HOLD_MISMATCH: 'Channel-manager hold is not ours',
  BEDS24_HOLD_DID_NOT_BLOCK: 'Hold exists but nights did not close',
  BEDS24_RELEASE_FAILED: 'Release could not be confirmed',
  BEDS24_RELEASE_UNVERIFIED: 'Released, but nights still closed',
  BEDS24_FINALIZATION_FAILED: 'Finalization at channel manager failed',
  BEDS24_FINALIZATION_UNVERIFIED: 'Finalized status did not verify',
  BEDS24_UNAVAILABLE: 'Channel manager unreachable',
  BEDS24_ORPHAN_BOOKING: 'Channel-manager booking without a local record',
  PAYMENT_AMOUNT_MISMATCH: 'Captured amount differs from the quote',
  PAYMENT_CURRENCY_MISMATCH: 'Captured currency differs from the quote',
  PAYMENT_DUPLICATE_CAPTURE: 'A second capture on one booking',
  PAYMENT_ORDER_MISMATCH: 'Capture belongs to a different order',
  PAYMENT_PROVIDER_MISMATCH: 'Capture from an unexpected provider',
  PAYMENT_AFTER_TERMINAL_STATE: 'Payment arrived after a terminal state',
  PAYMENT_PROVIDER_UNCERTAIN: 'Payment provider outcome uncertain',
  PAYMENT_UNKNOWN_REFERENCE: 'Payment for an unknown reference',
  PAYMENT_EVENT_STUCK: 'Verified payment event unprocessed',
  PAYMENT_ORPHAN: 'Payment without a booking',
  PAYMENT_REFUNDED: 'Refunded at the provider',
  PAYMENT_DISPUTED: 'Disputed at the provider',
  PAYMENT_REFUND_UNCERTAIN: 'Refund outcome unknown',
  PAYMENT_REFUND_FAILED: 'Refund refused by the provider',
  PAYMENT_REFUND_DUPLICATE: 'A second refund on one capture',
  PAID_BOOKING_UNFINALIZED: 'Paid, channel manager not updated',
  BOOKING_LOCK_LEASE_EXPIRED: 'Local lock lease expired',
  BOOKING_HOLD_STALE: 'Hold held far longer than a checkout',
  BOOKING_LEASE_EXPIRED: 'Hold lease expired, no payment evidence',
  BOOKING_LEASE_HELD_FOR_PAYMENT: 'Lease expired with payment evidence',
  BOOKING_MISSING_EXTERNAL_HOLD: 'Reserving booking without a channel-manager id',
  CANCELLATION_RELEASE_PENDING: 'Cancellation awaiting a verified release',
  OUTBOX_DEAD_LETTER: 'Automation event dead-lettered',
  OUTBOX_BACKLOG: 'Automation backlog',
  RECONCILIATION_EXHAUSTED: 'Reconciliation attempts exhausted',
  DIRECT_BOOKING_DISABLED: 'Direct booking is disabled',
  PAYMENT_MODE_UNCONFIGURED: 'Payment mode not configured',
};

export function codeTitle(code: string | null | undefined): string | null {
  if (!code) return null;
  return CODE_TITLE[code] ?? code;
}
