import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE COMMAND LAYER — every state change in the system goes through here.
 *
 * Each function is a thin, typed call to a PostgreSQL function that does the
 * work atomically. The logic is in the database on purpose: application code
 * gets redeployed, rewritten and called from four different runtimes, and a
 * guarantee that lives in a TypeScript module is a guarantee that lasts until
 * someone adds a fifth caller.
 *
 * What the database does that this file cannot:
 *
 *   • takes a row lock for the duration of the decision;
 *   • validates the transition against the same table twice (the function and
 *     the BEFORE UPDATE trigger);
 *   • refuses a stale expected-status, so two racing callbacks cannot both move
 *     one booking;
 *   • writes the audit row and the outbox row in the SAME TRANSACTION as the
 *     state change, so an event and the fact it describes cannot come apart.
 *
 * ── The null return ──────────────────────────────────────────────────────
 * `transitionIntent` returns null for "refused" — an illegal move, or a stale
 * expected status. Null is not an error and must not be thrown: refusing a
 * duplicate webhook delivery is the system working. Callers re-read.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { BookingLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import { findIntentByReference } from '@/lib/booking/repository';
import type { BookingState, PaymentState } from '@/lib/booking/states';
import type { OpsCode } from '@/lib/booking/errors';
import type { PaymentProvider, QuoteComponent } from '@/lib/booking/types';

/**
 * Raised when the database's overlap exclusion constraint refuses a lock.
 *
 * This is the last line of overbooking defence firing. It is a conflict to
 * show the guest, never a 500 to swallow.
 */
export class OverlapError extends Error {
  constructor() {
    super('These dates are already reserved');
    this.name = 'OverlapError';
  }
}

/**
 * The fields a transition may carry.
 *
 * Deliberately NOT `Record<string, unknown>`: the SQL function reads a fixed
 * set of keys out of its jsonb patch, and a typo in a key name would silently
 * write nothing at all. Naming them here makes that a compile error.
 */
export interface TransitionPatch {
  quotedTotalCents?: number;
  quoteComponents?: QuoteComponent[];
  quoteHash?: string;
  quoteExpiresAt?: string;
  currency?: string;
  holdExpiresAt?: string | null;
  lockExpiresAt?: string | null;
  beds24BookingId?: string;
  beds24PropertyId?: string;
  beds24RoomId?: string;
  beds24Status?: string;
  beds24VerifiedAt?: string;
  paymentProvider?: PaymentProvider;
  paymentStatus?: PaymentState;
  paymentOrderId?: string;
  paymentCaptureId?: string;
  paidAmountCents?: number;
  paidCurrency?: string;
  providerSnapshot?: unknown;
  /** `null` clears the column; `undefined` leaves it alone. */
  lastFailureCode?: OpsCode | null;
  lastFailureReason?: string;
  reconciliationState?: 'ok' | 'pending' | 'failed' | 'manual';
}

/** camelCase → the snake_case keys the SQL function reads. */
function toPatchJson(patch: TransitionPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value;
  };
  set('quoted_total_cents', patch.quotedTotalCents);
  set('quote_components', patch.quoteComponents);
  set('quote_hash', patch.quoteHash);
  set('quote_expires_at', patch.quoteExpiresAt);
  set('currency', patch.currency);
  set('hold_expires_at', patch.holdExpiresAt);
  set('lock_expires_at', patch.lockExpiresAt);
  set('beds24_booking_id', patch.beds24BookingId);
  set('beds24_property_id', patch.beds24PropertyId);
  set('beds24_room_id', patch.beds24RoomId);
  set('beds24_status', patch.beds24Status);
  set('beds24_verified_at', patch.beds24VerifiedAt);
  set('payment_provider', patch.paymentProvider);
  set('payment_status', patch.paymentStatus);
  set('payment_order_id', patch.paymentOrderId);
  set('payment_capture_id', patch.paymentCaptureId);
  set('paid_amount_cents', patch.paidAmountCents);
  set('paid_currency', patch.paidCurrency);
  set('provider_snapshot', patch.providerSnapshot);
  set('last_failure_code', patch.lastFailureCode);
  set('last_failure_reason', patch.lastFailureReason?.slice(0, 400));
  set('reconciliation_state', patch.reconciliationState);
  return out;
}

