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

/** Provisional gallery sets, keyed by apartment slug. */
export const tempGalleries: Record<string, TempImage[]> = {
  'schulstrasse-i': [living, bedroom, loft],
  'schulstrasse-ii': [loft, living, bedroom],
  'opernstrasse': [],
};
