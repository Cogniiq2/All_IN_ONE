/**
 * ══════════════════════════════════════════════════════════════════════════
 * CALENDAR ARITHMETIC — pure, and shared by the server and the grid.
 *
 * Hotel date semantics throughout: a stay from `checkIn` to `checkOut`
 * occupies the NIGHTS `[checkIn, checkOut)`. The checkout date is not a night
 * and may be another stay's arrival. Everything here is in ISO `YYYY-MM-DD`
 * and never touches a timezone — a night is a calendar day at the property.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { IsoDate } from '@/lib/booking/types';
import { addDays, nightsBetween } from '@/lib/booking/stay-rules';

export { addDays, nightsBetween };

export interface DateWindow {
  /** Inclusive first day shown. */
  start: IsoDate;
  /** Exclusive end. */
  end: IsoDate;
  days: number;
}

export function windowOf(start: IsoDate, days: number): DateWindow {
  return { start, end: addDays(start, days), days };
}

/** Every date in a window, inclusive start, exclusive end. */
export function datesIn(window: DateWindow): IsoDate[] {
  const out: IsoDate[] = [];
  for (let i = 0; i < window.days; i += 1) out.push(addDays(window.start, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday, from the ISO date alone. */
export function weekdayOf(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const d = weekdayOf(date);
  return d === 0 || d === 6;
}

/** The Monday on or before `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const d = weekdayOf(date);
  const back = d === 0 ? 6 : d - 1;
  return addDays(date, -back);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** Days in the calendar month containing `date`. */
export function daysInMonth(date: IsoDate): number {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface Span {
  checkIn: IsoDate;
  checkOut: IsoDate;
}

/**
 * Where a stay sits inside a window, in day columns.
 *
 * `startCol` is the first occupied night's column; `endCol` is exclusive.
 * Both are clamped, and the flags say whether the real arrival or departure
 * lies outside the window — so the grid can draw a bar that visibly continues
 * past the edge rather than pretending the stay begins on the first day shown.
 */
export interface Placement {
  startCol: number;
  endCol: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

export function place(span: Span, window: DateWindow): Placement | null {
  if (span.checkOut <= window.start || span.checkIn >= window.end) return null;
  const startCol = Math.max(0, nightsBetween(window.start, span.checkIn));
  const endCol = Math.min(window.days, nightsBetween(window.start, span.checkOut));
  if (endCol <= startCol) return null;
  return {
    startCol,
    endCol,
    clippedStart: span.checkIn < window.start,
    clippedEnd: span.checkOut > window.end,
  };
}

export function nightsOverlapping(span: Span, window: DateWindow): number {
  const p = place(span, window);
  return p ? p.endCol - p.startCol : 0;
}

/**
 * Turn a set of individually closed nights into contiguous ranges, leaving out
 * nights already explained by a local reservation.
 *
 * Used to show what the channel manager's cached availability says is taken
 * beyond what BoLaGio itself holds — a Booking.com or Airbnb reservation, or a
 * closed night. The cache does not say WHICH, so neither does the interface.
 */
export function closedRanges(
  closedNights: readonly IsoDate[],
  coveredNights: ReadonlySet<IsoDate>
): Span[] {
  const sorted = Array.from(new Set(closedNights)).filter((d) => !coveredNights.has(d)).sort();
  const out: Span[] = [];
  for (const night of sorted) {
    const last = out[out.length - 1];
    if (last && last.checkOut === night) {
      last.checkOut = addDays(night, 1);
    } else {
      out.push({ checkIn: night, checkOut: addDays(night, 1) });
    }
  }
  return out;
}

/** The set of nights a list of stays covers. */
export function nightsCovered(spans: readonly Span[]): Set<IsoDate> {
  const out = new Set<IsoDate>();
  for (const s of spans) {
    let d = s.checkIn;
    while (d < s.checkOut) {
      out.add(d);
      d = addDays(d, 1);
    }
  }
  return out;
}

/**
 * Whether `date` is an arrival, a departure, in-house, or nothing for a stay.
 * In-house means the night beginning on `date` is occupied and it is not the
 * arrival.
 */
export type StayRelation = 'arrival' | 'departure' | 'in_house' | 'none';

export function relationOn(span: Span, date: IsoDate): StayRelation {
  if (date === span.checkIn) return 'arrival';
  if (date === span.checkOut) return 'departure';
  if (date > span.checkIn && date < span.checkOut) return 'in_house';
  return 'none';
}

/** Occupancy over a window: occupied nights / (units × nights). Null when there is nothing to divide by. */
export function occupancyRatio(
  spans: readonly Span[],
  window: DateWindow,
  unitCount: number
): number | null {
  const capacity = unitCount * window.days;
  if (capacity <= 0) return null;
  const occupied = spans.reduce((sum, s) => sum + nightsOverlapping(s, window), 0);
  return Math.min(1, occupied / capacity);
}
