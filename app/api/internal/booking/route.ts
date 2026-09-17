/**
 * GET /api/internal/booking?ref=BLG-XXXXXX
 *
 * The guest details n8n needs to write a confirmation message or an invoice.
 *
 * ── Why this exists instead of putting the data in the event ─────────────
 * Outbox payloads carry references, never guest details. An event sits in a
 * queue table, travels through an n8n execution history, and is visible in
 * whatever logs that platform keeps — none of which is a good home for a
 * guest's name, email and phone number under the DSGVO.
 *
 * So the PII is fetched, once, per booking, on an authenticated request, by
 * the workflow that actually needs it. It is never at rest anywhere it does
 * not have to be.
 *
 * ── Authentication ───────────────────────────────────────────────────────
 * The same HMAC as the outbox endpoint. A GET has no body, so the canonical
 * string signs the empty string — see docs/n8n-booking-contract.md for the
 * worked example.
 *
 * Read-only. There is no PATCH, no PUT and no DELETE here, and no action this
 * route can take on a booking.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, requireBackend } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';
import { verifyN8nSignature } from '@/lib/n8n/signing';
import { bookingContext } from '@/lib/n8n/internal-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const logger = createLogger(request);

  // A GET has no body; the canonical string signs the empty string.
  const verified = await verifyN8nSignature(request.headers, '');
  if (!verified.ok) {
    logger.warn('n8n.request', { outcome: 'unauthorised', reason: verified.reason });
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();

    const reference = request.nextUrl.searchParams.get('ref');
    if (!isBookingReference(reference)) throw new BookingError('invalid_input');

    const context = await bookingContext(reference);
    // Same answer shape for a reference that does not exist, so this cannot be
    // used to test whether one is real.
    if (!context) throw new BookingError('invalid_input');

    logger.info('n8n.request', { reference, outcome: 'context' });
    return bookingJson(context, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
