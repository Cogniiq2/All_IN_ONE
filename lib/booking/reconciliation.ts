import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE RECONCILIATION ENGINE.
 *
 * Everything in this system that can end in "we do not know" ends here. Each
 * handler below resolves one kind of uncertainty by ASKING THE AUTHORITATIVE
 * SYSTEM — never by assuming, and never by retrying a mutation whose outcome
 * is unknown.
 *
 * ── The rule every handler obeys ─────────────────────────────────────────
 *     READ before you WRITE. Always.
 *
 * An `outcome_unknown` create is not retried; Beds24 is searched for the
 * booking it may have made. An uncertain capture is not re-attempted; PayPal
 * is asked what the order's state actually is. This is the difference between
 * a system that recovers and one that turns one failure into two bookings.
 *
 * ── And the rule about money ─────────────────────────────────────────────
 * Nothing here refunds, cancels a paid booking, or releases inventory for a
 * booking with any payment evidence. Ambiguous financial inconsistencies are
 * ESCALATED, not resolved. A worker that decides on its own to refund a guest
 * is a worse problem than the one it was fixing.
 *
 * ── How it runs ──────────────────────────────────────────────────────────
 * From `POST /api/booking/reconcile` behind a shared secret, called on a
 * schedule — Supabase Cron, a Cloudflare Cron Trigger, or an n8n timer. It
 * does not depend on a browser, and it does not depend on n8n: n8n triggering
 * it is a convenience, and any of the three works alone.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { staleHoldMinutes } from '@/lib/booking/config';
import {
  claimPaymentEvents,
  claimReconciliationJobs,
  failReconciliationJob,
  queueReconciliation,
  resolveReconciliationJob,
  settlePaymentEvent,
  transitionIntent,
  type ReconciliationJobRow,
} from '@/lib/booking/commands';
import { finalizeBooking } from '@/lib/booking/finalization';
import type { BookingLogger } from '@/lib/booking/logger';
import { applyCapture, processPaymentEvent } from '@/lib/booking/payments';
import { releaseHold } from '@/lib/booking/release';
import {
  findIntentByReference,
  findUnitBySlug,
  type IntentRecord,
} from '@/lib/booking/repository';
import { evaluateLease } from '@/lib/booking/lease';
import { mayHoldExternalBooking } from '@/lib/booking/states';
import { bookingProvider } from '@/lib/integrations/beds24';
import { paymentAdapter } from '@/lib/payments';
import {
  completeOperation,
  findOperation,
  operationKey,
} from '@/lib/ops/external-operations';
import { supabaseAdmin } from '@/lib/supabase/server';
import { mapWebhookEvent } from '@/lib/payments/paypal/mapper';
import type { PayPalWebhookEvent } from '@/lib/payments/paypal/types';

export interface ReconciliationReport {
  scanned: number;
  resolved: number;
  failed: number;
  escalated: number;
  paymentEvents: number;
  queued: number;
}

const WORKER = 'bolagio-reconciler';

/**
 * One pass.
 *
 * Three phases in a deliberate order:
 *   1. drain the payment inbox — a verified capture is the most valuable
 *      unprocessed fact in the system, and processing one often makes a
 *      reconciliation job unnecessary;
 *   2. sweep for problems nobody has queued yet;
 *   3. work the queue, most severe first.
 */
export async function runReconciliation(
  logger: BookingLogger,
  limit = 25
): Promise<ReconciliationReport> {
  const report: ReconciliationReport = {
    scanned: 0,
    resolved: 0,
    failed: 0,
    escalated: 0,
    paymentEvents: 0,
    queued: 0,
  };

  report.paymentEvents = await drainPaymentInbox(logger, limit);
  report.queued = await sweep(logger);

  const jobs = await claimReconciliationJobs(WORKER, limit);
  report.scanned = jobs.length;

  for (const job of jobs) {
    try {
      const outcome = await handle(job, logger);
      if (outcome === 'resolved') {
        await resolveReconciliationJob(job.id, 'resolved');
        report.resolved += 1;
      } else if (outcome === 'escalated') {
        // Deliberately left FAILED rather than resolved: it stays visible in
        // `bolagio_ops_attention` and keeps its retry schedule.
        await failReconciliationJob(job.id, 'escalated to manual review');
        report.escalated += 1;
      } else {
        await failReconciliationJob(job.id, 'not yet resolvable');
        report.failed += 1;
      }
    } catch (cause) {
      await failReconciliationJob(
        job.id,
        cause instanceof Error ? cause.message.slice(0, 400) : 'unknown'
      );
      report.failed += 1;
      logger.error('reconcile.resolve', cause, { jobId: job.id, reason: job.reason });
    }
  }

  logger.info('reconcile.resolve', {
    count: report.scanned,
    resolution: `resolved=${report.resolved} failed=${report.failed} escalated=${report.escalated}`,
  });
  return report;
}

