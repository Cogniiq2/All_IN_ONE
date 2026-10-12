/**
 * The bedroom package against Beds24 — the live mapping.
 *
 *   one_bedroom → Offer 1 "1 Schlafzimmer" (1–2 guests)
 *   two_bedroom → Offer 2 "2 Schlafzimmer" (1–4 guests)
 *
 * Pinned down here:
 *   • the seam selects exactly the package's offer — never the cheapest, never
 *     the other package — and refuses a missing, renamed or over-full one;
 *   • REAL live responses (tests/fixtures/beds24-offers-live-2026-10-12.json)
 *     produce exactly Beds24's own totals for both apartments, both packages,
 *     1/2/3/7 nights — the website computes nothing;
 *   • the live adapter asks with `numAdults`/`numChildren` and writes the
 *     offer and a bedroom marker onto the Beds24 booking;
 *   • the service books configured prices, books fixtures only off production,
 *     never a replayed (unverified) quote;
 *   • imported reservations derive the setup from Beds24's offerId, and leave
 *     a channel booking's setup unknown.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import liveOffers from './fixtures/beds24-offers-live-2026-10-12.json';

const beds24Request = vi.fn();
vi.mock('@/lib/integrations/beds24/client', () => ({
  beds24Request: (...args: unknown[]) => beds24Request(...args),
}));

import {
  BEDS24_BEDROOM_OFFERS,
  bedroomPackageForOfferId,
  resolveBeds24BedroomPricing,
} from '@/lib/integrations/beds24/bedroom-pricing';
import { BEDROOM_INFO_CODE, beds24LiveProvider } from '@/lib/integrations/beds24/live';
import { mapOffer } from '@/lib/integrations/beds24/mapper';
import { beds24MockProvider } from '@/lib/integrations/beds24/mock';
import { mapReservation } from '@/lib/integrations/beds24/reservations';
import { ProviderError } from '@/lib/integrations/provider';
import type { Beds24OffersResponse } from '@/lib/integrations/beds24/types';
import { bedroomPricingBookable } from '@/lib/booking/service';
import { readBedroomPackage } from '@/lib/booking/http';
import { bookingIdempotencyKey } from '@/lib/booking/reference';
import { quoteHashOf } from '@/lib/booking/quote-hash';
import { addDays, propertyToday } from '@/lib/booking/stay-rules';
import { CheckoutSummary, checkoutReady } from '@/components/booking/checkout-summary';
import type { BedroomPackage, BedroomPricing, BookingQuote } from '@/lib/booking/types';

type LiveCase = { unit: string; nights: number; guests: number; query: string; httpStatus: number; response: Beds24OffersResponse };
const LIVE = liveOffers as unknown as {
  arrival: string;
  units: Record<string, { propertyId: number; roomId: number }>;
  cases: LiveCase[];
};

const unitRef = (slug: string) => ({
  provider: 'beds24' as const,
  externalPropertyId: String(LIVE.units[slug].propertyId),
  externalRoomId: String(LIVE.units[slug].roomId),
});
const APT_I = unitRef('schulstrasse-i');

const BOTH = (offers: unknown[]) => ({ data: [{ roomId: 731147, propertyId: 354659, offers }] }) as Beds24OffersResponse;
const OFFER_1 = { offerId: 1, offerName: '1 Schlafzimmer', price: 434, unitsAvailable: 1 };
const OFFER_2 = { offerId: 2, offerName: '2 Schlafzimmer', price: 473, unitsAvailable: 1 };

function liveCase(unit: string, nights: number, guests: number): LiveCase {
  const found = LIVE.cases.find((c) => c.unit === unit && c.nights === nights && c.guests === guests && c.query === 'numAdults');
  if (!found) throw new Error(`no recorded case ${unit} ${nights}n ${guests}g`);
  return found;
}

/** The price Beds24 itself returned for an offer in a recorded case, in cents. */
function recordedCents(c: LiveCase, offerId: number): number {
  const offer = c.response.data?.[0]?.offers?.find((o) => Number(o.offerId) === offerId);
  if (!offer) throw new Error('offer not in recording');
  return Math.round(Number(offer.price) * 100);
}

const STAY = { checkIn: '2027-03-10', checkOut: '2027-03-12', adults: 2, children: 0 };

