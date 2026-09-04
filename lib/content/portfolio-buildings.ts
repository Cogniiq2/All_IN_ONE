import type { Localized } from '@/lib/content/apartments';

/**
 * ── The BoLaGio property portfolio, as architectural drawings ─────────────
 *
 * This is the *building* portfolio, not the lettable inventory. Some of these
 * addresses are not guest accommodation at all, and one of the apartments the
 * site does let (Opernstraße) is still in renovation. Nothing here may be
 * presented as bookable — `lib/content/apartments.ts` remains the single
 * source of truth for what a guest can actually enquire about.
 *
 * Each entry is one line drawing of one building, rendered on the About page
 * as a continuous horizontal procession. Adding a seventh property means
 * adding a seventh object below plus its `.webp` — no component change.
 *
 * ── Media ────────────────────────────────────────────────────────────────
 * `image` points at a transparent WebP derived from the original PNG in
 * `public/images/portfolio-buildings/`. The derivatives are cropped to the
 * drawing's own alpha bounding box, which is what lets every building sit on
 * one shared baseline in CSS without any per-item nudging. The originals are
 * kept untouched; regenerate with `scripts/optimise-portfolio-buildings.py`.
 *
 * `sourceFile` records which original each derivative came from, so the
 * mapping from drawing to address stays auditable.
 */
export interface PortfolioBuilding {
  /** Slug, and the derivative's filename stem. */
  id: string;
  /** Street address as displayed. Identical in both locales — it is a name. */
  name: string;
  /** Transparent WebP, cropped to the drawing. */
  image: string;
  /** Intrinsic size of the derivative, for layout stability. */
  width: number;
  height: number;
  alt: Localized;
  /** The untouched original this derivative was generated from. */
  sourceFile: string;
}

const alt = (name: string): Localized => ({
  de: `Architekturzeichnung der Immobilie ${name} in Bayreuth`,
  en: `Architectural sketch of the ${name} property in Bayreuth`,
});

export const portfolioBuildings: PortfolioBuilding[] = [
  {
    id: 'maximilianstrasse-14',
    name: 'Maximilianstraße 14',
    image: '/media/portfolio-buildings/maximilianstrasse-14.webp',
    width: 395,
    height: 640,
    alt: alt('Maximilianstraße 14'),
    sourceFile: '3816889F-8DAD-46F2-9536-AE55DDC273EC.png',
  },
  {
    id: 'am-main-3',
    name: 'Am Main 3',
    image: '/media/portfolio-buildings/am-main-3.webp',
    width: 886,
    height: 640,
    alt: alt('Am Main 3'),
    sourceFile: '4BCF476B-B364-449B-9649-5F44D2B4D8AB.png',
  },
  {
    id: 'harburgerstrasse-5',
    name: 'Harburgerstraße 5',
    image: '/media/portfolio-buildings/harburgerstrasse-5.webp',
    width: 649,
    height: 640,
    alt: alt('Harburgerstraße 5'),
    sourceFile: '50C9F1DA-A514-4603-B67F-4EAE6B68F5CF.png',
  },
  {
    id: 'opernstrasse-1',
    name: 'Opernstraße 1',
    image: '/media/portfolio-buildings/opernstrasse-1.webp',
    width: 611,
    height: 640,
    alt: alt('Opernstraße 1'),
    sourceFile: '6E19AE2C-F85B-4565-89C5-8AC636A23576.png',
  },
  {
    id: 'riedingerstrasse-10',
    name: 'Riedingerstraße 10',
    image: '/media/portfolio-buildings/riedingerstrasse-10.webp',
    width: 900,
    height: 343,
    alt: alt('Riedingerstraße 10'),
    sourceFile: '9EA84893-B3CD-472C-ABC7-2D5DE31D4D1A.png',
  },
  {
    id: 'schulstrasse-1',
    name: 'Schulstraße 1',
    image: '/media/portfolio-buildings/schulstrasse-1.webp',
    width: 629,
    height: 640,
    alt: alt('Schulstraße 1'),
    sourceFile: 'F3151280-62D1-4BA7-B175-DC44380D00FC.png',
  },
];
