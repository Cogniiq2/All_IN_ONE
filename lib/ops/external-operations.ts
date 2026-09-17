import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TRACKED EXTERNAL MUTATIONS.
 *
 * PostgreSQL cannot transact with Beds24 or PayPal. That is not a limitation
 * to be engineered around — it is a fact to be modelled. This module models it.
 *
 * ── The situation this exists for ────────────────────────────────────────
 * We POST "create a booking" to Beds24. The connection dies. There are three
 * possibilities and, locally, they are indistinguishable:
 *
 *   the request never arrived           → retrying is correct
 *   it arrived and was rejected         → retrying is correct
 *   it arrived and CREATED A BOOKING    → retrying double-books the guest
 *
 * The previous implementation assumed the first two and moved the intent to
 * `cancelled`, which both released the local range and abandoned an invisible
 * Beds24 hold that would block Booking.com and Airbnb indefinitely.
 *
 * So: a row is written BEFORE the call, and a call that does not answer is
 * `outcome_unknown` — not `failed`. An `outcome_unknown` operation is a hard
 * block on retrying the same mutation until a READ of the provider has
 * resolved it.
 *
 * ── What makes a key ─────────────────────────────────────────────────────
 * Deterministic and derived from the logical operation, never random:
 *
 *   beds24:create_hold:<intent uuid>
 *   beds24:release:<beds24 booking id>
 *   paypal:create_order:<intent uuid>:<quote hash>
 *   paypal:capture:<paypal order id>
 *
 * A retry of the same logical operation therefore finds the same row and can
 * see what the previous attempt learned. `paypal:create_order` includes the
 * quote hash so that a genuinely re-quoted booking gets a new order rather
 * than silently reusing one for a different amount.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { BookingLogger } from '@/lib/booking/logger';

export type ExternalProvider = 'beds24' | 'paypal';

export type OperationOutcome =
  | 'in_flight'
  | 'succeeded'
  | 'failed'
  | 'outcome_unknown'
  | 'reconciled';

export interface ExternalOperation {
  id: string;
  operationKey: string;
  provider: ExternalProvider;
  operationType: string;
  intentId: string | null;
  resourceId: string | null;
  outcome: OperationOutcome;
  attempts: number;
  startedAt: string;
  uncertainAt: string | null;
  lastError: string | null;
}

/**
 * Thrown when a call's outcome could not be determined.
 *
 * Distinct from a provider error ON PURPOSE. A `ProviderError` means the
 * provider answered; this means it did not, and the two demand opposite
 * responses — one may be retried, the other may not be.
 */
export class UncertainOperationError extends Error {
  constructor(
    readonly operationKey: string,
    readonly provider: ExternalProvider,
    readonly operationType: string,
    cause?: unknown
  ) {
    super(`External operation ${operationKey} did not return an outcome`);
    this.name = 'UncertainOperationError';
    // The cause is kept for the log line only. It is never rendered and never
    // attached to a response: a transport error message can echo a URL with a
    // token in the query string.
    this.detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : undefined;
  }
  readonly detail?: string;
}

const ROW =
  'id, operation_key, provider, operation_type, intent_id, resource_id,' +
  ' outcome, attempts, started_at, uncertain_at, last_error';

interface Row {
  id: string;
  operation_key: string;
  provider: ExternalProvider;
  operation_type: string;
  intent_id: string | null;
  resource_id: string | null;
  outcome: OperationOutcome;
  attempts: number;
  started_at: string;
  uncertain_at: string | null;
  last_error: string | null;
}

function toOperation(row: Row): ExternalOperation {
  return {
    id: row.id,
    operationKey: row.operation_key,
    provider: row.provider,
    operationType: row.operation_type,
    intentId: row.intent_id,
    resourceId: row.resource_id,
    outcome: row.outcome,
    attempts: row.attempts,
    startedAt: row.started_at,
    uncertainAt: row.uncertain_at,
    lastError: row.last_error,
  };
}

export async function findOperation(key: string): Promise<ExternalOperation | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_external_operations')
    .select(ROW)
    .eq('operation_key', key)
    .maybeSingle();
  if (error) throw error;
  return data ? toOperation(data as unknown as Row) : null;
}

/** Every unresolved uncertainty for one booking. The lease check reads this. */
export async function findUncertainOperations(intentId: string): Promise<ExternalOperation[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_external_operations')
    .select(ROW)
    .eq('intent_id', intentId)
    .in('outcome', ['outcome_unknown', 'in_flight']);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toOperation);
}

