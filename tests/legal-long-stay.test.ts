/**
 * A stay longer than the approved no-withdrawal notice covers is not booked
 * online. § 312g Abs. 2 Nr. 9 BGB exempts accommodation "other than for
 * residential purposes"; a long stay may be residential, where the notice
 * would be wrong. Such a stay is refused as a stay rule and goes to the
 * enquiry flow — the limit is counsel's number, carried on the notice.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: () => { throw new Error('no db'); }, isSupabaseConfigured: () => true }));
vi.mock('@/lib/legal/readiness', () => ({
  bookingLegalGaps: () => [],
  resolveCheckoutTerms: () => ({
    cancellation: { version: 'c', text: { de: 'c', en: 'c' } },
    withdrawal: { version: 'w', text: { de: 'w', en: 'w' }, maxNights: 28 },
    agb: { version: 'a', path: '/agb' },
    privacy: { version: 'p', path: '/datenschutz' },
    price: { version: 'pr', statement: { de: 's', en: 's' }, onSiteCharges: [] },
    contractingParty: 'BoLaGio GmbH, X, 95444 Bayreuth',
    test: false,
  }),
}));
vi.mock('@/lib/booking/repository', () => ({
  findUnitBySlug: async () => ({
    id: 'u', slug: 'schulstrasse-i', displayName: 'S', maxGuests: 4, minNights: null, currency: 'EUR', isBookable: true,
    timezone: 'Europe/Berlin', checkInTime: '15:00', checkOutTime: '11:00',
    providerRef: { provider: 'beds24', externalPropertyId: '1', externalRoomId: '2' },
  }),
  readInventory: async () => ({ days: [] }),
  OverlappingHoldError: class extends Error {},
}));
vi.mock('@/lib/integrations/beds24', () => ({
  bookingProvider: () => ({
    fetchOffer: async (r: { unitSlug: string; checkIn: string; checkOut: string }) => ({
      unitSlug: r.unitSlug, checkIn: r.checkIn, checkOut: r.checkOut,
      nights: Math.round((Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86_400_000),
      adults: 2, children: 0, currency: 'EUR', totalCents: 100, components: [], expiresAt: '2030-01-01T00:00:00Z',
    }),
  }),
}));

import { getQuote } from '@/lib/booking/service';
import { createLogger } from '@/lib/booking/logger';

describe('the online stay limit carried by the withdrawal notice', () => {
  it('quotes a stay within it, with the terms attached', async () => {
    const quote = await getQuote({ unitSlug: 'schulstrasse-i', checkIn: '2027-03-01', checkOut: '2027-03-29', adults: 2, children: 0 }, createLogger());
    expect(quote.nights).toBe(28);
    expect(quote.terms?.withdrawal.maxNights).toBe(28);
  });

  it('refuses a longer stay as a stay rule, naming the limit', async () => {
    await expect(
      getQuote({ unitSlug: 'schulstrasse-i', checkIn: '2027-03-01', checkOut: '2027-03-30', adults: 2, children: 0 }, createLogger())
    ).rejects.toMatchObject({ code: 'stay_rules', meta: { maxNights: 28 } });
  });
});
