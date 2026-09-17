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
  lastFailureCode?: OpsCode;
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
