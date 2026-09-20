/**
 * ══════════════════════════════════════════════════════════════════════════
 * TIME, IN BAYREUTH.
 *
 * The property keeps its calendar in Europe/Berlin, and the two clock changes
 * a year are where naive date code loses or invents a night. These pin the
 * arithmetic across both transitions and across the day boundary as seen
 * from very different guest time zones.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { addDays, nightsBetween, nightsOf, propertyToday, validateStayShape } from '@/lib/booking/stay-rules';
import { PROPERTY_TIMEZONE } from '@/lib/booking/property-config';

describe('the property clock', () => {
  it('is Europe/Berlin', () => {
    expect(PROPERTY_TIMEZONE).toBe('Europe/Berlin');
  });

  it('decides "today" by Bayreuth, not by UTC', () => {
    // 23:30 UTC on the 16th is already the 17th in Bayreuth (CEST, +02:00).
    expect(propertyToday(new Date('2026-07-16T23:30:00Z'))).toBe('2026-07-17');
    // 22:30 UTC in winter (CET, +01:00) is still the 16th.
    expect(propertyToday(new Date('2026-12-16T22:30:00Z'))).toBe('2026-12-16');
    expect(propertyToday(new Date('2026-12-16T23:30:00Z'))).toBe('2026-12-17');
  });

  it('accepts a check-in on the Bayreuth day even when UTC says yesterday', () => {
    // 00:30 Bayreuth on 17 July is 22:30 UTC on the 16th. The 17th is today.
    const today = propertyToday(new Date('2026-07-16T22:30:00Z'));
    expect(validateStayShape({ checkIn: '2026-07-17', checkOut: '2026-07-19', adults: 2, children: 0 }, { maxGuests: 4 }, today)).toBeNull();
    expect(validateStayShape({ checkIn: '2026-07-16', checkOut: '2026-07-19', adults: 2, children: 0 }, { maxGuests: 4 }, today)).toMatchObject({ error: 'invalid_dates' });
  });
});

describe('daylight-saving transitions', () => {
  it('counts the spring-forward night as one night', () => {
    // 29 March 2026: clocks go forward at 02:00 CET. A 23-hour night is one night.
    expect(nightsBetween('2026-03-28', '2026-03-29')).toBe(1);
    expect(nightsBetween('2026-03-27', '2026-03-31')).toBe(4);
    expect(nightsOf('2026-03-28', '2026-03-30')).toEqual(['2026-03-28', '2026-03-29']);
  });

  it('counts the fall-back night as one night', () => {
    // 25 October 2026: clocks go back at 03:00 CEST. A 25-hour night is one night.
    expect(nightsBetween('2026-10-24', '2026-10-25')).toBe(1);
    expect(nightsBetween('2026-10-23', '2026-10-27')).toBe(4);
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('never produces a fractional or duplicated day across a transition', () => {
    let d = '2026-03-27';
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) { seen.push(d); d = addDays(d, 1); }
    expect(seen).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
  });

  it('propertyToday is right on both transition days', () => {
    // 01:30 UTC on 29 March is 03:30 CEST (clocks just went forward): the 29th.
    expect(propertyToday(new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
    // 00:30 UTC on 25 October is 02:30 CEST (before fall-back): the 25th.
    expect(propertyToday(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25');
    // 23:30 UTC on 25 October is 00:30 CET on the 26th.
    expect(propertyToday(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-26');
  });
});

describe('year boundaries', () => {
  it('crosses the year on a stay and on "today"', () => {
    expect(nightsOf('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(propertyToday(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('handles leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(nightsBetween('2027-02-28', '2027-03-01')).toBe(1);
  });
});
