import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE HOLD LEASE.
 *
 * ── What a lease is, and what the old implementation thought it was ──────
 * A checkout expiry is a LEASE on inventory. It says the guest has had long
 * enough for us to stop keeping the room for them. It does NOT say the guest
 * failed to pay.
 *
 * The old sweep did not make that distinction:
 *
 *     15 minutes elapsed → move to expired → cancel the Beds24 booking
 *
 * A guest who completed a PayPal payment at 14:58 and whose webhook arrived at
 * 15:02 had their paid stay cancelled and the nights resold. That is not a
 * theoretical ordering — PayPal webhooks are routinely seconds to minutes
 * behind, and a capture is not instant.
 *
 * So a lease running out is permission to ASK, not permission to release.
 * `evaluateLease` asks four questions, and any one of them blocks the release.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { queueReconciliation } from '@/lib/booking/commands';
import type { BookingLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import { isPaidSide, mayInvolveMoney } from '@/lib/booking/states';
import { findUncertainOperations } from '@/lib/ops/external-operations';
import { supabaseAdmin } from '@/lib/supabase/server';

export type LeaseDecision =
  /** Safe to release: the lease is up and there is no payment evidence at all. */
  | { action: 'release'; reason: string }
  /** The lease is up but something says money may be involved. Reconcile first. */
  | { action: 'hold'; reason: string; code: 'BOOKING_LEASE_HELD_FOR_PAYMENT' }
  /** Not due yet. */
  | { action: 'wait'; reason: string };

/**
 * Decide whether an expired hold may be released.
 *
 * Each of the four blocks below is a real ordering that happens in production,
 * not a defensive maybe:
 *
 *   1. paid-side state        the capture already landed
 *   2. payment state          `capture_pending`, `approved` or `unknown`
 *   3. uncertain operation    a create-order or capture whose outcome is lost
 *   4. unprocessed event      a verified webhook still sitting in the inbox
 *
 * (4) is the subtle one. The webhook arrived, verified, and was durably
 * stored — and the processor has not run yet. Releasing on a timer while a
 * verified `PAYMENT.CAPTURE.COMPLETED` sits unprocessed would cancel a stay
 * we have already been told was paid for.
 */
export async function evaluateLease(
  intent: IntentRecord,
  logger: BookingLogger,
  now: Date = new Date()
): Promise<LeaseDecision> {
  /* 1 — the payment already landed. */
  if (isPaidSide(intent.status)) {
    return {
      action: 'hold',
      reason: 'booking is on the paid side',
      code: 'BOOKING_LEASE_HELD_FOR_PAYMENT',
    };
  }

  const leaseUp = isLeaseUp(intent, now);
  if (!leaseUp) return { action: 'wait', reason: 'lease has not run out' };

  /* 2 — the payment column says money may be involved. */
  if (mayInvolveMoney(intent.paymentStatus)) {
    await flag(intent, logger, `payment_status=${intent.paymentStatus}`);
    return {
      action: 'hold',
      reason: `payment state ${intent.paymentStatus} is not a definitive no`,
      code: 'BOOKING_LEASE_HELD_FOR_PAYMENT',
    };
  }

  /* 3 — an external operation whose outcome we never learned. */
  const uncertain = await findUncertainOperations(intent.id);
  if (uncertain.length > 0) {
    await flag(intent, logger, `uncertain_operations=${uncertain.length}`);
    return {
      action: 'hold',
      reason: 'an external operation has no known outcome',
      code: 'BOOKING_LEASE_HELD_FOR_PAYMENT',
    };
  }

  /* 4 — a verified event is sitting in the inbox, unprocessed. */
  if (await hasUnprocessedPaymentEvent(intent)) {
    await flag(intent, logger, 'unprocessed_payment_event');
    return {
      action: 'hold',
      reason: 'a verified payment event for this booking is unprocessed',
      code: 'BOOKING_LEASE_HELD_FOR_PAYMENT',
    };
  }

  return { action: 'release', reason: 'lease expired with no payment evidence' };
}

/**
 * Is the lease up?
 *
 * `hold_expires_at` IS the lease. A row without one has no lease, and the
 * answer is no — not "probably". A hold whose lease was never written (a
 * process that died between taking the hold and recording it) is a genuine
 * problem, but it is a problem for the age-based stale sweep in
 * `lib/booking/reconciliation.ts`, which can see `updated_at` and is not on a
 * guest-facing path. Inferring a lease here would mean releasing inventory on
 * a clock we invented.
 */
function isLeaseUp(intent: IntentRecord, now: Date): boolean {
  if (!intent.holdExpiresAt) return false;
  return Date.parse(intent.holdExpiresAt) <= now.getTime();
}

/**
 * Is there a verified, unprocessed payment event for this booking?
 *
 * Matched on the reference and on the order id, because an event may carry
 * either: PayPal echoes our reference in `custom_id`, and the order id reaches
 * us through `supplementary_data`. Missing one of the two would let a release
 * through while the evidence sat in the table.
 */
async function hasUnprocessedPaymentEvent(intent: IntentRecord): Promise<boolean> {
  const filters = [`reference.eq.${intent.reference}`];
  if (intent.paymentOrderId) filters.push(`order_id.eq.${intent.paymentOrderId}`);

  const { data, error } = await supabaseAdmin()
    .from('bolagio_payment_events')
    .select('id')
    .eq('verification', 'verified')
    .is('processed_at', null)
    .or(filters.join(','))
    .limit(1);

  // A failure to CHECK is not a licence to release. Unable to rule money out
  // means we do not release.
  if (error) return true;
  return (data ?? []).length > 0;
}

async function flag(intent: IntentRecord, logger: BookingLogger, detail: string): Promise<void> {
  logger.warn('intent.transition', {
    reference: intent.reference,
    status: intent.status,
    paymentStatus: intent.paymentStatus,
    errorCode: 'BOOKING_LEASE_HELD_FOR_PAYMENT',
    outcome: detail,
  });
  await queueReconciliation(intent.id, 'BOOKING_LEASE_HELD_FOR_PAYMENT', 2, { detail }).catch(
    () => undefined
  );
}
