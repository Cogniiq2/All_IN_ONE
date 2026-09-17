/**
 * A stable fingerprint of an authoritative quote.
 *
 * Two jobs, both about not silently charging the wrong amount:
 *
 *   • it is part of the PayPal create-order operation key, so a booking that
 *     was re-quoted to a different total gets a NEW provider order rather than
 *     reusing one priced at the old total;
 *   • it lets a later comparison establish "this is the same quote" without
 *     re-deriving the price and hoping the derivation is deterministic.
 *
 * Import-safe from a client component: a pure function over public fields.
 */

import type { BookingQuote } from '@/lib/booking/types';

export async function quoteHashOf(quote: BookingQuote): Promise<string> {
  const material = [
    quote.unitSlug,
    quote.checkIn,
    quote.checkOut,
    String(quote.adults),
    String(quote.children),
    quote.currency,
    String(quote.totalCents),
    // Component codes and amounts, sorted, so a reordered components array is
    // the same quote and a changed cleaning fee is not.
    quote.components
      .map((c) => `${c.code}=${c.amountCents}`)
      .sort()
      .join(','),
  ].join('|');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.prototype.slice
    .call(new Uint8Array(digest))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
