/**
 * ══════════════════════════════════════════════════════════════════════════
 * VERIFIED PROPERTY PHOTOGRAPHY
 *
 * Real photographs of real units, filed room by room. This is the counterpart
 * to lib/content/media.ts: that file holds the provisional reference imagery a
 * unit borrows until it has photography of its own, this one holds the real
 * thing, and a unit is in exactly one of those two states.
 *
 * Three properties have photography today — the two Schulstraße flats and the
 * Schulstraße commercial unit. Every Opernstraße unit is still on reference
 * imagery, keeps its "Referenzbild" marker, and shows no gallery at all: an
 * empty room heading would be worse than no gallery, and borrowing a
 * Schulstraße photograph for an Opernstraße flat would be a false depiction of
 * a specific apartment.
 *
 * ── The shape of it ──────────────────────────────────────────────────────
 *
 *     public/images/properties/<property>/<NN-section>/<file>
 *                 │                │
 *                 │                └── a gallery section, in folder order
 *                 └── keyed to a unit slug by PROPERTY_OF_SLUG below
 *
 * The file list itself is generated (property-media.generated.ts) by
 * scripts/build-property-media.mjs, which reads the real dimensions and EXIF
 * orientation out of each file and drops photographs filed twice. Nothing here
 * is typed by hand, so a photograph cannot go missing through a transcription
 * slip.
 *
 * ── One unit, one gallery ────────────────────────────────────────────────
 * A Schulstraße flat is offered both as accommodation and, case by case, on a
 * tenancy. It is the same flat, so it has one gallery, resolved from its slug
 * wherever it appears — the homepage, /apartments, /mieten, its own page. No
 * surface owns a copy of the list, and no component branches on a slug.
 *
 * ── Adding a building ────────────────────────────────────────────────────
 * Drop the folders under public/images/properties/, add a line to
 * PROPERTY_OF_SLUG, add any new section id to SECTION_LABELS (or don't — an
 * unknown folder falls back to a readable label), and run the generator. No
 * component changes.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Locale, Localized, RentalUnit } from '@/lib/content/apartments';
import { galleryFor } from '@/lib/content/apartments';
import { rawPropertyMedia } from '@/lib/content/property-media.generated';

/** What the generator emits. Dimensions are as displayed, EXIF applied. */
export interface RawPropertyImage {
  src: string;
  width: number;
  height: number;
}

export interface RawPropertySection {
  id: string;
  images: RawPropertyImage[];
}

export interface RawPropertyMedia {
  sections: RawPropertySection[];
}

/** A section of the gallery, with its label resolved for display. */
export interface GallerySection {
  id: string;
  label: Localized;
  images: RawPropertyImage[];
}

export interface PropertyMedia {
  /** Room sections, in folder order. Never contains the floor plan. */
  sections: GallerySection[];
  /** Always rendered last, and only when the property has one. */
  floorPlan?: GallerySection;
  /** Every gallery image in reading order, floor plan included. */
  all: RawPropertyImage[];
  /** The section each image in `all` belongs to, by the same index. */
  sectionOf: GallerySection[];
}

/**
 * Which folder holds which unit's photography.
 *
 * Explicit rather than derived from the slug: the folder names came from the
 * owners and do not all match the slugs we publish ("gewerbe-schulstrasse" is
 * the unit "schulstrasse-gewerbeflaeche"). One line per unit, and a unit
 * without a line simply has no photography yet.
 */
const PROPERTY_OF_SLUG: Record<string, string> = {
  'schulstrasse-i': 'schulstrasse-i',
  'schulstrasse-ii': 'schulstrasse-ii',
  'schulstrasse-gewerbeflaeche': 'gewerbe-schulstrasse',
  // Opernstraße I, II, III and the Opernstraße commercial unit are absent on
  // purpose. Their photography is expected later; until it exists they keep
  // their reference imagery and show no gallery.
};

/** The section that always sorts last and is presented on its own. */
const FLOOR_PLAN_SECTION = '99-grundriss';

/**
 * Room and area names, by folder id.
 *
 * Residential and commercial names live in one table because a folder id is
 * unique across both and a commercial unit must never be described in
 * residential terms — "Hauptraum", not "Wohnzimmer".
 */
const SECTION_LABELS: Record<string, Localized> = {
  // ── Residential ────────────────────────────────────────────────────────
  '01-wohnzimmer': { de: 'Wohnzimmer', en: 'Living room' },
  '02-kueche': { de: 'Küche', en: 'Kitchen' },
  '03-schlafzimmer-1': { de: 'Schlafzimmer 1', en: 'Bedroom 1' },
  '04-schlafzimmer-2': { de: 'Schlafzimmer 2', en: 'Bedroom 2' },
  '05-balkon': { de: 'Balkon', en: 'Balcony' },
  '05-dachterrasse': { de: 'Dachterrasse', en: 'Roof terrace' },
  '06-badezimmer': { de: 'Badezimmer', en: 'Bathroom' },
  '07-vorraum-aufzug': { de: 'Eingangsbereich & Aufzug', en: 'Entrance & lift' },
  '08-details': { de: 'Details', en: 'Details' },
  // ── Commercial ─────────────────────────────────────────────────────────
  '01-aussenansicht-schaufenster': {
    de: 'Außenansicht & Schaufenster',
    en: 'Exterior & shopfront',
  },
  '02-hauptraum': { de: 'Hauptraum', en: 'Main room' },
  '03-loungebereich': { de: 'Loungebereich', en: 'Lounge area' },
  '04-kuechen-thekenbereich': { de: 'Küchen- & Thekenbereich', en: 'Kitchen & counter area' },
  '05-details': { de: 'Details', en: 'Details' },
  // ── Both ───────────────────────────────────────────────────────────────
  [FLOOR_PLAN_SECTION]: { de: 'Grundriss & Raumaufteilung', en: 'Floor plan & layout' },
};

