/**
 * POST /api/booking/payment/order
 *
 *   { reference }  →  { orderId, approveUrl?, amountCents, currency }
 *
 * ── The entire input surface ─────────────────────────────────────────────
 * A BoLaGio reference. That is all.
 *
 * The amount, the currency, the dates, the unit and the guest are read from
 * the booking intent this server wrote from a live Beds24 offer. A body
 * carrying `amountCents` is not rejected — it is simply never read, because
 * there is no code path in this repository where a client-submitted amount
 * reaches a payment provider.
 *
 * ── Why an amount is returned ────────────────────────────────────────────
 * So the browser can RENDER it. The PayPal SDK is given an order id and
 * nothing else; the amount travels to PayPal inside the order the server
 * created, never through the browser.
 *
 * ── Double-click ─────────────────────────────────────────────────────────
 * Safe. `createPaymentOrder` reuses an existing payable order and, failing
 * that, creates with a deterministic PayPal-Request-Id — so two concurrent
 * presses of Pay produce one order at PayPal.
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
import { createPaymentOrder } from '@/lib/booking/payments';
import { BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  try {
    rateLimit(clientKey(request, 'payment-order'), 10, 60_000);
    requireBackend();

    const body = await readJson(request);
    const reference = body.reference;
    if (!isBookingReference(reference)) throw new BookingError('invalid_input');

    // PayPal only, deliberately. A provider chosen by the browser would be a
    // way to steer a guest at an adapter; when Stripe exists it will be chosen
    // here, server-side, from the booking and the unit.
    const order = await createPaymentOrder(reference, 'paypal', logger);

    return bookingJson(
      {
        orderId: order.orderId,
        approveUrl: order.approveUrl,
        amountCents: order.amountCents,
        currency: order.currency,
      },
      logger,
      201
    );
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
