/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CHECKOUT MAY NOT PROCEED WITHOUT APPROVED TERMS.
 *
 * The launch blocker this suite exists for: when Beds24 returned no
 * cancellation text, the checkout rendered no cancellation terms at all and
 * the guest could pay anyway. Asserted here, from four sides:
 *
 *   1. the rules      no approved text → a named gap → no terms resolved
 *   2. the gate       a complete production environment is STILL shut
 *   3. the service    the provider's text never reaches the browser; a
 *                     booking without the shown term versions is refused
 *   4. the screen     the cancellation block always renders — the approved
 *                     text, or the stated gap — with the AGB/privacy links,
 *                     the contracting party and every mandatory price line
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  db: 0,
  providerPolicy: 'Provider-Text: kostenlos stornierbar' as string | undefined,
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => {
    h.db += 1;
    throw new Error('the database must not be reached');
  },
  isSupabaseConfigured: () => true,
}));

vi.mock('@/lib/booking/repository', () => ({
  findUnitBySlug: async () => ({
    id: 'unit-1', slug: 'schulstrasse-i', displayName: 'Schulstraße I', maxGuests: 4, minNights: null,
    currency: 'EUR', isBookable: true, timezone: 'Europe/Berlin', checkInTime: '15:00', checkOutTime: '11:00',
    providerRef: { provider: 'beds24', externalPropertyId: '1', externalRoomId: '2' },
  }),
  readInventory: async () => ({ days: [] }),
  findIntentByIdempotencyKey: async () => {
    h.db += 1;
    throw new Error('the database must not be reached');
  },
  createIntent: async () => {
    h.db += 1;
    throw new Error('the database must not be reached');
  },
  OverlappingHoldError: class extends Error {},
}));