/* ══ Phase 1 — the payment inbox ═══════════════════════════════════════ */

/**
 * Process verified payment events that the webhook stored and nothing has
 * acted on yet.
 *
 * This is the path that makes the webhook fast: ingress stores and returns a
 * 2xx in milliseconds, and the Beds24 finalization that a completed capture
 * triggers happens here instead of inside PayPal's request.
 */
async function drainPaymentInbox(logger: BookingLogger, limit: number): Promise<number> {
  const events = await claimPaymentEvents(WORKER, limit);
  let processed = 0;

  for (const row of events) {
    try {
      const mapped = mapWebhookEvent(row.payload as PayPalWebhookEvent);
      if (!mapped) {
        // Stored but unreadable. Settled so it stops being claimed; it remains
        // in the table for an operator to look at.
        await settlePaymentEvent(row.id, true);
        continue;
      }
      const outcome = await processPaymentEvent(mapped, logger);
      await settlePaymentEvent(row.id, outcome !== 'escalated', outcome === 'escalated' ? 'escalated' : undefined);
      processed += 1;
    } catch (cause) {
      await settlePaymentEvent(
        row.id,
        false,
        cause instanceof Error ? cause.message.slice(0, 400) : 'unknown'
      );
      logger.error('payment.event', cause, { eventId: row.provider_event_id });
    }
  }

  if (events.length > 0) logger.info('payment.event', { count: processed, queue: 'inbox' });
  return processed;
}

/* ══ Phase 2 — the sweep ═══════════════════════════════════════════════ */

/**
 * Find problems nobody queued.
 *
 * The queue catches everything the application NOTICED. This catches what it
 * did not — a process that died before it could queue anything, a row left in
 * a reserving state by a worker that was killed mid-transition.
 */
async function sweep(logger: BookingLogger): Promise<number> {
  const staleBefore = new Date(Date.now() - staleHoldMinutes() * 60_000).toISOString();
  let queued = 0;

  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select('id, reference, status, payment_status, hold_expires_at, updated_at')
    .in('status', [
      'locking', 'hold_created', 'payment_session_created', 'awaiting_payment',
      'payment_pending', 'paid', 'finalizing', 'paid_unfinalized',
      'finalization_failed', 'releasing', 'release_failed', 'manual_review',
    ])
    .lt('updated_at', staleBefore)
    .limit(200);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{ id: string; status: string }>) {
    const reason = sweepReason(row.status);
    if (!reason) continue;
    await queueReconciliation(row.id, reason.code, reason.severity);
    queued += 1;
  }

  if (queued > 0) logger.info('reconcile.claim', { count: queued, queue: 'sweep' });
  return queued;
}

function sweepReason(
  status: string
): { code: Parameters<typeof queueReconciliation>[1]; severity: number } | null {
  switch (status) {
    case 'paid':
    case 'paid_unfinalized':
    case 'finalization_failed':
      // Money taken, channel manager not updated. Nothing outranks this.
      return { code: 'PAID_BOOKING_UNFINALIZED', severity: 1 };
    case 'releasing':
    case 'release_failed':
      return { code: 'BEDS24_RELEASE_FAILED', severity: 2 };
    case 'locking':
      return { code: 'BOOKING_LOCK_LEASE_EXPIRED', severity: 4 };
    case 'manual_review':
      return null; // already a human's problem
    default:
      return { code: 'BOOKING_HOLD_STALE', severity: 3 };
  }
}

/* ══ Phase 3 — the handlers ════════════════════════════════════════════ */

type Outcome = 'resolved' | 'escalated' | 'retry';