export async function completeOperation(
  key: string,
  outcome: OperationOutcome,
  resourceId?: string,
  errorText?: string
): Promise<void> {
  const { error } = await supabaseAdmin().rpc('bolagio_complete_external_operation', {
    p_key: key,
    p_outcome: outcome,
    p_resource_id: resourceId ?? null,
    p_error: errorText ?? null,
  });
  if (error) throw error;
}

export interface TrackedCallOptions<T> {
  key: string;
  provider: ExternalProvider;
  type: string;
  intentId?: string;
  /** Enough to recognise the result at the provider. No guest PII beyond ids. */
  request?: Record<string, unknown>;
  logger: BookingLogger;
  /**
   * Decides whether a thrown error left the world in a known state.
   *
   * Default: nothing is certain. A caller must OPT IN to "this failure is
   * definitive", by recognising an error the provider itself produced — a 4xx,
   * a structured rejection. A timeout, a socket error, a 5xx and an unknown
   * throw are all uncertain, because in every one of them the request may have
   * been executed before the answer was lost.
   */
  isDefiniteFailure?: (cause: unknown) => boolean;
  /** Pulls the provider's id out of a success, so it can be recorded. */
  resourceIdOf?: (result: T) => string | undefined;
}

/**
 * Run an external mutation with its outcome recorded.
 *
 * Three exits, and the middle one is the reason this function exists:
 *
 *   resolves            → 'succeeded', with the provider's resource id
 *   definite failure    → 'failed'; the caller may compensate and retry
 *   anything else       → 'outcome_unknown' + UncertainOperationError thrown.
 *                         The caller MUST NOT retry. It must reconcile.
 */
export async function trackedCall<T>(options: TrackedCallOptions<T>, call: () => Promise<T>): Promise<T> {
  const { key, provider, type, intentId, request, logger } = options;

  const { error: beginError } = await supabaseAdmin().rpc('bolagio_begin_external_operation', {
    p_key: key,
    p_provider: provider,
    p_type: type,
    p_intent_id: intentId ?? null,
    p_request: request ?? null,
  });
  // A failure to RECORD the intent to call must abort the call. Making an
  // untracked external mutation is precisely the thing this module prevents.
  if (beginError) throw beginError;

  const started = Date.now();
  try {
    const result = await call();
    await completeOperation(key, 'succeeded', options.resourceIdOf?.(result));
    logger.info('external.operation', {
      provider,
      eventType: type,
      outcome: 'succeeded',
      durationMs: Date.now() - started,
    });
    return result;
  } catch (cause) {
    const definite = options.isDefiniteFailure?.(cause) === true;

    if (definite) {
      await completeOperation(key, 'failed', undefined, describe(cause));
      logger.warn('external.operation', {
        provider,
        eventType: type,
        outcome: 'failed',
        durationMs: Date.now() - started,
      });
      throw cause;
    }

    await completeOperation(key, 'outcome_unknown', undefined, describe(cause));
    // Deliberately `error`, not `warn`. An unresolved external mutation is an
    // operational incident, not a handled condition.
    logger.error('external.operation', cause, {
      provider,
      eventType: type,
      outcome: 'outcome_unknown',
      errorCode: 'PAYMENT_PROVIDER_UNCERTAIN',
      durationMs: Date.now() - started,
    });
    throw new UncertainOperationError(key, provider, type, cause);
  }
}

/** Error text for a database column. Never for a response, never for a guest. */
function describe(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`.slice(0, 480);
  return 'unknown';
}

/* ── Key builders ──────────────────────────────────────────────────────── */

export const operationKey = {
  beds24Hold: (intentId: string) => `beds24:create_hold:${intentId}`,
  beds24Finalize: (bookingId: string) => `beds24:finalize:${bookingId}`,
  beds24Release: (bookingId: string) => `beds24:release:${bookingId}`,
  /**
   * The quote hash is part of the key on purpose: a booking that was re-quoted
   * to a different total must get a NEW PayPal order, not silently reuse one
   * for the old amount.
   */
  paypalOrder: (intentId: string, quoteHash: string) => `paypal:create_order:${intentId}:${quoteHash}`,
  paypalCapture: (orderId: string) => `paypal:capture:${orderId}`,
  paypalRefund: (captureId: string) => `paypal:refund:${captureId}`,
} as const;