vi.mock('@/lib/integrations/beds24', () => ({
  bookingProvider: () => ({
    mode: 'mock',
    fetchOffer: async (r: { unitSlug: string; checkIn: string; checkOut: string; adults: number; children: number }) => {
      const nights = Math.round((Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86_400_000);
      return {
        unitSlug: r.unitSlug, checkIn: r.checkIn, checkOut: r.checkOut, nights, adults: r.adults, children: r.children,
        currency: 'EUR', totalCents: 32000, expiresAt: '2030-01-01T00:00:00Z',
        components: [
          { code: 'accommodation', label: { de: 'Unterkunft · 2 Nächte', en: 'Accommodation · 2 nights' }, amountCents: 26000, mandatory: true },
          { code: 'fee:endreinigung', label: { de: 'Endreinigung', en: 'Endreinigung' }, amountCents: 6000, mandatory: true },
        ],
        cancellationPolicy: h.providerPolicy ? { de: h.providerPolicy, en: h.providerPolicy } : undefined,
      };
    },
  }),
}));

import { bookingLegalGaps, resolveCheckoutTerms, testTermsActive, type LegalRegistries } from '@/lib/legal/readiness';
import { companyIdentityGaps, COMPANY } from '@/lib/legal/company';
import { parseAcceptedVersions, sameVersions, versionsOf, type CheckoutTerms } from '@/lib/legal/booking-terms';
import { validateEnvironment, refusals } from '@/lib/config/environment';
import { getQuote, startBooking } from '@/lib/booking/service';
import { createLogger } from '@/lib/booking/logger';
import { CheckoutSummary, checkoutReady, ORDER_BUTTON_LABEL } from '@/components/booking/checkout-summary';
import type { BookingQuote } from '@/lib/booking/types';

const logger = createLogger();
const GUEST = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+49 000 000', locale: 'de' as const };
const STAY = { unitSlug: 'schulstrasse-i', checkIn: '2027-03-10', checkOut: '2027-03-12', adults: 2, children: 0 };

/** Registries as they will look once BoLaGio has approved everything. */
const APPROVED: LegalRegistries = {
  cancellation: [{ version: 'c-1', approvedAt: '2026-10-01', approvedBy: 'GF', text: { de: 'Storno DE', en: 'Cancel EN' } }],
  withdrawal: [{ version: 'w-1', approvedAt: '2026-10-01', approvedBy: 'GF', text: { de: 'Kein Widerrufsrecht DE', en: 'No withdrawal EN' }, maxNights: 28 }],
  agb: [{ version: 'a-1', approvedAt: '2026-10-01', approvedBy: 'GF', path: '/agb' }],
  privacy: [{ version: 'p-1', approvedAt: '2026-10-01', approvedBy: 'GF', path: '/datenschutz' }],
  price: [{ version: 'pr-1', confirmedAt: '2026-10-01', confirmedBy: 'GF', statement: { de: 'inkl. MwSt.', en: 'incl. VAT' }, onSiteCharges: [] }],
  company: {
    ...COMPANY,
    legalName: 'BoLaGio GmbH', street: 'Teststraße 1', postalCode: '95444', city: 'Bayreuth',
    managingDirectors: ['A. Beispiel'], registerCourt: 'Amtsgericht X', registerNumber: 'HRB 1',
    email: 'info@example.org', phone: '+49 000',
  },
};

beforeEach(() => {
  h.db = 0;
  h.providerPolicy = 'Provider-Text: kostenlos stornierbar';
  vi.stubEnv('APP_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

/* ── 1. the rules ───────────────────────────────────────────────────────── */

describe('legal readiness, with the registries as they are in the repository today', () => {
  it('names every missing approval — and the cancellation policy first', () => {
    const codes = bookingLegalGaps({ APP_ENV: 'production' }).map((g) => g.code);
    expect(codes).toEqual([
      'LEGAL_CANCELLATION_POLICY_UNAPPROVED',
      'LEGAL_WITHDRAWAL_NOTICE_UNAPPROVED',
      'LEGAL_BOOKING_TERMS_UNAPPROVED',
      'LEGAL_PRIVACY_NOTICE_UNAPPROVED',
      'LEGAL_PRICE_COMPLETENESS_UNCONFIRMED',
      'LEGAL_COMPANY_IDENTITY_INCOMPLETE',
    ]);
  });

  it('resolves NO checkout terms — never an invented fallback', () => {
    expect(resolveCheckoutTerms({ APP_ENV: 'production' })).toBeNull();
  });

  it('does not guess company facts: address, directors, register and email are gaps', () => {
    expect(companyIdentityGaps()).toEqual(['address', 'managingDirectors', 'register', 'email']);
  });
});

describe('legal readiness, once approved', () => {
  it('has no gap and resolves the newest approved version of each text', () => {
    expect(bookingLegalGaps({ APP_ENV: 'production' }, APPROVED)).toEqual([]);
    const terms = resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)!;
    expect(terms.cancellation).toEqual({ version: 'c-1', text: { de: 'Storno DE', en: 'Cancel EN' } });
    expect(terms.contractingParty).toBe('BoLaGio GmbH, Teststraße 1, 95444 Bayreuth');
    expect(terms.test).toBe(false);
  });

  it('treats an empty or whitespace-only cancellation text as unapproved', () => {
    const blank: LegalRegistries = {
      ...APPROVED,
      cancellation: [{ version: 'c-2', approvedAt: '2026-10-02', approvedBy: 'GF', text: { de: '  ', en: 'x' } }],
    };
    expect(bookingLegalGaps({ APP_ENV: 'production' }, blank).map((g) => g.code)).toContain('LEGAL_CANCELLATION_POLICY_UNAPPROVED');
    expect(resolveCheckoutTerms({ APP_ENV: 'production' }, blank)).toBeNull();
  });

  it('refuses a withdrawal notice that does not say how long a stay it covers', () => {
    const unbounded = { ...APPROVED, withdrawal: [{ ...APPROVED.withdrawal[0], maxNights: 0 }] };
    expect(bookingLegalGaps({ APP_ENV: 'production' }, unbounded).map((g) => g.code)).toEqual(['LEGAL_WITHDRAWAL_NOTICE_UNAPPROVED']);
  });
});

describe('the sandbox fixture', () => {
  it('is honoured on local and staging only', () => {
    expect(testTermsActive({ APP_ENV: 'staging', BOOKING_TEST_TERMS: 'true' })).toBe(true);
    expect(testTermsActive({ APP_ENV: 'local', BOOKING_TEST_TERMS: 'true' })).toBe(true);
    expect(testTermsActive({ APP_ENV: 'production', BOOKING_TEST_TERMS: 'true' })).toBe(false);
    expect(testTermsActive({ APP_ENV: 'preview', BOOKING_TEST_TERMS: 'true' })).toBe(false);
    expect(testTermsActive({ BOOKING_TEST_TERMS: 'true' })).toBe(false); // unset APP_ENV reads as production
  });

  it('is a REFUSAL on production, not merely ignored', () => {
    const codes = refusals(validateEnvironment({ APP_ENV: 'production', BOOKING_TEST_TERMS: 'true' })).map((f) => f.code);
    expect(codes).toContain('TEST_TERMS_OUTSIDE_STAGING');
  });

  it('labels itself as a test in both languages', () => {
    const terms = resolveCheckoutTerms({ APP_ENV: 'staging', BOOKING_TEST_TERMS: 'true' })!;
    expect(terms.test).toBe(true);
    expect(terms.cancellation.text.de).toMatch(/TESTBEDINGUNGEN/);
    expect(terms.cancellation.text.en).toMatch(/TEST TERMS/);
  });
});

describe('accepted-version evidence', () => {
  it('parses only a complete, well-formed versions object', () => {
    const v = { cancellation: 'c-1', withdrawal: 'w-1', agb: 'a-1', privacy: 'p-1', price: 'pr-1' };
    expect(parseAcceptedVersions(v)).toEqual(v);
    expect(parseAcceptedVersions({ ...v, agb: undefined })).toBeNull();
    expect(parseAcceptedVersions({ ...v, agb: 'x y' })).toBeNull();
    expect(parseAcceptedVersions('c-1')).toBeNull();
    expect(parseAcceptedVersions(null)).toBeNull();
  });

  it('compares every version, not just the cancellation policy', () => {
    const terms = resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)!;
    const shown = versionsOf(terms);
    expect(sameVersions(shown, shown)).toBe(true);
    expect(sameVersions(shown, { ...shown, agb: 'a-0' })).toBe(false);
  });
});

/* ── 2 + 3. the gate and the service ────────────────────────────────────── */

const COMPLETE_PRODUCTION = {
  DIRECT_BOOKING_ENABLED: 'true', PAYPAL_MODE: 'live', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's',
  PAYPAL_WEBHOOK_ID: 'w', BEDS24_MODE: 'live', BEDS24_REFRESH_TOKEN: 't', SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k', BOOKING_SYNC_SECRET: 'x',
};

function stubAll(values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) vi.stubEnv(k, v);
}

describe('the checkout cannot proceed without approved cancellation terms', () => {
  it('refuses a booking on a technically complete production deployment, before any database call', async () => {
    stubAll(COMPLETE_PRODUCTION);
    await expect(startBooking({ ...STAY, guest: GUEST }, logger)).rejects.toMatchObject({ code: 'booking_disabled' });
    expect(h.db).toBe(0);
  });

  it('never sends the provider’s cancellation text to the browser, and carries null terms instead', async () => {
    const quote = await getQuote(STAY, logger);
    expect(quote.cancellationPolicy).toBeUndefined();
    expect(JSON.stringify(quote)).not.toContain('Provider-Text');
    expect(quote.terms).toBeNull();
    expect(checkoutReady(quote)).toBe(false);
  });

  it('also carries null terms when the provider returned no policy at all (the original blocker)', async () => {
    h.providerPolicy = undefined;
    const quote = await getQuote(STAY, logger);
    expect(quote.terms).toBeNull();
    expect(checkoutReady(quote)).toBe(false);
  });

  it('refuses a booking whose shown term versions are missing or stale — before any database call', async () => {
    stubAll({ ...COMPLETE_PRODUCTION, APP_ENV: 'staging', PAYPAL_MODE: 'sandbox', BOOKING_TEST_TERMS: 'true' });
    await expect(startBooking({ ...STAY, guest: GUEST }, logger)).rejects.toMatchObject({ code: 'terms_changed' });
    await expect(
      startBooking({ ...STAY, guest: GUEST, acceptedTerms: { cancellation: 'old', withdrawal: 'test-fixture', agb: 'test-fixture', privacy: 'test-fixture', price: 'test-fixture' } }, logger)
    ).rejects.toMatchObject({ code: 'terms_changed' });
    expect(h.db).toBe(0);
  });

  it('passes the terms check with the exact versions shown (and only then reaches the database)', async () => {
    stubAll({ ...COMPLETE_PRODUCTION, APP_ENV: 'staging', PAYPAL_MODE: 'sandbox', BOOKING_TEST_TERMS: 'true' });
    const shown = versionsOf(resolveCheckoutTerms()!);
    await expect(startBooking({ ...STAY, guest: GUEST, acceptedTerms: shown }, logger)).rejects.toThrow(/database must not be reached/);
    expect(h.db).toBe(1);
  });

});

/* ── 4. the screen ──────────────────────────────────────────────────────── */

function quote(terms: CheckoutTerms | null): BookingQuote {
  return {
    ...STAY, nights: 2, currency: 'EUR', totalCents: 32000, expiresAt: '2030-01-01T00:00:00Z',
    components: [
      { code: 'accommodation', label: { de: 'Unterkunft · 2 Nächte', en: 'Accommodation · 2 nights' }, amountCents: 26000, mandatory: true },
      { code: 'fee:endreinigung', label: { de: 'Endreinigung', en: 'Final cleaning' }, amountCents: 6000, mandatory: true },
    ],
    terms,
  };
}

function render(props: Partial<Parameters<typeof CheckoutSummary>[0]>): string {
  return renderToStaticMarkup(
    createElement(CheckoutSummary, {
      locale: 'de', unitName: 'Schulstraße I', arrival: STAY.checkIn, departure: STAY.checkOut, nights: 2, guests: 2,
      quote: null, quoteLoading: false, bookable: true, ...props,
    })
  );
}

describe('the checkout summary', () => {
  it('renders the cancellation block even when no terms are approved — as the stated gap', () => {
    const html = render({ quote: quote(null) });
    expect(html).toContain('data-legal="cancellation"');
    expect(html).toContain('data-legal="terms-missing"');
    expect(html).toMatch(/Stornierungsbedingungen/);
    expect(html).toMatch(/nicht freigegeben/);
  });

  it('shows the AGB and privacy links in both states', () => {
    for (const terms of [null, resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)]) {
      const html = render({ quote: quote(terms) });
      expect(html).toMatch(/href="\/agb"/);
      expect(html).toMatch(/href="\/datenschutz"/);
    }
  });

  it('shows the approved cancellation text, withdrawal notice and contracting party when approved', () => {
    const html = render({ quote: quote(resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)) });
    expect(html).toContain('Storno DE');
    expect(html).toContain('Kein Widerrufsrecht DE');
    expect(html).toContain('BoLaGio GmbH, Teststraße 1, 95444 Bayreuth');
    expect(html).not.toContain('terms-missing');
  });

  it('shows every mandatory price component, the total and the price statement', () => {
    const html = render({ quote: quote(resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)) });
    expect(html).toContain('Unterkunft · 2 Nächte');
    expect(html).toContain('Endreinigung');
    expect(html).toMatch(/260,00\s*€/);
    expect(html).toMatch(/60,00\s*€/);
    expect(html).toMatch(/Gesamtpreis/);
    expect(html).toMatch(/320,00\s*€/);
    expect(html).toContain('inkl. MwSt.');
  });

  it('lists charges payable on site when the owners declared any', () => {
    const withCharges: LegalRegistries = {
      ...APPROVED,
      price: [{ ...APPROVED.price[0], onSiteCharges: [{ label: { de: 'Beispielabgabe', en: 'Example levy' }, amount: { de: '1 € pro Nacht', en: '€1 per night' } }] }],
    };
    const html = render({ quote: quote(resolveCheckoutTerms({ APP_ENV: 'production' }, withCharges)) });
    expect(html).toContain('Zusätzlich vor Ort zu zahlen');
    expect(html).toContain('Beispielabgabe: 1 € pro Nacht');
  });

  it('labels the sandbox fixture loudly', () => {
    const html = render({ quote: quote(resolveCheckoutTerms({ APP_ENV: 'staging', BOOKING_TEST_TERMS: 'true' })) });
    expect(html).toContain('data-legal="test-terms"');
  });

  it('renders the English version in English', () => {
    const html = render({ locale: 'en', quote: quote(resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)) });
    expect(html).toContain('Cancel EN');
    expect(html).toContain('No withdrawal EN');
    expect(html).toContain('Your contracting party');
  });

  it('contains no pre-ticked box and no marketing opt-in', () => {
    const html = render({ quote: quote(resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)) });
    expect(html).not.toMatch(/type="checkbox"/);
    expect(html).not.toMatch(/checked/);
  });
});

describe('the order button', () => {
  it('states the obligation to pay in its own words (§ 312j Abs. 3 BGB)', () => {
    expect(ORDER_BUTTON_LABEL.de).toBe('Zahlungspflichtig buchen');
    expect(ORDER_BUTTON_LABEL.en).toMatch(/pay/i);
  });

  it('is only offered for a quote that carries approved terms', () => {
    expect(checkoutReady(null)).toBe(false);
    expect(checkoutReady(quote(null))).toBe(false);
    expect(checkoutReady(quote(resolveCheckoutTerms({ APP_ENV: 'production' }, APPROVED)))).toBe(true);
  });
});
