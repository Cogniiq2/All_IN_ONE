/**
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT NEEDS A PERSON — derived, deterministic, testable.
 *
 * The domain already says what is wrong: a booking state, a payment state, a
 * failure code, an operation outcome, a job status. This module turns those
 * facts into an ordered list an operator can work from top to bottom. It
 * introduces no new booking semantics: the ordering mirrors the severity in
 * `bolagio_ops_attention`, and every "is money involved / is inventory held"
 * answer is asked of `lib/booking/states.ts`.
 *
 * ── Severity is not permission ───────────────────────────────────────────
 * Nothing here says "retry". The next step for an unknown outcome is to let
 * reconciliation READ the provider; the next step for a mismatch is a person
 * with the payment record. Red means look, never means press.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { isPaidSide, mayInvolveMoney, reservesInventory } from '@/lib/booking/states';
import type {
  AttentionItem,
  AttentionLevel,
  BookingSummaryDto,
  ExternalOperationDto,
  OutboxEventDto,
  PaymentEventDto,
  ReconciliationJobDto,
} from '@/lib/admin/dto';
import { codeTitle, isBookingState, isPaymentState } from '@/lib/admin/presentation';

export const LEVEL_ORDER: Readonly<Record<AttentionLevel, number>> = {
  critical: 0,
  high: 1,
  elevated: 2,
  watch: 3,
};

export const LEVEL_LABEL: Readonly<Record<AttentionLevel, string>> = {
  critical: 'Critical',
  high: 'High',
  elevated: 'Elevated',
  watch: 'Watch',
};

/** Severity 1–5 from the domain's closed vocabulary → a level. */
export function levelFromSeverity(severity: number): AttentionLevel {
  if (severity <= 1) return 'critical';
  if (severity === 2) return 'high';
  if (severity === 3) return 'elevated';
  return 'watch';
}

/** Verified payment events unprocessed for longer than this are stuck. */
export const PAYMENT_EVENT_STUCK_MS = 15 * 60_000;
/** Outbox events pending for longer than this mean the automation pump is not running. */
export const OUTBOX_BACKLOG_MS = 30 * 60_000;
/** An in-flight external operation older than this has lost its caller. */
export const OPERATION_IN_FLIGHT_STALE_MS = 10 * 60_000;

function bookingHref(reference: string): string {
  return `/admin/bookings/${encodeURIComponent(reference)}`;
}

function moneyOf(b: Pick<BookingSummaryDto, 'status' | 'paymentStatus'>): boolean | 'unknown' {
  if (isPaymentState(b.paymentStatus)) return mayInvolveMoney(b.paymentStatus) || (isBookingState(b.status) && isPaidSide(b.status));
  return 'unknown';
}

function inventoryOf(b: Pick<BookingSummaryDto, 'status'>): boolean | 'unknown' {
  return isBookingState(b.status) ? reservesInventory(b.status) : 'unknown';
}

/**
 * The booking-level rule set, in the order of `bolagio_ops_attention`.
 *
 * Returns at most one item per booking — the most severe reading — so the
 * operations inbox lists a booking once with its worst problem, not four
 * times with every symptom.
 */