/** Postgres `23P01` — the no-overlap exclusion constraint. */
function isOverlap(error: { code?: string } | null): boolean {
  return error?.code === '23P01';
}

export interface TransitionOptions {
  /** Compare-and-set. Omit only when the caller genuinely does not care. */
  expected: BookingState | null;
  to: BookingState;
  reason?: string;
  patch?: TransitionPatch;
  /**
   * The outbox event this transition emits, written in the same transaction.
   *
   * References only — no guest name, email or phone. n8n fetches those from
   * the authenticated internal API when it needs them, so PII never sits in a
   * queue table or an n8n execution history.
   */
  outbox?: { type: string; payload?: Record<string, unknown> };
}

/**
 * Move a booking. The only way.
 *
 * Returns the new row, or null when the database refused — illegal transition,
 * or the row moved since the caller read it.
 */
export async function transitionIntent(
  intentId: string,
  options: TransitionOptions,
  logger: BookingLogger
): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_booking_transition', {
    p_intent_id: intentId,
    p_expected: options.expected,
    p_to: options.to,
    p_reason: options.reason ?? null,
    p_patch: toPatchJson(options.patch ?? {}),
    p_correlation_id: logger.correlationId,
    p_outbox_type: options.outbox?.type ?? null,
    p_outbox_payload: options.outbox?.payload ?? null,
  });

  if (error) {
    if (isOverlap(error)) throw new OverlapError();
    throw error;
  }
  if (!data) {
    logger.warn('intent.transition', {
      toStatus: options.to,
      fromStatus: options.expected ?? undefined,
      outcome: 'refused',
    });
    return null;
  }

  // The RPC returns the row as the table's own composite type. Re-reading by
  // reference rather than hand-mapping thirty snake_case columns keeps one
  // mapping function (`toIntent`) in the repository as the only place that
  // knows the row shape.
  const row = data as { reference?: string };
  const refreshed = row.reference ? await findIntentByReference(row.reference) : null;

  logger.info('intent.transition', {
    reference: row.reference,
    fromStatus: options.expected ?? undefined,
    toStatus: options.to,
    outcome: options.reason ?? 'applied',
  });
  return refreshed;
}

/**
 * Take the LOCAL lock on a unit and date range.
 *
 * Called before any Beds24 call, which is the change that makes concurrent
 * direct bookings safe: the exclusion constraint covers `locking`, so of two
 * overlapping requests exactly one ever reaches the provider. Previously the
 * constraint only bit after the external hold existed, and the loser's hold
 * was orphaned.
 *
 * Throws `OverlapError` when someone else holds the range. That is the correct
 * outcome and is shown to the guest as an availability conflict.
 */
export async function acquireLock(
  intentId: string,
  lockSeconds: number,
  logger: BookingLogger
): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_acquire_lock', {
    p_intent_id: intentId,
    p_lock_seconds: lockSeconds,
    p_correlation_id: logger.correlationId,
  });

  if (error) {
    if (isOverlap(error)) throw new OverlapError();
    throw error;
  }
  const row = data as { reference?: string } | null;
  if (!row?.reference) {
    logger.warn('intent.lock', { outcome: 'refused' });
    return null;
  }
  logger.info('intent.lock', { reference: row.reference, outcome: 'acquired' });
  return findIntentByReference(row.reference);
}

/* ── Payment ───────────────────────────────────────────────────────────── */

export type CaptureOutcome =
  | { outcome: 'applied'; status: BookingState; paymentStatus: PaymentState }
  | { outcome: 'duplicate'; status: BookingState; paymentStatus: PaymentState }
  | { outcome: 'mismatch'; code: OpsCode }
  | { outcome: 'not_applicable'; status: BookingState }
  | { outcome: 'unknown_reference' };

