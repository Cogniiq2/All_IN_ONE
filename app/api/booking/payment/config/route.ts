/**
 * GET /api/booking/payment/config
 *
 *   → { provider: "paypal", clientId, currency, mode }
 *
 * What the PayPal JS SDK needs to load, and nothing else.
 *
 * ── Why a route rather than a NEXT_PUBLIC_ variable ──────────────────────
 * Three reasons, and the third is the important one.
 *
 *  1. The mode and the client id cannot drift apart between build time and
 *     run time, because they are read from the same `paypalConfig()` call.
 *  2. Changing PayPal credentials does not require a rebuild.
 *  3. A deployment with the launch gate off serves NO client id at all, so the
 *     SDK cannot be loaded and no payment UI can appear — even on a stale page
 *     someone left open. A NEXT_PUBLIC_ variable is baked into every bundle
 *     and cannot be withdrawn.
 *
 * The client id itself is genuinely public: it identifies the merchant and
 * authorises nothing. The SECRET is never read by this route or any route.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, clientKey, rateLimit } from '@/lib/booking/http';
import { directBookingPermitted, paypalConfig } from '@/lib/booking/config';
import { BookingError } from '@/lib/booking/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const logger = createLogger(request);
  try {
    rateLimit(clientKey(request, 'payment-config'), 60, 60_000);

    if (!directBookingPermitted().permitted) throw new BookingError('booking_disabled');

    const { mode, clientId } = paypalConfig();
    // Fail closed. An unset or unrecognised PAYPAL_MODE means no payment UI,
    // rather than a default that might be the wrong one.
    if (!mode || !clientId) throw new BookingError('payment_handoff_failed');

    return bookingJson({ provider: 'paypal' as const, clientId, currency: 'EUR', mode }, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
