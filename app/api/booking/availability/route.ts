/**
 * GET /api/booking/availability?unit=<slug>&from=<iso>&to=<iso>
 *
 * The calendar the browser paints. Served from the Supabase cache, so paging
 * through months is instant and generates no provider traffic at all.
 *
 * It is deliberately NOT authoritative and the client must not treat it as a
 * guarantee — `/api/booking/quote` re-asks Beds24 live before anything is
 * reserved. Nothing identifying is required to call it: availability is public
 * information, the same information Booking.com shows.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, clientKey, rateLimit, requireBackend } from '@/lib/booking/http';
import { getAvailability } from '@/lib/booking/service';
import { isIsoDate } from '@/lib/booking/stay-rules';

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
    return bookingJson(calendar, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
