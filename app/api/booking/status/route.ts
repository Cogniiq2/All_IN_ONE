/**
 * GET /api/booking/status?ref=BLG-XXXXXX
 *
 * What the confirmation screen and the post-payment return page read. It only
 * ever REPORTS state; nothing here can change one.
 *
 * ── Why this is safe to expose on a reference alone ──────────────────────
 * The response carries no personal data at all — no name, no email, no phone,
 * no payment identifier. It is the stay and its status, which is what the
 * person holding the reference already knows. A reference is six characters
 * over a 30-symbol alphabet drawn from a CSPRNG (729 million combinations) and
 * this endpoint is rate limited, so enumeration is not a practical route to
 * anything, and what it would yield is not sensitive.
 *
 * ── The rule the confirmation screen depends on ──────────────────────────
 * `status` is whatever the database says, and the database only reaches
 * 'confirmed' through the authenticated callback. So a screen that renders
 * "reservation confirmed" on `status === 'confirmed'` cannot be tricked by a
 * guest re-visiting a URL.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, clientKey, rateLimit, requireBackend } from '@/lib/booking/http';
import { isBookingReference } from '@/lib/booking/reference';
import { findIntentByReference } from '@/lib/booking/repository';
import { BookingError, toView } from '@/lib/booking/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const logger = createLogger(request);
  try {
    rateLimit(clientKey(request, 'status'), 30, 60_000);
    requireBackend();

    const reference = request.nextUrl.searchParams.get('ref');
    if (!isBookingReference(reference)) throw new BookingError('invalid_input');

    const intent = await findIntentByReference(reference);
    // A reference that does not exist and one that does are the same answer
    // shape, so this cannot be used to test whether a reference is real.
    if (!intent) throw new BookingError('invalid_input');

    return bookingJson(toView(intent), logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
