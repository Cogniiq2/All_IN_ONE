/**
 * ══════════════════════════════════════════════════════════════════════════
 * OVERVIEW — pure derivations for the owner's first screen.
 *
 * Everything here is computed from calendar stays the queries already
 * classified: only stays that OCCUPY a unit are passed in (a cancelled or
 * merely requested reservation never reaches these functions), so a figure
 * can be read as "booked" without a second look. Nights are half-open: the
 * departure day is the next arrival's.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { CalendarReservationDto } from '@/lib/admin/dto';
import { occupancyRatio, relationOn, windowOf, nightsOverlapping, addDays } from '@/lib/admin/calendar';

export interface TonightSnapshot {
  /** Units with a stay covering tonight, or a guest arriving today. */
  occupiedUnits: number;
  /** Bookable units with nobody in them tonight. */
  vacantUnits: number;
  /** Units where one guest leaves and another arrives today. */
  sameDayTurnovers: number;
}

/** Where every bookable unit stands tonight. */
export function tonightSnapshot(unitSlugs: readonly string[], stays: readonly CalendarReservationDto[], today: string): TonightSnapshot {
  let occupied = 0;
  let sameDay = 0;
  for (const slug of unitSlugs) {
    const mine = stays.filter((s) => s.unitSlug === slug);
    const arriving = mine.some((s) => relationOn(s, today) === 'arrival');
    const departing = mine.some((s) => relationOn(s, today) === 'departure');
    const inHouse = mine.some((s) => relationOn(s, today) === 'in_house');
    if (arriving || inHouse) occupied += 1;
    if (arriving && departing) sameDay += 1;
  }
  return { occupiedUnits: occupied, vacantUnits: Math.max(0, unitSlugs.length - occupied), sameDayTurnovers: sameDay };
}

export interface WindowStats {
  days: number;
  /** Stays whose check-in falls inside the window (today inclusive). */
  arrivals: number;
  /** Nights booked inside the window, every unit. */
  nights: number;
  /** Booked nights over available unit nights; null without bookable units. */
  occupancy: number | null;
}

/** Arrivals, nights and occupancy for the next `days` nights from today. */
export function windowStats(stays: readonly CalendarReservationDto[], today: string, days: number, unitCount: number): WindowStats {
  const window = windowOf(today, days);
  const end = addDays(today, days);
  return {
    days,
    arrivals: stays.filter((s) => s.checkIn >= today && s.checkIn < end).length,
    nights: stays.reduce((n, s) => n + nightsOverlapping(s, window), 0),
    occupancy: unitCount > 0 ? occupancyRatio(stays, window, unitCount) : null,
  };
}

/** The next stays to arrive after today, soonest first, every channel. */
export function upcomingStays(stays: readonly CalendarReservationDto[], today: string, limit = 8): CalendarReservationDto[] {
  return stays
    .filter((s) => s.checkIn > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.unitSlug.localeCompare(b.unitSlug))
    .slice(0, limit);
}
