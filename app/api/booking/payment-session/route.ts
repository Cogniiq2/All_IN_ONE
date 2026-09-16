/**
 * POST /api/booking/payment-session
 *
 *   { reference, paymentProvider }  →  { redirectUrl, expiresAt? }
 *
 * ── The entire input surface ─────────────────────────────────────────────
 * A BoLaGio reference and a choice of provider. That is all. The amount, the
 * currency, the dates, the unit and the guest are read from the booking intent
 * the server itself wrote from a live Beds24 offer.
 *
 * A body carrying `amountCents` is not rejected — it is simply never read.
 * There is no code path in this repository where a client-submitted amount can
 * reach a payment provider.
 *
 * The response does not echo the payment session id back to the browser
 * either. The browser needs somewhere to go; it does not need an identifier
 * that lets it impersonate a callback.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import {
  bookingErrorResponse,
  bookingJson,
  clientKey,
  rateLimit,
  readJson,
  requireBackend,
} from '@/lib/booking/http';
import { attachPaymentSession, beginPayment, BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';
import { createPaymentSession } from '@/lib/integrations/n8n/payment';
import { SITE_URL } from '@/lib/content/brand';
import type { PaymentProvider } from '@/lib/booking/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  try {
    rateLimit(clientKey(request, 'payment'), 10, 60_000);
    requireBackend();

    const body = await readJson(request);
    const reference = body.reference;
    if (!isBookingReference(reference)) throw new BookingError('invalid_input');

    const provider = body.paymentProvider;
    if (provider !== 'stripe' && provider !== 'paypal') throw new BookingError('invalid_input');

    const intent = await beginPayment(reference, provider as PaymentProvider, logger);

    const session = await createPaymentSession(
      intent,
      provider,
      {
        // Fixed, server-side. A return URL supplied by the caller would be an
        // open redirect with a payment provider in front of it.
        returnUrl: `${SITE_URL}/booking/return?ref=${reference}`,
        cancelUrl: `${SITE_URL}/booking/return?ref=${reference}&cancelled=1`,
      },
      logger
    );

    await attachPaymentSession(intent, session.paymentSessionId);

    return bookingJson({ redirectUrl: session.redirectUrl, expiresAt: session.expiresAt }, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
