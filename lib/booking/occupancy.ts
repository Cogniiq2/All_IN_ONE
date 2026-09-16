/**
 * How many people a unit sleeps.
 *
 * ── Why this is a function and not a constant ────────────────────────────
 * `MAX_GUESTS = 4` was honest while the portfolio was two identical
 * Schulstraße flats. It stops being honest the moment Opernstraße III sleeps
 * six, and a constant spread across a stepper, a quick-choice row, a party
 * field and a URL parser is four places to be wrong in at once. Occupancy is a
 * property of a unit, so it is read from the unit.
 *
 * ── Precedence, and why the fallback is low ──────────────────────────────
 *   1. the booking backend's `bolagio_units.max_guests`, which operations can
 *      change without a deploy and which the SERVER enforces;
 *   2. `maxGuests` in lib/content/apartments.ts, for a unit the backend does
 *      not yet know about;
 *   3. FALLBACK_MAX_GUESTS.
 *
 * Every unit's `maxGuests` is `undefined` today — the owners have not
 * confirmed occupancy, and this repository does not invent facts. So the
 * fallback governs, and it errs downward: offering fewer guests than a flat
 * sleeps costs an enquiry, offering more costs a guest sleeping on a sofa they
 * were promised a bed instead of.
 *
 * This is the client-side courtesy. The authority is `occupancyFor()` in
 * lib/booking/service.ts, which reads the same number from the database and
 * refuses the booking regardless of what the browser allowed.
 */

import type { Apartment, RentalUnit } from '@/lib/content/apartments';

export const MIN_GUESTS = 1;

/** Used only where a unit's own figure is unknown. Deliberately conservative. */
export const FALLBACK_MAX_GUESTS = 4;

/**
 * The largest party any unit in the portfolio takes.
 *
 * For the homepage panel, which is asked about a stay before an apartment has
 * been chosen and so cannot know a per-unit limit. The per-unit ceiling is
 * applied as soon as there is a unit.
 */
export function portfolioMaxGuests(units: Apartment[]): number {
  return units.reduce((max, unit) => Math.max(max, unit.maxGuests ?? 0), 0) || FALLBACK_MAX_GUESTS;
}

/** The ceiling for one unit. `backendMaxGuests` wins when the API supplied one. */
export function maxGuestsFor(
  unit: RentalUnit | null | undefined,
  backendMaxGuests?: number | null
): number {
  if (backendMaxGuests && backendMaxGuests > 0) return backendMaxGuests;
  const content = unit && 'maxGuests' in unit ? unit.maxGuests : undefined;
  return content && content > 0 ? content : FALLBACK_MAX_GUESTS;
}

/** Forces a number into a unit's bookable range. The only way guests are set. */
export function clampGuestsFor(value: number | undefined, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(MIN_GUESTS, Math.floor(value)));
}
