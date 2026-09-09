'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM TRUST BADGE
 *
 * A small, scannable trust signal: the real Booking.com score, the real
 * review count, and a link to the real listing. One reusable component for
 * both places it appears (the homepage hero and /apartments), both reading
 * lib/content/booking-trust.ts — never two independently maintained copies
 * of the same number.
 *
 * ── Why it may render nothing ─────────────────────────────────────────────
 * No rating, review count or listing URL is currently verified (see the
 * long comment in lib/content/booking-trust.ts for why). Following the
 * convention already established in lib/content/brand.ts — an unverified
 * value is `null`, and every component treats `null` as "render nothing at
 * all" — this badge returns null unless a rating, a review count AND a URL
 * are all present. A badge with a number but no link, or a link with no
 * number, would be half a claim; this shows the whole one or none of it.
 *
 * ── Never a fake star rating ────────────────────────────────────────────
 * Booking.com's own scale is out of 10, and that is the number shown. It is
 * never converted into "X of 5 stars" — an 8.9 rendered as four and a half
 * gold stars would overstate what the score actually says. The one star
 * glyph here is decorative (a review/trust glyph, not a five-star row) and
 * sits beside the real number, never in place of it.
 *
 * ── No guest photographs ─────────────────────────────────────────────────
 * The 21st.dev reference this was adapted from uses a stack of overlapping
 * stock user photos. BoLaGio has no guest photographs to show and Booking.com
 * reviews carry no licence to reuse anyone's face, so the overlapping-circle
 * motif is rebuilt here as plain abstract tone-on-tone circles in the site's
 * own champagne palette — the layout of the reference, none of its content.
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 * A single CSS transform on hover/focus (see `.booking-trust-link` in
 * app/globals.css) — no JS animation, no new dependency. The site's global
 * `prefers-reduced-motion` rule already zeroes every transition duration, so
 * this needs no separate reduced-motion branch.
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

  // See the file header: a partial claim is not shown. All three or none.
  if (rating === null || reviewCount === null || url === null) return null;

  const ratingLabel = rating.toLocaleString(de ? 'de-DE' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const reviewCountLabel = reviewCount.toLocaleString(de ? 'de-DE' : 'en-US');

  const linkClass = invert ? 'booking-trust-link-invert' : 'booking-trust-link';
  const mutedColor = invert ? 'hsl(var(--on-dark-muted))' : 'hsl(var(--muted-foreground))';
  const strongColor = invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))';
  const goldColor = invert ? 'hsl(var(--on-dark-gold))' : 'hsl(var(--champagne-dark))';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${linkClass} group inline-flex items-center gap-4 px-4 py-3.5 sm:gap-5 sm:px-5 ${className}`}
      aria-label={
        de
          ? `Booking.com Bewertung ${ratingLabel} von 10, ${reviewCountLabel} verifizierte Bewertungen — Bewertungen auf Booking.com ansehen`
          : `Booking.com rating ${ratingLabel} out of 10, ${reviewCountLabel} verified reviews — view reviews on Booking.com`
      }
    >
      {/* Decorative overlapping circles — the reference's visual rhythm,
          none of its stock guest photography. */}
      <span className="relative hidden h-9 w-[54px] shrink-0 items-center sm:flex" aria-hidden="true">
        <span
          className="absolute left-0 h-8 w-8 rounded-full"
          style={{
            background: invert ? 'hsl(var(--on-dark) / 0.1)' : 'hsl(var(--champagne) / 0.22)',
            border: `1px solid ${invert ? 'hsl(var(--on-dark) / 0.2)' : 'hsl(var(--champagne) / 0.5)'}`,
          }}
        />
        <span
          className="absolute left-[13px] h-8 w-8 rounded-full"
          style={{
            background: invert ? 'hsl(var(--on-dark) / 0.14)' : 'hsl(var(--champagne) / 0.32)',
            border: `1px solid ${invert ? 'hsl(var(--on-dark) / 0.24)' : 'hsl(var(--champagne) / 0.55)'}`,
          }}
        />
        <span
          className="absolute left-[26px] flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            background: invert ? 'hsl(var(--on-dark) / 0.18)' : 'hsl(var(--champagne) / 0.42)',
            border: `1px solid ${invert ? 'hsl(var(--on-dark-gold) / 0.55)' : 'hsl(var(--champagne-dark) / 0.55)'}`,
          }}
        >
          <Star
            className="h-3.5 w-3.5"
            style={{ color: goldColor }}
            fill={goldColor}
            strokeWidth={0}
            aria-hidden="true"
          />
        </span>
      </span>

      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: mutedColor }}
          >
            Booking.com
          </span>
        </span>

        <span className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[20px] font-semibold leading-none" style={{ color: strongColor }}>
            {ratingLabel}
          </span>
          <span className="text-[13px]" style={{ color: mutedColor }}>
            / 10
          </span>
        </span>

        <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: mutedColor }}>
          {de
            ? `${reviewCountLabel} verifizierte Bewertungen`
            : `${reviewCountLabel} verified reviews`}
        </span>

        <span
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: goldColor }}
        >
          {de ? 'Bewertungen ansehen' : 'View reviews'}
          <span
            className="transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            →
          </span>
        </span>
      </span>
    </a>
  );
}
