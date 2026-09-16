/**
 * POST /api/booking/callback
 *
 * The ONLY thing in this system that may declare a payment successful.
 *
 *   x-bolagio-signature: BOOKING_CALLBACK_SECRET
 *   { reference, outcome: "succeeded"|"failed"|"cancelled"|"expired",
 *     paymentSessionId? }
 *
 * ── Why a browser cannot do this ─────────────────────────────────────────
 * A guest returning to /booking/return proves that a browser navigated. It
 * does not prove a card cleared: the URL can be typed, shared, replayed or
 * reached by closing the provider's page early. So the return page only ever
 * READS the booking status, and the status only ever changes here, behind a
 * shared secret compared in constant time.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 * n8n retries. Payment providers redeliver. Every outcome passes through the
 * state machine, where a repeat of an already-applied outcome is a quiet
 * success and a late failure after a confirmation is refused — a guest who has
 * paid does not lose their stay to a retried webhook.
 *
 * The response is always the same shape and never explains itself. A caller
 * without the secret learns nothing, including whether the reference exists.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingCallbackSecret } from '@/lib/booking/config';
import { bookingErrorResponse, bookingJson, requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { isBookingReference } from '@/lib/booking/reference';
import { BookingError, settlePayment, type PaymentOutcome } from '@/lib/booking/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OUTCOMES: PaymentOutcome[] = ['succeeded', 'failed', 'cancelled', 'expired'];

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  if (!verifySharedSecret(request, bookingCallbackSecret())) {
    logger.warn('payment.callback', { outcome: 'unauthorised' });
    // 401 with no body. Never confirm or deny that a reference exists.
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();
    const body = (await request.json()) as Record<string, unknown>;

    const reference = body.reference;
    if (!isBookingReference(reference)) throw new BookingError('invalid_input');

    const outcome = body.outcome;
    if (typeof outcome !== 'string' || !OUTCOMES.includes(outcome as PaymentOutcome)) {
      throw new BookingError('invalid_input');
    }

    const view = await settlePayment(reference, outcome as PaymentOutcome, logger, {
      paymentSessionId:
        typeof body.paymentSessionId === 'string' ? body.paymentSessionId.slice(0, 200) : undefined,
    });

    logger.info('payment.callback', { reference, outcome, status: view.status });
    return bookingJson({ reference: view.reference, status: view.status }, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