/**
 * Record a VERIFIED capture.
 *
 * Everything that could make this unsafe is checked inside one transaction
 * against a locked row: that the order is ours, that the amount is the amount
 * we quoted, that the currency matches, and that this capture has not already
 * been applied. A mismatch goes to `manual_review` with a severity-1 job — it
 * never confirms, and it never refunds. Both of those are human decisions.
 *
 * The amount passed here comes from the PROVIDER, never from a caller's input.
 */
export async function recordCapture(
  input: {
    reference: string;
    provider: PaymentProvider;
    orderId: string;
    captureId: string;
    amountCents: number;
    currency: string;
  },
  logger: BookingLogger
): Promise<CaptureOutcome> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_record_payment_capture', {
    p_reference: input.reference,
    p_provider: input.provider,
    p_order_id: input.orderId,
    p_capture_id: input.captureId,
    p_amount_cents: input.amountCents,
    p_currency: input.currency.toUpperCase().slice(0, 3),
    p_correlation_id: logger.correlationId,
  });
  if (error) throw error;

  const result = data as CaptureOutcome;
  logger.info('payment.capture', {
    reference: input.reference,
    orderId: input.orderId,
    captureId: input.captureId,
    amountCents: input.amountCents,
    currency: input.currency,
    outcome: result.outcome,
    errorCode: 'code' in result ? result.code : undefined,
  });
  return result;
}

/* ── Reconciliation ────────────────────────────────────────────────────── */

export async function queueReconciliation(
  intentId: string,
  reason: OpsCode,
  severity: number,
  detail?: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_queue_reconciliation', {
    p_intent_id: intentId,
    p_reason: reason,
    p_severity: severity,
    p_detail: detail ?? null,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/* ── Payment event inbox ───────────────────────────────────────────────── */

export interface RecordEventInput {
  provider: 'paypal';
  providerEventId: string;
  eventType: string;
  verification: 'verified' | 'failed' | 'unverified' | 'skipped';
  payload: Record<string, unknown>;
  eventTime?: string;
  transmissionTime?: string;
  transmissionId?: string;
  orderId?: string;
  captureId?: string;
  reference?: string;
  amountCents?: number;
  currency?: string;
}

/**
 * Store an inbound payment event.
 *
 * Unique on `(provider, provider_event_id)`, so PayPal's up-to-nine retries
 * produce one row and one processing. `duplicate: true` is the normal, quiet,
 * expected answer — not an error.
 */
export async function recordPaymentEvent(
  input: RecordEventInput
): Promise<{ duplicate: boolean; id?: string }> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_record_payment_event', {
    p_provider: input.provider,
    p_provider_event_id: input.providerEventId,
    p_event_type: input.eventType,
    p_verification: input.verification,
    p_payload: input.payload,
    p_event_time: input.eventTime ?? null,
    p_transmission_time: input.transmissionTime ?? null,
    p_transmission_id: input.transmissionId ?? null,
    p_order_id: input.orderId ?? null,
    p_capture_id: input.captureId ?? null,
    p_reference: input.reference ?? null,
    p_amount_cents: input.amountCents ?? null,
    p_currency: input.currency?.toUpperCase().slice(0, 3) ?? null,
  });
  if (error) throw error;
  return data as { duplicate: boolean; id?: string };
}

export interface PaymentEventRow {
  id: string;
  provider: 'paypal';
  provider_event_id: string;
  event_type: string;
  order_id: string | null;
  capture_id: string | null;
  reference: string | null;
  amount_cents: number | null;
  currency: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  received_at: string;
}

export async function claimPaymentEvents(worker: string, limit = 20): Promise<PaymentEventRow[]> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_claim_payment_events', {
    p_worker: worker,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as PaymentEventRow[];
}

export async function settlePaymentEvent(id: string, ok: boolean, errorText?: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc('bolagio_settle_payment_event', {
    p_id: id,
    p_ok: ok,
    p_error: errorText ?? null,
  });
  if (error) throw error;
}

/* ── Outbox ────────────────────────────────────────────────────────────── */

export interface OutboxEventRow {
  id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string | null;
  reference: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
}

