/**
 * ══════════════════════════════════════════════════════════════════════════
 * SHORT-TERM AVAILABILITY — the client-side seam.
 *
 * This module used to answer "there is no source" for the whole site. It no
 * longer answers that question at all, because the question is no longer
 * portfolio-wide: availability is a property of a RESIDENCE, and two units in
 * the same building can be in different states while one is onboarded to the
 * channel manager and the other is not.
 *
 *     UI  →  /api/booking/availability  →  Supabase cache  ←  Beds24
 *     UI  →  /api/booking/quote         →  Beds24, live
 *
 * `lib/booking/client.ts` is how the UI asks. What remains here is the small,
 * shared date and party-size arithmetic that several surfaces need, and which
 * has no business making a network call.
 *
 * Rules this file still exists to enforce:
 *   • no availability is ever invented, in any code path;
 *   • the UI never talks to Booking.com or Airbnb directly — the channel
 *     manager owns those connections;
 *   • this site is not the source of truth for a calendar, and must never
 *     grow a proprietary one.
 *
 * Long-term rental never passes through here. A tenancy is agreed in person
 * under a rental agreement; it has no availability calendar and no booking.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { PAYMENT_ENABLED } from '@/lib/content/brand';
import { clampGuestsFor, FALLBACK_MAX_GUESTS, MIN_GUESTS } from '@/lib/booking/occupancy';

export { MIN_GUESTS };

/**
 * The portfolio-wide ceiling, for surfaces asked about a stay before a
 * residence has been chosen — the homepage panel and the shared-URL parser.
 *
 * A per-residence limit replaces it the moment there is a residence; see
 * `maxGuestsFor` in lib/booking/occupancy.ts, and the server's own
 * `occupancyFor`, which is the one that actually decides.
 */
export const MAX_GUESTS = FALLBACK_MAX_GUESTS;

/** Forces any number into the portfolio-wide bookable range. */
export function clampGuests(value: number | undefined): number | undefined {
  return clampGuestsFor(value, MAX_GUESTS);
}

/** What a visitor selected in the availability panel. ISO `YYYY-MM-DD`. */
export interface StayQuery {
  arrival?: string;
  departure?: string;
  guests?: number;
}

/**
 * Whether a stay can be completed on the website end to end.
 *
 * Payment is the portfolio-wide half of the answer and lives in `brand.ts`.
 * The other half — whether THIS residence has live availability — is per unit
 * and comes back on the availability response as `unsourced`. Both are
 * required, and the booking dialog reads them together.
 */
export function canBookOnline(): boolean {
  return PAYMENT_ENABLED;
}

/** Normalises a `<input type="date">` value to `YYYY-MM-DD` or undefined. */
export function toIsoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** Today as `YYYY-MM-DD` in the visitor's own timezone, for date `min`s. */
export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** The night after `date`, used as the minimum departure. */
export function nextDayIso(date: string | undefined): string | undefined {
  const iso = toIsoDate(date);
  if (!iso) return undefined;
  const next = new Date(`${iso}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Nights between two ISO dates, or undefined when the range is incomplete. */
export function nightsBetween(arrival?: string, departure?: string): number | undefined {
  const from = toIsoDate(arrival);
  const to = toIsoDate(departure);
  if (!from || !to) return undefined;
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : undefined;
}
