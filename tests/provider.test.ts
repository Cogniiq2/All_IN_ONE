/**
 * The provider boundary: reading Beds24's answers, and the mock fixtures.
 *
 * The mapper tests are the ones that matter for money and for overbooking —
 * a price read as a float, a gap in a provider response treated as "free", an
 * empty offers list flattened into "no nights available". Each of those is a
 * production incident with a different shape, and each is a test here.
 */

import { describe, expect, it } from 'vitest';
import { mapCalendar, mapOffer, toCents } from '@/lib/integrations/beds24/mapper';
import { ProviderError } from '@/lib/integrations/provider';
import { beds24MockProvider } from '@/lib/integrations/beds24/mock';
import { maxGuestsFor, clampGuestsFor, FALLBACK_MAX_GUESTS } from '@/lib/booking/occupancy';
import type { Apartment } from '@/lib/content/apartments';
import { propertyToday } from '@/lib/booking/stay-rules';

/** The fixture month `offset` months from the property's current month. */
function fixtureMonth(offset: number): string {
  const [y, m] = propertyToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}

const UNIT = { provider: 'beds24' as const, externalPropertyId: '1001', externalRoomId: '2002' };

describe('money conversion', () => {
  it('converts major units to integer cents without floating point drift', () => {
    expect(toCents(83.33)).toBe(8333);
    expect(toCents('83.33')).toBe(8333);
    expect(toCents(140)).toBe(14000);
    expect(toCents(0)).toBe(0);
    // The case a `Math.round(n * 100)` implementation gets wrong: in binary
    // floating point 1.005 * 100 is 100.49999999999999, which rounds to 100.
    expect(toCents(1.005)).toBe(101);
    expect(toCents('1.005')).toBe(101);
    // And the one where rounding down is right.
    expect(toCents('1.004')).toBe(100);
  });

  it('refuses to read a price it cannot trust', () => {
    // An unreadable price makes an offer unusable. It never becomes zero.
    expect(toCents(undefined)).toBeUndefined();
    expect(toCents('')).toBeUndefined();
    expect(toCents('n/a')).toBeUndefined();
    expect(toCents(-5)).toBeUndefined();
  });
});

describe('calendar mapping', () => {
  it('expands a compressed run into one day each', () => {
    const days = mapCalendar(
      {
        data: [
          {
            roomId: 2002,
            calendar: [
              { from: '2026-09-16', to: '2026-09-19', numAvail: '0', price1: '140.00' },
              { from: '2026-09-20', to: '2026-09-22', numAvail: 1, price1: 140, minStay: '2' },
            ],
          },
        ],
      },
      '2026-09-16',
      '2026-09-23'
    );

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: '2026-09-16', available: false, canCheckIn: false });
    // The occupied nights are still legal departures.
    expect(days[0].canCheckOut).toBe(true);
    expect(days[4]).toMatchObject({ date: '2026-09-20', available: true, canCheckIn: true, minStay: 2 });
    expect(days[4].displayPriceCents).toBe(14000);
  });

  it('honours closed arrivals and closed departures separately', () => {
    const days = mapCalendar(
      {
        data: [
          {
            roomId: 2002,
            calendar: [
              { from: '2026-10-01', to: '2026-10-01', numAvail: 1, closedArrival: 1 },
              { from: '2026-10-02', to: '2026-10-02', numAvail: 1, closedDeparture: true },
            ],
          },
        ],
      },
      '2026-10-01',
      '2026-10-03'
    );

    expect(days[0]).toMatchObject({ available: true, canCheckIn: false, canCheckOut: true });
    expect(days[1]).toMatchObject({ available: true, canCheckIn: true, canCheckOut: false });
  });

  it('treats a date the provider did not describe as unavailable', () => {
    // A gap in a provider response is not permission to sell a night.
    const days = mapCalendar({ data: [] }, '2026-09-16', '2026-09-19');
    expect(days).toHaveLength(3);
    expect(days.every((d) => !d.available && !d.canCheckIn)).toBe(true);
  });
});

