'use client';

/**
 * The full-screen image viewer.
 *
 * Opened from any gallery image and navigating the WHOLE property — press
 * right on the last photograph of the living room and the kitchen begins. The
 * gallery hands it a flat list and the index that was clicked; it knows nothing
 * about rooms beyond the label it prints in the corner.
 *
 * ── Built on what is already here ────────────────────────────────────────
 * Radix Dialog, the same primitive as every other overlay on this site, so the
 * focus trap, the return of focus to the image that opened it, Escape, and the
 * scroll lock are the platform's and not a second implementation of them. It
 * nests inside the detail modal, which Radix handles: Escape closes the viewer
 * and leaves the property open behind it. No gallery library was added — there
 * is nothing here that would justify the weight or the dependency.
 *
 * ── Zoom ─────────────────────────────────────────────────────────────────
 * Buttons, at four fixed steps, with drag-to-pan once magnified. Deliberately
 * not pinch: a reliable pinch implementation has to fight the browser's own
 * gesture handling, and a floor plan that occasionally refuses to zoom is worse
 * than one with a visible + button. The buttons are keyboard-reachable and
 * named, which pinch never is.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { GallerySection, RawPropertyImage } from '@/lib/content/property-media';

/** Fixed steps, so a tap always lands somewhere sensible. */
const ZOOM_STEPS = [1, 1.75, 2.75, 4] as const;

export interface LightboxSource {
  images: RawPropertyImage[];
  sectionOf: GallerySection[];
  /** "Wohnzimmer – Apartment Schulstraße I", built by the caller. */
  altFor: (index: number) => string;
}

export function PropertyLightbox({
  source,
  index,
  onIndexChange,
  onClose,
}: {
  source: LightboxSource;
  /** null closes the viewer. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();
  const open = index !== null;

  const [zoomStep, setZoomStep] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const count = source.images.length;
  const zoom = ZOOM_STEPS[zoomStep];
  const zoomed = zoomStep > 0;

  const resetView = useCallback(() => {
    setZoomStep(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  // A new photograph always starts fitted. Carrying a magnified, panned view
  // from one image to the next lands the visitor in the corner of a picture
  // they have not seen yet.
  useEffect(() => {
    resetView();
  }, [index, resetView]);

  const go = useCallback(
    (delta: 1 | -1) => {
      if (index === null || count === 0) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange]
  );

  // Arrow keys anywhere in the viewer. Escape and the focus trap are Radix's.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === '+' || event.key === '=') setZoomStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1));
      if (event.key === '-') setZoomStep((s) => Math.max(0, s - 1));
      if (event.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go, resetView]);

  if (index === null) return null;

  const image = source.images[index];
  const section = source.sectionOf[index];
  if (!image) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    if (zoomed) {
      drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    } else {
      swipe.current = { x: event.clientX, y: event.clientY };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    drag.current = null;
    // A horizontal flick moves to the next photograph; only while fitted, so a
    // pan across a magnified floor plan is never mistaken for one.
    if (swipe.current) {
      const dx = event.clientX - swipe.current.x;
      const dy = event.clientY - swipe.current.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      swipe.current = null;
    }
  };

  const zoomIn = () => setZoomStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1));
  const zoomOut = () =>
    setZoomStep((s) => {
      const next = Math.max(0, s - 1);
      if (next === 0) setOffset({ x: 0, y: 0 });
      return next;
    });

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[80]"
            style={{ background: 'hsl(var(--ink) / 0.96)' }}
          />
        </Dialog.Overlay>

        <Dialog.Content
          className="fixed inset-0 z-[80] flex flex-col outline-none"
          aria-label={source.altFor(index)}
          // The image itself carries the gesture handling; letting Radix move
          // focus to it on open would put the focus ring on a picture.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">{source.altFor(index)}</Dialog.Title>

          {/* ── Bar: where you are, and the way out ──────────────────── */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <p
              className="min-w-0 truncate text-[12px] font-medium tracking-[0.02em]"
              style={{ color: 'hsl(var(--on-dark-muted))' }}
              aria-live="polite"
            >
              <span style={{ color: 'hsl(var(--on-dark))' }}>{section?.label[locale]}</span>
              <span aria-hidden="true"> · </span>
              {index + 1} / {count}
            </p>

            <Dialog.Close asChild>
              <button type="button" className="lb-control" aria-label={de ? 'Schließen' : 'Close'}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {/* ── The photograph ───────────────────────────────────────── */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 lg:p-10"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ cursor: zoomed ? (drag.current ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
            >
              {/*
                A plain <img>, not next/image: this is one deliberately opened
                full-resolution photograph, and the fill/sizes machinery would
                only get in the way of showing it whole. `object-contain` inside
                a fixed box is what guarantees the complete image, at its own
                aspect ratio, however the viewport is shaped.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={image.src}
                src={image.src}
                alt={source.altFor(index)}
                draggable={false}
                /*
                  The element fills the space that is left, and `object-contain`
                  fits the photograph inside it. Sizing the element to the image
                  instead — max-width and max-height against its own intrinsic
                  size — let a tall portrait grow past a short viewport, which is
                  exactly the case a viewer must never get wrong.
                */
                className="h-full w-full select-none object-contain"
                style={{
                  transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
                  transition: drag.current ? 'none' : 'transform 0.24s cubic-bezier(0.22,1,0.36,1)',
                  willChange: 'transform',
                }}
              />
            </div>

            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="lb-control absolute left-3 top-1/2 -translate-y-1/2 sm:left-5"
                  aria-label={de ? 'Vorheriges Bild' : 'Previous image'}
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="lb-control absolute right-3 top-1/2 -translate-y-1/2 sm:right-5"
                  aria-label={de ? 'Nächstes Bild' : 'Next image'}
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* ── Zoom ─────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-center gap-2 px-4 pb-5 pt-3">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomStep === 0}
              className="lb-control"
              aria-label={de ? 'Verkleinern' : 'Zoom out'}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetView}
              disabled={!zoomed}
              className="lb-control !w-auto gap-2 !px-4 text-[12px] font-semibold"
              aria-label={de ? 'Ansicht zurücksetzen' : 'Reset view'}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomStep === ZOOM_STEPS.length - 1}
              className="lb-control"
              aria-label={de ? 'Vergrößern' : 'Zoom in'}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
