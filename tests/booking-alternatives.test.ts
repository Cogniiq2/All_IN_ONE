import { describe, expect, it } from 'vitest';
import { addIsoDays, nearestFreeWindows, windowIsFree } from '@/lib/booking/alternatives';
import type { InventoryDay } from '@/lib/booking/types';

const TODAY = '2026-10-20';

/** 60 free days from 2026-11-01, with the given dates taken. */
function calendar(taken: string[] = [], patch: Record<string, Partial<InventoryDay>> = {}): InventoryDay[] {
  return Array.from({ length: 60 }, (_, i) => {
    const date = addIsoDays('2026-11-01', i);
    return { date, available: !taken.includes(date), canCheckIn: true, canCheckOut: true, ...patch[date] };
  });
}

describe('nearest free stay', () => {
  it('finds the closest windows of the same length, later first at equal distance', () => {
    // Wanted 10–13 Nov; 11 Nov is taken.
    const out = nearestFreeWindows(calendar(['2026-11-11']), { checkIn: '2026-11-10', checkOut: '2026-11-13' }, { today: TODAY });
    expect(out.map((w) => [w.checkIn, w.checkOut, w.shiftDays])).toEqual([
      ['2026-11-12', '2026-11-15', 2],
      // Leaving on the 11th is allowed even though that night is taken: back-to-back, as at the door.
      ['2026-11-08', '2026-11-11', -2],
      ['2026-11-13', '2026-11-16', 3],
    ]);
    expect(out.every((w) => w.nights === 3)).toBe(true);
  });

  it('never suggests the past', () => {
    const out = nearestFreeWindows(calendar(['2026-11-02']), { checkIn: '2026-11-02', checkOut: '2026-11-04' }, { today: '2026-11-01', limit: 5 });
    expect(out.every((w) => w.checkIn >= '2026-11-01')).toBe(true);
  });

  it('respects arrival and departure days and minimum stay', () => {
    const days = calendar([], { '2026-11-12': { canCheckIn: false }, '2026-11-16': { canCheckOut: false }, '2026-11-14': { minStay: 5 } });
    const byDate = new Map(days.map((d) => [d.date, d] as const));
    expect(windowIsFree(byDate, '2026-11-12', 3)).toBe(false); // no arrival
    expect(windowIsFree(byDate, '2026-11-13', 3)).toBe(false); // no departure on 16th
    expect(windowIsFree(byDate, '2026-11-14', 3)).toBe(false); // min 5 nights
    expect(windowIsFree(byDate, '2026-11-14', 5)).toBe(true);
  });

  it('returns nothing when nothing fits within the search range', () => {
    const allTaken = calendar(Array.from({ length: 60 }, (_, i) => addIsoDays('2026-11-01', i)));
    expect(nearestFreeWindows(allTaken, { checkIn: '2026-11-10', checkOut: '2026-11-12' }, { today: TODAY })).toEqual([]);
  });
});
