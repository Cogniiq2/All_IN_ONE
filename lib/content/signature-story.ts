/**
 * ══════════════════════════════════════════════════════════════════════════
 * "VON DER FASSADE ZUM AUFENTHALT" — the homepage signature story
 *
 * Two chapters, one per building, each carrying only the media that building
 * genuinely has. Nothing here is a new asset: every path is resolved from a
 * canonical source that already exists —
 *
 *   the elevation   lib/content/buildings.ts  (the same drawing the About
 *                   procession uses; not regenerated, not duplicated)
 *   the floor plan  lib/content/property-media.ts → `floorPlan`
 *   the interior    lib/content/property-media.ts → `verifiedCoverFor`
 *   the destination the unit's own /apartments/[slug] route
 *
 * so a chapter cannot drift from the gallery, the cards or the procession.
 *
 * ── Why one chapter is shorter than the other ────────────────────────────
 * Schulstraße I has a verified floor plan and verified photography, so its
 * chapter runs the full way: façade → plan → room → CTA.
 *
 * Opernstraße has NEITHER. The only Opernstraße asset in this repository is
 * its elevation drawing — there is no floor plan and not one photograph, in
 * public/media/ or in assets/property-originals/. Its chapter therefore ends
 * where the evidence ends: the façade is traced, then held, then released.
 * It carries no floor-plan beat, no interior beat, and no "discover the
 * apartment" CTA, because there is no apartment visual to discover yet and a
 * CTA promising one would be the same lie as a borrowed photograph.
 *
 * Every alternative was rejected on the same grounds: a Schulstraße room
 * standing in for an Opernstraße one, a drawn plan, a stock interior, or a
 * reference image presented as real photography.
 *
 * `status` carries the distinction and the component branches on it, never on
 * a slug. On the day the photography arrives, dropping it into
 * assets/property-originals/opernstrasse-i/ and running the existing
 * generator promotes the chapter to 'complete' automatically — the beats and
 * the CTA appear with no change to this file and none to the component.
 *
 * NEEDS CONFIRMATION — Opernstraße floor plan and interior photography.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { getApartment, type Locale } from '@/lib/content/apartments';
import { buildingById } from '@/lib/content/buildings';
import type { PortfolioBuilding } from '@/lib/content/portfolio';
import { imageAlt, propertyMediaFor, verifiedCoverFor } from '@/lib/content/property-media';

export interface StoryImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface StoryChapter {
  id: string;
  /** The building's public label — "Schulstraße 1". */
  title: string;
  /** The building's elevation. Every chapter has one; it is the only certainty. */
  elevation: PortfolioBuilding;
  unitSlug: string;
  unitName: string;
  /** Present only when verified. Absent means absent — never substituted. */
  floorPlan?: StoryImage;
  interior?: StoryImage;
  /**
   * Where "Apartment entdecken" leads, and undefined when there is nothing to
   * lead to yet. A chapter without a plan and a room gets no CTA at all.
   */
  href?: string;
  /**
   * 'complete'             façade → plan → room → CTA.
   * 'awaiting-photography' façade, traced and held. Nothing further is shown
   *                        and nothing further is promised.
   */
  status: 'complete' | 'awaiting-photography';
}

/**
 * Builds a chapter from a unit slug, taking only what is verified.
 *
 * A unit with no verified media yields a façade-only chapter automatically —
 * the absence of photography is detected here, never assumed by a caller.
 */
function chapter(buildingId: string, unitSlug: string, locale: Locale): StoryChapter | undefined {
  const building = buildingById(buildingId);
  const unit = getApartment(unitSlug);
  if (!building?.cover || !unit) return undefined;

  const media = propertyMediaFor(unitSlug);
  const planImage = media?.floorPlan?.images[0];
  const coverImage = verifiedCoverFor(unitSlug);
  const coverSection =
    media && coverImage
      ? media.sectionOf[media.all.findIndex((image) => image.src === coverImage.src)]
      : undefined;

  const floorPlan: StoryImage | undefined =
    planImage && media?.floorPlan
      ? {
          src: planImage.src,
          width: planImage.width,
          height: planImage.height,
          alt: imageAlt(media.floorPlan, unit, locale),
        }
      : undefined;

  const interior: StoryImage | undefined =
    coverImage && coverSection
      ? {
          src: coverImage.src,
          width: coverImage.width,
          height: coverImage.height,
          alt: imageAlt(coverSection, unit, locale),
        }
      : undefined;

  // Both, or neither. Half a journey is not a journey, and a CTA on top of
  // half a journey promises the half that is missing.
  const complete = floorPlan !== undefined && interior !== undefined;

  return {
    id: buildingId,
    title: building.publicName,
    elevation: building.cover,
    unitSlug,
    unitName: unit.name[locale],
    floorPlan: complete ? floorPlan : undefined,
    interior: complete ? interior : undefined,
    href: complete ? `/apartments/${unitSlug}` : undefined,
    status: complete ? 'complete' : 'awaiting-photography',
  };
}

/**
 * The two chapters, in scroll order.
 *
 * Schulstraße I and Opernstraße I are the first apartment of each building.
 * There is no "featured" flag in the inventory to defer to, and the first unit
 * is the one the rest of the site already leads with.
 */
export function signatureChapters(locale: Locale): StoryChapter[] {
  return [
    chapter('schulstrasse', 'schulstrasse-i', locale),
    chapter('opernstrasse', 'opernstrasse-i', locale),
  ].filter((entry): entry is StoryChapter => entry !== undefined);
}
