'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { REFERENCE_IMAGE_LABEL, REFERENCE_IMAGE_NOTE } from '@/lib/content/media';

/** A frame with its alt text already resolved for the current language. */
export interface GalleryImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Apartment gallery.
 *
 * Built for real photography: a large lead frame with a thumbnail rail, full
 * keyboard support, and a visible marker while the images are still
 * provisional. When an apartment has no photographs at all it shows a composed
 * empty state rather than a broken frame.
 *
 * `verified` says whether these are photographs of this exact apartment. It
 * drops the "Referenzbild" marker and the note beneath — both are statements
 * about provenance, and repeating them over real photography of the real flat
 * would be its own kind of untruth. It also switches the lead frame to showing
 * the whole picture: this photography is portrait, and a 16:10 frame filled by
 * it loses most of the room.
 */
export function Gallery({
  images,
  verified = false,
}: {
  images: GalleryImage[];
  verified?: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const [index, setIndex] = useState(0);

  const count = images.length;

  const go = useCallback(
    (direction: 1 | -1) => {
      setIndex((current) => (current + direction + count) % count);
    },
    [count]
  );

  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, go]);

  if (count === 0) {
    return (
      <div
        className="flex aspect-[16/10] flex-col items-center justify-center gap-3 text-center"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 100%)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <ImageOff className="w-6 h-6" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
        <p className="text-[14px] max-w-[34ch] px-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Fotos folgen, sobald die Renovierung abgeschlossen ist.'
            : 'Photographs will follow once the renovation is complete.'}
        </p>
      </div>
    );
  }

  const active = images[index];

  return (
    <figure className="m-0">
      <div
        className="relative aspect-[16/10] overflow-hidden bg-secondary"
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        <Image
          key={active.src}
          src={active.src}
          alt={active.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 760px"
          className={verified ? 'object-contain' : 'object-cover'}
        />

        {!verified && (
          <span className="absolute top-3 left-3 ref-badge">{REFERENCE_IMAGE_LABEL[locale]}</span>
        )}

        {count > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'hsl(var(--background) / 0.9)', color: 'hsl(var(--foreground))' }}
              aria-label={de ? 'Vorheriges Bild' : 'Previous image'}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full transition-colors"
              style={{ background: 'hsl(var(--background) / 0.9)', color: 'hsl(var(--foreground))' }}
              aria-label={de ? 'Nächstes Bild' : 'Next image'}
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <span
              className="absolute bottom-3 right-3 px-2.5 py-1.5 text-[11px] font-medium rounded-xs"
              style={{ background: 'hsl(var(--ink) / 0.7)', color: 'hsl(var(--on-dark))' }}
              aria-live="polite"
            >
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={de ? 'Bildauswahl' : 'Image selection'}>
          {images.map((image, i) => (
            <button
              key={image.src + i}
              role="tab"
              aria-selected={i === index}
              aria-label={`${de ? 'Bild' : 'Image'} ${i + 1}`}
              onClick={() => setIndex(i)}
              className="relative h-16 w-24 shrink-0 overflow-hidden transition-opacity"
              style={{
                borderRadius: 'var(--radius-sm)',
                opacity: i === index ? 1 : 0.55,
                outline: i === index ? '2px solid hsl(var(--champagne-dark))' : 'none',
                outlineOffset: '1px',
              }}
            >
              <Image src={image.src} alt="" fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {!verified && (
        <figcaption className="mt-3 text-[12px] text-muted-foreground">
          {REFERENCE_IMAGE_NOTE[locale]}
        </figcaption>
      )}
    </figure>
  );
}
