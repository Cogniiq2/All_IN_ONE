'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * REVEAL PRIMITIVES FOR THE PROPERTY DETAIL VIEW
 *
 * Three small pieces of motion, shared by the gallery and the fact sheet:
 * a heading whose letters arrive in sequence, a gold rule that draws itself,
 * and a block that fades up as it is reached.
 *
 * ── Why not the existing Reveal ──────────────────────────────────────────
 * `components/ui-kit/reveal.tsx` uses framer-motion's `whileInView`, which
 * watches the WINDOW. Inside the detail modal the window never scrolls — the
 * modal's own pane does — so a whileInView element either fires on mount or
 * never fires at all. Everything here observes an explicit scroll root
 * instead, found by walking up to the nearest scrollable ancestor, so the same
 * components work on a page and inside the modal without being told which they
 * are in.
 *
 * ── What it costs ────────────────────────────────────────────────────────
 * This was written immediately after fixing a serious gallery performance
 * regression on iPad, so:
 *
 *   • one IntersectionObserver per element, disconnected the moment it fires.
 *     No scroll listener exists anywhere in this file;
 *   • one state change per element, ever — from hidden to shown. Nothing
 *     updates on a scroll frame;
 *   • only `opacity` and `transform` animate, both on the compositor. No
 *     width, height, margin or filter;
 *   • the letters of a heading are spans that animate once and are then
 *     static. A room heading is one or two words, not a paragraph;
 *   • nothing here touches image loading. The gallery's own observer still
 *     decides when a photograph is fetched, and a tile that has not loaded
 *     yet reveals its frame, not a decoded picture.
 *
 * Under `prefers-reduced-motion` every component renders its content in place,
 * fully visible, with no transition at all.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * The nearest scrollable ancestor, or null for the viewport.
 *
 * The modal's pane is `overflow-y: auto`; a page has nothing between the
 * element and the document. Passing the pane to IntersectionObserver as its
 * `root` is what makes these reveals fire on the scroll that is actually
 * happening.
 */
function scrollRootOf(node: Element | null): Element | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return null;
}

/** True once the element has been reached, and true from then on. */
function useRevealed<T extends HTMLElement>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { root: scrollRootOf(node), rootMargin, threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, rootMargin]);

  return { ref, shown };
}

/**
 * A heading whose letters arrive one after another.
 *
 * Editorial rather than mechanical: every letter is already in place and only
 * fades up, a few milliseconds apart, so the word settles instead of being
 * typed. There is no cursor and no character is ever missing from the DOM —
 * the whole string is present for a screen reader and for find-in-page from
 * the first frame, with the individual letters hidden from the accessibility
 * tree.
 */
export function RevealLetters({
  text,
  className = '',
  as: Tag = 'span',
  id,
  delay = 0,
}: {
  text: string;
  className?: string;
  as?: 'span' | 'h3' | 'h4' | 'p';
  id?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const { ref, shown } = useRevealed<HTMLElement>();

  if (reduce) {
    return (
      <Tag id={id} className={className}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag id={id} className={className} ref={ref as never}>
      {/* The real string, for assistive technology and find-in-page. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {Array.from(text).map((character, i) => (
          <span
            key={`${character}-${i}`}
            style={{
              display: 'inline-block',
              // A space has no glyph to animate; keep it as a space so words
              // do not run together.
              whiteSpace: character === ' ' ? 'pre' : undefined,
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(0.32em)',
              transition: `opacity 420ms ${EASE} ${delay + i * 26}ms, transform 480ms ${EASE} ${delay + i * 26}ms`,
            }}
          >
            {character === ' ' ? ' ' : character}
          </span>
        ))}
      </span>
    </Tag>
  );
}

/**
 * The gold hairline beside a section heading, drawn left to right.
 *
 * `scaleX` from a left origin — a transform, so it costs a compositor frame
 * and not a layout. It keeps its full width at all times, so nothing around it
 * moves as it draws.
 */
export function RevealRule({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const { ref, shown } = useRevealed<HTMLSpanElement>();

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`block h-px w-full origin-left ${className}`}
      style={{
        background:
          'linear-gradient(90deg, hsl(var(--champagne-dark) / 0.55), hsl(var(--border) / 0.6) 45%, transparent)',
        transform: reduce || shown ? 'scaleX(1)' : 'scaleX(0)',
        transition: reduce ? 'none' : `transform 900ms ${EASE} ${delay}ms`,
      }}
    />
  );
}

/**
 * A block that fades up as it is reached.
 *
 * Used for gallery tiles and for groups of copy. `index` staggers a row without
 * every tile needing its own delay prop.
 */
export function RevealBlock({
  children,
  className = '',
  index = 0,
  distance = 14,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
  distance?: number;
}) {
  const reduce = useReducedMotion();
  const { ref, shown } = useRevealed<HTMLDivElement>();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${distance}px)`,
        // Capped so a wide row never ends on a tile that arrives late.
        transition: `opacity 620ms ${EASE} ${Math.min(index, 5) * 70}ms, transform 720ms ${EASE} ${Math.min(index, 5) * 70}ms`,
      }}
    >
      {children}
    </div>
  );
}
