/**
 * ══════════════════════════════════════════════════════════════════════════
 * OVERVIEW — the owner's first-screen figures, pure.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { tonightSnapshot, upcomingStays, windowStats } from '@/lib/admin/overview';
import { reservationQueryOf, parseReservationFilter } from '@/lib/admin/reservation-filters';
import type { CalendarReservationDto } from '@/lib/admin/dto';

const TODAY = '2026-10-14';

function stay(over: Partial<CalendarReservationDto> = {}): CalendarReservationDto {
  return {
    reference: '1', kind: 'reservation', href: null, unitSlug: 'schulstrasse-i', checkIn: '2026-10-14', checkOut: '2026-10-16', nights: 2,
    status: 'active', paymentStatus: 'not_applicable', source: 'booking_com', guestLabel: 'G', adults: 2, children: 0, occupies: true,
    ...over,
  };
}

const UNITS = ['schulstrasse-i', 'schulstrasse-ii'];

describe('tonightSnapshot', () => {
  it('counts an apartment occupied when a guest is in house or arrives today, vacant otherwise', () => {
    const s = tonightSnapshot(UNITS, [stay({ checkIn: '2026-10-12', checkOut: '2026-10-15' })], TODAY);
    expect(s).toEqual({ occupiedUnits: 1, vacantUnits: 1, sameDayTurnovers: 0 });
    expect(tonightSnapshot(UNITS, [stay({ checkIn: TODAY })], TODAY).occupiedUnits).toBe(1);
  });
  it('a departure today without an arrival leaves the apartment vacant tonight', () => {
    const s = tonightSnapshot(UNITS, [stay({ checkIn: '2026-10-12', checkOut: TODAY })], TODAY);
    expect(s).toEqual({ occupiedUnits: 0, vacantUnits: 2, sameDayTurnovers: 0 });
  });
  it('a same-day turnover is one guest out and another in, in the same apartment', () => {
    const s = tonightSnapshot(UNITS, [stay({ reference: 'a', checkIn: '2026-10-12', checkOut: TODAY }), stay({ reference: 'b', checkIn: TODAY, checkOut: '2026-10-17' })], TODAY);
    expect(s).toEqual({ occupiedUnits: 1, vacantUnits: 1, sameDayTurnovers: 1 });
    const other = tonightSnapshot(UNITS, [stay({ reference: 'a', checkIn: '2026-10-12', checkOut: TODAY }), stay({ reference: 'b', unitSlug: 'schulstrasse-ii', checkIn: TODAY })], TODAY);
    expect(other.sameDayTurnovers).toBe(0);
  });
  it('never counts a unit twice or below zero', () => {
    const s = tonightSnapshot(UNITS, [stay({ reference: 'a', checkIn: '2026-10-12', checkOut: '2026-10-20' }), stay({ reference: 'b', checkIn: TODAY, checkOut: '2026-10-15' })], TODAY);
    expect(s.occupiedUnits).toBe(1);
    expect(s.vacantUnits).toBe(1);
  });
});

describe('windowStats', () => {
  const stays = [
    stay({ reference: 'a', checkIn: '2026-10-14', checkOut: '2026-10-17' }), // 3 nights, arrives in window
    stay({ reference: 'b', unitSlug: 'schulstrasse-ii', checkIn: '2026-10-19', checkOut: '2026-10-23' }), // 2 nights in the 7-day window
    stay({ reference: 'c', checkIn: '2026-10-25', checkOut: '2026-10-27' }), // outside 7 days, inside 30
  ];
  it('counts arrivals and nights inside the window, half-open', () => {
    const w = windowStats(stays, TODAY, 7, 2);
    expect(w.arrivals).toBe(2);
    expect(w.nights).toBe(5);
    expect(w.occupancy).toBeCloseTo(5 / 14, 5);
  });
  it('a longer window takes in more', () => {
    const w = windowStats(stays, TODAY, 30, 2);
    expect(w.arrivals).toBe(3);
    expect(w.nights).toBe(9);
  });
  it('has no occupancy without bookable units', () => {
    expect(windowStats(stays, TODAY, 7, 0).occupancy).toBeNull();
  });
});

describe('upcomingStays', () => {
  it('is after today, soonest first, capped', () => {
    const list = upcomingStays([stay({ reference: 'today', checkIn: TODAY }), stay({ reference: 'later', checkIn: '2026-10-20' }), stay({ reference: 'soon', checkIn: '2026-10-15' })], TODAY, 1);
    expect(list.map((s) => s.reference)).toEqual(['soon']);
  });
});

describe('reservation time segments', () => {
  const parse = (when: string) => reservationQueryOf(parseReservationFilter({ when }), TODAY, null);
  it('upcoming and in-house mean booked stays only; cancelled is the cancelled history', () => {
    expect(parse('upcoming')).toMatchObject({ statusClasses: ['active'], checkOutFrom: TODAY });
    expect(parse('current')).toMatchObject({ statusClasses: ['active'], checkInTo: '2026-10-15', checkOutFrom: '2026-10-15' });
    expect(parse('cancelled')).toMatchObject({ statusClasses: ['cancelled'], dir: 'desc' });
    expect(parse('past')).toMatchObject({ statusClasses: null, checkOutTo: TODAY });
    expect(parse('all').statusClasses).toBeNull();
  });
  it('an explicit status wins over the implied one', () => {
    expect(reservationQueryOf(parseReservationFilter({ when: 'upcoming', status: 'cancelled' }), TODAY, null).statusClasses).toEqual(['cancelled']);
  });
  it('an unknown segment falls back to upcoming', () => {
    expect(parseReservationFilter({ when: 'bogus' }).when).toBe('upcoming');
  });
});