export async function claimOutboxEvents(
  worker: string,
  limit = 20,
  leaseSeconds = 300
): Promise<OutboxEventRow[]> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_claim_outbox_events', {
    p_worker: worker,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw error;
  return (data ?? []) as OutboxEventRow[];
}

export async function ackOutboxEvent(id: string, worker: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_ack_outbox_event', {
    p_id: id,
    p_worker: worker,
  });
  if (error) throw error;
  return data === true;
}

export async function failOutboxEvent(id: string, worker: string, errorText: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_fail_outbox_event', {
    p_id: id,
    p_worker: worker,
    p_error: errorText,
  });
  if (error) throw error;
  return data === true;
}

/* ── Reconciliation queue ──────────────────────────────────────────────── */

export interface ReconciliationJobRow {
  id: string;
  intent_id: string | null;
  reference: string | null;
  reason: string;
  severity: number;
  detail: Record<string, unknown> | null;
  attempts: number;
}

export async function claimReconciliationJobs(
  worker: string,
  limit = 10
): Promise<ReconciliationJobRow[]> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_claim_reconciliation_jobs', {
    p_worker: worker,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ReconciliationJobRow[];
}

export async function resolveReconciliationJob(id: string, resolution: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc('bolagio_resolve_reconciliation_job', {
    p_id: id,
    p_resolution: resolution,
  });
  if (error) throw error;
}

export async function failReconciliationJob(id: string, errorText: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc('bolagio_fail_reconciliation_job', {
    p_id: id,
    p_error: errorText,
  });
  if (error) throw error;
}

/* ── Scheduler heartbeat ───────────────────────────────────────────────── */

export type SchedulerJob = 'reconcile' | 'inventory_sync' | 'operations' | 'reservation_sync';

/**
 * Record one scheduled invocation, whatever its outcome.
 *
 * Counts only in `report`; never a reference, never guest data. Never throws:
 * a heartbeat that fails to write must not turn a successful pass into an
 * error — the pass already did its work.
 */
export async function recordSchedulerRun(input: {
  job: SchedulerJob;
  startedAt: Date;
  ok: boolean;
  report?: Record<string, number | string | boolean | null>;
  error?: string;
  worker?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().rpc('bolagio_record_scheduler_run', {
    p_job: input.job,
    p_started_at: input.startedAt.toISOString(),
    p_ok: input.ok,
    p_report: input.report ?? null,
    p_error: input.error?.slice(0, 500) ?? null,
    p_worker: input.worker ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console -- the heartbeat itself failed; nothing else can record it.
    console.error(JSON.stringify({ scope: 'booking', event: 'scheduler.heartbeat', level: 'error', cause: error.code }));
  }
}

export interface SchedulerStatusRow {
  job: SchedulerJob;
  started_at: string;
  finished_at: string;
  ok: boolean;
  report: Record<string, unknown> | null;
  error: string | null;
  worker: string | null;
}

export async function readSchedulerStatus(): Promise<SchedulerStatusRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_scheduler_status')
    .select('job, started_at, finished_at, ok, report, error, worker');
  if (error) throw error;
  return (data ?? []) as SchedulerStatusRow[];
}

/* ── Operations: turnovers and guest events ───────────────────────────── */

export interface TurnoverSyncReport {
  created: number;
  updated: number;
  voided: number;
  reopened: number;
}

/** Derive turnovers from confirmed stays. Idempotent; emits `cleaning.required` once per new turnover. */
export async function syncTurnovers(horizonDays = 60): Promise<TurnoverSyncReport> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_sync_turnovers', { p_horizon_days: horizonDays });
  if (error) throw error;
  const r = (data ?? {}) as Partial<TurnoverSyncReport>;
  return { created: r.created ?? 0, updated: r.updated ?? 0, voided: r.voided ?? 0, reopened: r.reopened ?? 0 };
}

export interface GuestEventReport {
  prearrival: number;
  checkin: number;
  checkout: number;
  review: number;
  invoice: number;
}

