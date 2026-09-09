/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM TRUST DATA — the one canonical source.
 *
 * The homepage and /apartments both render the same compact trust badge, and
 * both must read it from here — never a second, independently-typed copy of
 * the rating in either file.
 *
 * ── Scope: Schulstraße only ───────────────────────────────────────────────
 * rating and reviewCount are verified, owner-supplied Booking.com figures
 * for the two Schulstraße apartments only:
 *   - Schulstraße I:  8.9 rating, 37 reviews
 *   - Schulstraße II: 8.9 rating, 35 reviews
 *   - combined:       8.9 rating, 72 reviews (37 + 35)
 * This does NOT cover Opernstraße or "all BoLaGio apartments" — the badge's
 * copy must keep naming Schulstraße explicitly rather than using an
 * unqualified "Booking.com" label, so nothing here overstates its scope.
 * Do not fold in any other number without the same verification.
 *
 * This is not the first time a number like this was invented and had to be
 * removed: see the header comment in components/shared/json-ld.tsx — a
 * previous version of this site published a fabricated 9.4-from-48-reviews
 * `AggregateRating`, which is misleading advertising under UWG §5/§5b and
 * grounds for a Google manual action. Nothing here repeats that.
 *
 * ── url still needs confirmation ─────────────────────────────────────────
 * BOOKING REVIEW URL NEEDS CONFIRMATION. No real Booking.com listing URL has
 * been supplied yet, so `url` stays `null` — following the convention
 * already established in lib/content/brand.ts, an unverified value is
 * `null`, and it is never guessed or constructed from a slug. The badge
 * still renders with the verified rating/count; it just isn't a link until
 * a real URL is set here.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface BookingTrust {
  /** Out of 10, e.g. 8.9. Booking.com's own scale — never converted to stars. */
  rating: number | null;
  reviewCount: number | null;
  /** The real Booking.com listing page. Never a guessed or constructed URL. */
  url: string | null;
}

export const bookingTrust: BookingTrust = {
  rating: 8.9,
  reviewCount: 72,
  url: null,
};

/**
 * Whether the badge has anything truthful to show. A caller wrapping
 * `<BookingTrustBadge />` in its own spacing/entrance-animation element (the
 * hero, /apartments) checks this first, so that element does not render an
 * empty wrapper — with its own margin — around nothing. The listing `url`
 * is not required here: once it exists the badge becomes a link, but the
 * rating and review count alone are already a truthful, complete claim.
 */
export function hasBookingTrust(): boolean {
  return bookingTrust.rating !== null && bookingTrust.reviewCount !== null;
}
