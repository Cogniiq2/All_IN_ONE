/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE REAL BEDS24 RESPONSE, frozen as a fixture.
 *
 * Every value below was observed in an actual Beds24 API V2 response on
 * 2026-09-17 (GitHub Actions run 35192013491, property 354659, the 30-day
 * window 2026-09-17 → 2026-10-17). It is not an approximation of what the
 * provider might send — it is what it sent.
 *
 * That makes this the most valuable test in the suite: the rest of the
 * provider tests assert that the mapper behaves correctly given a shape the
 * repository INVENTED, and were all passing while the integration still
 * believed in an endpoint that does not exist. This one can only pass if the
 * mapper understands reality.
 *
 * ── One honest caveat about the fixture ──────────────────────────────────
 * The run log printed these values through a string formatter, so it proves
 * what they read as, not their JSON type. They are written here as numbers
 * because `price1` printed as `324` rather than `"324.00"`, which a string
 * field almost certainly would not. The mapper accepts both forms and
 * `provider.test.ts` covers the string variants, so nothing depends on this
 * guess being right.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { mapCalendar, mapProperties } from '@/lib/integrations/beds24/mapper';
import type { Beds24CalendarResponse, Beds24PropertiesResponse } from '@/lib/integrations/beds24/types';

const FROM = '2026-09-17';
const TO = '2026-10-17';

/** The nine compressed runs Beds24 actually returned, verbatim. */
const LIVE_CALENDAR: Beds24CalendarResponse = {
  data: [
    {
      roomId: 731147,
      propertyId: 354659,
      calendar: [
        { from: '2026-09-17', to: '2026-09-17', numAvail: 0, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-09-18', to: '2026-09-25', numAvail: 1, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-09-26', to: '2026-09-26', numAvail: 0, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-09-27', to: '2026-09-30', numAvail: 1, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-10-01', to: '2026-10-03', numAvail: 0, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-10-04', to: '2026-10-07', numAvail: 1, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-10-08', to: '2026-10-09', numAvail: 0, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-10-10', to: '2026-10-14', numAvail: 1, minStay: 1, maxStay: 365, price1: 324 },
        { from: '2026-10-15', to: '2026-10-17', numAvail: 0, minStay: 1, maxStay: 365, price1: 324 },
      ],
    },
  ],
};

describe('the real Beds24 calendar response', () => {
  const days = mapCalendar(LIVE_CALENDAR, FROM, TO);
  const on = (date: string) => days.find((d) => d.date === date)!;

  it('expands nine compressed runs into exactly thirty nights', () => {
    // The window is half-open: the 17th of October is a departure boundary,
    // not a night, so it is not in the result even though a run covers it.
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe(FROM);
    expect(days[days.length - 1].date).toBe('2026-10-16');
  });

  it('reads 21 of the 30 nights as available, matching the raw numAvail', () => {
    // Counted by hand from the runs above: 8 + 4 + 4 + 5.
    expect(days.filter((d) => d.available)).toHaveLength(21);
  });

  it('places the availability on the right dates', () => {
    expect(on('2026-09-17').available).toBe(false); // first run, numAvail 0
    expect(on('2026-09-18').available).toBe(true);  // start of the free run
    expect(on('2026-09-25').available).toBe(true);  // its inclusive end
    expect(on('2026-09-26').available).toBe(false); // single blocked night
    expect(on('2026-09-27').available).toBe(true);
    expect(on('2026-10-16').available).toBe(false); // inside the last run
  });

  it('treats absent closedArrival / closedDeparture as "not closed"', () => {
    // The live response carried neither field. An absent flag must mean the
    // date is open, not closed — failing closed here would make every night
    // unbookable on a property that simply has not configured the restriction.
    for (const day of days) {
      expect(day.canCheckIn).toBe(day.available);
      expect(day.canCheckOut).toBe(true);
    }
  });

  it('converts the live nightly rate to integer cents', () => {
    expect(on('2026-09-18').displayPriceCents).toBe(32_400);
  });

  it('drops a minimum stay of one and keeps the real maximum', () => {
    // minStay 1 is the absence of a restriction, not a restriction, and
    // surfacing it would put "minimum stay 1 night" on a premium calendar.
    expect(on('2026-09-18').minStay).toBeUndefined();
    expect(on('2026-09-18').maxStay).toBe(365);
  });
});

/**
 * `GET /properties?includeAllRooms=true`.
 *
 * The rooms half of this shape has NOT been seen live yet — the run that
 * confirmed the calendar was still calling the non-existent
 * `GET /properties/rooms`, which returned HTTP 500. These cases therefore
 * pin down the behaviour the mapper must have under each plausible nesting,
 * so whichever one the next live run reveals is already handled.
 */
describe('properties and their nested rooms', () => {
  it('reads the property fields confirmed live', () => {
    const [property] = mapProperties({
      data: [{ id: 354659, name: 'designAparts - II - by MorenoPisano', currency: 'EUR' }],
    });
    expect(property.externalPropertyId).toBe('354659');
    expect(property.name).toBe('designAparts - II - by MorenoPisano');
    expect(property.currency).toBe('EUR');
    expect(property.rooms).toEqual([]);
  });

  it('reads rooms nested under roomTypes', () => {
    const [property] = mapProperties({
      data: [{ id: 1, name: 'P', roomTypes: [{ id: 731147, name: 'Apartment', maxPeople: 4 }] }],
    });
    expect(property.rooms).toEqual([
      { externalRoomId: '731147', name: 'Apartment', maxGuests: 4 },
    ]);
  });

  it('reads rooms nested under rooms, and ids echoed under the alternate key', () => {
    const [property] = mapProperties({
      data: [{ propertyId: '354659', name: 'P', rooms: [{ roomId: '731147', name: 'Apartment' }] }],
    });
    expect(property.externalPropertyId).toBe('354659');
    expect(property.rooms[0].externalRoomId).toBe('731147');
    expect(property.rooms[0].maxGuests).toBeUndefined();
  });

  it('never mistakes the room count for the occupancy', () => {
    // `qty` is how many of this room type exist. Reading it as occupancy
    // would offer a party of one the run of a two-unit room type.
    const [property] = mapProperties({
      data: [{ id: 1, name: 'P', roomTypes: [{ id: 2, name: 'R', qty: 2 }] }],
    });
    expect(property.rooms[0].maxGuests).toBeUndefined();
  });

  it('skips records with no readable id rather than inventing one', () => {
    const properties = mapProperties({
      data: [
        { name: 'no id at all' },
        { id: 1, name: 'P', roomTypes: [{ name: 'room with no id' }, { id: 9, name: 'fine' }] },
      ],
    } as Beds24PropertiesResponse);
    expect(properties).toHaveLength(1);
    expect(properties[0].rooms).toHaveLength(1);
    expect(properties[0].rooms[0].externalRoomId).toBe('9');
  });

  it('survives an empty or absent payload', () => {
    expect(mapProperties({})).toEqual([]);
    expect(mapProperties({ data: [] })).toEqual([]);
  });
});