/**
 * Emit the time-driven guest-operations events that are due, once each.
 *
 * The timing is decided in the database, in the property's own timezone,
 * and the dedup ledger row is written in the same transaction as the outbox
 * row — a pass that dies half way emits nothing twice.
 */
export async function emitGuestEvents(timing: {
  prearrivalDays: number;
  reviewDelayDays: number;
  reviewWindowDays: number;
}): Promise<GuestEventReport> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_emit_guest_events', {
    p_prearrival_days: timing.prearrivalDays,
    p_review_delay_days: timing.reviewDelayDays,
    p_review_window_days: timing.reviewWindowDays,
  });
  if (error) throw error;
  const r = (data ?? {}) as Partial<GuestEventReport>;
  return { prearrival: r.prearrival ?? 0, checkin: r.checkin ?? 0, checkout: r.checkout ?? 0, review: r.review ?? 0, invoice: r.invoice ?? 0 };
}


/* ── Cancellation ──────────────────────────────────────────────────────── */

export type CancellationRequestOutcome =
  | { outcome: 'cancelled'; status: 'cancelled'; refundState: string }
  | { outcome: 'already_cancelled'; status: string; refundState: string }
  | { outcome: 'release_required'; status: BookingState; refundState: string; authorized: boolean }
  | { outcome: 'in_progress'; status: string }
  | { outcome: 'refused'; code: 'NOT_FOUND' | 'AUTHORIZATION_REQUIRED' | 'REFUND_DECISION_REQUIRED' | 'INVALID_REFUND_AMOUNT' | 'MANUAL_REVIEW'; status?: string; paidAmountCents?: number | null };

/**
 * Record a cancellation decision. The database classifies the case and
 * refuses what it must refuse (no authorisation for a booking with payment
 * evidence, no refund decision for a paid one). It never calls a provider.
 */
export async function requestCancellation(
  input: { intentId: string; actor: string; reason?: string; authorized?: boolean; refundCents?: number | null },
  logger: BookingLogger
): Promise<CancellationRequestOutcome> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_request_cancellation', {
    p_intent_id: input.intentId,
    p_actor: input.actor,
    p_reason: input.reason ?? null,
    p_authorized: input.authorized === true,
    p_refund_cents: input.refundCents ?? null,
    p_correlation_id: logger.correlationId,
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  const result = {
    outcome: r.outcome,
    status: r.status,
    refundState: r.refund_state,
    authorized: r.authorized,
    code: r.code,
    paidAmountCents: r.paid_amount_cents,
  } as unknown as CancellationRequestOutcome;
  logger.info('booking.cancel', { outcome: String(r.outcome), errorCode: typeof r.code === 'string' ? r.code : undefined });
  return result;
}

export async function completeCancellation(
  intentId: string,
  logger: BookingLogger
): Promise<'cancelled' | 'already_cancelled' | 'not_yet' | 'refused'> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_complete_cancellation', {
    p_intent_id: intentId,
    p_correlation_id: logger.correlationId,
  });
  if (error) throw error;
  const r = data as { outcome: string };
  return (r.outcome as 'cancelled' | 'already_cancelled' | 'not_yet' | 'refused') ?? 'refused';
}

/* ── Refunds ───────────────────────────────────────────────────────────── */

export type BeginRefundOutcome =
  | { ok: true; captureId: string; amountCents: number; currency: string }
  | { ok: false; code: 'NOT_FOUND' | 'REFUND_ALREADY_COMPLETED' | 'REFUND_IN_PROGRESS' | 'REFUND_NOT_REQUIRED' | 'NO_CAPTURE' | 'AUTHORIZATION_REQUIRED'; refundState?: string };

export async function beginRefund(intentId: string, actor: string): Promise<BeginRefundOutcome> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_begin_refund', { p_intent_id: intentId, p_actor: actor });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  if (r.ok === true) {
    return { ok: true, captureId: String(r.capture_id), amountCents: Number(r.amount_cents), currency: String(r.currency) };
  }
  return { ok: false, code: r.code as Exclude<BeginRefundOutcome, { ok: true }>['code'], refundState: r.refund_state as string | undefined };
}

