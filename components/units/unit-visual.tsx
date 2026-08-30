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
 */

import { useEffect, useRef, useState } from 'react';
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
}: {
  image?: TempImage;
  street: string;
  commercial?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const { locale } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  /*
   * A cached image can finish loading before React attaches its onLoad
   * handler during hydration, in which case the event never fires and the
   * photograph would stay invisible. Checking `complete` on mount closes that
   * race, which is the difference between a nice touch and a broken page on a
   * repeat visit.
   */
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  if (image) {
    return (
      <div className={`relative overflow-hidden bg-secondary ${className}`}>
        {/*
          A photograph that snaps in at full opacity the instant it decodes is
          the cheapest-looking moment on any site. It now resolves out of the
          warm card ground over 700ms, and lifts the last 1.5% of scale as it
          does, so the image looks like it settles into the frame.

          `onLoad` fires for cached images too, so a repeat visit is not left
          permanently transparent. `priority` images are still fetched first —
          this only governs how they appear, never when they load, so LCP is
          untouched.
        */}
        <Image
          src={image.src}
          alt={image.alt[locale]}
          fill
          priority={priority}
          sizes={sizes}
          ref={imgRef}
          onLoad={() => setLoaded(true)}
          className="img-resolve object-cover"
          data-loaded={loaded ? 'true' : undefined}
        />
        <span className="ref-badge absolute bottom-3 right-3">
          {REFERENCE_IMAGE_LABEL[locale]}
        </span>
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

      {/* Never let a drawing be mistaken for a photograph of the unit. */}
      <span className="ref-badge absolute bottom-3 right-3">
        {locale === 'de' ? 'Foto folgt' : 'Photo to follow'}
      </span>
    </div>
  );
}
