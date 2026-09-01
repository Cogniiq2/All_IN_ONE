'use client';

/**
 * The room-by-room gallery, below the detail view's top area.
 *
 * One component for every property and every context — a flat let by the
 * night, the same flat discussed as a tenancy, a commercial unit. It renders
 * whatever sections the data gives it and knows nothing about which unit it is
 * showing, so a new building is photography plus a line of data.
 *
 * ── Why the tiles never crop ─────────────────────────────────────────────
 * Each tile is given the aspect ratio of the photograph inside it, so
 * `object-cover` has nothing to cut off. Nearly all of this photography is 3:4
 * portrait — phone-held-upright — with a handful of landscape frames, and the
 * landscape ones take two columns so they are not shrunk to a portrait tile's
 * width. The grid is aligned to the top, so a mixed row leaves a little air
 * rather than stretching anything to match.
 *
 * ── What is actually fetched ─────────────────────────────────────────────
 * A section's photographs are requested only once that section is close to the
 * viewport. `loading="lazy"` alone was not enough: the browser treats a tall
 * scroll container generously and pulled most of a property's gallery the
 * moment the detail view opened — tens of megabytes of originals for pictures
 * nobody had scrolled to. Each section now watches for its own approach, and
 * every tile reserves its exact space beforehand, so nothing shifts when the
 * photographs arrive.
 *
 * ── Why the headings are small ───────────────────────────────────────────
 * A room heading is a signpost, not a title: an eyebrow and a hairline, costing
 * one line. What separates one room from the next is space — a wide margin
 * above each heading and a tight one below it, so a heading reads as belonging
 * to the pictures under it and not to the ones above.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Maximize2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  imageAlt,
  type GallerySection,
  type PropertyMedia,
  type RawPropertyImage,
} from '@/lib/content/property-media';
import type { RentalUnit } from '@/lib/content/apartments';
import { PropertyLightbox } from '@/components/property/property-lightbox';

/** Wider than about 6:5 earns two columns rather than a portrait's width. */
function isWide(image: RawPropertyImage): boolean {
  return image.width / image.height > 1.2;
}

/**
 * True once the element has come within a screenful of the viewport, and true
 * from then on — a section already scrolled past does not unload.
 */
function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      // No observer (a very old browser, or a test runner): show everything
      // rather than leaving a visitor with empty frames.
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // A screenful of warning, so a photograph is decoded before it is reached
      // without fetching the whole property up front.
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  return { ref, near };
}

