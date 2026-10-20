import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE STAGING TESTER GATE — live Beds24, but not for the public.
 *
 * Staging talks to the REAL Beds24 account. With direct booking on, a hold
 * there closes the nights on Booking.com and Airbnb, and a PayPal SANDBOX
 * capture — free for anyone with a developer account — would confirm it. A
 * staging URL that is merely unlisted is not a control. So, anywhere but
 * production, a live Beds24 write needs a signed tester cookie that only a
 * signed-in BoLaGio Control administrator can mint (System → Test bookings).
 *
 * Every other visitor keeps the live calendar and sends a booking request,
 * exactly as with the launch gate shut. Production is untouched: there the
 * launch gate alone decides. Against the local simulator (a non-Beds24 base
 * URL) the gate does not apply, so the integration suite runs as before.
 *
 * Fail closed: no usable `ADMIN_SESSION_SECRET` means no tester can exist.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { appEnvironment } from '@/lib/config/environment';
import { BEDS24_DEFAULT_BASE_URL, beds24Config, beds24Mode, directBookingPermitted } from '@/lib/booking/config';
import { signSession, verifySession, SESSION_TTL_SECONDS } from '@/lib/admin/session';
import { BookingError } from '@/lib/booking/service';
import type { BookingLogger } from '@/lib/booking/logger';

export const TESTER_COOKIE = 'bolagio_booking_tester';
const AUDIENCE = 'booking-tester';

interface CookieReader {
  cookies: { get(name: string): { value: string } | undefined };
}

/** True where a live Beds24 write must come from an approved tester: not production, and the real Beds24. */
export function testerGateApplies(): boolean {
  return appEnvironment() !== 'production' && beds24Mode() === 'live' && beds24Config().baseUrl === BEDS24_DEFAULT_BASE_URL;
}

export async function isBookingTester(request: CookieReader): Promise<boolean> {
  const verdict = await verifySession(request.cookies.get(TESTER_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET, new Date(), AUDIENCE);
  return verdict.ok;
}

/** The launch gate, for this visitor. */
export async function directBookingFor(request: CookieReader): Promise<boolean> {
  if (!directBookingPermitted().permitted) return false;
  if (!testerGateApplies()) return true;
  return isBookingTester(request);
}

export async function requireDirectBookingFor(request: CookieReader, logger: BookingLogger): Promise<void> {
  if (await directBookingFor(request)) return;
  if (directBookingPermitted().permitted) {
    logger.warn('config.validation', { errorCode: 'DIRECT_BOOKING_DISABLED', outcome: 'not_a_tester' });
  }
  throw new BookingError('booking_disabled');
}

/** A tester token for one administrator, valid for one admin session's length. */
export async function mintTesterToken(operator: { id: string; email: string }): Promise<string> {
  return signSession({ sub: operator.id, email: operator.email, audience: AUDIENCE }, process.env.ADMIN_SESSION_SECRET ?? '');
}

export function testerCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: SESSION_TTL_SECONDS };
}
