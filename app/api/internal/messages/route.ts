/**
 * POST /api/internal/messages
 *
 *   { action: "prepare",  kind, reference, eventId?, sequence? }
 *   { action: "complete", deliveryId, outcome, provider, providerMessageId?, error?, retryable? }
 *
 * The automation platform's side of guest messaging. `prepare` returns a
 * rendered message and a claimed delivery slot (or the reason nothing should
 * be sent); `complete` records what the transport did. The exactly-once
 * ledger behind it is `bolagio_message_deliveries`.
 *
 * ── Authentication ───────────────────────────────────────────────────────
 * The same HMAC as the outbox endpoint. A prepared message carries a guest's
 * name and email, which is exactly why it is only ever returned on a signed
 * request and never sits in a queue.
 *
 * ── What this endpoint cannot do ─────────────────────────────────────────
 * Send anything, change a booking, or make the ledger say "sent" without a
 * transport saying so — and a test transport is refused on production.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, requireBackend } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';
import { verifyN8nSignature } from '@/lib/n8n/signing';
import { completeGuestMessage, prepareGuestMessage } from '@/lib/messaging/deliveries';
import { isMessageKind } from '@/lib/messaging/templates';
import { observeIntegration } from '@/lib/booking/commands';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32_000;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const verified = await verifyN8nSignature(request.headers, raw);
  if (!verified.ok) {
    logger.warn('n8n.request', { outcome: 'unauthorised', reason: verified.reason });
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

    switch (body.action) {
      case 'prepare': {
        if (!isMessageKind(body.kind) || !isBookingReference(body.reference)) throw new BookingError('invalid_input');
        const eventId = typeof body.eventId === 'string' && UUID.test(body.eventId) ? body.eventId : null;
        const sequence = typeof body.sequence === 'number' && Number.isInteger(body.sequence) && body.sequence >= 1 && body.sequence <= 20 ? body.sequence : 1;
        const result = await prepareGuestMessage({ kind: body.kind, reference: body.reference, outboxEventId: eventId, sequence }, logger);
        observeIntegration('n8n', 'last_message_prepare', `${body.kind}: ${result.outcome}`);
        return bookingJson(result, logger);
      }
      case 'complete': {
        if (typeof body.deliveryId !== 'string' || !UUID.test(body.deliveryId)) throw new BookingError('invalid_input');
        if (body.outcome !== 'sent' && body.outcome !== 'failed' && body.outcome !== 'skipped') throw new BookingError('invalid_input');
        if (typeof body.provider !== 'string' || body.provider.trim() === '') throw new BookingError('invalid_input');
        const result = await completeGuestMessage(
          {
            deliveryId: body.deliveryId,
            outcome: body.outcome,
            provider: body.provider,
            providerMessageId: typeof body.providerMessageId === 'string' ? body.providerMessageId.slice(0, 200) : undefined,
            error: typeof body.error === 'string' ? body.error.slice(0, 400) : undefined,
            retryable: typeof body.retryable === 'boolean' ? body.retryable : undefined,
          },
          logger
        );
        observeIntegration('n8n', 'last_message_complete', `${body.outcome}: ${result.refused ?? 'recorded'}`);
        return bookingJson(result, logger);
      }
      default:
        throw new BookingError('invalid_input');
    }
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
