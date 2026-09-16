/**
 * POST /api/booking/intent
 *
 * Creates the BoLaGio booking intent and blocks the inventory at Beds24,
 * BEFORE any money moves. Returns the guest-facing reference and the
 * authoritative quote.
 *
 *   { unitSlug, checkIn, checkOut, adults, children, guest{…}, attemptId? }
 *   → { intent: BookingIntentView, quote: BookingQuote }
 *
 * ── What it will not accept ──────────────────────────────────────────────
 * An amount. A currency. An availability claim. A booking status. Those are
 * server facts; a body that contains them is simply ignored, and the server
 * reads the unit, the occupancy limit, the live availability and the price for
 * itself.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 * The key is derived from the unit, the dates, the party and the guest's email
 * and enforced by a unique index. Double-clicking, retrying and refreshing all
 * land on the same intent and the same Beds24 hold.
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
import { BookingError, startBooking } from '@/lib/booking/service';
import type { GuestDetails } from '@/lib/booking/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  try {
    // The narrowest limit in the booking API: each call may create a
    // reservation at the channel manager.
    rateLimit(clientKey(request, 'intent'), 10, 60_000);
    requireBackend();

    const body = await readJson(request);
    const result = await startBooking(
      {
        unitSlug: str(body.unitSlug),
        checkIn: str(body.checkIn),
        checkOut: str(body.checkOut),
        adults: int(body.adults, 1),
        children: int(body.children, 0),
        guest: guest(body.guest),
        attemptId: typeof body.attemptId === 'string' ? body.attemptId.slice(0, 64) : undefined,
      },
      logger
    );
    return bookingJson(result, logger, 201);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}

/**
 * Exactly the fields a booking needs.
 *
 * Nothing identity-document shaped is accepted here, deliberately: passport
 * and ID details belong to the German guest-registration obligation
 * (Meldeschein), which is a separate flow with its own retention rules, not
 * something to collect while someone is trying to pay.
 */
function guest(value: unknown): GuestDetails {
  if (typeof value !== 'object' || value === null) throw new BookingError('invalid_input');
  const g = value as Record<string, unknown>;

  const firstName = str(g.firstName).trim();
  const lastName = str(g.lastName).trim();
  const email = str(g.email).trim();
  const phone = str(g.phone).trim();

  if (firstName.length < 1 || lastName.length < 1) throw new BookingError('invalid_input');
  if (!EMAIL.test(email) || email.length > 254) throw new BookingError('invalid_input');
  if (phone.length < 5 || phone.length > 40) throw new BookingError('invalid_input');

  const country = typeof g.country === 'string' && /^[A-Za-z]{2}$/.test(g.country) ? g.country : undefined;

  return {
    firstName,
    lastName,
    email,
    phone,
    country,
    locale: g.locale === 'en' ? 'en' : 'de',
  };
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