export function assessBooking(b: BookingSummaryDto): AttentionItem | null {
  const base = {
    category: 'booking' as const,
    reference: b.reference,
    unitSlug: b.unitSlug,
    unitName: b.unitName,
    since: b.updatedAt,
    moneyInvolved: moneyOf(b),
    inventoryHeld: inventoryOf(b),
    href: bookingHref(b.reference),
  };

  if (!isBookingState(b.status) || !isPaymentState(b.paymentStatus)) {
    return {
      ...base,
      id: `booking:${b.reference}:unknown_state`,
      level: 'high',
      code: null,
      title: 'Unrecognised state',
      explanation: `This booking is in a state the interface does not know (${b.status} / ${b.paymentStatus}). It is shown as needing attention rather than assumed healthy.`,
      nextStep: 'Read the record directly and update the interface before acting on it.',
    };
  }

  if (b.status === 'paid_unfinalized' || b.status === 'finalization_failed') {
    return {
      ...base,
      id: `booking:${b.reference}:unfinalized`,
      level: 'critical',
      code: b.lastFailureCode ?? 'PAID_BOOKING_UNFINALIZED',
      title: codeTitle(b.lastFailureCode) ?? 'Paid, channel manager not updated',
      explanation:
        'The guest has paid and the channel-manager booking has not been promoted. The hold is still in place, so the nights are protected; the guest does not yet have a confirmed reservation.',
      nextStep:
        'Let reconciliation re-attempt finalization against the same channel-manager booking. If it keeps failing, read the failure reason on the booking — it names the expected and actual status.',
    };
  }

  if (b.status === 'manual_review') {
    return {
      ...base,
      id: `booking:${b.reference}:manual_review`,
      level: 'critical',
      code: b.lastFailureCode,
      title: codeTitle(b.lastFailureCode) ?? 'Manual review required',
      explanation:
        'Automation has stopped for this booking because the system could not establish what is true. Nothing will be released, refunded or confirmed without a person.',
      nextStep: 'Read the lifecycle and the payment record, establish what the guest actually paid and what the channel manager holds, then decide.',
    };
  }

  if (b.status === 'release_failed') {
    return {
      ...base,
      id: `booking:${b.reference}:release_failed`,
      level: 'high',
      code: b.lastFailureCode ?? 'BEDS24_RELEASE_FAILED',
      title: 'Release could not be confirmed',
      explanation:
        'We asked the channel manager to cancel this hold and could not verify that it did. The nights are still treated as taken locally, which is the safe direction — at worst a night is unsellable.',
      nextStep: 'Check the booking at the channel manager. Reconciliation re-checks and only marks it released once the nights are provably open.',
    };
  }

  if (b.paymentStatus === 'unknown') {
    return {
      ...base,
      id: `booking:${b.reference}:payment_unknown`,
      level: 'high',
      code: b.lastFailureCode ?? 'PAYMENT_PROVIDER_UNCERTAIN',
      title: 'Payment outcome unknown',
      explanation:
        'The provider outcome for this booking could not be determined. It is treated as neither paid nor unpaid, and nothing is released while this stands.',
      nextStep: 'Let reconciliation read the order from the provider. Do not retry the capture.',
    };
  }

  if (b.paymentStatus === 'disputed') {
    return {
      ...base,
      id: `booking:${b.reference}:disputed`,
      level: 'high',
      code: 'PAYMENT_DISPUTED',
      title: 'Payment disputed at the provider',
      explanation: 'A dispute is open against this payment.',
      nextStep: 'Handle the dispute in the provider dashboard. Nothing here changes it.',
    };
  }

  if (b.status === 'paid' && !b.confirmedAt) {
    return {
      ...base,
      id: `booking:${b.reference}:paid_pending_finalization`,
      level: 'high',
      code: null,
      title: 'Paid, awaiting finalization',
      explanation: 'A verified capture has landed and the channel manager has not yet been updated. This normally resolves within one reconciliation cycle.',
      nextStep: 'Wait one cycle. If it is still here afterwards, it will have moved to a finalization failure with a reason.',
    };
  }

  if (b.status === 'releasing' || b.status === 'locking') {
    return {
      ...base,
      id: `booking:${b.reference}:${b.status}`,
      level: 'elevated',
      code: null,
      title: b.status === 'releasing' ? 'Release in progress' : 'Lock in progress',
      explanation:
        b.status === 'releasing'
          ? 'The channel-manager hold is being cancelled. If this persists, the release did not complete.'
          : 'The local range is reserved while the channel manager is asked for a hold. If this persists, the process that took the lock did not come back.',
      nextStep: 'Wait one cycle. Reconciliation resolves a stale lock and re-runs an unfinished release.',
    };
  }

  if (b.reconciliationState !== 'ok') {
    return {
      ...base,
      id: `booking:${b.reference}:reconciliation_${b.reconciliationState}`,
      level: b.reconciliationState === 'manual' ? 'high' : 'watch',
      code: b.lastFailureCode,
      title: codeTitle(b.lastFailureCode) ?? 'Reconciliation open',
      explanation:
        b.reconciliationState === 'manual'
          ? 'Reconciliation has escalated this booking to a person.'
          : 'A reconciliation job is open on this booking.',
      nextStep: b.reconciliationState === 'manual' ? 'Read the lifecycle and decide.' : 'Wait for the next pass; check back if it persists.',
    };
  }

  return null;
}