export type RefundOutcomeInput =
  | { outcome: 'completed'; refundId: string; amountCents: number; source: 'saga' | 'webhook' | 'readback' }
  | { outcome: 'unknown'; error: string }
  | { outcome: 'failed'; error: string };

export async function recordRefundOutcome(
  intentId: string,
  input: RefundOutcomeInput,
  logger: BookingLogger
): Promise<{ ok: boolean; code?: string; duplicate?: boolean; refundState?: string; paymentStatus?: string }> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_record_refund_outcome', {
    p_intent_id: intentId,
    p_outcome: input.outcome,
    p_refund_id: input.outcome === 'completed' ? input.refundId : null,
    p_amount_cents: input.outcome === 'completed' ? input.amountCents : null,
    p_error: input.outcome === 'completed' ? null : input.error.slice(0, 400),
    p_source: input.outcome === 'completed' ? input.source : 'saga',
    p_correlation_id: logger.correlationId,
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  logger.info('payment.refund', {
    outcome: input.outcome,
    errorCode: typeof r.code === 'string' ? r.code : undefined,
    resolution: typeof r.refund_state === 'string' ? r.refund_state : undefined,
  });
  return {
    ok: r.ok === true,
    code: typeof r.code === 'string' ? r.code : undefined,
    duplicate: r.duplicate === true,
    refundState: typeof r.refund_state === 'string' ? r.refund_state : undefined,
    paymentStatus: typeof r.payment_status === 'string' ? r.payment_status : undefined,
  };
}

export async function resetRefund(intentId: string, actor: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_reset_refund', { p_intent_id: intentId, p_actor: actor });
  if (error) throw error;
  return data === true;
}

/* ── Message deliveries ────────────────────────────────────────────────── */

export type DeliveryClaim =
  | { outcome: 'claimed'; id: string; attempt: number; sequence: number }
  | { outcome: 'already_sent'; id: string; status: string; provider: string | null; providerMessageId: string | null; sentAt: string | null }
  | { outcome: 'in_progress'; id: string }
  | { outcome: 'not_retryable'; id: string; lastError: string | null }
  | { outcome: 'backoff'; id: string; nextAttemptAt: string }
  | { outcome: 'unknown_reference' };

export async function beginMessageDelivery(input: {
  reference: string;
  kind: string;
  channel: 'email' | 'sms' | 'none';
  locale: string;
  templateId: string;
  templateVersion: string;
  destinationMasked: string | null;
  destinationHash: string | null;
  outboxEventId?: string | null;
  sequence?: number;
}): Promise<DeliveryClaim> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_begin_message_delivery', {
    p_reference: input.reference,
    p_kind: input.kind,
    p_channel: input.channel,
    p_locale: input.locale,
    p_template_id: input.templateId,
    p_template_version: input.templateVersion,
    p_destination_masked: input.destinationMasked,
    p_destination_hash: input.destinationHash,
    p_outbox_event_id: input.outboxEventId ?? null,
    p_sequence: input.sequence ?? 1,
    p_lease_seconds: 300,
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  switch (r.outcome) {
    case 'claimed':
      return { outcome: 'claimed', id: String(r.id), attempt: Number(r.attempt), sequence: Number(r.sequence) };
    case 'already_sent':
      return { outcome: 'already_sent', id: String(r.id), status: String(r.status), provider: (r.provider as string | null) ?? null, providerMessageId: (r.provider_message_id as string | null) ?? null, sentAt: (r.sent_at as string | null) ?? null };
    case 'in_progress':
      return { outcome: 'in_progress', id: String(r.id) };
    case 'not_retryable':
      return { outcome: 'not_retryable', id: String(r.id), lastError: (r.last_error as string | null) ?? null };
    case 'backoff':
      return { outcome: 'backoff', id: String(r.id), nextAttemptAt: String(r.next_attempt_at) };
    default:
      return { outcome: 'unknown_reference' };
  }
}

