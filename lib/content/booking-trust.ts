/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM TRUST DATA — the one canonical source.
 *
 * The homepage and /apartments both render the same compact trust badge, and
 * both must read it from here — never a second, independently-typed copy of
 * the rating in either file.
 *
 * ── Why every field is `null` right now ──────────────────────────────────
 * No Booking.com aggregate rating, review count or listing URL is verified
 * anywhere in this repository. The owners' Booking.com listing exists (see
 * lib/content/property-facts.ts, whose amenity lists were sourced from it),
 * but no rating, no review count and no listing URL for it is recorded
 * anywhere — and `AVAILABILITY_SOURCE` in lib/booking/availability.ts
 * confirms Booking.com onboarding is still pending, so there is no connected
 * feed this could be read from automatically either.
 *
 * This is not the first time a number like this was invented and had to be
 * removed: see the header comment in components/shared/json-ld.tsx — a
 * previous version of this site published a fabricated 9.4-from-48-reviews
 * `AggregateRating`, which is misleading advertising under UWG §5/§5b and
 * grounds for a Google manual action. Nothing here repeats that.
 *
 * Following the convention already established in lib/content/brand.ts:
 * a value that is not verified is `null`, and every component that reads
 * this file treats `null` as "render nothing" — never a placeholder, a
 * dash, or an invented number.
 *
 * BOOKING RATING NEEDS CONFIRMATION.
 * BOOKING REVIEW COUNT NEEDS CONFIRMATION.
 * BOOKING REVIEW URL NEEDS CONFIRMATION.
 *
 * ── Filling this in later ─────────────────────────────────────────────────
 * Once the owners supply the real, current numbers from Booking.com's own
 * partner dashboard (not a screenshot, not a guess), set the three fields
 * below and both the homepage and /apartments will show the trust badge
 * immediately — no other file needs to change.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 * If and when a rating is supplied, confirm whether it covers the
 * Schulstraße listing only or the whole BoLaGio Booking.com presence before
 * publishing it — the wording below ("Booking.com" with no qualifier) is
 * only accurate if the scope is the whole presence. A listing-specific score
 * needs a listing-specific label (e.g. "Booking.com · Schulstraße") rather
 * than the current unqualified one.
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
  rating: null,
  reviewCount: null,
  url: null,
};

/**
 * Whether the badge has anything truthful to show. A caller wrapping
 * `<BookingTrustBadge />` in its own spacing/entrance-animation element (the
 * hero, /apartments) checks this first, so that element does not render an
 * empty wrapper — with its own margin — around nothing.
 */
export function hasBookingTrust(): boolean {
  return bookingTrust.rating !== null && bookingTrust.reviewCount !== null && bookingTrust.url !== null;
}