beforeEach(() => {
  beds24Request.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ── The seam ──────────────────────────────────────────────────────────── */

describe('resolveBeds24BedroomPricing', () => {
  it('maps one_bedroom to Offer 1 and two_bedroom to Offer 2', () => {
    expect(BEDS24_BEDROOM_OFFERS.one_bedroom).toMatchObject({ offerId: 1, offerName: '1 Schlafzimmer', maxGuests: 2 });
    expect(BEDS24_BEDROOM_OFFERS.two_bedroom).toMatchObject({ offerId: 2, offerName: '2 Schlafzimmer', maxGuests: 4 });
  });

  it('selects Offer 1 for one_bedroom', () => {
    const r = resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'one_bedroom', guests: 2, offers: BOTH([OFFER_1, OFFER_2]) });
    expect(r).toMatchObject({ status: 'configured', offerId: 1, offer: OFFER_1 });
  });

  it('selects Offer 2 for two_bedroom', () => {
    const r = resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: BOTH([OFFER_1, OFFER_2]) });
    expect(r).toMatchObject({ status: 'configured', offerId: 2, offer: OFFER_2 });
  });

  it('never falls back to the cheapest offer', () => {
    const cheapFirst = BOTH([{ ...OFFER_1, price: 1 }, { ...OFFER_2, price: 9999 }]);
    const r = resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: cheapFirst });
    expect(r).toMatchObject({ status: 'configured', offerId: 2 });
    expect(r.status === 'configured' && r.offer.price).toBe(9999);
  });

  it('reports a missing requested offer instead of substituting the other package', () => {
    // Exactly the live 3–4 guest response: Offer 1 absent, Offer 2 present.
    const r = resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'one_bedroom', guests: 2, offers: BOTH([OFFER_2]) });
    expect(r).toEqual({ status: 'unavailable', bedroomPackage: 'one_bedroom', reason: 'offer_missing' });
    const r2 = resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: BOTH([OFFER_1]) });
    expect(r2).toEqual({ status: 'unavailable', bedroomPackage: 'two_bedroom', reason: 'offer_missing' });
  });

  it('refuses 3 guests on Offer 1, and accepts 4 guests on Offer 2', () => {
    expect(resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'one_bedroom', guests: 3, offers: BOTH([OFFER_1, OFFER_2]) }))
      .toEqual({ status: 'unavailable', bedroomPackage: 'one_bedroom', reason: 'occupancy_exceeded' });
    expect(resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 4, offers: BOTH([OFFER_2]) }))
      .toMatchObject({ status: 'configured', offerId: 2 });
  });

  it('refuses an offer id carrying the other package name — the account changed', () => {
    const swapped = BOTH([{ ...OFFER_1, offerName: '2 Schlafzimmer' }, { ...OFFER_2, offerName: '1 Schlafzimmer' }]);
    expect(resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: swapped }))
      .toMatchObject({ status: 'unavailable', reason: 'offer_name_mismatch' });
  });

  it('refuses duplicate offer ids, other rooms, and an empty answer', () => {
    expect(resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: BOTH([OFFER_2, OFFER_2]) }))
      .toMatchObject({ status: 'unavailable', reason: 'offer_missing' });
    const otherRoom = { data: [{ roomId: 731146, propertyId: 354658, offers: [OFFER_2] }] } as Beds24OffersResponse;
    expect(resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: otherRoom }))
      .toMatchObject({ status: 'unavailable', reason: 'no_offers' });
    expect(resolveBeds24BedroomPricing({ unit: APT_I, bedroomPackage: 'two_bedroom', guests: 2, offers: { data: [] } }))
      .toMatchObject({ status: 'unavailable', reason: 'no_offers' });
  });

  it('reads an offer id back into a package — and nothing else', () => {
    expect(bedroomPackageForOfferId(1)).toBe('one_bedroom');
    expect(bedroomPackageForOfferId('2')).toBe('two_bedroom');
    expect(bedroomPackageForOfferId(0)).toBeUndefined();
    expect(bedroomPackageForOfferId(3)).toBeUndefined();
    expect(bedroomPackageForOfferId(undefined)).toBeUndefined();
  });
});

/* ── Real Beds24 responses, both apartments ────────────────────────────── */

