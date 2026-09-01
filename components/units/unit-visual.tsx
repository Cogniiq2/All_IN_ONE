'use client';

/**
 * The image area of a unit card and of the detail view.
 *
 * Two states, and the second is not a fallback for a broken image — it is the
 * honest presentation for a unit we have no photograph of:
 *
 *   with photography  the frame, plus the "Referenzbild" marker while the
 *                     images are still provisional;
 *   without           a composed architectural panel — a drawn elevation in
 *                     brand tones, with the street name set in the serif.
 *
 * The commercial units have no photographs. Dropping a residential interior on
 * a shop unit would be a false depiction rather than a placeholder, so they get
 * the panel until real photography exists. It is drawn to be worth looking at,
 * so a card without a photograph still holds its place in the grid.
 *
 * ── Where the provenance marker is shown ─────────────────────────────────
 * `showBadge` decides whether the corner marker is painted. Listing cards pass
 * `false`: a grid of tiles each wearing a dark chip reads as a watermarked
 * stock sheet rather than a collection, and the marker is repeated five times
 * before anyone has looked at anything.
 *
 * It is turned off on the card ONLY — never on a surface where the image is
 * actually being examined. Open the unit and the marker is there on the large
 * image, with the full note under the copy; the same is true of the gallery on
 * an apartment page and of the hero. The registry itself
 * (lib/content/media.ts) is untouched: the provenance is still recorded and
 * still displayed, one tap from every card.
 *
 * The drawn panel keeps its `role="img"` and its aria-label naming it an
 * illustration in every case, so nothing is presented to assistive technology
 * as a photograph of the unit.
 */

import Image from 'next/image';
import { useI18n } from '@/lib/i18n';
import { REFERENCE_IMAGE_LABEL, type TempImage } from '@/lib/content/media';

export function UnitVisual({
  image,
  street,
  commercial = false,
  priority = false,
  sizes = '(max-width: 768px) 100vw, 420px',
  className = '',
  /** Corner provenance marker. Off on listing cards, on everywhere else. */
  showBadge = true,
}: {
  image?: TempImage;
  street: string;
  commercial?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
  showBadge?: boolean;
}) {
  const { locale } = useI18n();

  if (image) {
    return (
      <div className={`relative overflow-hidden bg-secondary ${className}`}>
        <Image
          src={image.src}
          alt={image.alt[locale]}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                     group-hover:scale-[1.04]"
        />
        {showBadge && (
          <span className="ref-badge absolute bottom-3 right-3">
            {REFERENCE_IMAGE_LABEL[locale]}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background:
          'linear-gradient(158deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 58%, hsl(var(--stone) / 0.55) 100%)',
      }}
      role="img"
      aria-label={
        locale === 'de'
          ? `Illustration statt Foto — ${street}`
          : `Illustration in place of a photograph — ${street}`
      }
    >
      {/* A shopfront elevation: fascia, two display windows, a door. */}
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 h-full w-full transition-transform duration-[900ms]
                   ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
        aria-hidden="true"
      >
        <g
          fill="none"
          stroke="hsl(var(--champagne-dark))"
          strokeWidth="1.1"
          opacity="0.55"
          vectorEffect="non-scaling-stroke"
        >
          <path d="M52 300V128h296v172" />
          <path d="M40 128h320" strokeWidth="1.6" />
          <path d="M52 112h296" opacity="0.5" />
          <rect x="78" y="158" width="94" height="92" />
          <rect x="228" y="158" width="94" height="92" />
          <path d="M78 204h94M228 204h94" opacity="0.4" />
          <path d="M125 158v92M275 158v92" opacity="0.4" />
          <rect x="182" y="176" width="36" height="124" />
          <circle cx="211" cy="240" r="2.4" fill="hsl(var(--champagne-dark))" stroke="none" />
        </g>
        <path d="M0 300h400" stroke="hsl(var(--champagne-dark))" strokeWidth="2" opacity="0.35" />
      </svg>

      <div className="absolute inset-x-0 bottom-0 p-5">
        <p
          className="font-serif text-[19px] leading-tight"
          style={{ color: 'hsl(var(--champagne-dark))' }}
        >
          {street}
        </p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em]"
           style={{ color: 'hsl(var(--muted-foreground))' }}>
          {commercial
            ? locale === 'de' ? 'Erdgeschoss' : 'Ground floor'
            : locale === 'de' ? 'Bayreuth' : 'Bayreuth'}
        </p>
      </div>

      {/* Never let a drawing be mistaken for a photograph of the unit. The
          aria-label above says so in every case; the visible chip is dropped on
          listing cards for the same reason as the photographic one. */}
      {showBadge && (
        <span className="ref-badge absolute bottom-3 right-3">
          {locale === 'de' ? 'Foto folgt' : 'Photo to follow'}
        </span>
      )}
    </div>
  );
}
