/**
 * The quote fingerprint.
 *
 * It is part of the PayPal create-order operation key, which means a bug here
 * has exactly one consequence worth caring about: a re-quoted booking silently
 * reusing a provider order priced at the OLD total.
 */

import { describe, expect, it } from 'vitest';
import { quoteHashOf } from '@/lib/booking/quote-hash';
import type { BookingQuote } from '@/lib/booking/types';

function quote(overrides: Partial<BookingQuote> = {}): BookingQuote {
  return {
    unitSlug: 'schulstrasse-i',
    checkIn: '2026-10-20',
    checkOut: '2026-10-23',
    nights: 3,
    adults: 2,
    children: 0,
    currency: 'EUR',
    totalCents: 42500,
    components: [
      { code: 'accommodation', label: { de: 'a', en: 'a' }, amountCents: 38000, mandatory: true },
      { code: 'fee:cleaning', label: { de: 'b', en: 'b' }, amountCents: 4500, mandatory: true },
    ],
    expiresAt: '2026-09-17T12:20:00Z',
    ...overrides,
  };
}

describe('stability', () => {
  it('is the same for the same quote', async () => {
    expect(await quoteHashOf(quote())).toBe(await quoteHashOf(quote()));
  });

  it('ignores component ORDER', async () => {
    // A provider that returns its lines in a different order has not changed
    // the price, and forcing a new payment order would be pure friction.
    const reordered = quote({ components: [...quote().components].reverse() });
    expect(await quoteHashOf(reordered)).toBe(await quoteHashOf(quote()));
  });

  it('ignores the expiry, which moves on every re-quote', async () => {
    expect(await quoteHashOf(quote({ expiresAt: '2030-01-01T00:00:00Z' }))).toBe(
      await quoteHashOf(quote())
    );
  });

  it('ignores the labels, which are presentation', async () => {
    const relabelled = quote({
      components: quote().components.map((c) => ({ ...c, label: { de: 'x', en: 'y' } })),
    });
    expect(await quoteHashOf(relabelled)).toBe(await quoteHashOf(quote()));
  });
});

describe('sensitivity', () => {
  it.each([
    ['total', quote({ totalCents: 42600 })],
    ['currency', quote({ currency: 'CHF' })],
    ['check-in', quote({ checkIn: '2026-10-21' })],
    ['check-out', quote({ checkOut: '2026-10-24' })],
    ['adults', quote({ adults: 3 })],
    ['children', quote({ children: 1 })],
    ['unit', quote({ unitSlug: 'schulstrasse-ii' })],
    [
      'a component amount',
      quote({
        components: [
          { code: 'accommodation', label: { de: 'a', en: 'a' }, amountCents: 38000, mandatory: true },
          { code: 'fee:cleaning', label: { de: 'b', en: 'b' }, amountCents: 5500, mandatory: true },
        ],
      }),
    ],
  ])('changes when the %s changes', async (_what, altered) => {
    expect(await quoteHashOf(altered)).not.toBe(await quoteHashOf(quote()));
  });
});

describe('shape', () => {
  it('is short, hex and safe in an operation key', async () => {
    // It ends up inside a PayPal-Request-Id, which is length-limited.
    const hash = await quoteHashOf(quote());
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});
