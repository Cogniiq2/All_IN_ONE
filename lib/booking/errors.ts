/**
 * ══════════════════════════════════════════════════════════════════════════
 * OPERATIONAL ERROR CODES.
 *
 * A CLOSED set, and the only vocabulary that is written to
 * `last_failure_code`, `bolagio_reconciliation_jobs.reason` and the structured
 * logs. Free text belongs in `last_failure_reason`, where nothing queries it.
 *
 * The point is queryability. "How many bookings are paid but not finalized
 * this week" has to be one `where last_failure_code = …`, not a grep through a
 * log drain for a sentence someone once wrote.
 *
 * ── Severity ─────────────────────────────────────────────────────────────
 * 1 is the top. It means money or inventory is in an inconsistent state right
 * now and a person should look today. Everything at 1 appears in
 * `bolagio_ops_attention` above everything else.
 *
 * This module is import-safe from a client component: constants only.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const OPS_CODES = {
  /* ── Beds24 ───────────────────────────────────────────────────────────── */

  /**
   * A POST to Beds24 did not return an answer. The booking may or may not
   * exist. The single most dangerous condition in the system, because the
   * naive response — retry — creates the double booking.
   */
  BEDS24_HOLD_OUTCOME_UNKNOWN: 1,
  /** Beds24 answered, and the answer was no. Safe; nothing was created. */
  BEDS24_HOLD_REJECTED: 4,
  /** The hold was created but the booking Beds24 returned is not ours. */
  BEDS24_HOLD_MISMATCH: 1,
  /** The hold exists but the nights did not close. Overbooking risk, now. */
  BEDS24_HOLD_DID_NOT_BLOCK: 1,
  /** We asked Beds24 to cancel and do not know whether it did. */
  BEDS24_RELEASE_FAILED: 2,
  /** Beds24 said it cancelled, but the nights are still closed. */
  BEDS24_RELEASE_UNVERIFIED: 2,
  /** Updating the held booking after payment failed. Guest has paid. */
  BEDS24_FINALIZATION_FAILED: 1,
  /** The booking read back after finalization is not in the expected status. */
  BEDS24_FINALIZATION_UNVERIFIED: 1,
  /** Beds24 is unreachable or erroring. Not a booking-specific fault. */
  BEDS24_UNAVAILABLE: 3,
  /** A Beds24 booking exists that no BoLaGio intent claims. */
  BEDS24_ORPHAN_BOOKING: 2,

  /* ── Payment ──────────────────────────────────────────────────────────── */

  /** A capture arrived whose amount is not the amount we quoted. */
  PAYMENT_AMOUNT_MISMATCH: 1,
  PAYMENT_CURRENCY_MISMATCH: 1,
  /** A second, different capture against a booking that already had one. */
  PAYMENT_DUPLICATE_CAPTURE: 1,
  PAYMENT_ORDER_MISMATCH: 1,
  PAYMENT_PROVIDER_MISMATCH: 1,
  /** A verified capture for a booking that is already terminal. */
  PAYMENT_AFTER_TERMINAL_STATE: 1,
  /** A create-order or capture call whose outcome we could not determine. */
  PAYMENT_PROVIDER_UNCERTAIN: 1,
  /** A verified event referencing a booking reference we do not have. */
  PAYMENT_UNKNOWN_REFERENCE: 2,
  /** Ingested, verified, and still unprocessed well past its arrival. */
  PAYMENT_EVENT_STUCK: 2,
  /** The provider says a payment exists that our row does not know about. */
  PAYMENT_ORPHAN: 1,
  PAYMENT_REFUNDED: 3,
  PAYMENT_DISPUTED: 1,

  /* ── Booking lifecycle ────────────────────────────────────────────────── */

  /** Money taken, Beds24 not updated. The highest-priority state there is. */
  PAID_BOOKING_UNFINALIZED: 1,
  /** A local lock whose owner never came back. */
  BOOKING_LOCK_LEASE_EXPIRED: 4,
  /** Held far longer than any checkout should take. */
  BOOKING_HOLD_STALE: 3,
  /** Awaiting payment past its lease, with no payment evidence. */
  BOOKING_LEASE_EXPIRED: 4,
  /** Awaiting payment past its lease, WITH payment evidence. Do not release. */
  BOOKING_LEASE_HELD_FOR_PAYMENT: 2,
  /** A reserving booking with no Beds24 booking id. */
  BOOKING_MISSING_EXTERNAL_HOLD: 2,

  /* ── Queues ───────────────────────────────────────────────────────────── */

  OUTBOX_DEAD_LETTER: 2,
  OUTBOX_BACKLOG: 3,
  RECONCILIATION_EXHAUSTED: 1,

  /* ── Configuration ────────────────────────────────────────────────────── */

  /** A booking was attempted while the launch gate is off. */
  DIRECT_BOOKING_DISABLED: 5,
  /** PayPal mode is absent or not one of sandbox|live. Fail closed. */
  PAYMENT_MODE_UNCONFIGURED: 2,
} as const;

export type OpsCode = keyof typeof OPS_CODES;

export function severityOf(code: OpsCode): number {
  return OPS_CODES[code];
}

export function isOpsCode(value: unknown): value is OpsCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OPS_CODES, value);
}

/** Codes that mean a person should look today. */
export const CRITICAL_CODES: readonly OpsCode[] = (Object.keys(OPS_CODES) as OpsCode[]).filter(
  (code) => OPS_CODES[code] === 1
);
