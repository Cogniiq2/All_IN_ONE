import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * STRUCTURED LOGGING for the booking pipeline.
 *
 * One JSON line per event, on a Cloudflare Worker's stdout, where Workers
 * Logs and any log drain can parse it. No logging library is added: a
 * dependency that formats a JSON object is not worth a kilobyte in a worker
 * bundle.
 *
 * ── The rule about guest data ────────────────────────────────────────────
 * A booking log line may contain: a unit slug, dates, a night count, a party
 * size, an amount, a currency, a status, a BoLaGio reference, a provider
 * booking id, a correlation id and a duration.
 *
 * It may NOT contain: a name, an email address, a phone number, an IP
 * address, a full provider response, a token, or a request body. `scrub()`
 * below is the enforcement, not the intention — every field is allow-listed
 * by name, so a field added upstream cannot leak by being forgotten about.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type BookingLogEvent =
  /** An unhandled throw inside a route handler. Logged, never returned. */
  | 'route.error'
  | 'inventory.sync'
  /** The canonical reservation import. Counts, unit slugs and provider ids only. */
  | 'reservation.sync'
  /** The staging-only financial shape probe. Outcome and provider status only. */
  | 'reservation.financial_probe'
  | 'availability.read'
  | 'beds24.availability'
  | 'beds24.offer'
  | 'beds24.hold'
  | 'beds24.hold_release'
  | 'beds24.confirm'
  | 'intent.create'
  | 'intent.transition'
  | 'beds24.finalize'
  | 'beds24.verify'
  | 'beds24.search'
  | 'intent.lock'
  | 'external.operation'
  | 'payment.order'
  | 'payment.capture'
  | 'payment.callback'
  | 'payment.event'
  | 'payment.refund'
  | 'booking.cancel'
  | 'message.delivery'
  | 'integration.observe'
  | 'turnover.status'
  | 'turnover.assign'
  | 'delivery.requeue'
  | 'outbox.requeue'
  | 'reconcile.claim'
  | 'reconcile.resolve'
  | 'outbox.claim'
  | 'outbox.ack'
  | 'n8n.request'
  | 'webhook.paypal'
  | 'webhook.beds24'
  | 'operations.pass'
  /** The finance subledger ingestion that follows an operations pass. */
  | 'finance.ingest'
  | 'scheduler.heartbeat'
  | 'config.validation'
  | 'health.read';

/** Field names a booking log line is allowed to carry. Nothing else survives. */
const ALLOWED = new Set([
  'unitSlug', 'unitId', 'checkIn', 'checkOut', 'nights', 'adults', 'children',
  'guests', 'amountCents', 'currency', 'status', 'fromStatus', 'toStatus',
  'reference', 'providerBookingId', 'provider', 'mode', 'durationMs', 'count',
  'from', 'to', 'months', 'outcome', 'errorCode', 'httpStatus', 'eventType',
  'externalId', 'duplicate', 'paymentProvider', 'attempt',
  // Added by the hardening pass. Every one of these is an id, a code, a count
  // or a state — the allow list stays an allow list, and a guest's name still
  // has no way through it.
  'paymentStatus', 'paymentState', 'orderId', 'captureId', 'refundId',
  'operationKey', 'operationType', 'eventId', 'reason', 'severity', 'jobId',
  'claimed', 'queue', 'worker', 'verification', 'gate', 'stale', 'released',
  'expected', 'actual', 'verified', 'resolution',
]);

function scrub(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED.has(key)) continue;
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

export interface BookingLogger {
  /** The id that ties every line of one guest journey together. */
  readonly correlationId: string;
  info(event: BookingLogEvent, fields?: Record<string, unknown>): void;
  warn(event: BookingLogEvent, fields?: Record<string, unknown>): void;
  /**
   * `cause` is logged as a message and a name only. A provider error object
   * may carry a response body with a token in it, so it is never spread.
   */
  error(event: BookingLogEvent, cause?: unknown, fields?: Record<string, unknown>): void;
}

function emit(
  level: 'info' | 'warn' | 'error',
  correlationId: string,
  event: BookingLogEvent,
  fields: Record<string, unknown>,
  cause?: unknown
) {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope: 'booking',
    event,
    correlationId,
    ...scrub(fields),
  };
  if (cause !== undefined) {
    line.cause = cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown';
  }
  // eslint-disable-next-line no-console -- this is the log drain.
  console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](JSON.stringify(line));
}

/**
 * A logger for one request.
 *
 * The correlation id is taken from an inbound `x-correlation-id` where one is
 * present — so a call chain that starts in n8n keeps one id end to end — and
 * generated otherwise.
 */
export function createLogger(request?: Request): BookingLogger {
  const inbound = request?.headers.get('x-correlation-id');
  const correlationId =
    inbound && /^[A-Za-z0-9._-]{8,64}$/.test(inbound) ? inbound : crypto.randomUUID();

  return {
    correlationId,
    info: (event, fields = {}) => emit('info', correlationId, event, fields),
    warn: (event, fields = {}) => emit('warn', correlationId, event, fields),
    error: (event, cause, fields = {}) => emit('error', correlationId, event, fields, cause),
  };
}
