/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE NEAREST FREE STAY — what to offer when the chosen dates are gone.
 *
 * Pure. Given one unit's nights (live from Beds24) and the stay the guest
 * wanted, find the closest windows of the SAME length that the calendar
 * would accept: every night free, arrival allowed on the first day,
 * departure allowed on the last, minimum and maximum stay respected.
 * Closest first, one step either side at a time, never in the past.
 *
 * These are suggestions, not promises: choosing one runs the live quote and
 * the hold exactly like any other choice — Beds24 stays the authority.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { InventoryDay, IsoDate } from '@/lib/booking/types';

export interface StayWindow {
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  /** Days moved from the wanted arrival: negative is earlier. */
  shiftDays: number;
}

export function addIsoDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsOf(checkIn: IsoDate, checkOut: IsoDate): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

/** Would the calendar accept arriving on `checkIn` for `nights` nights? */
export function windowIsFree(byDate: ReadonlyMap<IsoDate, InventoryDay>, checkIn: IsoDate, nights: number): boolean {
  if (nights < 1) return false;
  const arrival = byDate.get(checkIn);
  if (!arrival || !arrival.canCheckIn) return false;
  if (arrival.minStay && nights < arrival.minStay) return false;
  if (arrival.maxStay && nights > arrival.maxStay) return false;
  for (let i = 0; i < nights; i++) {
    const night = byDate.get(addIsoDays(checkIn, i));
    if (!night || !night.available) return false;
  }
  // The departure day needs no free night — only permission to leave. A day
  // outside the known window is not evidence against leaving.
  const departure = byDate.get(addIsoDays(checkIn, nights));
  if (departure && !departure.canCheckOut) return false;
  return true;
}

/**
 * The nearest windows of the same length, closest first (later before
 * earlier at equal distance), at most `limit`, within `maxShift` days.
 */
export function nearestFreeWindows(
  days: readonly InventoryDay[],
  wanted: { checkIn: IsoDate; checkOut: IsoDate },
  options: { today: IsoDate; maxShift?: number; limit?: number }
): StayWindow[] {
  const nights = nightsOf(wanted.checkIn, wanted.checkOut);
  if (nights < 1) return [];
  const byDate = new Map(days.map((d) => [d.date, d] as const));
  const maxShift = options.maxShift ?? 45;
  const limit = options.limit ?? 3;
  const out: StayWindow[] = [];
  for (let distance = 1; distance <= maxShift && out.length < limit; distance++) {
    for (const shift of [distance, -distance]) {
      if (out.length >= limit) break;
      const checkIn = addIsoDays(wanted.checkIn, shift);
      if (checkIn < options.today) continue;
      if (windowIsFree(byDate, checkIn, nights)) out.push({ checkIn, checkOut: addIsoDays(checkIn, nights), nights, shiftDays: shift });
    }
  }
  return out;
}
