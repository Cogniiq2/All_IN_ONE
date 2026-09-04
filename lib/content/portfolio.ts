/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BUILDING PORTFOLIO
 *
 * Six buildings in Bayreuth, as architectural drawings, shown on the About
 * page. This is the *building* portfolio and not the lettable inventory:
 * `lib/content/apartments.ts` remains the single source of truth for what a
 * guest can actually book or rent, and nothing here may be read as an offer.
 * Several of these addresses are not guest accommodation at all.
 *
 * Adding a seventh building is one object below plus its derivative — the
 * component maps over whatever this array holds and has no per-building code.
 *
 * ── The drawings ─────────────────────────────────────────────────────────
 * `image` points at a transparent WebP built by
 * `scripts/build-portfolio-media.mjs` from the untouched original PNG named in
 * `sourceFile`, which lives in `assets/portfolio-originals/` — outside
 * `public/`, so 12 MB of source material stays out of the deployed bundle. Each derivative is cropped to its own alpha bounding box, so
 * the image's bottom edge IS the building's ground line — which is what lets
 * the procession sit every drawing on one baseline without nudging any of
 * them individually.
 *
 * `width` and `height` are the derivative's intrinsic pixels. They are here so
 * the browser reserves the right space before the image arrives; the rendered
 * size is decided in CSS.
 *
 * ── The addresses ────────────────────────────────────────────────────────
 * Supplied by the owners and mapped to the source files by them. Nothing is
 * inferred from the picture, and a name is never guessed from a filename.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Localized } from '@/lib/content/apartments';

export interface PortfolioBuilding {
  /** Slug, and the stem of the derivative's filename. */
  id: string;
  /**
   * The street address, as displayed. Not `Localized`: a German street name is
   * the same string in an English sentence, and translating it would invent an
   * address that no map and no letterbox knows.
   */
  name: string;
  image: string;
  /** Intrinsic pixels of the derivative. */
  width: number;
  height: number;
  alt: Localized;
  /** The original this was generated from, so the mapping stays auditable. */
  sourceFile: string;
}

const sketchAlt = (name: string): Localized => ({
  de: `Architekturzeichnung der Immobilie ${name} in Bayreuth`,
  en: `Architectural sketch of the ${name} property in Bayreuth`,
});

export const portfolioBuildings: PortfolioBuilding[] = [
  {
    id: 'mainstrasse-14',
    name: 'Mainstraße 14',
    image: '/media/portfolio-buildings/mainstrasse-14.webp',
    width: 346,
    height: 560,
    alt: sketchAlt('Mainstraße 14'),
    sourceFile: '3816889F-8DAD-46F2-9536-AE55DDC273EC.png',
  },
  {
    id: 'am-main-3',
    name: 'Am Main 3',
    image: '/media/portfolio-buildings/am-main-3.webp',
    width: 776,
    height: 560,
    alt: sketchAlt('Am Main 3'),
    sourceFile: '4BCF476B-B364-449B-9649-5F44D2B4D8AB.png',
  },
  {
    id: 'harburgerstrasse-5',
    name: 'Harburgerstraße 5',
    image: '/media/portfolio-buildings/harburgerstrasse-5.webp',
    width: 568,
    height: 560,
    alt: sketchAlt('Harburgerstraße 5'),
    sourceFile: '50C9F1DA-A514-4603-B67F-4EAE6B68F5CF.png',
  },
  {
    id: 'opernstrasse-1',
    name: 'Opernstraße 1',
    image: '/media/portfolio-buildings/opernstrasse-1.webp',
    width: 535,
    height: 560,
    alt: sketchAlt('Opernstraße 1'),
    sourceFile: '6E19AE2C-F85B-4565-89C5-8AC636A23576.png',
  },
  {
    id: 'riedingerstrasse-13',
    name: 'Riedingerstraße 13',
    image: '/media/portfolio-buildings/riedingerstrasse-13.webp',
    width: 900,
    height: 343,
    alt: sketchAlt('Riedingerstraße 13'),
    sourceFile: '9EA84893-B3CD-472C-ABC7-2D5DE31D4D1A.png',
  },
  {
    id: 'schulstrasse-1',
    name: 'Schulstraße 1',
    image: '/media/portfolio-buildings/schulstrasse-1.webp',
    width: 550,
    height: 560,
    alt: sketchAlt('Schulstraße 1'),
    sourceFile: 'F3151280-62D1-4BA7-B175-DC44380D00FC.png',
  },
];
