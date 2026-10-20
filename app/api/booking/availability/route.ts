/**
 * GET /api/booking/availability?unit=<slug>&from=<iso>&to=<iso>
 *
 * The calendar the browser paints. Read LIVE from Beds24 (one answer shared
 * for 15 seconds per isolate), falling back to the Supabase cache only when
 * Beds24 does not answer. The whole horizon arrives in one response, so
 * paging through months costs nothing.
 *
 * It is still not a guarantee — `/api/booking/quote` and the hold re-ask
 * Beds24 before anything is reserved. Nothing identifying is required to call it: availability is public
 * information, the same information Booking.com shows.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, clientKey, rateLimit, requireBackend } from '@/lib/booking/http';
import { getAvailability } from '@/lib/booking/service';
import { isIsoDate } from '@/lib/booking/stay-rules';
import { directBookingFor } from '@/lib/booking/tester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const logger = createLogger(request);
  try {
    // Generous: a guest paging a year of months is a normal, desirable session.
    rateLimit(clientKey(request, 'availability'), 120, 60_000);
    requireBackend();

    const params = request.nextUrl.searchParams;
    const unit = params.get('unit') ?? '';
    const from = params.get('from');
    const to = params.get('to');

    const calendar = await getAvailability(
      unit,
      {
        from: from && isIsoDate(from) ? from : undefined,
        to: to && isIsoDate(to) ? to : undefined,
      },
      logger
    );
    // The gate as it applies to THIS visitor (a staging tester or not).
    return bookingJson({ ...calendar, directBooking: await directBookingFor(request) }, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
