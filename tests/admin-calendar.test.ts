/**
 * Calendar arithmetic under hotel semantics: nights are half-open, a
 * departure day is the next arrival's, and clipping at a window edge is
 * reported rather than hidden.
 */

import { describe, expect, it } from 'vitest';
import {
  addMonths,
  closedRanges,
  datesIn,
  daysInMonth,
  isWeekend,
  nightsCovered,
  occupancyRatio,
  place,
  relationOn,
  startOfWeek,
  weekdayOf,
  windowOf,
} from '@/lib/admin/calendar';

describe('windows and dates', () => {
  it('enumerates a window with an exclusive end', () => {
    const w = windowOf('2026-09-28', 5);
    expect(w.end).toBe('2026-10-03');
    expect(datesIn(w)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('knows weekdays without a timezone', () => {
    expect(weekdayOf('2026-09-19')).toBe(6); // Saturday
    expect(isWeekend('2026-09-19')).toBe(true);
    expect(isWeekend('2026-09-21')).toBe(false);
    expect(startOfWeek('2026-09-19')).toBe('2026-09-14');
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14'); // Sunday belongs to the week before
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14');
  });

  it('walks months, including year ends and leap Februaries', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(daysInMonth('2028-02-10')).toBe(29);
    expect(daysInMonth('2026-02-10')).toBe(28);
  });
});

describe('placement', () => {
  const w = windowOf('2026-09-10', 10); // 10th … 19th

  it('places a stay inside the window on its nights', () => {
    expect(place({ checkIn: '2026-09-12', checkOut: '2026-09-15' }, w)).toEqual({ startCol: 2, endCol: 5, clippedStart: false, clippedEnd: false });
  });

  it('clips and reports clipping at both edges', () => {
    expect(place({ checkIn: '2026-09-05', checkOut: '2026-09-12' }, w)).toEqual({ startCol: 0, endCol: 2, clippedStart: true, clippedEnd: false });
    expect(place({ checkIn: '2026-09-18', checkOut: '2026-09-25' }, w)).toEqual({ startCol: 8, endCol: 10, clippedStart: false, clippedEnd: true });
    expect(place({ checkIn: '2026-09-01', checkOut: '2026-10-01' }, w)).toEqual({ startCol: 0, endCol: 10, clippedStart: true, clippedEnd: true });
  });

  it('excludes stays that only touch the window edge — a checkout is not a night', () => {
    expect(place({ checkIn: '2026-09-05', checkOut: '2026-09-10' }, w)).toBeNull();
    expect(place({ checkIn: '2026-09-20', checkOut: '2026-09-22' }, w)).toBeNull();
  });

  it('classifies arrival, departure and in-house by hotel semantics', () => {
    const stay = { checkIn: '2026-09-12', checkOut: '2026-09-15' };
    expect(relationOn(stay, '2026-09-12')).toBe('arrival');
    expect(relationOn(stay, '2026-09-13')).toBe('in_house');
    expect(relationOn(stay, '2026-09-15')).toBe('departure');
    expect(relationOn(stay, '2026-09-16')).toBe('none');
  });
});

describe('channel closures', () => {
  it('merges closed nights into ranges and drops nights a local stay explains', () => {
    const covered = nightsCovered([{ checkIn: '2026-09-12', checkOut: '2026-09-14' }]);
    expect(covered).toEqual(new Set(['2026-09-12', '2026-09-13']));
    const ranges = closedRanges(['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-20'], covered);
    expect(ranges).toEqual([
      { checkIn: '2026-09-11', checkOut: '2026-09-12' },
      { checkIn: '2026-09-14', checkOut: '2026-09-16' },
      { checkIn: '2026-09-20', checkOut: '2026-09-21' },
    ]);
  });

  it('tolerates duplicates and unsorted input', () => {
    expect(closedRanges(['2026-09-02', '2026-09-01', '2026-09-02'], new Set())).toEqual([{ checkIn: '2026-09-01', checkOut: '2026-09-03' }]);
  });
});

describe('occupancy', () => {
  it('divides occupied nights by unit-nights, clamped, and null without capacity', () => {
    const w = windowOf('2026-09-10', 7);
    expect(occupancyRatio([{ checkIn: '2026-09-10', checkOut: '2026-09-17' }], w, 2)).toBeCloseTo(0.5);
    expect(occupancyRatio([{ checkIn: '2026-09-01', checkOut: '2026-09-30' }], w, 1)).toBe(1);
    expect(occupancyRatio([], w, 0)).toBeNull();
  });
});