export function assessOperation(op: ExternalOperationDto, now: Date): AttentionItem | null {
  const base = {
    category: 'external_operation' as const,
    reference: op.reference,
    unitSlug: null,
    unitName: null,
    href: op.reference ? bookingHref(op.reference) : null,
    moneyInvolved: (op.provider === 'paypal' ? true : 'unknown') as boolean | 'unknown',
    inventoryHeld: (op.provider === 'beds24' ? 'unknown' : false) as boolean | 'unknown',
  };
  const providerName = op.provider === 'paypal' ? 'PayPal' : op.provider === 'beds24' ? 'the channel manager' : op.provider;
  const verb = op.operationType.replace(/_/g, ' ');
  const title = (rest: string) => `${verb.charAt(0).toUpperCase()}${verb.slice(1)} at ${providerName}: ${rest}`;
  const unknownCode =
    op.provider === 'paypal'
      ? 'PAYMENT_PROVIDER_UNCERTAIN'
      : op.operationType === 'release'
        ? 'BEDS24_RELEASE_FAILED'
        : op.operationType === 'finalize'
          ? 'BEDS24_FINALIZATION_UNVERIFIED'
          : 'BEDS24_HOLD_OUTCOME_UNKNOWN';

  if (op.outcome === 'outcome_unknown') {
    return {
      ...base,
      id: `operation:${op.id}`,
      level: 'critical',
      code: unknownCode,
      title: title('outcome unknown'),
      explanation: `A request to ${providerName} did not return an answer. It may or may not have taken effect. Retrying blind could create a second booking or a second charge.`,
      nextStep: 'Let reconciliation read the provider and resolve it. Do not retry.',
      since: op.uncertainAt ?? op.startedAt,
    };
  }

  if (op.outcome === 'in_flight' && now.getTime() - new Date(op.startedAt).getTime() > OPERATION_IN_FLIGHT_STALE_MS) {
    return {
      ...base,
      id: `operation:${op.id}`,
      level: 'high',
      code: null,
      title: title('no answer recorded'),
      explanation: `An operation was started and nothing was recorded afterwards. The process that made it may have died before it could say what happened.`,
      nextStep: 'Treat as uncertain. Reconciliation on the booking reads the provider before anything is retried.',
      since: op.startedAt,
    };
  }

  return null;
}

export function assessReconciliationJob(job: ReconciliationJobDto): AttentionItem | null {
  if (job.status === 'resolved' || job.status === 'succeeded') return null;
  const level: AttentionLevel = job.status === 'exhausted' ? 'critical' : levelFromSeverity(job.severity);
  return {
    id: `job:${job.id}`,
    level,
    category: 'reconciliation',
    code: job.reason,
    title: codeTitle(job.reason) ?? job.reason,
    explanation:
      job.status === 'exhausted'
        ? `Reconciliation tried ${job.attempts} times and stopped. The condition is still open.`
        : job.status === 'failed'
          ? `The last of ${job.attempts} reconciliation attempts did not resolve this. It will be retried automatically.`
          : job.status === 'claimed'
            ? 'A reconciliation worker is on it now.'
            : 'Queued for the next reconciliation pass.',
    nextStep:
      job.status === 'exhausted'
        ? 'A person has to resolve the underlying condition; automation will not.'
        : 'No action unless it persists across several passes.',
    reference: job.reference,
    unitSlug: null,
    unitName: null,
    since: job.createdAt,
    moneyInvolved: job.reason.startsWith('PAYMENT') || job.reason === 'PAID_BOOKING_UNFINALIZED' ? true : 'unknown',
    inventoryHeld: 'unknown',
    href: job.reference ? bookingHref(job.reference) : null,
  };
}

