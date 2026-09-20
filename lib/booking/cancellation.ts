import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CANCELLATION — the saga.
 *
 * Four different facts, kept apart on purpose:
 *
 *   the INTENT      a guest or an operator wants the booking to end
 *                   (`bolagio_request_cancellation`: who, why, authorised?)
 *   the RELEASE     the channel manager no longer holds the nights
 *                   (the release saga — verified against the calendar)
 *   the REFUND      money goes back, or is decided not to
 *                   (lib/booking/refunds.ts — a separate command, never
 *                   triggered by this file)
 *   the END STATE   `cancelled` — reachable only once the release is verified
 *                   (`bolagio_complete_cancellation`)
 *
 * ── The cases, and where each is decided ─────────────────────────────────
 *   A  unpaid, nothing held         the database cancels it outright
 *   B  held, unpaid                 release saga → released → cancelled
 *   C  declined / abandoned         same as B (a definitive no is not evidence)
 *   D  paid and confirmed           refused unless AUTHORISED with a refund
 *                                   decision; then release → cancelled, refund
 *                                   left for its own command
 *   E  Beds24 release succeeds      released (verified) → cancelled
 *   F  Beds24 answer unknown        release_failed; STILL RESERVED; reconciliation
 *                                   re-checks; cancellation stays requested
 *   G  release fails                as F
 *   H  refund not required          refund_state = not_required
 *   I  refund required, not run     refund_state = required (nothing sent)
 *   J–K refund outcome lost         lib/booking/refunds.ts + reconciliation
 *   L  duplicate cancellation       idempotent at the database; the second
 *                                   saga run finds nothing to do
 *   M  duplicate refund             refused at the database; the operation
 *                                   ledger refuses a blind resend
 *
 * Nothing here calls the payment provider. Nothing here can move a paid
 * booking to `releasing` without `cancellation_authorized_by` — the database
 * trigger refuses it, whatever this code does.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { completeCancellation, queueReconciliation, requestCancellation, type CancellationRequestOutcome } from '@/lib/booking/commands';
import type { BookingLogger } from '@/lib/booking/logger';
import { findIntentByReference, type IntentRecord } from '@/lib/booking/repository';
import { releaseHold } from '@/lib/booking/release';

export interface CancelBookingInput {
  /** Who is asking: an operator's email, `guest`, or `system`. */
  actor: string;
  reason?: string;
  /**
   * The actor takes responsibility for ending a booking that carries payment
   * evidence. Required for D; ignored for A–C. Recorded as
   * `cancellation_authorized_by`.
   */
  authorized?: boolean;
  /**
   * The refund DECISION for a paid booking, in minor units. `0` records "no
   * refund"; a positive amount records "refund required" and nothing more —
   * the refund itself is a separate, gated command. Never inferred.
   */
  refundCents?: number | null;
}

export type CancelBookingResult =
  | { outcome: 'cancelled'; intent: IntentRecord; refundState: string }
  | { outcome: 'already_cancelled'; intent: IntentRecord }
  /** The release could not be verified. The dates stay protected; reconciliation continues. */
  | { outcome: 'release_pending'; intent: IntentRecord; code: 'BEDS24_RELEASE_FAILED' | 'BEDS24_RELEASE_UNVERIFIED' | 'IN_PROGRESS' }
  | { outcome: 'refused'; code: Extract<CancellationRequestOutcome, { outcome: 'refused' }>['code']; intent: IntentRecord; paidAmountCents?: number | null };

/**
 * Cancel a booking, as far as it can safely be taken right now.
 *
 * Idempotent: running it again on a booking mid-release re-runs the release
 * saga (which is itself idempotent on the Beds24 booking id) and finishes
 * the cancellation if the release verifies.
 */