describe('live responses recorded 2026-10-12 produce Beds24\'s own totals', () => {
  const quoteFor = (unit: string, nights: number, guests: number, bedroomPackage: BedroomPackage) =>
    mapOffer(
      liveCase(unit, nights, guests).response,
      {
        unit: unitRef(unit),
        unitSlug: unit,
        checkIn: LIVE.arrival,
        checkOut: addDays(LIVE.arrival, nights),
        adults: guests,
        children: 0,
        bedroomPackage,
      },
      '2030-01-01T00:00:00Z'
    );

  for (const unit of ['schulstrasse-i', 'schulstrasse-ii']) {
    for (const nights of [1, 2, 3, 7]) {
      it(`${unit} · 1 Schlafzimmer · ${nights} night(s) · 2 guests = Offer 1 verbatim`, () => {
        const quote = quoteFor(unit, nights, 2, 'one_bedroom');
        expect(quote.totalCents).toBe(recordedCents(liveCase(unit, nights, 2), 1));
        expect(quote.bedroomPricing).toEqual({ status: 'configured', offerId: 1 });
        // Short-stay surcharges are folded into Beds24's price: one line, no fee rows.
        expect(quote.components.map((c) => c.code)).toEqual(['accommodation']);
        expect(quote.components[0].amountCents).toBe(quote.totalCents);
        expect(quote.nights).toBe(nights);
      });

      it(`${unit} · 2 Schlafzimmer · ${nights} night(s) · 2 and 4 guests = Offer 2 verbatim`, () => {
        for (const guests of [2, 4]) {
          const quote = quoteFor(unit, nights, guests, 'two_bedroom');
          expect(quote.totalCents).toBe(recordedCents(liveCase(unit, nights, guests), 2));
          expect(quote.bedroomPricing).toEqual({ status: 'configured', offerId: 2 });
          expect(quote.components).toHaveLength(1);
        }
      });
    }

    it(`${unit} · 1 Schlafzimmer for 3 or 4 guests is refused, never priced as Offer 2`, () => {
      for (const [nights, guests] of [[1, 3], [3, 3], [3, 4], [1, 4]]) {
        expect(() => quoteFor(unit, nights, guests, 'one_bedroom')).toThrowError(ProviderError);
        try { quoteFor(unit, nights, guests, 'one_bedroom'); } catch (e) {
          expect((e as ProviderError).code).toBe('offer_unavailable');
        }
      }
    });
  }

  it('the 2-bedroom total is a different, higher Beds24 number — taken, not derived', () => {
    const c = liveCase('schulstrasse-i', 3, 2);
    expect(quoteFor('schulstrasse-i', 3, 2, 'two_bedroom').totalCents).toBeGreaterThan(quoteFor('schulstrasse-i', 3, 2, 'one_bedroom').totalCents);
    expect(recordedCents(c, 2)).toBe(123_900);
    expect(recordedCents(c, 1)).toBe(112_200);
  });
});

/* ── The live adapter's requests ───────────────────────────────────────── */

describe('live adapter', () => {
  it('asks /inventory/rooms/offers with numAdults/numChildren and no offer filter', async () => {
    beds24Request.mockResolvedValue(liveCase('schulstrasse-ii', 3, 2).response);
    const quote = await beds24LiveProvider.fetchOffer({
      unit: unitRef('schulstrasse-ii'),
      unitSlug: 'schulstrasse-ii',
      checkIn: LIVE.arrival,
      checkOut: addDays(LIVE.arrival, 3),
      adults: 2,
      children: 0,
      bedroomPackage: 'two_bedroom',
    });
    const call = beds24Request.mock.calls[0][0] as { path: string; query: Record<string, unknown> };
    expect(call.path).toBe('/inventory/rooms/offers');
    expect(call.query).toMatchObject({ numAdults: 2, numChildren: 0, propertyId: '354658', roomId: '731146' });
    expect(call.query).not.toHaveProperty('numAdult');
    expect(call.query).not.toHaveProperty('offerId');
    expect(quote.totalCents).toBe(108_900);
    expect(quote.bedroomPricing).toEqual({ status: 'configured', offerId: 2 });
  });

  it.each<[BedroomPackage, number, string]>([
    ['one_bedroom', 1, '1 Schlafzimmer'],
    ['two_bedroom', 2, '2 Schlafzimmer'],
  ])('a %s hold writes offerId %i and the "%s" marker to the booking', async (bedroomPackage, offerId, label) => {
    beds24Request.mockResolvedValue([{ success: true, new: { id: 777, status: 'new', roomId: 731147, propertyId: 354659, offerId } }]);
    const booking = await beds24LiveProvider.createHold({
      unit: APT_I,
      unitSlug: 'schulstrasse-i',
      ...STAY,
      bedroomPackage,
      providerOfferId: offerId,
      reference: 'BLG-BED234',
      guest: { firstName: 'A', lastName: 'B', email: 'a@example.com', phone: '+49 1' },
      totalCents: 47_300,
      currency: 'EUR',
      idempotencyKey: 'k',
      holdExpiresAt: '2030-01-01T00:00:00Z',
    });
    const body = (beds24Request.mock.calls[0][0] as { body: Array<Record<string, unknown>> }).body[0];
    expect(body.offerId).toBe(offerId);
    expect(body.price).toBe(473);
    expect(body.numAdult).toBe(2); // the booking WRITE takes the singular form
    expect(body.infoItems).toEqual([{ code: BEDROOM_INFO_CODE, text: `Bedroom setup: ${label}` }]);
    expect(String(body.notes)).toContain(`Bedroom setup: ${label}`);
    // Guest-visible fields are not used for the marker.
    expect(body).not.toHaveProperty('comments');
    expect(body).not.toHaveProperty('message');
    expect(booking.offerId).toBe(offerId);
  });
});