async function handle(job: ReconciliationJobRow, logger: BookingLogger): Promise<Outcome> {
  if (!job.reference) return 'escalated';
  const intent = await findIntentByReference(job.reference);
  if (!intent) return 'escalated';

  switch (job.reason) {
    case 'BEDS24_HOLD_OUTCOME_UNKNOWN':
    case 'BOOKING_MISSING_EXTERNAL_HOLD':
      return resolveUnknownHold(intent, logger);

    case 'PAID_BOOKING_UNFINALIZED':
    case 'BEDS24_FINALIZATION_FAILED':
    case 'BEDS24_FINALIZATION_UNVERIFIED':
      return resolveUnfinalized(intent, logger);

    case 'BEDS24_RELEASE_FAILED':
    case 'BEDS24_RELEASE_UNVERIFIED':
      return resolveRelease(intent, logger);

    case 'PAYMENT_PROVIDER_UNCERTAIN':
      return resolveUncertainPayment(intent, logger);

    case 'BOOKING_LOCK_LEASE_EXPIRED':
      return resolveStaleLock(intent, logger);

    case 'BOOKING_HOLD_STALE':
    case 'BOOKING_LEASE_HELD_FOR_PAYMENT':
      return resolveStaleHold(intent, logger);

    // Everything financially ambiguous. Deliberately not automated.
    case 'PAYMENT_AMOUNT_MISMATCH':
    case 'PAYMENT_CURRENCY_MISMATCH':
    case 'PAYMENT_DUPLICATE_CAPTURE':
    case 'PAYMENT_ORDER_MISMATCH':
    case 'PAYMENT_AFTER_TERMINAL_STATE':
    case 'PAYMENT_DISPUTED':
    case 'PAYMENT_REFUNDED':
    case 'BEDS24_HOLD_MISMATCH':
      return 'escalated';

    default:
      return 'escalated';
  }
}

/**
 * A Beds24 create whose outcome we never learned.
 *
 * THE handler this engine exists for. The booking may or may not be at Beds24,
 * and the one thing that must not happen is another POST. So:
 *
 *   1. if the operation row recorded a resource id, read that booking;
 *   2. otherwise SEARCH Beds24 for a booking on this room and arrival date
 *      carrying our reference;
 *   3. found → adopt it, and the booking becomes `hold_created` properly;
 *   4. not found → we still do not know. Escalate. Never create.
 *
 * Step 4 is not a failure of the design. Beds24 is not documented to return
 * the `reference` field on a search for this account, and a handler that
 * created a booking when it could not find one would turn "probably nothing
 * happened" into "definitely two bookings".
 */
async function resolveUnknownHold(intent: IntentRecord, logger: BookingLogger): Promise<Outcome> {
  const provider = bookingProvider();
  const key = operationKey.beds24Hold(intent.id);
  const operation = await findOperation(key);

  let found = intent.beds24BookingId
    ? await provider.getBooking(intent.beds24BookingId).catch(() => null)
    : null;

  if (!found && operation?.resourceId) {
    found = await provider.getBooking(operation.resourceId).catch(() => null);
  }

  if (!found) {
    const unit = await findUnitBySlug(intent.unitSlug);
    const ref = unit?.providerRef;
    if (ref) {
      const candidates = await provider
        .findBookings({ unit: ref, arrivalFrom: intent.checkIn, arrivalTo: intent.checkIn })
        .catch(() => []);
      // Matched on OUR reference, never on dates alone — a date match could be
      // somebody else's Booking.com reservation for the same night.
      found =
        candidates.find(
          (b) => b.reference === intent.reference && b.status !== 'cancelled'
        ) ?? null;
    }
  }

  if (!found) {
    logger.warn('beds24.search', {
      reference: intent.reference,
      outcome: 'no_matching_booking',
      errorCode: 'BEDS24_HOLD_OUTCOME_UNKNOWN',
    });
    return 'escalated';
  }

  await completeOperation(key, 'reconciled', found.externalBookingId);

  const adopted = await transitionIntent(
    intent.id,
    {
      expected: intent.status,
      to: 'hold_created',
      reason: 'hold_reconciled',
      patch: {
        beds24BookingId: found.externalBookingId,
        beds24Status: found.status,
        beds24VerifiedAt: new Date().toISOString(),
        providerSnapshot: found.snapshot,
        reconciliationState: 'ok',
        lastFailureCode: undefined,
      },
      outbox: {
        type: 'booking.held',
        payload: { reference: intent.reference, reconciled: true },
      },
    },
    logger
  );

  logger.info('beds24.search', {
    reference: intent.reference,
    providerBookingId: found.externalBookingId,
    outcome: adopted ? 'adopted' : 'adopt_refused',
  });
  return adopted ? 'resolved' : 'escalated';
}

/** Paid, Beds24 not updated. Retried against the SAME booking id, forever. */
async function resolveUnfinalized(intent: IntentRecord, logger: BookingLogger): Promise<Outcome> {
  const result = await finalizeBooking(intent, logger);
  if (result.outcome === 'confirmed') return 'resolved';
  // Never creates a second booking, never refunds, never releases. It simply
  // stays queued until it works or a person intervenes.
  return 'retry';
}

/**
 * A release we could not prove.
 *
 * The local range is still reserved, so nothing is oversold while this is
 * unresolved. Re-running the release saga re-checks whether Beds24 cancelled
 * and whether the nights reopened; only both make it `released`.
 */