describe('offer mapping', () => {
  const request = {
    unitSlug: 'schulstrasse-i',
    externalRoomId: '2002',
    checkIn: '2026-09-20',
    checkOut: '2026-09-23',
    adults: 2,
    children: 0,
  };
  const expires = '2026-09-20T12:00:00Z';

  it('prices a stay and totals its fees', () => {
    const quote = mapOffer(
      {
        data: [
          {
            propertyId: 1001,
            roomTypes: [
              {
                roomId: 2002,
                offers: [{ price: '420.00', currency: 'EUR', fees: [{ name: 'Cleaning', amount: 45 }] }],
              },
            ],
          },
        ],
      },
      request,
      expires
    );

    expect(quote.nights).toBe(3);
    expect(quote.totalCents).toBe(46_500);
    expect(quote.components).toHaveLength(2);
    expect(quote.components[0].amountCents).toBe(42_000);
    expect(quote.components[0].taxCategory).toBe('accommodation');
    // A fee's tax treatment is recorded as unknown rather than guessed at.
    expect(quote.components[1].taxCategory).toBe('unknown');
  });

  it('takes the cheapest offer the provider is willing to sell', () => {
    const quote = mapOffer(
      {
        data: [
          {
            roomTypes: [
              { roomId: 2002, offers: [{ price: 500 }, { price: 420 }, { price: 'n/a' }] },
            ],
          },
        ],
      },
      request,
      expires
    );
    expect(quote.totalCents).toBe(42_000);
  });

  it('ignores offers belonging to another room', () => {
    expect(() =>
      mapOffer({ data: [{ roomTypes: [{ roomId: 9999, offers: [{ price: 100 }] }] }] }, request, expires)
    ).toThrowError(ProviderError);
  });

  it('reports no offers as an availability conflict, not an empty result', () => {
    // This is the race: free when the cache was built, gone now. It must reach
    // the guest as "just reserved", never as a server error or a zero price.
    try {
      mapOffer({ data: [] }, request, expires);
      throw new Error('should have thrown');
    } catch (cause) {
      expect(cause).toBeInstanceOf(ProviderError);
      expect((cause as ProviderError).code).toBe('availability_conflict');
    }
  });

  it('rejects an offer whose price cannot be read', () => {
    try {
      mapOffer({ data: [{ roomTypes: [{ roomId: 2002, offers: [{ price: 'free' }] }] }] }, request, expires);
      throw new Error('should have thrown');
    } catch (cause) {
      expect((cause as ProviderError).code).toBe('unavailable');
    }
  });
});

