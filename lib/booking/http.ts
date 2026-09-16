import 'server-only';

/**
 * Shared plumbing for the booking route handlers.
 *
 * ── What leaves the server ───────────────────────────────────────────────
 * On success, the documented body. On failure, `{ error: <code> }` and
 * nothing else — never a Beds24 message, a Postgres error, a stack trace, an
 * n8n response or an internal id. `bookingErrorResponse` is the only way a
 * booking route reports a failure, which is what makes that guarantee hold
 * rather than being a convention someone forgets.
 */

import { NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking/service';
import type { BookingLogger } from '@/lib/booking/logger';
import type { BookingErrorCode } from '@/lib/booking/types';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { timingSafeEqual } from '@/lib/booking/reference';

/** Booking responses are per-guest and per-moment. Nothing may cache them. */
const NO_STORE = {
  'cache-control': 'no-store, max-age=0',
} as const;

export function bookingJson<T>(body: T, logger: BookingLogger, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, 'x-correlation-id': logger.correlationId },
  });
}

const STATUS_BY_CODE: Record<BookingErrorCode, number> = {
  availability_conflict: 409,
  stay_rules: 422,
  occupancy: 422,
  invalid_dates: 400,
  invalid_input: 400,
  quote_expired: 410,
  hold_expired: 410,
  provider_unavailable: 503,
  not_bookable: 404,
  payment_handoff_failed: 502,
  rate_limited: 429,
  unexpected: 500,
};

/**
 * Turn anything thrown inside a route into a safe response.
 *
 * An unrecognised throw becomes `unexpected` / 500 with no detail. The cause
 * is logged server-side with the correlation id, so it is still diagnosable —
 * just not from the outside.
 */
export function bookingErrorResponse(cause: unknown, logger: BookingLogger): NextResponse {
  if (cause instanceof BookingError) {
    return NextResponse.json(
      { error: cause.code, ...(cause.meta ? { meta: cause.meta } : {}) },
      { status: STATUS_BY_CODE[cause.code], headers: { ...NO_STORE, 'x-correlation-id': logger.correlationId } }
    );
  }
  logger.error('route.error', cause, { errorCode: 'unexpected' });
  return NextResponse.json(
    { error: 'unexpected' satisfies BookingErrorCode },
    { status: 500, headers: { ...NO_STORE, 'x-correlation-id': logger.correlationId } }
  );
}

/** Rejects a request body that is not JSON, without leaking the parse error. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BookingError('invalid_input');
    }
    return body as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof BookingError) throw cause;
    throw new BookingError('invalid_input');
  }
}

/**
 * Guard every booking route: without Supabase there is nowhere to write a
 * booking, and a flow that appears to work and persists nothing is worse than
 * one that says it is unavailable.
 */
export function requireBackend(): void {
  if (!isSupabaseConfigured()) throw new BookingError('provider_unavailable');
}

/**
 * A shared secret on an inbound machine-to-machine call.
 *
 * Compared in constant time, and a missing configured secret is a refusal
 * rather than an open door — an endpoint that accepts anything when its secret
 * is unset is how a staging misconfiguration becomes a production incident.
 */
export function verifySharedSecret(request: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const header =
    request.headers.get('x-bolagio-signature') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  return header !== '' && timingSafeEqual(header, expected);
}

/* ── Rate limiting ─────────────────────────────────────────────────────── */

/**
 * A best-effort fixed-window limiter, in isolate memory.
 *
 * ── Its honest limitation ────────────────────────────────────────────────
 * Cloudflare runs many isolates, so this bounds abuse per isolate rather than
 * globally. It is worth having — it stops a single client hammering one
 * isolate with quote requests, which is the realistic case — and it is NOT the
 * security boundary. The real guarantees are elsewhere and do not depend on
 * it: idempotency keys stop duplicate bookings, the database exclusion
 * constraint stops overlapping holds, and Cloudflare's own WAF rate limiting
 * should be configured in front of `/api/booking/*` for volumetric abuse.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic cleanup, so an isolate that lives for hours does not grow
    // a map entry per client forever.
    if (buckets.size > 5_000) {
      buckets.forEach((v, k) => { if (v.resetAt <= now) buckets.delete(k); });
    }
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) throw new BookingError('rate_limited');
}

/**
 * A coarse client key.
 *
 * `cf-connecting-ip` is set by Cloudflare and cannot be spoofed by the client
 * at the edge. It is used as an ephemeral in-memory bucket key only — never
 * logged, never stored, never written to the database.
 */
export function clientKey(request: Request, scope: string): string {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  return `${scope}:${ip}`;
}