export async function cancelBooking(
  intent: IntentRecord,
  input: CancelBookingInput,
  logger: BookingLogger
): Promise<CancelBookingResult> {
  const decision = await requestCancellation(
    {
      intentId: intent.id,
      actor: input.actor,
      reason: input.reason,
      authorized: input.authorized,
      refundCents: input.refundCents,
    },
    logger
  );

  switch (decision.outcome) {
    case 'cancelled': {
      const after = (await findIntentByReference(intent.reference)) ?? intent;
      logger.info('booking.cancel', { reference: intent.reference, outcome: 'cancelled', resolution: decision.refundState });
      return { outcome: 'cancelled', intent: after, refundState: decision.refundState };
    }
    case 'already_cancelled':
      return { outcome: 'already_cancelled', intent };
    case 'in_progress':
      // Locking or releasing right now. The lease sweep resolves the lock;
      // this job makes the sweep re-run the release afterwards, so the
      // cancellation finishes without anyone pressing the button again.
      await queueReconciliation(intent.id, 'CANCELLATION_RELEASE_PENDING', 3, { requestedBy: input.actor }).catch(() => undefined);
      return { outcome: 'release_pending', intent, code: 'IN_PROGRESS' };
    case 'refused':
      logger.warn('booking.cancel', { reference: intent.reference, outcome: 'refused', errorCode: decision.code });
      return { outcome: 'refused', code: decision.code, intent, paidAmountCents: decision.paidAmountCents };
    case 'release_required':
      break;
  }

  /*
   * Inventory may be held at Beds24. Re-read the row: the decision above
   * wrote the authorisation the release saga (and the database trigger)
   * will check.
   */
  const current = (await findIntentByReference(intent.reference)) ?? intent;

  if (current.status !== 'released') {
    const released = await releaseHold(current, 'cancellation', logger);
    if (released.outcome === 'refused') {
      // The saga and the database disagree with the request: no authorisation.
      return { outcome: 'refused', code: 'AUTHORIZATION_REQUIRED', intent: current };
    }
    if (released.outcome === 'failed' || released.outcome === 'unverified') {
      /*
       * F / G. Beds24 did not answer, or answered and the nights are still
       * closed. `release_failed` RESERVES the local range: nothing is resold,
       * and reconciliation keeps re-checking. The cancellation stays
       * requested and completes on its own once the release verifies.
       */
      logger.warn('booking.cancel', { reference: intent.reference, outcome: 'release_pending', errorCode: released.code });
      return { outcome: 'release_pending', intent: released.intent ?? current, code: released.code };
    }
  }

  const done = await completeCancellation(current.id, logger);
  const after = (await findIntentByReference(intent.reference)) ?? current;
  if (done === 'cancelled' || done === 'already_cancelled') {
    logger.info('booking.cancel', { reference: intent.reference, outcome: 'cancelled', resolution: after.refundState });
    return { outcome: 'cancelled', intent: after, refundState: after.refundState };
  }
  // `not_yet`: the release saga returned but the row is not `released` — a
  // concurrent process moved it. Reconciliation finishes it.
  return { outcome: 'release_pending', intent: after, code: 'IN_PROGRESS' };
}

/**
 * The pure classification, for tests and for the admin: what would a
 * cancellation of this booking need, before anything is written?
 */
export type CancellationClass =
  | { kind: 'nothing_held' }
  | { kind: 'held_unpaid' }
  | { kind: 'payment_evidence'; needs: 'authorization' }
  | { kind: 'paid'; needs: 'authorization_and_refund_decision'; paidAmountCents: number | null }
  | { kind: 'in_progress' }
  | { kind: 'manual_review' }
  | { kind: 'terminal' };

export function classifyCancellation(intent: Pick<IntentRecord, 'status' | 'paymentStatus' | 'paidAmountCents' | 'refundedAmountCents'>): CancellationClass {
  if (intent.status === 'cancelled') return { kind: 'terminal' };
  if (intent.status === 'locking' || intent.status === 'releasing') return { kind: 'in_progress' };
  if (intent.status === 'manual_review') return { kind: 'manual_review' };
  const paidSide =
    ['paid', 'finalizing', 'confirmed', 'paid_unfinalized', 'finalization_failed'].includes(intent.status) ||
    ['paid', 'partially_refunded', 'disputed', 'refunded'].includes(intent.paymentStatus);
  if (paidSide) return { kind: 'paid', needs: 'authorization_and_refund_decision', paidAmountCents: intent.paidAmountCents };
  const evidence = !['not_created', 'order_created', 'cancelled', 'denied'].includes(intent.paymentStatus);
  if (evidence) return { kind: 'payment_evidence', needs: 'authorization' };
  if (['draft', 'quoted', 'quote_expired', 'unavailable', 'hold_failed', 'released'].includes(intent.status)) {
    return { kind: 'nothing_held' };
  }
  return { kind: 'held_unpaid' };
}