export function PropertyGallery({
  media,
  unit,
}: {
  media: PropertyMedia;
  unit: RentalUnit;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const [openAt, setOpenAt] = useState<number | null>(null);

  // The lightbox walks the whole property, so every tile needs to know its
  // position in that flat order. Built once from the same arrays the data layer
  // already assembled.
  const indexOf = useMemo(() => {
    const map = new Map<string, number>();
    media.all.forEach((image, i) => map.set(image.src, i));
    return map;
  }, [media.all]);

  const altFor = useCallback(
    (index: number) => imageAlt(media.sectionOf[index], unit, locale),
    [media.sectionOf, unit, locale]
  );

  const sections = media.floorPlan ? [...media.sections, media.floorPlan] : media.sections;
  if (sections.length === 0) return null;

  return (
    <section className="border-t border-border/70 px-6 py-10 sm:px-8 lg:px-10 lg:py-12">
      <header>
        <p className="eyebrow">{de ? 'Galerie' : 'Gallery'}</p>
        <h3 className="display-3 mt-3">
          {de ? 'Räume im Überblick' : 'Room by room'}
        </h3>
        <p className="body-copy mt-3 max-w-[58ch] text-[14px]">
          {de
            ? 'Aufnahmen dieser Wohnung, Raum für Raum. Tippen Sie auf ein Bild, um es groß zu sehen — im Betrachter blättern Sie durch die gesamte Galerie.'
            : 'Photographs of this property, room by room. Tap an image to see it large — the viewer moves through the whole gallery.'}
        </p>
      </header>

      {sections.map((section, sectionIndex) => (
        <SectionBlock
          key={section.id}
          section={section}
          unit={unit}
          first={sectionIndex === 0}
          isFloorPlan={section.id === media.floorPlan?.id}
          indexOf={indexOf}
          onOpen={setOpenAt}
        />
      ))}

      <PropertyLightbox
        source={{ images: media.all, sectionOf: media.sectionOf, altFor }}
        index={openAt}
        onIndexChange={setOpenAt}
        onClose={() => setOpenAt(null)}
      />
    </section>
  );
}

function SectionBlock({
  section,
  unit,
  first,
  isFloorPlan,
  indexOf,
  onOpen,
}: {
  section: GallerySection;
  unit: RentalUnit;
  first: boolean;
  isFloorPlan: boolean;
  indexOf: Map<string, number>;
  onOpen: (index: number) => void;
}) {
  const { locale } = useI18n();
  const headingId = `gallery-${section.id}`;
  // Even the first section waits: the top area fills the detail view when it
  // opens, so nothing in the gallery is on screen yet. Eleven photographs of a
  // living room is forty megabytes nobody asked for.
  const { ref, near } = useNearViewport<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby={headingId} className={first ? 'mt-10' : 'mt-14'}>
      {/* Signpost, not a title: one line, then the pictures it belongs to. */}
      <div className="flex items-center gap-4">
        <h4
          id={headingId}
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: 'hsl(var(--champagne-dark))' }}
        >
          {section.label[locale]}
        </h4>
        <span className="rule-hair" aria-hidden="true" />
        <span
          className="shrink-0 text-[11px] tabular-nums"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {section.images.length}
        </span>
      </div>

      {/*
        Three across on a desktop, two on a tablet, one on a phone. Portrait
        frames three-up read as a contact sheet of a room; two-up at this width
        would give each photograph most of the modal and turn nine pictures into
        nine screens of scrolling.
      */}
      <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {section.images.map((image, i) => {
          const index = indexOf.get(image.src) ?? 0;
          // A floor plan is a document: it takes the full width so it can be
          // read, rather than sharing a row with another picture.
          const span = isFloorPlan
            ? 'sm:col-span-2 lg:col-span-3'
            : isWide(image)
            ? 'sm:col-span-2 lg:col-span-2'
            : '';
          return (
            <GalleryTile
              key={image.src}
              image={image}
              alt={imageAlt(section, unit, locale)}
              /* Only the very first frame of the first room is worth fetching
                 eagerly; everything else waits until it is scrolled to. */
              eager={first && i === 0}
              load={near}
              className={span}
              onOpen={() => onOpen(index)}
            />
          );
        })}
      </div>
    </section>
  );
}

function GalleryTile({
  image,
  alt,
  eager,
  load,
  className,
  onOpen,
}: {
  image: RawPropertyImage;
  alt: string;
  eager: boolean;
  /** False until the section is approached; the frame is reserved regardless. */
  load: boolean;
  className: string;
  onOpen: () => void;
}) {
  const { locale } = useI18n();

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative block w-full overflow-hidden bg-secondary ${className}`}
      style={{
        // The tile takes the photograph's own proportions, so the object-cover
        // below has nothing to trim and nothing is ever stretched.
        aspectRatio: `${image.width} / ${image.height}`,
        borderRadius: 'var(--radius-md)',
      }}
      aria-label={`${alt} — ${locale === 'de' ? 'groß ansehen' : 'view larger'}`}
    >
      {load && (
        <Image
          src={image.src}
          alt={alt}
          fill
          loading={eager ? 'eager' : 'lazy'}
          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 30vw"
          className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                     group-hover:scale-[1.03]"
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center
                   justify-center opacity-0 transition-opacity duration-300
                   group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          borderRadius: 'var(--radius-xs)',
          background: 'hsl(var(--ink) / 0.62)',
          color: 'hsl(var(--on-dark))',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