describe('mock provider fixtures', () => {
  it('produces a back-to-back month where the shared day is not lost', async () => {
    // Month + 3 in the fixture table: 16→20 and 20→23.
    const month = fixtureMonth(3);
    const days = await beds24MockProvider.fetchAvailability({
      unit: UNIT,
      from: `${month}-01`,
      to: `${month}-28`,
    });
    const on = (date: string) => days.find((d) => d.date === date)!;
    expect(on(`${month}-19`).available).toBe(false);
    // The 20th is the first stay's checkout and the second's arrival: its
    // NIGHT belongs to the second stay, but it is still a legal departure.
    expect(on(`${month}-20`).available).toBe(false);
    expect(on(`${month}-20`).canCheckOut).toBe(true);
    // The second stay's own departure is free again, and sellable.
    expect(on(`${month}-23`).available).toBe(true);
    expect(on(`${month}-23`).canCheckIn).toBe(true);
  });

  it('produces a completely free month and a minimum-stay month', async () => {
    const free = fixtureMonth(1);
    const freeDays = await beds24MockProvider.fetchAvailability({
      unit: UNIT, from: `${free}-02`, to: `${free}-28`,
    });
    expect(freeDays.every((d) => d.available && d.canCheckIn)).toBe(true);

    const restricted = fixtureMonth(4);
    const restrictedDays = await beds24MockProvider.fetchAvailability({
      unit: UNIT, from: `${restricted}-02`, to: `${restricted}-28`,
    });
    expect(restrictedDays.every((d) => d.minStay === 3)).toBe(true);
  });

  it('refuses a stay shorter than the fixture minimum', async () => {
    const month = fixtureMonth(4);
    await expect(
      beds24MockProvider.fetchOffer({
        unit: UNIT,
        unitSlug: 'schulstrasse-i',
        checkIn: `${month}-05`,
        checkOut: `${month}-06`,
        adults: 2,
        children: 0,
      })
    ).rejects.toMatchObject({ code: 'stay_rules', meta: { minNights: 3 } });
  });

  it('quotes a free stay', async () => {
    const month = fixtureMonth(1);
    const quote = await beds24MockProvider.fetchOffer({
      unit: UNIT,
      unitSlug: 'schulstrasse-i',
      checkIn: `${month}-04`,
      checkOut: `${month}-07`,
      adults: 2,
      children: 0,
    });
    expect(quote.nights).toBe(3);
    expect(quote.totalCents).toBe(3 * 14_000 + 4_500);
    expect(quote.components.map((c) => c.code)).toEqual(['accommodation', 'fee:cleaning']);
  });

  it('refuses a stay that overlaps an occupied fixture night', async () => {
    const month = fixtureMonth(3);
    await expect(
      beds24MockProvider.fetchOffer({
        unit: UNIT,
        unitSlug: 'schulstrasse-i',
        checkIn: `${month}-18`,
        checkOut: `${month}-21`,
        adults: 2,
        children: 0,
      })
    ).rejects.toMatchObject({ code: 'availability_conflict' });
  });

  it('exercises the conflict, outage and quote-then-hold-fails fixtures', async () => {
    const month = fixtureMonth(1);
    const stay = (day: string) => ({
      unit: UNIT,
      unitSlug: 'schulstrasse-i',
      checkIn: `${month}-${day}`,
      checkOut: `${month}-${String(Number(day) + 3).padStart(2, '0')}`,
      adults: 2,
      children: 0,
    });

    await expect(beds24MockProvider.fetchOffer(stay('13'))).rejects.toMatchObject({
      code: 'availability_conflict',
    });
    await expect(beds24MockProvider.fetchOffer(stay('14'))).rejects.toMatchObject({
      code: 'unavailable',
    });

    // The 15th quotes successfully and then loses the race at hold time —
    // a Booking.com reservation landing between the two calls.
    const quote = await beds24MockProvider.fetchOffer(stay('15'));
    expect(quote.totalCents).toBeGreaterThan(0);
    await expect(
      beds24MockProvider.createHold({
        ...stay('15'),
        reference: 'BLG-ABC234',
        guest: { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '+49123456' },
        totalCents: quote.totalCents,
        currency: 'EUR',
        idempotencyKey: 'key-1',
        holdExpiresAt: new Date().toISOString(),
      })
    ).rejects.toMatchObject({ code: 'availability_conflict' });
  });

  it('returns the same provider booking for a repeated attempt', async () => {
    const hold = {
      unit: UNIT,
      unitSlug: 'schulstrasse-i',
      checkIn: `${fixtureMonth(1)}-04`,
      checkOut: `${fixtureMonth(1)}-07`,
      adults: 2,
      children: 0,
      reference: 'BLG-ABC234',
      guest: { firstName: 'A', lastName: 'B', email: 'a@b.de', phone: '+49123456' },
      totalCents: 46_500,
      currency: 'EUR',
      idempotencyKey: 'stable-attempt-key',
      holdExpiresAt: new Date().toISOString(),
    };
    const first = await beds24MockProvider.createHold(hold);
    const second = await beds24MockProvider.createHold(hold);
    expect(first.externalBookingId).toBe(second.externalBookingId);
  });
});

describe('occupancy', () => {
  const unit = (maxGuests?: number) => ({ maxGuests, slug: 'x' } as unknown as Apartment);

  it('prefers the backend figure, then the content figure, then the fallback', () => {
    expect(maxGuestsFor(unit(4), 6)).toBe(6);
    expect(maxGuestsFor(unit(5))).toBe(5);
    expect(maxGuestsFor(unit(undefined))).toBe(FALLBACK_MAX_GUESTS);
    expect(maxGuestsFor(null)).toBe(FALLBACK_MAX_GUESTS);
  });

  it('clamps a party size into a unit range', () => {
    expect(clampGuestsFor(9, 6)).toBe(6);
    expect(clampGuestsFor(0, 6)).toBe(1);
    expect(clampGuestsFor(2.7, 6)).toBe(2);
    expect(clampGuestsFor(undefined, 6)).toBeUndefined();
  });
});
