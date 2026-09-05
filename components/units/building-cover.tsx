'use client';

/**
 * A building's own elevation, used as a card cover.
 *
 * ── What this is, and what it is not ─────────────────────────────────────
 * It is the architectural drawing of the OUTSIDE of the building, the same
 * one the About page's procession shows. It is not a photograph and is not
 * offered as one: the drawing is contained rather than cropped, it sits on
 * the brand's own ground, and it carries a visible marker saying a photograph
 * is still to come. A visitor can see at a glance that they are looking at a
 * drawing of a façade, not into a room.
 *
 * That distinction is the reason this exists at all. A card with an empty
 * cover looks unfinished; a card carrying a stock interior would be a false
 * depiction of a specific flat. An elevation of the building the flat is
 * actually in is true, is ours, and is already on the site.
 *
 * ── Where the drawing comes from ─────────────────────────────────────────
 * `lib/content/buildings.ts` decides which drawing belongs to which building.
 * A building with none — Tunnelstraße today — passes `cover: undefined` and
 * gets the plain ground below, never another building's drawing.
 */

import Image from 'next/image';
import { useI18n } from '@/lib/i18n';
import type { PortfolioBuilding } from '@/lib/content/portfolio';
import { publicAltFor } from '@/lib/content/portfolio-labels';

/** The neutral ground, shared by both states so they are one treatment. */
const GROUND =
  'linear-gradient(158deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 58%, hsl(var(--stone) / 0.55) 100%)';

export function BuildingCover({
  cover,
  buildingName,
  className = '',
  priority = false,
  /** Off wherever the card is not a control. */
  zoomOnHover = true,
}: {
  cover?: PortfolioBuilding;
  buildingName: string;
  className?: string;
  priority?: boolean;
  zoomOnHover?: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: GROUND }}
      role={cover ? undefined : 'img'}
      aria-label={
        cover
          ? undefined
          : de
          ? `Illustration statt Foto — ${buildingName}`
          : `Illustration in place of a photograph — ${buildingName}`
      }
    >
      {cover && (
        <Image
          src={cover.image}
          alt={publicAltFor(cover, locale)}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, 420px"
          /*
            Contained, never cropped. These are drawings of whole buildings —
            a 4:3 crop would cut the roof off one and the ground line off
            another, and a stretched façade is worse than a small one.

            The asymmetric padding is doing real work: it holds the drawing
            clear of the status badge above it and, more importantly, above
            the caption below, so the façade never has type printed across
            its ground floor.
          */
          className={`object-contain px-6 pb-[4.75rem] pt-9 transition-transform duration-[900ms]
                      ease-[cubic-bezier(0.22,1,0.36,1)]
                      ${zoomOnHover ? 'group-hover:scale-[1.03]' : ''}`}
        />
      )}

      {/* The building, and an unambiguous statement that this is not a room. */}
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p
          className="font-serif text-[19px] leading-tight"
          style={{ color: 'hsl(var(--champagne-dark))' }}
        >
          {buildingName}
        </p>
        <p
          className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {de ? 'Foto folgt' : 'Photograph to follow'}
        </p>
      </div>
    </div>
  );
}