/* ── Mock fixtures ─────────────────────────────────────────────────────── */

describe('mock fixtures', () => {
  // A month the mock leaves completely free, away from the failure days.
  const month = addDays(`${propertyToday().slice(0, 7)}-01`, 40).slice(0, 7);
  const request = (bedroomPackage: BedroomPackage, day = '04', adults = 2) => ({
    unit: APT_I, unitSlug: 'schulstrasse-i', checkIn: `${month}-${day}`,
    checkOut: addDays(`${month}-${day}`, 3), adults, children: 0, bedroomPackage,
  });

  it('runs the real selection and labels the result a fixture', async () => {
    const one = await beds24MockProvider.fetchOffer(request('one_bedroom'));
    const two = await beds24MockProvider.fetchOffer(request('two_bedroom'));
    expect(one.bedroomPricing).toEqual({ status: 'fixture', offerId: 1 });
    expect(two.bedroomPricing).toEqual({ status: 'fixture', offerId: 2 });
    expect(one.totalCents).not.toBe(two.totalCents);
  });

  it('withholds Offer 1 for three guests and on the 16th', async () => {
    await expect(beds24MockProvider.fetchOffer(request('one_bedroom', '04', 3))).rejects.toMatchObject({ code: 'offer_unavailable' });
    await expect(beds24MockProvider.fetchOffer(request('one_bedroom', '16'))).rejects.toMatchObject({ code: 'offer_unavailable' });
    await expect(beds24MockProvider.fetchOffer(request('two_bedroom', '16'))).resolves.toMatchObject({ bedroomPricing: { offerId: 2 } });
  });
});

/* ── The service gate ──────────────────────────────────────────────────── */

describe('bedroomPricingBookable', () => {
  const quote = (bedroomPricing: BedroomPricing): BookingQuote => ({
    unitSlug: 'schulstrasse-i', ...STAY, nights: 2, bedroomPackage: 'two_bedroom', bedroomPricing,
    currency: 'EUR', totalCents: 1, components: [], expiresAt: '2030-01-01T00:00:00Z',
  });

  it('books a configured live offer anywhere, never a replayed quote', () => {
    for (const env of ['local', 'staging', 'production']) {
      vi.stubEnv('APP_ENV', env);
      expect(bedroomPricingBookable(quote({ status: 'configured', offerId: 2 }))).toBe(true);
      expect(bedroomPricingBookable(quote({ status: 'unverified' }))).toBe(false);
    }
  });

  it('books a fixture for testing, but never on production', () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(bedroomPricingBookable(quote({ status: 'fixture', offerId: 1 }))).toBe(true);
    vi.stubEnv('APP_ENV', 'production');
    expect(bedroomPricingBookable(quote({ status: 'fixture', offerId: 1 }))).toBe(false);
  });
});

/* ── Request parsing, identity ─────────────────────────────────────────── */

describe('request parsing', () => {
  it('accepts exactly the two packages', () => {
    expect(readBedroomPackage('one_bedroom')).toBe('one_bedroom');
    expect(readBedroomPackage('two_bedroom')).toBe('two_bedroom');
  });

  it.each([undefined, null, '', 'ONE_BEDROOM', 'three_bedroom', 2, {}])('refuses %p as invalid_input', (value) => {
    expect(() => readBedroomPackage(value)).toThrow(expect.objectContaining({ code: 'invalid_input' }));
  });
});

