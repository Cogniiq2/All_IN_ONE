'use client';

/**
 * The modal system.
 *
 * Two sizes, one behaviour, used by both journeys so a stay and a tenancy feel
 * like the same house speaking:
 *
 *   <LargeModal>   the unit detail view. Nearly full-screen but inset, so the
 *                  page stays visible at the edges and the overlay reads as a
 *                  layer above the site rather than a new page.
 *   <DialogModal>  the action that follows — booking, or an appointment. A
 *                  narrower, calmer surface, deliberately a step down in scale
 *                  so the hierarchy between "look at this" and "do this" is
 *                  legible.
 *
 * Built on Radix Dialog, which supplies dialog semantics, focus trapping,
 * Escape-to-close, focus restoration and scroll locking. Motion is framer —
 * both already dependencies; nothing new was installed.
 *
 * Motion: opacity plus a small rise and a fraction of scale, on the site's
 * easing curve. No bounce, no spring overshoot. Under prefers-reduced-motion
 * every transition collapses to a plain appearance.
 */

import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const EASE = [0.22, 1, 0.36, 1] as const;

function Backdrop({ strong = false }: { strong?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Dialog.Overlay asChild>
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        className="fixed inset-0 z-50"
        style={{
          // The page behind stays faintly readable — that is the point of the
          // inset. Blur carries the separation, not opacity alone.
          background: `hsl(var(--ink) / ${strong ? 0.62 : 0.5})`,
          backdropFilter: 'blur(10px) saturate(120%)',
          WebkitBackdropFilter: 'blur(10px) saturate(120%)',
        }}
      />
    </Dialog.Overlay>
  );
}

/**
 * `floating` is for the large modal, where the control sits over whatever the
 * layout happens to put beneath it — a photograph on a phone, the light content
 * column on a desktop. A translucent page-coloured chip with a hairline reads
 * on both; a dark one looked like a stray grey square on the light panel.
 */
function CloseButton({ floating = false }: { floating?: boolean }) {
  const { locale } = useI18n();
  return (
    <Dialog.Close asChild>
      <button
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xs transition-colors
                   hover:bg-secondary"
        style={{
          color: 'hsl(var(--foreground))',
          background: floating ? 'hsl(var(--background) / 0.88)' : 'transparent',
          border: floating ? '1px solid hsl(var(--border))' : undefined,
          backdropFilter: floating ? 'blur(10px)' : undefined,
          WebkitBackdropFilter: floating ? 'blur(10px)' : undefined,
        }}
        aria-label={locale === 'de' ? 'Schließen' : 'Close'}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </Dialog.Close>
  );
}

/**
 * Near-full-screen detail layer.
 *
 * The inset is deliberate and responsive: tight on a phone where every pixel
 * counts, generous on a desktop where the framing does the work. The panel
 * scrolls internally, so the close control never scrolls away.
 */
export function LargeModal({
  open,
  onOpenChange,
  labelledBy,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelledBy?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Backdrop strong />
        <Dialog.Content asChild aria-labelledby={labelledBy}>
          <div className="pointer-events-none fixed inset-0 z-50 flex items-stretch justify-center
                          p-3 sm:p-6 lg:p-10">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 26, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.99 }}
              transition={{ duration: 0.42, ease: EASE }}
              className="pointer-events-auto relative flex w-full max-w-[1180px] flex-col
                         overflow-hidden bg-background shadow-2xl"
              style={{
                // Extra-large tier. `overflow-hidden` above clips the imagery
                // and the inner scroll container to the same curve, so nothing
                // squares off a corner during the entrance transform.
                borderRadius: 'var(--radius-xl)',
                border: '1px solid hsl(var(--border))',
              }}
            >
              {children}
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The close control for LargeModal, floated over the imagery. */
export function LargeModalClose() {
  return (
    <div className="absolute right-3 top-3 z-20 lg:right-5 lg:top-5">
      <CloseButton floating />
    </div>
  );
}

/**
 * The action dialog: booking, or an appointment request.
 *
 * One step down in scale from LargeModal, so opening it from inside the detail
 * view reads as narrowing in rather than opening another page.
 *
 * ── Height ───────────────────────────────────────────────────────────────
 * The card is capped and always keeps a visible margin above and below, so it
 * reads as a card floating on the page rather than a second screen pinned to
 * the edges. Without the cap a tall step — the rental dialog's timing step, on
 * a 768px-high laptop or an iPad in landscape — grew until it filled the whole
 * viewport with a 16px sliver left at each end.
 *
 * `svh` is the small viewport height: on a phone it measures the space left
 * with the browser's own chrome showing, so the card cannot end up taller than
 * what is actually visible. `min(…, 100%)` keeps it inside the padded wrapper
 * as well, and an engine that does not know `svh` drops the whole declaration
 * and falls back to the `max-h-full` class — the previous behaviour, never
 * something broken.
 *
 * Only the header and the footer are fixed; the step body between them scrolls
 * on its own, so the page behind never has to scroll to reach the CTA.
 */
export function DialogModal({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Backdrop />
        <Dialog.Content asChild>
          <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center
                          p-4 sm:p-6 lg:p-8">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.99 }}
              transition={{ duration: 0.34, ease: EASE }}
              className="pointer-events-auto flex max-h-full w-full max-w-[540px] flex-col
                         overflow-hidden bg-background shadow-2xl"
              style={{
                // Same tier as the detail overlay: the dialog reads as the same
                // family of surface, one step down in scale.
                borderRadius: 'var(--radius-xl)',
                border: '1px solid hsl(var(--border))',
                // See the note above: capped so the card always floats, with
                // the `max-h-full` class as the fallback.
                maxHeight: 'min(86svh, 100%)',
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border/70 px-6 pb-5 pt-6">
                <div>
                  {eyebrow && <p className="eyebrow">{eyebrow}</p>}
                  <Dialog.Title className="display-3 mt-2">{title}</Dialog.Title>
                  {description && (
                    <Dialog.Description className="body-copy mt-2 text-[14px]">
                      {description}
                    </Dialog.Description>
                  )}
                </div>
                <div className="-mr-2 -mt-1">
                  <CloseButton />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The action row of a dialog step, pinned to the bottom of the scrollport.
 *
 * A step is as tall as its content, and the tallest of them — the rental
 * dialog's timing step, the booking dialog's calendar — is taller than a
 * 768px-high laptop can show. In flow, the primary action was the first thing
 * to fall off the bottom edge: the visitor had to scroll inside the card to
 * find the button that moves them forward.
 *
 * Sticky rather than fixed, so it belongs to the step it acts on and slides
 * with it during the step transition. The hairline above it is the same rule
 * that already separates the dialog's header from its body, so a scrolled step
 * reads as one surface with a header and a footer rather than a new element.
 */
export function StepActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-6 mt-8 border-t border-border/70 px-6 pb-1 pt-4"
      style={{ background: 'hsl(var(--background))' }}
    >
      {children}
    </div>
  );
}

/**
 * The step transition inside a multi-step dialog.
 *
 * Direction-aware: forward slides in from the right, back from the left, so the
 * flow reads as a line rather than a stack of unrelated screens.
 */
export function Step({
  direction,
  children,
}: {
  direction: 1 | -1;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  // The `key` that AnimatePresence needs goes on <Step> itself at the call
  // site — React never forwards it, so it must not be a prop here.
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: direction * 22 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: direction * -22 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