async function resolveRelease(intent: IntentRecord, logger: BookingLogger): Promise<Outcome> {
  const result = await releaseHold(intent, 'reconcile_release', logger);
  if (result.outcome === 'released' || result.outcome === 'nothing_to_release') return 'resolved';
  if (result.outcome === 'refused') return 'escalated';
  return 'retry';
}

/**
 * A create-order or capture whose outcome was lost.
 *
 * PayPal is READ, never re-POSTed. If the order turns out to be captured, the
 * capture is applied through the same validated path as a webhook — so an
 * amount that does not match still lands in manual review rather than
 * confirming.
 */
async function resolveUncertainPayment(intent: IntentRecord, logger: BookingLogger): Promise<Outcome> {
  if (!intent.paymentOrderId) {
    // Nothing to read. An order may exist that we have no id for; only a human
    // with the PayPal dashboard can match it up.
    return 'escalated';
  }

  const order = await paymentAdapter(intent.paymentProvider ?? 'paypal')
    .getOrder(intent.paymentOrderId)
    .catch(() => null);
  if (!order) return 'retry';

  if (order.state === 'paid' && order.captureId && order.captured) {
    await completeOperation(operationKey.paypalCapture(intent.paymentOrderId), 'reconciled', order.captureId);
    const outcome = await applyCapture(
      {
        reference: intent.reference,
        provider: intent.paymentProvider ?? 'paypal',
        orderId: order.orderId,
        captureId: order.captureId,
        amountCents: order.captured.amountCents,
        currency: order.captured.currency,
      },
      logger
    );
    return outcome.outcome === 'applied' || outcome.outcome === 'duplicate' ? 'resolved' : 'escalated';
  }

  // Not captured. Record what PayPal actually says, which un-blocks the lease
  // check — an order that is definitively `cancelled` or `denied` no longer
  // holds the room hostage.
  await transitionIntent(
    intent.id,
    {
      expected: intent.status,
      to: intent.status,
      reason: 'payment_state_reconciled',
      patch: { paymentStatus: order.state, reconciliationState: 'ok' },
    },
    logger
  ).catch(() => undefined);

  logger.info('payment.event', {
    reference: intent.reference,
    orderId: order.orderId,
    paymentState: order.state,
    outcome: 'reconciled',
  });
  return order.state === 'order_created' || order.state === 'approved' ? 'retry' : 'resolved';
}

/**
 * A lock whose owner never came back.
 *
 * Safe to free ONLY because `locking` is, by construction, before any external
 * call has succeeded — a request that got a Beds24 booking id would be
 * `hold_created`. An uncertain create is a different job with a different
 * handler, and `findUncertainOperations` in the lease check is the belt to
 * this braces.
 */
async function resolveStaleLock(intent: IntentRecord, logger: BookingLogger): Promise<Outcome> {
  if (intent.status !== 'locking') return 'resolved';
  const next = await transitionIntent(
    intent.id,
    {
      expected: 'locking',
      to: 'hold_failed',
      reason: 'lock_lease_expired',
      patch: { lockExpiresAt: null, lastFailureCode: 'BOOKING_LOCK_LEASE_EXPIRED' },
    },
    logger
  );
  return next ? 'resolved' : 'retry';
}

/**
 * A hold sitting far longer than a checkout takes.
 *
 * Goes through `evaluateLease`, which refuses to release while any payment
 * evidence exists — a paid-side state, a payment column that is not a
 * definitive no, an uncertain external operation, or a verified webhook still
 * unprocessed in the inbox. A stale hold with payment evidence is escalated,
 * not released.
 */
async function resolveStaleHold(intent: IntentRecord, logger: BookingLogger): Promise<Outcome> {
  if (!mayHoldExternalBooking(intent.status)) return 'resolved';

  const decision = await evaluateLease(intent, logger);
  if (decision.action === 'wait') return 'retry';
  if (decision.action === 'hold') return 'escalated';

  const expired = await transitionIntent(
    intent.id,
    {
      expected: intent.status,
      to: 'expired',
      reason: 'lease_expired',
      patch: { lastFailureCode: 'BOOKING_LEASE_EXPIRED' },
      outbox: { type: 'booking.expired', payload: { reference: intent.reference } },
    },
    logger
  );
  if (!expired) return 'retry';

  const released = await releaseHold(expired, 'lease_expired', logger);
  return released.outcome === 'released' || released.outcome === 'nothing_to_release'
    ? 'resolved'
    : 'retry';
}

/**
 * Finalize a booking that is paid and not confirmed.
 *
 * Exported so the payment processor and the reconciler share one entry point;
 * two implementations of "make this booking confirmed" would drift.
 */
export async function ensureFinalized(
  intent: IntentRecord,
  logger: BookingLogger
): Promise<void> {
  await finalizeBooking(intent, logger);
}
