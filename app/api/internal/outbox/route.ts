/**
 * The n8n outbox endpoint.
 *
 *   POST /api/internal/outbox   { action: "claim" | "ack" | "fail", … }
 *
 * One route rather than three, because n8n's HTTP node is easier to configure
 * once with a body that varies than three times with paths that vary — and
 * because it means one signature verification to implement on that side.
 *
 * ── Authentication ───────────────────────────────────────────────────────
 * HMAC-SHA256 over `v1:<timestamp>:<raw body>`, with a replay window. Not a
 * bearer secret: this endpoint acknowledges events, and a replayable password
 * means a captured acknowledgement can be replayed to lose an event. The exact
 * algorithm, with a worked example, is in docs/n8n-booking-contract.md.
 *
 * ── What this endpoint cannot do ─────────────────────────────────────────
 * Change a booking. There is no action for it, and the database would refuse
 * one anyway — a status change is only accepted from inside
 * `bolagio_booking_transition()`, which nothing here calls.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, requireBackend } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { verifyN8nSignature } from '@/lib/n8n/signing';
import { acknowledgeEvent, claimEvents, failEvent } from '@/lib/n8n/internal-api';
import { observeIntegration } from '@/lib/booking/commands';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32_000;

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  // The raw bytes, because the signature covers what was SENT. Signing a
  // re-serialised object would make the signature depend on key ordering.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const verified = await verifyN8nSignature(request.headers, raw);
  if (!verified.ok) {
    logger.warn('n8n.request', { outcome: 'unauthorised', reason: verified.reason });
    // 401 with no body. A caller without the secret learns nothing — not the
    // reason, not whether an event exists, not whether the secret is set.
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new BookingError('invalid_input');
    }

    const worker = typeof body.worker === 'string' ? body.worker.slice(0, 100) : 'n8n';

    switch (body.action) {
      case 'claim': {
        const limit = typeof body.limit === 'number' ? Math.min(50, Math.max(1, body.limit)) : 20;
        const events = await claimEvents(worker, limit, logger);
        observeIntegration('n8n', 'last_claim', `${worker}: ${events.length}`);
        return bookingJson({ events }, logger);
      }
      case 'ack': {
        const id = requireId(body.eventId);
        const acknowledged = await acknowledgeEvent(id, worker, logger);
        if (acknowledged) observeIntegration('n8n', 'last_ack', worker);
        return bookingJson({ acknowledged }, logger);
      }
      case 'fail': {
        const id = requireId(body.eventId);
        const reason = typeof body.error === 'string' ? body.error : 'unspecified';
        const recorded = await failEvent(id, worker, reason, logger);
        if (recorded) observeIntegration('n8n', 'last_fail', `${worker}: ${reason.slice(0, 120)}`);
        return bookingJson({ recorded }, logger);
      }
      default:
        throw new BookingError('invalid_input');
    }
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}

function requireId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new BookingError('invalid_input');
  }
  return value;
}
