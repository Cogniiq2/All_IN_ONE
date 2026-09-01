/**
 * ══════════════════════════════════════════════════════════════════════════
 * TEMPORARY IMAGE REGISTRY — REPLACEMENT ASSETS
 *
 * None of the images referenced here may be presented to visitors as
 * verified photography of a BoLaGio apartment.
 *
 * • Provenance of the three interior photographs below is UNCONFIRMED. They
 *   were already in the repository and appear to be listing photos, but the
 *   owners have not confirmed that they are their own apartments.
 *   NEEDS CONFIRMATION before production.
 *
 * • Every surface that renders one of these carries a visible
 *   "Referenzbild" / "Reference image" marker, so nothing on the site claims
 *   to show a real room until real photography is supplied.
 *
 * • The previously used Alamy comp image and the Bayerischer Rundfunk press
 *   photograph were deleted outright — they were never licensed.
 *
 * To swap in real photography: replace the file paths here only. No component
 * references an image path directly.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface TempImage {
  src: string;
  /** Alt text describes what is visible, never a claim about which apartment. */
  alt: { de: string; en: string };
  width: number;
  height: number;
}

/** Marker rendered over provisional photography. */
export const REFERENCE_IMAGE_LABEL = {
  de: 'Referenzbild',
  en: 'Reference image',
} as const;

export const REFERENCE_IMAGE_NOTE = {
  de: 'Die gezeigten Aufnahmen sind Referenzbilder. Die Originalfotos unserer Apartments folgen.',
  en: 'The images shown are reference images. Original photographs of our apartments will follow.',
} as const;

const living: TempImage = {
  src: '/images/723934204.jpg',
  alt: {
    de: 'Heller Wohnraum mit hohen Altbaufenstern',
    en: 'Bright living room with tall period windows',
  },
  width: 1024,
  height: 768,
};

const bedroom: TempImage = {
  src: '/images/728876267.jpg',
  alt: {
    de: 'Ruhiges Schlafzimmer mit Parkettboden',
    en: 'Quiet bedroom with parquet flooring',
  },
  width: 1024,
  height: 768,
};

const loft: TempImage = {
  src: '/images/733083360.jpg',
  alt: {
    de: 'Offener Wohnbereich unter historischem Dachstuhl',
    en: 'Open living area beneath a historic roof structure',
  },
  width: 1024,
  height: 768,
};

export const tempImages = { living, bedroom, loft } as const;

/** Hero background. NEEDS REPLACEMENT with commissioned photography. */
export const heroImage = living;

/**
 * Provisional gallery sets, keyed by unit slug.
 *
 * The three Opernstraße flats draw on the same reference set so their cards and
 * detail views hold their own beside the Schulstraße flats. Every frame still
 * carries the "Referenzbild" marker, so nothing claims to show that specific
 * apartment — and their `status` keeps them out of every bookable path
 * regardless. The order is varied per unit only so the grid does not read as
 * one photograph repeated five times; it asserts nothing about the rooms.
 *
 * The two commercial units are deliberately ABSENT. The only photographs in
 * this repository are residential interiors; putting one on a shop unit would
 * be a false depiction, not a placeholder. Those cards render the composed
 * architectural panel in `components/units/unit-visual.tsx` instead, until real
 * photography of the units exists.
 */
export const tempGalleries: Record<string, TempImage[]> = {
  'schulstrasse-i': [living, bedroom, loft],
  'schulstrasse-ii': [loft, living, bedroom],
  'opernstrasse-i': [bedroom, loft, living],
  'opernstrasse-ii': [living, loft, bedroom],
  'opernstrasse-iii': [loft, bedroom, living],
};
