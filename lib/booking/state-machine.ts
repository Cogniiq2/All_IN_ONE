/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BOOKING INTENT STATE MACHINE.
 *
 *   draft ──► quoted ──► hold_created ──► payment_pending ──► paid ──► confirmed
 *     │         │            │                  │              │
 *     │         │            │                  ├──► payment_failed ──► cancelled
 *     │         │            │                  └──► expired ────────► cancelled
 *     │         │            └──► expired (hold ran out)
 *     │         └──► expired (quote ran out)
 *     └──► cancelled
 *
 * ── Why this is a table and not a pile of `if`s ──────────────────────────
 * Payment callbacks arrive out of order and more than once. n8n retries. A
 * provider webhook fires twice. A guest refreshes the return URL. Every one of
 * those hits `apply()`, and the three outcomes it can produce are the only
 * three that exist:
 *
 *   'applied'   a legal transition; write it.
 *   'noop'      already in that state. Idempotency, not an error — the second
 *               delivery of a success callback must be a quiet success.
 *   'illegal'   would move backwards or sideways. Refused, logged, and the
 *               existing state is preserved. A `payment_failed` callback that
 *               arrives after `confirmed` does NOT un-confirm a stay a guest
 *               has already paid for.
 *
 * `confirmed` and `cancelled` are terminal. Nothing moves out of them.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BookingStatus } from '@/lib/booking/types';

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ['quoted', 'expired', 'cancelled'],
  quoted: ['quoted', 'hold_created', 'expired', 'cancelled'],
  hold_created: ['payment_pending', 'expired', 'cancelled', 'payment_failed'],
  // 'paid' may arrive before the payment session is even recorded as pending;
  // both orderings are legal because we do not control callback ordering.
  payment_pending: ['paid', 'payment_failed', 'expired', 'cancelled'],
  paid: ['confirmed', 'cancelled'],
  // A payment can be retried on the same intent while the hold still stands.
  payment_failed: ['payment_pending', 'expired', 'cancelled'],
  expired: ['cancelled'],
  confirmed: [],
  cancelled: [],
};

export type TransitionOutcome = 'applied' | 'noop' | 'illegal';

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: BookingStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * Decide what a requested status change means, given where the intent is.
 *
 * Pure. The caller does the writing — which keeps this exhaustively testable
 * without a database, and every payment callback goes through it.
 */
export function apply(from: BookingStatus, to: BookingStatus): TransitionOutcome {
  // The idempotency rule, first and unconditionally: a repeated delivery of a
  // callback that has already been honoured is a success, not a conflict.
  // 'quoted' is the exception — re-quoting genuinely rewrites the total.
  if (from === to) return to === 'quoted' ? 'applied' : 'noop';
  return canTransition(from, to) ? 'applied' : 'illegal';
}

/**
 * Has this intent's inventory hold outlived it?
 *
 * Read before honouring a payment: a hold that expired while the guest was on
 * the provider's page means the nights went back on sale and may now belong to
 * someone else, so the flow re-validates rather than confirming blind.
 */
export function isHoldExpired(
  status: BookingStatus,
  holdExpiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!holdExpiresAt) return false;
  if (status !== 'hold_created' && status !== 'payment_pending') return false;
  return Date.parse(holdExpiresAt) <= now.getTime();
}

export function isQuoteExpired(
  quoteExpiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!quoteExpiresAt) return true;
  return Date.parse(quoteExpiresAt) <= now.getTime();
}
