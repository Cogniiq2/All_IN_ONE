/**
 * POST /api/booking/payment/capture
 *
 *   { reference }  →  { status, paymentStatus }
 *
 * ── What this is, and what it is not ─────────────────────────────────────
 * The browser calls this once PayPal's SDK reports that the guest approved.
 * The browser's report is a PROMPT, not evidence: this endpoint asks PayPal to
 * capture, PayPal decides, and the answer goes through exactly the same
 * validation as a webhook — provider, order, amount and currency checked
 * against the authoritative quote inside one database transaction.
 *
 * So a forged call to this endpoint achieves nothing. It can, at most, cause
 * the server to ask PayPal about a booking that has not been paid for, and
 * PayPal says no.
 *
 * ── Why it exists at all, given the webhook ──────────────────────────────
 * Latency. A guest watching a spinner should not wait on a webhook that may be
 * seconds or minutes behind. The webhook remains the authority of record and
 * the path that works when the guest closes the tab; this is the fast path,
 * and the two are idempotent against each other by construction.
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
import { capturePaymentOrder } from '@/lib/booking/payments';
import { BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  try {
    rateLimit(clientKey(request, 'payment-capture'), 10, 60_000);
    requireBackend();

    const body = await readJson(request);
    const reference = body.reference;
    if (!isBookingReference(reference)) throw new BookingError('invalid_input');

    const result = await capturePaymentOrder(reference, logger);
    // Status only. The browser renders what the SERVER says the booking is;
    // it never concludes anything from having arrived here.
    return bookingJson(result, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
