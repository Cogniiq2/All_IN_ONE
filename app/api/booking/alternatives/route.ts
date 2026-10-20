/**
 * POST /api/booking/alternatives
 *
 * When the chosen dates are no longer available: the nearest free stays of
 * the same length, read live from Beds24.
 *
 *   { unitSlug, checkIn, checkOut, adults, children }
 *   → { alternatives: [{ unitSlug, checkIn, checkOut, nights, shiftDays, sameUnit }], live }
 *
 * Suggestions only — nothing is held. Choosing one runs the normal live
 * quote and hold.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, clientKey, rateLimit, readJson, requireBackend } from '@/lib/booking/http';
import { BookingError, getAlternatives } from '@/lib/booking/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  try {
    // Each call reads Beds24 for up to every bookable unit: as tight as the quote.
    rateLimit(clientKey(request, 'alternatives'), 20, 60_000);
    requireBackend();
    const body = await readJson(request);
    const result = await getAlternatives(
      {
        unitSlug: str(body.unitSlug),
        checkIn: str(body.checkIn),
        checkOut: str(body.checkOut),
        adults: int(body.adults, 1),
        children: int(body.children, 0),
      },
      logger
    );
    return bookingJson(result, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}

function str(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40) throw new BookingError('invalid_input');
  return value;
}

function int(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 20) throw new BookingError('invalid_input');
  return value;
}
