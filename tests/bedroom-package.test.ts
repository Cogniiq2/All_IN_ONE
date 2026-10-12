/**
 * The bedroom package, end to end on the server side — Phase 1.
 *
 * What these tests pin down is the SAFETY of the preparation, not a price:
 *
 *   • the Beds24 seam reports "not configured" whatever the response holds,
 *     and never turns a package into the cheapest offer;
 *   • the live adapter's offer selection and request are unchanged, and the
 *     package is carried on the quote without being sent to Beds24;
 *   • mock quotes are fixtures, identical for both packages, and the service
 *     refuses to book a fixture price on production;
 *   • the package is part of the idempotency key and the quote hash;
 *   • the checkout withholds its button while the package price is unknown.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const beds24Request = vi.fn();
vi.mock('@/lib/integrations/beds24/client', () => ({
  beds24Request: (...args: unknown[]) => beds24Request(...args),
}));

import { resolveBeds24BedroomPricing } from '@/lib/integrations/beds24/bedroom-pricing';
import { beds24LiveProvider } from '@/lib/integrations/beds24/live';
import { beds24MockProvider } from '@/lib/integrations/beds24/mock';
import { bedroomPricingBookable } from '@/lib/booking/service';
import { readBedroomPackage } from '@/lib/booking/http';
import { bedroomPricingTestOverride } from '@/lib/booking/config';
import { refusals, validateEnvironment } from '@/lib/config/environment';
import { bookingIdempotencyKey } from '@/lib/booking/reference';
import { quoteHashOf } from '@/lib/booking/quote-hash';
import { addDays, propertyToday } from '@/lib/booking/stay-rules';
import { CheckoutSummary, checkoutReady } from '@/components/booking/checkout-summary';
import type { BedroomPackage, BookingQuote } from '@/lib/booking/types';

const UNIT = { provider: 'beds24' as const, externalPropertyId: '354659', externalRoomId: '731147' };

/** Two offers for the mapped room — the shape a per-package setup might take. */
const TWO_OFFERS = {
  data: [
    {
      propertyId: 354659,
      roomTypes: [
        {
          roomId: 731147,
          offers: [
            { offerId: 1, price: '300.00', fees: [{ name: 'Endreinigung', amount: '60' }] },
            { offerId: 2, price: '420.00' },
          ],
        },
      ],
    },
  ],
};

const STAY = { checkIn: '2027-03-10', checkOut: '2027-03-12', adults: 2, children: 0 };

beforeEach(() => {
  beds24Request.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveBeds24BedroomPricing — the Phase 2 seam', () => {
  it.each<BedroomPackage>(['one_bedroom', 'two_bedroom'])(
    'reports %s as not configured, even when several offers are present',
    (bedroomPackage) => {
      expect(resolveBeds24BedroomPricing({ unit: UNIT, bedroomPackage, offers: TWO_OFFERS })).toEqual({
        status: 'not_configured',
        bedroomPackage,
        reason: 'BEDS24_BEDROOM_MAPPING_NOT_CONFIGURED',
      });
    }
  );

  it('never names an offer, a rate or a price', () => {
    const resolution = resolveBeds24BedroomPricing({ unit: UNIT, bedroomPackage: 'two_bedroom', offers: TWO_OFFERS });
    expect(Object.keys(resolution).sort()).toEqual(['bedroomPackage', 'reason', 'status']);
  });
});

describe('live Beds24 offer with a bedroom package', () => {
  it('keeps the existing selection and request, and marks the package price unconfigured', async () => {
    beds24Request.mockResolvedValue(TWO_OFFERS);

    const quote = await beds24LiveProvider.fetchOffer({
      unit: UNIT,
      unitSlug: 'schulstrasse-i',
      ...STAY,
      bedroomPackage: 'two_bedroom',
    });

    // Unchanged selection: the existing algorithm's choice, fee included.
    expect(quote.totalCents).toBe(36_000);
    expect(quote.bedroomPackage).toBe('two_bedroom');
    expect(quote.bedroomPricing).toEqual({ status: 'not_configured' });

    // Unchanged request: the package is not sent to Beds24 as any parameter.
    expect(beds24Request).toHaveBeenCalledTimes(1);
    const call = beds24Request.mock.calls[0][0] as { path: string; query: Record<string, unknown> };
    expect(call.path).toBe('/inventory/rooms/offers');
    expect(Object.keys(call.query).sort()).toEqual(
      ['arrival', 'departure', 'numAdult', 'numChild', 'propertyId', 'roomId'].sort()
    );
  });

  it('gives both packages the same Beds24 total — no price is derived from the package', async () => {
    beds24Request.mockResolvedValue(TWO_OFFERS);
    const one = await beds24LiveProvider.fetchOffer({ unit: UNIT, unitSlug: 's', ...STAY, bedroomPackage: 'one_bedroom' });
    const two = await beds24LiveProvider.fetchOffer({ unit: UNIT, unitSlug: 's', ...STAY, bedroomPackage: 'two_bedroom' });
    expect(one.totalCents).toBe(two.totalCents);
    expect(one.components).toEqual(two.components);
  });
});