export async function completeMessageDelivery(input: {
  id: string;
  outcome: 'sent' | 'failed' | 'skipped' | 'suppressed';
  provider?: string;
  providerMessageId?: string;
  error?: string;
  retryable?: boolean;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_complete_message_delivery', {
    p_id: input.id,
    p_outcome: input.outcome,
    p_provider: input.provider ?? null,
    p_provider_message_id: input.providerMessageId ?? null,
    p_error: input.error?.slice(0, 400) ?? null,
    p_retryable: input.retryable !== false,
  });
  if (error) throw error;
  return data === true;
}

export async function requeueMessageDelivery(id: string, actor: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_requeue_message_delivery', { p_id: id, p_actor: actor });
  if (error) throw error;
  return data === true;
}

export async function requeueOutboxEvent(id: string, actor: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_requeue_outbox_event', { p_id: id, p_actor: actor });
  if (error) throw error;
  return data === true;
}

/* ── Cleaning ──────────────────────────────────────────────────────────── */

export type TurnoverStatus = 'required' | 'in_progress' | 'done' | 'void';

export async function setTurnoverStatus(
  turnoverId: string,
  to: Exclude<TurnoverStatus, 'void'>,
  actor: string,
  note?: string
): Promise<{ ok: boolean; code?: string; from?: string; noop?: boolean }> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_set_turnover_status', {
    p_turnover_id: turnoverId,
    p_to: to,
    p_actor: actor,
    p_note: note ?? null,
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return { ok: r.ok === true, code: typeof r.code === 'string' ? r.code : undefined, from: typeof r.from === 'string' ? r.from : undefined, noop: r.noop === true };
}

export async function assignTurnover(turnoverId: string, assignee: string | null, actor: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('bolagio_assign_turnover', {
    p_turnover_id: turnoverId,
    p_assignee: assignee ?? '',
    p_actor: actor,
  });
  if (error) throw error;
  return data === true;
}

/* ── Integration health ────────────────────────────────────────────────── */

export type IntegrationProvider = 'beds24' | 'paypal' | 'n8n';

/**
 * Leave a timestamp: "we last heard this from that provider". Never throws
 * and never awaited on a guest-facing path — an observation that fails to
 * write must not fail the operation it observes.
 */
/**
 * Success heartbeats are throttled per isolate: a reservation sync makes a
 * dozen Beds24 calls, and one `last_success` write per call spent a dozen of
 * the Worker's per-request subrequests to say the same thing twelve times —
 * enough, on the 50-subrequest plan, to starve the sync's own last window and
 * its scheduler heartbeat. Failures, and every other signal, are never
 * throttled.
 */
const lastObserved = new Map<string, number>();

/** `OBSERVE_SUCCESS_INTERVAL_MS`, default one minute; 0 records every success. */
function successObserveIntervalMs(): number {
  const n = Number.parseInt(process.env.OBSERVE_SUCCESS_INTERVAL_MS ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

export function shouldObserve(provider: string, signal: string, now = Date.now()): boolean {
  if (signal !== 'last_success') return true;
  const interval = successObserveIntervalMs();
  if (interval === 0) return true;
  const key = `${provider}:${signal}`;
  const last = lastObserved.get(key);
  if (last !== undefined && now - last < interval) return false;
  lastObserved.set(key, now);
  return true;
}

export function observeIntegration(provider: IntegrationProvider, signal: string, detail?: string): void {
  if (!shouldObserve(provider, signal)) return;
  let client: ReturnType<typeof supabaseAdmin>;
  try {
    client = supabaseAdmin();
  } catch {
    // No database configured: nothing to observe into, and nothing to fail.
    return;
  }
  void Promise.resolve(
    client.rpc('bolagio_observe_integration', { p_provider: provider, p_signal: signal, p_detail: detail ?? null })
  )
    .then(({ error }) => {
      if (error) {
        // eslint-disable-next-line no-console -- nothing else can record that the observation failed.
        console.error(JSON.stringify({ scope: 'booking', event: 'integration.observe', level: 'warn', cause: error.code }));
      }
    })
    .catch(() => undefined);
}