describe('identity of an attempt and a quote', () => {
  it('gives the same dates in a different setup a different idempotency key', async () => {
    const base = { unitSlug: 'schulstrasse-i', ...STAY, email: 'ada@example.com', attemptId: 'a1' };
    const one = await bookingIdempotencyKey({ ...base, bedroomPackage: 'one_bedroom' });
    const two = await bookingIdempotencyKey({ ...base, bedroomPackage: 'two_bedroom' });
    expect(one).not.toBe(two);
    expect(await bookingIdempotencyKey({ ...base, bedroomPackage: 'one_bedroom' })).toBe(one);
  });

  it('gives the same total for a different setup a different quote hash', async () => {
    const quote = (bedroomPackage: BedroomPackage): BookingQuote => ({
      unitSlug: 'schulstrasse-i', ...STAY, nights: 2, bedroomPackage, bedroomPricing: { status: 'configured', offerId: 2 },
      currency: 'EUR', totalCents: 36_000, components: [], expiresAt: '2030-01-01T00:00:00Z',
    });
    expect(await quoteHashOf(quote('one_bedroom'))).not.toBe(await quoteHashOf(quote('two_bedroom')));
  });
});

/* ── Checkout ──────────────────────────────────────────────────────────── */

describe('checkout', () => {
  const quote = (bedroomPricing: BedroomPricing): BookingQuote => ({
    unitSlug: 'schulstrasse-i', ...STAY, nights: 2, bedroomPackage: 'one_bedroom', bedroomPricing,
    currency: 'EUR', totalCents: 78_800,
    components: [
      { code: 'accommodation', label: { de: 'Unterkunft · 2 Nächte', en: 'Accommodation · 2 nights' }, amountCents: 78_800, mandatory: true },
    ],
    expiresAt: '2030-01-01T00:00:00Z',
    terms: null,
  });
  const withTerms = (q: BookingQuote) => ({ ...q, terms: {} as NonNullable<BookingQuote['terms']> });

  const render = (q: BookingQuote) =>
    renderToStaticMarkup(
      createElement(CheckoutSummary, {
        locale: 'en', unitName: 'Apartment Schulstraße I', arrival: STAY.checkIn, departure: STAY.checkOut,
        nights: 2, guests: 2, bedroomPackage: 'one_bedroom', quote: q, quoteLoading: false, bookable: false,
      })
    );

  it('offers the button for a configured offer, never for a replayed quote', () => {
    expect(checkoutReady(withTerms(quote({ status: 'configured', offerId: 1 })))).toBe(true);
    expect(checkoutReady(withTerms(quote({ status: 'fixture', offerId: 1 })))).toBe(true);
    expect(checkoutReady(withTerms(quote({ status: 'unverified' })))).toBe(false);
  });

  it('shows apartment, dates, nights, guests, bedroom setup, accommodation and total — no caveat', () => {
    const html = render(quote({ status: 'configured', offerId: 1 }));
    for (const text of ['Apartment Schulstraße I', 'Nights', 'Guests', 'Bedroom setup', '1 Bedroom', 'Accommodation · 2 nights', 'Total price', '€788.00']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('data-pricing=');
  });

  it('labels fixture prices as test data', () => {
    expect(render(quote({ status: 'fixture', offerId: 1 }))).toContain('data-pricing="fixture"');
  });
});

/* ── Imported reservations ─────────────────────────────────────────────── */

describe('reservation import', () => {
  const booking = (offerId: unknown) => ({ id: 1, arrival: '2027-01-01', departure: '2027-01-03', status: 'confirmed', roomId: 731147, propertyId: 354659, offerId });

  it('derives the setup of a direct booking from its Beds24 offer', () => {
    expect(mapReservation(booking(1) as never)).toMatchObject({ externalOfferId: 1, bedroomPackage: 'one_bedroom' });
    expect(mapReservation(booking(2) as never)).toMatchObject({ externalOfferId: 2, bedroomPackage: 'two_bedroom' });
  });

  it('leaves a channel booking (offerId 0, or none) unknown', () => {
    const ota = mapReservation(booking(0) as never) as { externalOfferId?: number; bedroomPackage?: string };
    expect(ota.externalOfferId).toBe(0);
    expect(ota.bedroomPackage).toBeUndefined();
    expect((mapReservation(booking(undefined) as never) as { bedroomPackage?: string }).bedroomPackage).toBeUndefined();
  });
});
