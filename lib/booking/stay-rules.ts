/**
 * ══════════════════════════════════════════════════════════════════════════
 * STAY RULES — the pure, testable core of the booking flow.
 *
 * Every rule that decides whether a set of dates and a party size is a stay
 * lives here, as functions with no I/O, no provider and no React. Both the
 * browser and the route handlers import it, which is the point: the client
 * uses it to keep the UI honest, and the server uses it to enforce, so the two
 * can never disagree about what "three nights" means.
 *
 * The server never TRUSTS the client's use of it. Validation is re-run on
 * every request.
 *
 * ── Hotel date semantics, once, here ─────────────────────────────────────
 * A stay is the half-open range [checkIn, checkOut). A reservation from the
 * 16th to the 20th occupies the nights of the 16th, 17th, 18th and 19th, and
 * the 20th is free to be someone else's arrival. Getting this wrong loses one
 * sellable night on every back-to-back stay, silently.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BookingErrorBody, InventoryDay, IsoDate } from '@/lib/booking/types';

/** Longest stay the booking flow will quote. Beyond this is a tenancy. */
export const MAX_STAY_NIGHTS = 90;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  // Rejects 2026-02-30 and friends, which the regex happily accepts.
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** `date` shifted by whole days, as ISO. Pure UTC arithmetic — no timezone. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Nights in [checkIn, checkOut). Zero or negative when the range is not a stay. */
export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * The nights a stay occupies: check-in through the night before checkout.
 *
 * `nightsOf('2026-09-16', '2026-09-20')` is `['2026-09-16','2026-09-17',
 * '2026-09-18','2026-09-19']`. The 20th is not in it, and that is the whole
 * point of this function existing rather than a loop being written inline in
 * four places.
 */
export function nightsOf(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
  const nights: IsoDate[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nights.push(d);
  return nights;
}

/**
 * Today in Europe/Berlin, as ISO.
 *
 * The property is in Bayreuth, so "in the past" is decided by the property's
 * own calendar day, not by the guest's device — a guest in Auckland must not
 * be refused tonight because it is already tomorrow where they are, and a
 * guest in Los Angeles must not be offered a night that has already begun in
 * Bavaria.
 */
export function propertyToday(now: Date = new Date()): IsoDate {
  // `en-CA` formats as YYYY-MM-DD, which is what we want out of Intl here.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export interface StayRequest {
  checkIn: IsoDate;
  checkOut: IsoDate;
  adults: number;
  children: number;
}

export interface StayLimits {
  maxGuests: number;
  minNights?: number;
}

/**
 * Is this a stay at all?
 *
 * Shape and calendar only — nothing here knows about availability. Returns the
 * first reason it is not, or `null` when it is.
 */
export function validateStayShape(
  request: StayRequest,
  limits: StayLimits,
  today: IsoDate = propertyToday()
): BookingErrorBody | null {
  const { checkIn, checkOut, adults, children } = request;

  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return { error: 'invalid_dates' };

  const nights = nightsBetween(checkIn, checkOut);
  // Zero nights is not a stay, and a checkout before an arrival is not a stay
  // read backwards — it is invalid input, and quietly swapping the two would
  // book something the guest did not ask for.
  if (nights < 1) return { error: 'invalid_dates' };
  if (nights > MAX_STAY_NIGHTS) {
    return { error: 'invalid_dates', meta: { maxNights: MAX_STAY_NIGHTS } };
  }
  // The check-in day itself is still bookable until it is over; the day before
  // is not.
  if (checkIn < today) return { error: 'invalid_dates', meta: { past: true } };

  if (!Number.isInteger(adults) || adults < 1) return { error: 'invalid_input' };
  if (!Number.isInteger(children) || children < 0) return { error: 'invalid_input' };

  const party = adults + children;
  if (party > limits.maxGuests) {
    return { error: 'occupancy', meta: { maxGuests: limits.maxGuests } };
  }

  if (limits.minNights && nights < limits.minNights) {
    return { error: 'stay_rules', meta: { minNights: limits.minNights } };
  }

  return null;
}

/**
 * Does the cached calendar allow this stay?
 *
 * A fast, local pre-check so a guest is not sent all the way to a live
 * provider call to be told the obvious. It is NOT the authority: the cache can
 * be stale, and `lib/booking/service.ts` re-asks Beds24 before anything is
 * reserved. A `null` here means "nothing in the cache objects", not "these
 * dates are yours".
 */
export function validateAgainstCalendar(
  request: StayRequest,
  days: InventoryDay[]
): BookingErrorBody | null {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const nights = nightsOf(request.checkIn, request.checkOut);

  const arrival = byDate.get(request.checkIn);
  // An unknown date is one outside the synced horizon. It is not "free" — the
  // answer is that we cannot say, which is a provider matter, not a rejection.
  if (!arrival) return null;
  if (!arrival.canCheckIn) return { error: 'availability_conflict' };

  for (const night of nights) {
    const day = byDate.get(night);
    if (!day) continue;
    if (!day.available) return { error: 'availability_conflict' };
  }

  // The checkout date is a boundary, not a night. It only has to be a date the
  // provider permits departures on.
  const departure = byDate.get(request.checkOut);
  if (departure && !departure.canCheckOut) return { error: 'availability_conflict' };

  const minStay = arrival.minStay;
  if (minStay && nights.length < minStay) {
    return { error: 'stay_rules', meta: { minNights: minStay } };
  }
  const maxStay = arrival.maxStay;
  if (maxStay && nights.length > maxStay) {
    return { error: 'stay_rules', meta: { maxNights: maxStay } };
  }

  return null;
}

/**
 * Turn a set of reservations into a day-by-day calendar.
 *
 * Used by the mock provider and by the Beds24 mapper, so both produce exactly
 * the same shape and the checkout-boundary rule is written once.
 *
 * A date is:
 *   not available  when a reservation covers that NIGHT;
 *   check-in-able  when its night is free;
 *   check-out-able always, unless the provider explicitly closes departures.
 *
 * That last one is the rule people get wrong. Checking out on a date and
 * sleeping through it are different things: a guest leaves on the morning of
 * the 20th and the next guest arrives on the afternoon of the 20th. The 20th
 * is an occupied NIGHT and a perfectly legal DEPARTURE at the same time. Tying
 * `canCheckOut` to `available` would refuse every back-to-back stay in the
 * portfolio.
 */
export function calendarFromReservations(
  from: IsoDate,
  to: IsoDate,
  reservations: Array<{ checkIn: IsoDate; checkOut: IsoDate }>,
  defaults: { minStay?: number; displayPriceCents?: number } = {}
): InventoryDay[] {
  const occupied = new Set<IsoDate>();
  for (const r of reservations) {
    for (const night of nightsOf(r.checkIn, r.checkOut)) occupied.add(night);
  }

  const days: InventoryDay[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    const free = !occupied.has(d);
    days.push({
      date: d,
      available: free,
      canCheckIn: free,
      canCheckOut: true,
      minStay: defaults.minStay,
      displayPriceCents: defaults.displayPriceCents,
    });
  }
  return days;
}