export function assessPaymentEvent(ev: PaymentEventDto, now: Date): AttentionItem | null {
  const base = {
    category: 'payment_inbox' as const,
    reference: ev.reference,
    unitSlug: null,
    unitName: null,
    moneyInvolved: true as const,
    inventoryHeld: 'unknown' as const,
    href: ev.reference ? bookingHref(ev.reference) : null,
    since: ev.receivedAt,
  };

  if (ev.verification === 'failed') {
    return {
      ...base,
      id: `payment_event:${ev.id}`,
      level: 'high',
      code: null,
      title: 'Payment webhook failed verification',
      explanation: `A ${ev.eventType} delivery did not verify against the registered webhook. Usually a webhook-id mismatch between the two secret stores; occasionally a forgery attempt. It was stored and not processed.`,
      nextStep: 'Compare the webhook id in the provider dashboard with both secret stores. The provider will redeliver once it matches.',
    };
  }

  if (ev.status === 'exhausted') {
    return {
      ...base,
      id: `payment_event:${ev.id}`,
      level: 'critical',
      code: 'PAYMENT_EVENT_STUCK',
      title: 'Verified payment event could not be processed',
      explanation: `A verified ${ev.eventType} was received and every processing attempt failed. A payment fact may be unapplied.`,
      nextStep: 'Read the last error, then run reconciliation — it reads the order from the provider and applies a capture through the same validation.',
    };
  }

  if (ev.status === 'failed') {
    return {
      ...base,
      id: `payment_event:${ev.id}`,
      level: 'high',
      code: 'PAYMENT_EVENT_STUCK',
      title: 'Payment event processing failed',
      explanation: `Processing a verified ${ev.eventType} failed on attempt ${ev.attempts}. It will be retried with backoff.`,
      nextStep: 'No action unless it persists. The last error is on the technical panel.',
    };
  }

  if (
    ev.verification === 'verified' &&
    (ev.status === 'pending' || ev.status === 'claimed') &&
    now.getTime() - new Date(ev.receivedAt).getTime() > PAYMENT_EVENT_STUCK_MS
  ) {
    return {
      ...base,
      id: `payment_event:${ev.id}`,
      level: 'high',
      code: 'PAYMENT_EVENT_STUCK',
      title: 'Verified payment event unprocessed',
      explanation: `A verified ${ev.eventType} has been waiting for processing longer than a reconciliation cycle. Either reconciliation is not running, or it is failing before reaching the inbox.`,
      nextStep: 'Check that the reconciliation schedule is running. Running one pass drains the inbox.',
    };
  }

  return null;
}

/** Outbox problems are reported per event, so an operator sees which message did not go. */
export function assessOutboxEvent(ev: OutboxEventDto, now: Date): AttentionItem | null {
  const base = {
    category: 'outbox' as const,
    reference: ev.reference,
    unitSlug: null,
    unitName: null,
    moneyInvolved: false as const,
    inventoryHeld: false as const,
    href: ev.reference ? bookingHref(ev.reference) : null,
    since: ev.createdAt,
  };

  if (ev.status === 'exhausted') {
    return {
      ...base,
      id: `outbox:${ev.id}`,
      level: 'high',
      code: 'OUTBOX_DEAD_LETTER',
      title: `${ev.eventType} was never delivered`,
      explanation: `The automation event ${ev.eventType} failed ${ev.attempts} times and has been dead-lettered. The booking itself is unaffected; whatever this event triggers — a guest message, an invoice — did not happen.`,
      nextStep: 'Read the last error, fix the automation, and handle the guest communication by hand if it was a confirmation.',
    };
  }

  if ((ev.status === 'pending' || ev.status === 'claimed') && now.getTime() - new Date(ev.createdAt).getTime() > OUTBOX_BACKLOG_MS) {
    return {
      ...base,
      id: `outbox:${ev.id}`,
      level: 'elevated',
      code: 'OUTBOX_BACKLOG',
      title: `${ev.eventType} waiting for automation`,
      explanation: `This event has been waiting ${Math.round((now.getTime() - new Date(ev.createdAt).getTime()) / 60_000)} minutes. The automation pump is not claiming events.`,
      nextStep: 'Check that the automation platform is online and polling the outbox. Nothing is lost while it waits.',
    };
  }

  return null;
}

export interface AttentionInput {
  bookings: readonly BookingSummaryDto[];
  operations: readonly ExternalOperationDto[];
  jobs: readonly ReconciliationJobDto[];
  paymentEvents: readonly PaymentEventDto[];
  outbox: readonly OutboxEventDto[];
}

/**
 * The inbox: everything that needs a person, most urgent first, then oldest
 * first within a level. Deterministic for a given input and `now`.
 */
export function collectAttention(input: AttentionInput, now: Date = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const b of input.bookings) {
    const item = assessBooking(b);
    if (item) items.push(item);
  }
  for (const op of input.operations) {
    const item = assessOperation(op, now);
    if (item) items.push(item);
  }
  for (const job of input.jobs) {
    const item = assessReconciliationJob(job);
    if (item) items.push(item);
  }
  for (const ev of input.paymentEvents) {
    const item = assessPaymentEvent(ev, now);
    if (item) items.push(item);
  }
  for (const ev of input.outbox) {
    const item = assessOutboxEvent(ev, now);
    if (item) items.push(item);
  }
  return items.sort((a, b) => {
    const level = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (level !== 0) return level;
    return a.since.localeCompare(b.since);
  });
}

export function countByLevel(items: readonly AttentionItem[]): Record<AttentionLevel, number> {
  const out: Record<AttentionLevel, number> = { critical: 0, high: 0, elevated: 0, watch: 0 };
  for (const i of items) out[i.level] += 1;
  return out;
}
