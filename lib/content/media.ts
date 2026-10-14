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
 * Empty, and that is the point.
 *
 * The Schulstraße units have their own verified photography and resolve
 * through lib/content/property-media.ts instead; they never looked here. The
 * Opernstraße units used to borrow the stock interiors below, and no longer
 * do: a stock living room standing in for a specific unnamed apartment invited
 * exactly the reading the "Referenzbild" marker existed to prevent, and a
 * marker is a weaker instrument than simply not showing the picture. Every
 * Opernstraße unit now gets the composed architectural panel in
 * `components/units/unit-visual.tsx` — the same treatment the commercial units
 * have always had — until it has photography of its own.
 *
 * The map is kept rather than deleted: it is the seam a unit passes through
 * when it has something provisional to show, and the reference-image
 * vocabulary above is still the right one on the day that happens.
 */
export const tempGalleries: Record<string, TempImage[]> = {};

/**
 * The BoLaGio logo artwork, cut from the brand master
 * (assets/brand/bolagio-logo-source.jpg) as transparent masks: white ink,
 * alpha carrying the letterforms. Components tint them with the colour token
 * of their surface (`components/brand/logo.tsx`), so one asset serves light
 * pages and dark photography alike.
 */
export interface BrandArt {
  src: string;
  /** Intrinsic pixels; the aspect ratio is what layout uses. */
  width: number;
  height: number;
}

export const brandArt = {
  /** "BoLaGio", including the G's descending tail. */
  wordmark: { src: '/images/brand/bolagio-wordmark.png', width: 851, height: 234 },
  /** The stacked B / L / G monogram. */
  monogram: { src: '/images/brand/bolagio-monogram.png', width: 299, height: 356 },
} as const satisfies Record<string, BrandArt>;
