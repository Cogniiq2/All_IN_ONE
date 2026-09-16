/**
 * POST /api/booking/quote
 *
 * The authoritative answer for a concrete stay: is it genuinely free, and what
 * does it genuinely cost. Live Beds24, every time — never cached, never
 * derived on the client.
 *
 *   { unitSlug, checkIn, checkOut, adults, children }
 *   → BookingQuote  (totalCents, components, expiresAt)
 *
 * The frontend does not compute a total anywhere. It renders this one.
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
import { BookingError, getQuote } from '@/lib/booking/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  try {
    // Tighter than the calendar: each one of these is a real provider call.
    rateLimit(clientKey(request, 'quote'), 30, 60_000);
    requireBackend();

    const body = await readJson(request);
    const quote = await getQuote(
      {
        unitSlug: str(body.unitSlug),
        checkIn: str(body.checkIn),
        checkOut: str(body.checkOut),
        adults: int(body.adults, 1),
        children: int(body.children, 0),
      },
      logger
    );
    return bookingJson(quote, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw new BookingError('invalid_input');
  return value;
}

function int(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new BookingError('invalid_input');
  return value;
}