/**
 * A readable label for a folder nobody has named yet.
 *
 * "10-dachboden" becomes "Dachboden" rather than the raw folder name, so a new
 * section added with the photography still reads properly before anyone
 * touches this file. It is not a translation — both languages get the same
 * words — which is exactly why a real entry above is preferred.
 */
function fallbackLabel(id: string): Localized {
  const words = id
    .replace(/^\d+-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { de: words, en: words };
}

function labelFor(id: string): Localized {
  return SECTION_LABELS[id] ?? fallbackLabel(id);
}

/** Resolved media for a unit, or undefined while it has no photography. */
export function propertyMediaFor(slug: string): PropertyMedia | undefined {
  const property = PROPERTY_OF_SLUG[slug];
  if (!property) return undefined;
  const raw = rawPropertyMedia[property];
  if (!raw || raw.sections.length === 0) return undefined;

  const sections: GallerySection[] = [];
  let floorPlan: GallerySection | undefined;

  for (const section of raw.sections) {
    if (section.images.length === 0) continue;
    const resolved: GallerySection = {
      id: section.id,
      label: labelFor(section.id),
      images: section.images,
    };
    if (section.id === FLOOR_PLAN_SECTION) floorPlan = resolved;
    else sections.push(resolved);
  }

  if (sections.length === 0 && !floorPlan) return undefined;

  // The flat order the lightbox walks: every room in turn, the floor plan last.
  // Built once here so the viewer can move from the last photograph of one room
  // straight into the next without knowing how the gallery is laid out.
  const ordered = floorPlan ? [...sections, floorPlan] : sections;
  const all: RawPropertyImage[] = [];
  const sectionOf: GallerySection[] = [];
  for (const section of ordered) {
    for (const image of section.images) {
      all.push(image);
      sectionOf.push(section);
    }
  }

  return { sections, floorPlan, all, sectionOf };
}

export function hasVerifiedMedia(slug: string): boolean {
  return propertyMediaFor(slug) !== undefined;
}

/**
 * The cover photograph of each property — the one frame that carries the card
 * and opens the detail view.
 *
 * Chosen by eye from the uploaded photography, not by filename order: the
 * first file in a folder is whatever the camera numbered first, which for
 * Schulstraße I is a doorway and for the commercial unit a single window. A
 * property without an entry here falls back to the first image of its first
 * section, so a new building has a sensible cover the moment its photographs
 * land.
 */
const COVER_OF_PROPERTY: Record<string, string> = {
  // The living room square-on: the sofa centred under the artwork, both tall
  // period windows in frame, afternoon light across the floor. The one frame
  // that says "period building, done properly" before a word is read, and it
  // survives the card's crop because its subject is dead centre.
  'schulstrasse-i': '/images/properties/schulstrasse-i/01-wohnzimmer/IMG_4678.jpeg',
  // The living area under the roof, looking through to the dining end. It
  // shows what actually distinguishes this flat — the exposed timber and the
  // open split level — where a tighter frame would just show a sofa.
  'schulstrasse-ii': '/images/properties/schulstrasse-ii/01-wohnzimmer/IMG_4698.jpeg',
  // The full shopfront at dusk, lit from inside, with the street running past.
  // The other two exteriors are a single window and a steeper angle; this is
  // the only one that shows the whole frontage, and the only landscape frame,
  // which is what a card's crop wants.
  'schulstrasse-gewerbeflaeche':
    '/images/properties/gewerbe-schulstrasse/01-aussenansicht-schaufenster/IMG_9590.jpeg',
};

export function verifiedCoverFor(slug: string): RawPropertyImage | undefined {
  const media = propertyMediaFor(slug);
  if (!media) return undefined;
  const chosen = COVER_OF_PROPERTY[slug];
  const picked = chosen ? media.all.find((image) => image.src === chosen) : undefined;
  return picked ?? media.all[0];
}

/**
 * Alt text: the room, and the unit it is in. Nothing about what is visible.
 *
 * "Wohnzimmer – Apartment Schulstraße I" is true of every photograph in that
 * folder. A generated description of the furniture would be a claim nobody
 * verified.
 */
export function imageAlt(section: GallerySection, unit: RentalUnit, locale: Locale): string {
  return `${section.label[locale]} – ${unit.name[locale]}`;
}

/**
 * The one picture that stands for a unit, wherever it is shown.
 *
 * This is the single place that decides between a unit's real photography and
 * the provisional reference set it borrows until that photography exists, so
 * no card, modal or page has to know which state a unit is in — or can get it
 * wrong. `verified` travels with the image and is what suppresses the
 * "Referenzbild" marker: the marker is a statement about provenance, and it
 * must disappear exactly when, and only when, the provenance changes.
 */
export interface ResolvedCover {
  image: RawPropertyImage;
  alt: string;
  /** True only for photography of this exact unit. */
  verified: boolean;
}

export function coverFor(unit: RentalUnit, locale: Locale): ResolvedCover | undefined {
  const verified = verifiedCoverFor(unit.slug);
  if (verified) {
    const media = propertyMediaFor(unit.slug);
    const index = media ? media.all.findIndex((image) => image.src === verified.src) : -1;
    const section = media && index >= 0 ? media.sectionOf[index] : undefined;
    return {
      image: verified,
      alt: section ? imageAlt(section, unit, locale) : unit.name[locale],
      verified: true,
    };
  }

  const reference = galleryFor(unit.slug)[0];
  if (!reference) return undefined;
  return {
    image: { src: reference.src, width: reference.width, height: reference.height },
    alt: reference.alt[locale],
    verified: false,
  };
}