describe('mock fixtures', () => {
  it('labels both packages as fixtures and prices them identically', async () => {
    // A month the mock leaves completely free, away from the failure days.
    const month = addDays(`${propertyToday().slice(0, 7)}-01`, 40).slice(0, 7);
    const request = (bedroomPackage: BedroomPackage) => ({
      unit: UNIT,
      unitSlug: 'schulstrasse-i',
      checkIn: `${month}-04`,
      checkOut: `${month}-07`,
      adults: 2,
      children: 0,
      bedroomPackage,
    });
    const one = await beds24MockProvider.fetchOffer(request('one_bedroom'));
    const two = await beds24MockProvider.fetchOffer(request('two_bedroom'));
    expect(one.bedroomPricing).toEqual({ status: 'fixture' });
    expect(two.bedroomPricing).toEqual({ status: 'fixture' });
    expect(one.bedroomPackage).toBe('one_bedroom');
    expect(one.totalCents).toBe(two.totalCents);
  });
});

describe('the server-side pricing gate', () => {
  const quote = (status: 'not_configured' | 'fixture'): BookingQuote => ({
    unitSlug: 'schulstrasse-i', ...STAY, nights: 2, bedroomPackage: 'two_bedroom',
    bedroomPricing: { status }, currency: 'EUR', totalCents: 1, components: [], expiresAt: '2030-01-01T00:00:00Z',
  });

  it('refuses every unconfigured package price, on any environment', () => {
    for (const env of ['local', 'preview', 'staging', 'production']) {
      vi.stubEnv('APP_ENV', env);
      expect(bedroomPricingBookable(quote('not_configured'))).toBe(false);
    }
  });

  it('lets a fixture through for testing, but never on production', () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(bedroomPricingBookable(quote('fixture'))).toBe(true);
    vi.stubEnv('APP_ENV', 'production');
    expect(bedroomPricingBookable(quote('fixture'))).toBe(false);
  });
});

describe('the local simulator switch', () => {
  it('is honoured on APP_ENV=local only', () => {
    vi.stubEnv('BOOKING_TEST_BEDROOM_PRICING', 'true');
    vi.stubEnv('APP_ENV', 'local');
    expect(bedroomPricingTestOverride()).toBe(true);
    for (const env of ['preview', 'staging', 'production']) {
      vi.stubEnv('APP_ENV', env);
      expect(bedroomPricingTestOverride()).toBe(false);
    }
  });

  it('is refused by the environment model everywhere but local', () => {
    const codes = (env: string) =>
      refusals(validateEnvironment({ APP_ENV: env, BOOKING_TEST_BEDROOM_PRICING: 'true' })).map((f) => f.code);
    expect(codes('local')).not.toContain('TEST_BEDROOM_PRICING_OUTSIDE_LOCAL');
    for (const env of ['preview', 'staging', 'production']) {
      expect(codes(env)).toContain('TEST_BEDROOM_PRICING_OUTSIDE_LOCAL');
    }
  });
});

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
      unitSlug: 'schulstrasse-i', ...STAY, nights: 2, bedroomPackage, bedroomPricing: { status: 'fixture' },
      currency: 'EUR', totalCents: 36_000, components: [], expiresAt: '2030-01-01T00:00:00Z',
    });
    expect(await quoteHashOf(quote('one_bedroom'))).not.toBe(await quoteHashOf(quote('two_bedroom')));
  });
});

describe('checkout', () => {
  const quote = (status: 'not_configured' | 'fixture'): BookingQuote => ({
    unitSlug: 'schulstrasse-i', ...STAY, nights: 2, bedroomPackage: 'one_bedroom',
    bedroomPricing: { status }, currency: 'EUR', totalCents: 36_000,
    components: [
      { code: 'accommodation', label: { de: 'Unterkunft · 2 Nächte', en: 'Accommodation · 2 nights' }, amountCents: 30_000, mandatory: true },
      { code: 'fee:endreinigung', label: { de: 'Endreinigung', en: 'Endreinigung' }, amountCents: 6_000, mandatory: true },
    ],
    expiresAt: '2030-01-01T00:00:00Z',
    terms: null,
  });

  const render = (q: BookingQuote) =>
    renderToStaticMarkup(
      createElement(CheckoutSummary, {
        locale: 'en',
        unitName: 'Apartment Schulstraße I',
        arrival: STAY.checkIn,
        departure: STAY.checkOut,
        nights: 2,
        guests: 2,
        bedroomPackage: 'one_bedroom',
        quote: q,
        quoteLoading: false,
        bookable: false,
      })
    );

  it('withholds the button while the package price is not configured', () => {
    // `checkoutReady` reads only whether terms exist; their content is tested
    // in legal-checkout.test.ts.
    const withTerms = (status: 'not_configured' | 'fixture') =>
      ({ ...quote(status), terms: {} as NonNullable<BookingQuote['terms']> });
    expect(checkoutReady(withTerms('not_configured'))).toBe(false);
    expect(checkoutReady(withTerms('fixture'))).toBe(true);
  });

  it('shows apartment, dates, guests, bedroom setup, provider lines and total', () => {
    const html = render(quote('not_configured'));
    expect(html).toContain('Apartment Schulstraße I');
    expect(html).toContain('Bedroom setup');
    expect(html).toContain('1 Bedroom');
    expect(html).toContain('Accommodation · 2 nights');
    expect(html).toContain('Endreinigung');
    expect(html).toContain('Total price');
    expect(html).toContain('data-pricing="bedroom-unconfigured"');
  });

  it('labels fixture prices as test data', () => {
    const html = render(quote('fixture'));
    expect(html).toContain('data-pricing="fixture"');
    expect(html).not.toContain('data-pricing="bedroom-unconfigured"');
  });
});
