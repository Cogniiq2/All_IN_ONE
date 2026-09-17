/**
 * The previous state machine's surface, preserved.
 *
 * The machine itself moved to `lib/booking/states.ts` (and, authoritatively,
 * into PostgreSQL). This file keeps the four functions the rest of the
 * repository already imports, so the hardening did not require touching every
 * call site — and so the diff of what actually CHANGED stayed readable.
 *
 * New code should import from `@/lib/booking/states`.
 */

import {
  applyTransition,
  canTransition as canTransitionState,
  isTerminal as isTerminalState,
  isPaidSide,
  type BookingState,
  type TransitionOutcome,
} from '@/lib/booking/states';
import type { BookingStatus } from '@/lib/booking/types';

export type { TransitionOutcome };

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return canTransitionState(from as BookingState, to as BookingState);
}

export function isTerminal(status: BookingStatus): boolean {
  return isTerminalState(status as BookingState);
}

export function apply(from: BookingStatus, to: BookingStatus): TransitionOutcome {
  return applyTransition(from as BookingState, to as BookingState);
}

/**
 * Has this booking's hold lease run out?
 *
 * ── What this is NOT ─────────────────────────────────────────────────────
 * It is not permission to release. A lease running out says the guest has had
 * long enough; it says nothing about whether they paid in the last ten
 * seconds. `lib/booking/lease.ts` is the thing that decides a release, and it
 * reads payment evidence first. A timer that cancels rooms on its own is how a
 * paid guest arrives to find their reservation resold.
 */
export function isHoldExpired(
  status: BookingStatus,
  holdExpiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!holdExpiresAt) return false;
  if (isPaidSide(status as BookingState)) return false;
  const leaseable: BookingStatus[] = [
    'hold_created', 'payment_session_created', 'awaiting_payment', 'payment_pending',
  ];
  if (!leaseable.includes(status)) return false;
  return Date.parse(holdExpiresAt) <= now.getTime();
}

export function isQuoteExpired(
  quoteExpiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!quoteExpiresAt) return true;
  return Date.parse(quoteExpiresAt) <= now.getTime();
}
