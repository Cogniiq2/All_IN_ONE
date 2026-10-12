/**
 * Date semantics and stay validation.
 *
 * These are the tests that stop a night being sold twice or a sellable night
 * being thrown away. The checkout-boundary cases in particular are the ones a
 * naive implementation gets wrong silently, and nobody notices until a guest
 * is turned away at the door.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  BEDROOM_PACKAGE_GUEST_LIMIT,
  bedroomPackageFits,
  calendarFromReservations,
  isBedroomPackage,
  isIsoDate,
  MAX_STAY_NIGHTS,
  nightsBetween,
  nightsOf,
  validateAgainstCalendar,
  validateStayShape,
} from '@/lib/booking/stay-rules';
import type { InventoryDay } from '@/lib/booking/types';

const TODAY = '2026-09-16';
const LIMITS = { maxGuests: 4 };

describe('hotel date semantics', () => {
  it('counts the nights of a stay, excluding the departure day', () => {
    // 16 Sep → 20 Sep occupies four nights. The 20th is not one of them.
    expect(nightsOf('2026-09-16', '2026-09-20')).toEqual([
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
    expect(nightsBetween('2026-09-16', '2026-09-20')).toBe(4);
  });

  it('treats a one-night stay as one night', () => {
    expect(nightsOf('2026-09-16', '2026-09-17')).toEqual(['2026-09-16']);
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(nightsBetween('2026-02-27', '2026-03-02')).toBe(3);
  });

  it('rejects dates that look valid but are not', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
    expect(isIsoDate('2026-01-01')).toBe(true);
  });
});

describe('calendar derivation', () => {
  it('leaves the departure day of a reservation sellable', () => {
    const days = calendarFromReservations('2026-09-16', '2026-09-23', [
      { checkIn: '2026-09-16', checkOut: '2026-09-20' },
    ]);
    const on = (date: string) => days.find((d) => d.date === date)!;

    // The nights of the stay are gone.
    expect(on('2026-09-19').available).toBe(false);
    // The departure day is NOT an occupied night, and is a valid new arrival.
    expect(on('2026-09-20').available).toBe(true);
    expect(on('2026-09-20').canCheckIn).toBe(true);
  });

  it('handles back-to-back reservations without losing the shared day', () => {
    const days = calendarFromReservations('2026-09-16', '2026-09-25', [
      { checkIn: '2026-09-16', checkOut: '2026-09-20' },
      { checkIn: '2026-09-20', checkOut: '2026-09-23' },
    ]);
    const on = (date: string) => days.find((d) => d.date === date)!;

    // The 20th is one stay's checkout and the next one's arrival, so its
    // night IS taken — by the second reservation.
    expect(on('2026-09-20').available).toBe(false);
    // The 23rd is the second departure: free again.
    expect(on('2026-09-23').available).toBe(true);
    expect(on('2026-09-23').canCheckIn).toBe(true);
  });

  it('lets a guest leave on a day they cannot sleep through', () => {
    const days = calendarFromReservations('2026-09-16', '2026-09-20', [
      { checkIn: '2026-09-17', checkOut: '2026-09-19' },
    ]);
    const on = (date: string) => days.find((d) => d.date === date)!;
    // The 17th is taken as a NIGHT — nobody else sleeps through it — but a
    // stay that began on the 16th still ends on it: that guest leaves in the
    // morning and the next arrives in the afternoon. Tying `canCheckOut` to
    // `available` would refuse every back-to-back stay in the portfolio.
    expect(on('2026-09-17').available).toBe(false);
    expect(on('2026-09-17').canCheckIn).toBe(false);
    expect(on('2026-09-17').canCheckOut).toBe(true);
    expect(on('2026-09-19').canCheckOut).toBe(true);
  });
});

describe('stay shape validation', () => {
  const stay = (over: Partial<Parameters<typeof validateStayShape>[0]> = {}) => ({
    checkIn: '2026-09-20',
    checkOut: '2026-09-23',
    adults: 2,
    children: 0,
    bedroomPackage: 'two_bedroom' as const,
    ...over,
  });

  it('accepts a valid range', () => {
    expect(validateStayShape(stay(), LIMITS, TODAY)).toBeNull();
  });

  it('rejects a zero-night range', () => {
    expect(validateStayShape(stay({ checkOut: '2026-09-20' }), LIMITS, TODAY)).toEqual({
      error: 'invalid_dates',
    });
  });

  it('rejects an inverted range rather than silently swapping it', () => {
    // Swapping would book something the guest did not ask for.
    expect(validateStayShape(stay({ checkIn: '2026-09-23', checkOut: '2026-09-20' }), LIMITS, TODAY))
      .toEqual({ error: 'invalid_dates' });
  });

  it('rejects a stay that starts in the past', () => {
    expect(validateStayShape(stay({ checkIn: '2026-09-15', checkOut: '2026-09-18' }), LIMITS, TODAY))
      .toEqual({ error: 'invalid_dates', meta: { past: true } });
  });

  it('accepts a stay starting today', () => {
    expect(validateStayShape(stay({ checkIn: TODAY, checkOut: '2026-09-18' }), LIMITS, TODAY)).toBeNull();
  });

  it('rejects a stay longer than the booking flow will quote', () => {
    const checkOut = addDays('2026-09-20', MAX_STAY_NIGHTS + 1);
    expect(validateStayShape(stay({ checkOut }), LIMITS, TODAY)).toEqual({
      error: 'invalid_dates',
      meta: { maxNights: MAX_STAY_NIGHTS },
    });
  });

  it('enforces the unit occupancy, counting children', () => {
    expect(validateStayShape(stay({ adults: 5 }), LIMITS, TODAY)).toEqual({
      error: 'occupancy',
      meta: { maxGuests: 4 },
    });
    expect(validateStayShape(stay({ adults: 3, children: 2 }), LIMITS, TODAY)).toEqual({
      error: 'occupancy',
      meta: { maxGuests: 4 },
    });
    // Occupancy is per unit, not global: a unit that sleeps six is not capped
    // at the fallback four by its own limit…
    expect(validateStayShape(stay({ adults: 4 }), { maxGuests: 6 }, TODAY)).toBeNull();
    // …but the bedroom package is a second, separate cap: 2 Bedrooms is for
    // one to four guests (see the bedroom package tests below).
    expect(validateStayShape(stay({ adults: 6 }), { maxGuests: 6 }, TODAY)).toEqual({
      error: 'occupancy',
      meta: { maxGuests: 4, bedroomPackage: 'two_bedroom' },
    });
  });

  it('enforces a unit minimum stay', () => {
    expect(validateStayShape(stay(), { maxGuests: 4, minNights: 5 }, TODAY)).toEqual({
      error: 'stay_rules',
      meta: { minNights: 5 },
    });
  });

  it('rejects a fractional or zero party size', () => {
    expect(validateStayShape(stay({ adults: 0 }), LIMITS, TODAY)).toEqual({ error: 'invalid_input' });
    expect(validateStayShape(stay({ adults: 1.5 }), LIMITS, TODAY)).toEqual({ error: 'invalid_input' });
  });
});

describe('bedroom packages', () => {
  const stay = (over: Partial<Parameters<typeof validateStayShape>[0]> = {}) => ({
    checkIn: '2026-09-20',
    checkOut: '2026-09-23',
    adults: 2,
    children: 0,
    bedroomPackage: 'one_bedroom' as const,
    ...over,
  });

  it('knows exactly the two packages', () => {
    expect(isBedroomPackage('one_bedroom')).toBe(true);
    expect(isBedroomPackage('two_bedroom')).toBe(true);
    expect(isBedroomPackage('three_bedroom')).toBe(false);
    expect(isBedroomPackage(undefined)).toBe(false);
    expect(isBedroomPackage(2)).toBe(false);
    expect(BEDROOM_PACKAGE_GUEST_LIMIT).toEqual({ one_bedroom: 2, two_bedroom: 4 });
  });

  it('accepts 1 Bedroom with one or two guests', () => {
    expect(validateStayShape(stay({ adults: 1 }), LIMITS, TODAY)).toBeNull();
    expect(validateStayShape(stay({ adults: 2 }), LIMITS, TODAY)).toBeNull();
    expect(bedroomPackageFits('one_bedroom', 2)).toBe(true);
  });

  it('refuses 1 Bedroom with three or four guests, children included', () => {
    for (const party of [{ adults: 3 }, { adults: 4 }, { adults: 1, children: 2 }]) {
      expect(validateStayShape(stay(party), LIMITS, TODAY)).toEqual({
        error: 'occupancy',
        meta: { maxGuests: 2, bedroomPackage: 'one_bedroom' },
      });
    }
    expect(bedroomPackageFits('one_bedroom', 3)).toBe(false);
  });

  it('accepts 2 Bedrooms with one to four guests', () => {
    for (const adults of [1, 2, 3, 4]) {
      expect(validateStayShape(stay({ adults, bedroomPackage: 'two_bedroom' }), LIMITS, TODAY)).toBeNull();
    }
  });

  it('keeps the unit occupancy as the outer limit', () => {
    expect(validateStayShape(stay({ adults: 4, bedroomPackage: 'two_bedroom' }), { maxGuests: 3 }, TODAY)).toEqual({
      error: 'occupancy',
      meta: { maxGuests: 3 },
    });
  });

  it('refuses a missing or unknown package instead of defaulting one', () => {
    const missing = { ...stay(), bedroomPackage: undefined } as unknown as Parameters<typeof validateStayShape>[0];
    const unknown = { ...stay(), bedroomPackage: 'penthouse' } as unknown as Parameters<typeof validateStayShape>[0];
    expect(validateStayShape(missing, LIMITS, TODAY)).toEqual({ error: 'invalid_input', meta: { field: 'bedroomPackage' } });
    expect(validateStayShape(unknown, LIMITS, TODAY)).toEqual({ error: 'invalid_input', meta: { field: 'bedroomPackage' } });
  });
});

describe('validation against the cached calendar', () => {
  const calendar = (): InventoryDay[] =>
    calendarFromReservations('2026-09-16', '2026-09-30', [
      { checkIn: '2026-09-20', checkOut: '2026-09-23' },
    ]);

  const stay = (checkIn: string, checkOut: string) => ({
    checkIn,
    checkOut,
    adults: 2,
    children: 0,
    bedroomPackage: 'two_bedroom' as const,
  });

  it('accepts a stay that ends where a reservation begins', () => {
    expect(validateAgainstCalendar(stay('2026-09-17', '2026-09-20'), calendar())).toBeNull();
  });

  it('accepts a stay that begins where a reservation ends', () => {
    expect(validateAgainstCalendar(stay('2026-09-23', '2026-09-26'), calendar())).toBeNull();
  });

  it('refuses a stay that sleeps through an occupied night', () => {
    expect(validateAgainstCalendar(stay('2026-09-19', '2026-09-24'), calendar())).toEqual({
      error: 'availability_conflict',
    });
  });

  it('refuses an arrival on an occupied night', () => {
    expect(validateAgainstCalendar(stay('2026-09-21', '2026-09-26'), calendar())).toEqual({
      error: 'availability_conflict',
    });
  });

  it('enforces a per-date minimum stay', () => {
    const days = calendarFromReservations('2026-09-16', '2026-09-30', [], { minStay: 3 });
    expect(validateAgainstCalendar(stay('2026-09-17', '2026-09-18'), days)).toEqual({
      error: 'stay_rules',
      meta: { minNights: 3 },
    });
    expect(validateAgainstCalendar(stay('2026-09-17', '2026-09-20'), days)).toBeNull();
  });

  it('does not treat an unsynced date as unavailable', () => {
    // Outside the horizon is "we cannot say", which is the provider's job to
    // answer — not a rejection the cache is entitled to make.
    expect(validateAgainstCalendar(stay('2027-06-01', '2027-06-04'), calendar())).toBeNull();
  });
});
