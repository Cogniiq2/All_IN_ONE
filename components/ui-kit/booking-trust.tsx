'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM TRUST BADGE — Schulstraße
 *
 * A quiet, horizontal social-proof strip, not a card: three overlapping
 * abstract circles, a hairline divider, then a decorative star row over the
 * real Booking.com score and review count. One reusable component for both
 * places it appears (the homepage hero and /apartments), both reading
 * lib/content/booking-trust.ts — never two independently maintained copies
 * of the same number.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 * The verified rating and review count cover the two Schulstraße apartments
 * only (see the header comment in lib/content/booking-trust.ts), so the
 * label always reads "Booking.com · Schulstraße" — never an unqualified
 * "Booking.com" that would read as covering every BoLaGio property.
 *
 * ── "reviews on Booking.com", not "verified reviews" (2026-09-23) ───────
 * Calling them "verified" is a claim about how the reviews were checked.
 * § 5b Abs. 3 UWG then requires BoLaGio to explain whether and how it ensures
 * they come from real guests, and BoLaGio does not collect or check them
 * itself; Booking.com does. The label now states only where the reviews come
 * from. Whether to add a verification sentence is in LEGAL_REVIEW_REQUIRED.md.
 *
 * ── Never a fake star rating ────────────────────────────────────────────
 * Booking.com's own scale is out of 10, and that real number — "8,9" — is
 * always the value shown, never converted into a star count. The star row
 * here is a fixed, fully-filled decorative trust indicator (the layout
 * rhythm of a star rating), not a rendering of the score itself.
 *
 * ── No guest photographs ─────────────────────────────────────────────────
 * The overlapping-circle motif is rebuilt as plain abstract tone-on-tone
 * circles in the site's own champagne palette — no stock or guest photos,
 * no external image requests.
 *
 * ── Link vs. no link ──────────────────────────────────────────────────────
 * A real Booking.com listing URL has not been supplied yet (`url` is
 * `null` — see lib/content/booking-trust.ts). Until it is, this renders as
 * a plain, non-interactive strip rather than inventing or guessing a URL.
 * The moment a real URL is set, it becomes a clickable link automatically —
 * no other file needs to change.
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 * A single CSS transform on hover/focus when it is a link (see
 * `.booking-trust-strip` in app/globals.css) — no JS animation, no new
 * dependency. The site's global `prefers-reduced-motion` rule already
 * zeroes every transition duration.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { Star } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { bookingTrust } from '@/lib/content/booking-trust';

export function BookingTrustBadge({
  /** The hero sits on a dark photograph; /apartments sits on the cream page. */
  invert = false,
  className = '',
}: {
  invert?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { rating, reviewCount, url } = bookingTrust;

  // See the file header: a partial claim is not shown.
  if (rating === null || reviewCount === null) return null;

  const ratingLabel = rating.toLocaleString(de ? 'de-DE' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const reviewCountLabel = reviewCount.toLocaleString(de ? 'de-DE' : 'en-US');

  const stripClass = invert ? 'booking-trust-strip-invert' : 'booking-trust-strip';
  const mutedColor = invert ? 'hsl(var(--on-dark-muted))' : 'hsl(var(--muted-foreground))';
  const strongColor = invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))';
  const goldColor = invert ? 'hsl(var(--on-dark-gold))' : 'hsl(var(--champagne-dark))';

  const ariaLabel = de
    ? `Booking.com Bewertung Schulstraße: ${ratingLabel} von 10, ${reviewCountLabel} Bewertungen auf Booking.com${
        url ? ' — Bewertungen auf Booking.com ansehen' : ''
      }`
    : `Booking.com rating for Schulstraße: ${ratingLabel} out of 10, ${reviewCountLabel} reviews on Booking.com${
        url ? ' — view reviews on Booking.com' : ''
      }`;

  const content = (
    <>
      {/* Overlapping abstract circles — the reference's visual rhythm,
          none of its stock guest photography. */}
      <span className="relative flex h-7 w-[44px] shrink-0 items-center" aria-hidden="true">
        <span
          className="absolute left-0 h-6 w-6 rounded-full"
          style={{
            background: invert ? 'hsl(var(--on-dark) / 0.14)' : 'hsl(var(--champagne) / 0.32)',
          }}
        />
        <span
          className="absolute left-[10px] h-6 w-6 rounded-full"
          style={{
            background: invert ? 'hsl(var(--on-dark) / 0.2)' : 'hsl(var(--champagne) / 0.46)',
          }}
        />
        <span
          className="absolute left-[20px] h-6 w-6 rounded-full"
          style={{
            background: invert ? 'hsl(var(--on-dark) / 0.26)' : 'hsl(var(--champagne) / 0.6)',
          }}
        />
      </span>

      {/* Hairline divider — no box, no background, just a quiet separator. */}
      <span
        className="h-7 w-px shrink-0"
        style={{ background: invert ? 'hsl(var(--on-dark) / 0.22)' : 'hsl(var(--border))' }}
        aria-hidden="true"
      />

      <span className="min-w-0">
        {/* Decorative star row — a trust-indicator rhythm only, not the score. */}
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="h-3 w-3"
              style={{ color: goldColor }}
              fill={goldColor}
              strokeWidth={0}
            />
          ))}
        </span>

        <span className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[16px] font-semibold leading-none" style={{ color: strongColor }}>
            {ratingLabel}
          </span>
          <span className="text-[12px] leading-none" style={{ color: mutedColor }}>
            {de
              ? `${reviewCountLabel} Bewertungen auf Booking.com`
              : `${reviewCountLabel} reviews on Booking.com`}
          </span>
        </span>

        <span
          className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: mutedColor }}
        >
          {de ? 'Booking.com · Schulstraße' : 'Booking.com · Schulstraße'}
        </span>
      </span>
    </>
  );

  const sharedClass = `${stripClass} inline-flex items-center gap-3.5 ${className}`;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${sharedClass} group`}
        aria-label={ariaLabel}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={sharedClass} role="img" aria-label={ariaLabel}>
      {content}
    </div>
  );
}
