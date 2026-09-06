'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * VON DER FASSADE ZUM AUFENTHALT
 *
 * The homepage's one signature moment: a scroll-driven passage from a
 * building's elevation to a room inside it, told twice — Schulstraße 1, then
 * Opernstraße 1 — inside a single sticky stage.
 *
 * ── Scroll drives it, and scroll is never taken away ─────────────────────
 * Progress is the wrapper's own scroll position, so slow scrolling moves the
 * story slowly, fast scrolling moves it fast, and scrolling back up runs it
 * backwards exactly. There is no timeline, no autoplay and no easing over
 * time — only position.
 *
 * Nothing here touches the scroll itself. No wheel or touchmove handler, no
 * preventDefault, no scroll locking, no body overflow change, no nested
 * scroll container, no custom momentum. The stage is `position: sticky` and
 * the page scrolls natively past it. That is deliberate and load-bearing:
 * iOS Safari scrolling has been broken twice in this project already, both
 * times by something that intercepted it.
 *
 * ── What a frame costs ───────────────────────────────────────────────────
 *   • ONE passive scroll listener, section-local, removed on unmount;
 *   • rAF-coalesced — many scroll events collapse into one write per frame;
 *   • ONE getBoundingClientRect, on one element;
 *   • ONE custom property written: `--p`. Every phase of the choreography is
 *     derived from it in CSS (app/globals.css, `.sig-stage`), so JavaScript
 *     never computes a layer's opacity or transform;
 *   • ZERO React state updates. Nothing in this component re-renders while
 *     scrolling. The only state that exists at all flips at most twice, from
 *     an IntersectionObserver, to begin loading images.
 *
 * ── Truthfulness ─────────────────────────────────────────────────────────
 * Every picture is a real asset belonging to the building it is shown under.
 * Schulstraße I has a verified floor plan and verified photography and gets
 * the full passage. Opernstraße has neither — only its elevation exists in
 * this repository — so its chapter traces the façade, holds, and releases.
 * It shows no plan, no room and no CTA, because there is nothing yet to lead
 * anyone to. See lib/content/signature-story.ts.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { publicAltFor } from '@/lib/content/portfolio-labels';
import { signatureChapters, type StoryChapter } from '@/lib/content/signature-story';

export function SignatureStory() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const chapters = signatureChapters(locale);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);

  /**
   * Image loading, in two steps and never on a scroll frame.
   *
   *   'idle'   nothing fetched. The homepage's first paint carries none of
   *            this section's weight.
   *   'near'   the section is within a screen — Schulstraße's three assets
   *            load, so the story is ready before it is reached.
   *   'all'    the reader has entered the section — Opernstraße's elevation
   *            loads well before the transition needs it.
   *
   * Two one-shot IntersectionObservers, each disconnected the moment it
   * fires. Two state changes for the life of the component.
   */
  const [phase, setPhase] = useState<'idle' | 'near' | 'all'>('idle');

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === 'undefined') {
      setPhase('all');
      return;
    }
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase((current) => (current === 'idle' ? 'near' : current));
          near.disconnect();
        }
      },
      { rootMargin: '100% 0px' }
    );
    const entered = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase('all');
          entered.disconnect();
        }
      },
      { rootMargin: '0px' }
    );
    near.observe(wrapper);
    entered.observe(wrapper);
    return () => {
      near.disconnect();
      entered.disconnect();
    };
  }, []);

  /**
   * The scroll wiring.
   *
   * Under `prefers-reduced-motion` this never runs: no listener is added, no
   * frame is ever requested, and the CSS renders the same markup as a static
   * editorial spread instead.
   */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const stage = stageRef.current;
    if (!wrapper || !stage) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    // The chapter currently in front. Tracked only so the one behind can be
    // made inert — an invisible link must not stay in the tab order.
    let active = -1;
    // Captured for the cleanup: `chapterRefs.current` is a different array by
    // the time an unmount runs, and the nodes to clear are these ones.
    const chapterNodes = chapterRefs.current;

    const paint = () => {
      frame = 0;
      const rect = wrapper.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;

      stage.style.setProperty('--p', progress.toFixed(4));

      const front = progress < 0.5 ? 0 : 1;
      if (front !== active) {
        active = front;
        chapterNodes.forEach((node, index) => {
          if (!node) return;
          // `inert` keeps the faded-out chapter out of the tab order and out
          // of the accessibility tree while leaving it visible to paint, so
          // the cross-fade still reads.
          if (index === front) node.removeAttribute('inert');
          else node.setAttribute('inert', '');
        });
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
      chapterNodes.forEach((node) => node?.removeAttribute('inert'));
    };
  }, []);

  if (chapters.length === 0) return null;
  const [first, second] = chapters;

  return (
    <section aria-labelledby="signature-heading" className="border-t border-border/70">
      {/*
        The wrapper's height IS the story's length: the sticky stage stays put
        while this scrolls past it. Shorter on a phone, where the same passage
        should not cost four screens of thumb. `svh` rather than `vh` so the
        iOS toolbar appearing does not change the choreography mid-scroll.
      */}
      <div ref={wrapperRef} className="sig-wrapper relative h-[300svh] lg:h-[420svh]">
        <div
          ref={stageRef}
          className="sig-stage sticky top-0 flex h-[100svh] items-center overflow-hidden"
        >
          <div className="container-luxury w-full">
            <header className="mb-6 lg:mb-0">
              <p className="eyebrow">{de ? 'Architektur' : 'Architecture'}</p>
              <h2 id="signature-heading" className="display-2 mt-3 max-w-[16ch]">
                {de ? 'Von der Fassade zum Aufenthalt' : 'From architecture to stay'}
              </h2>
            </header>

            {/*
              The two chapters occupy the same space. Only one is in front at
              a time — they are sequential stories, never a pair side by side.
            */}
            <div className="relative lg:mt-8">
              <Chapter
                chapter={first}
                index={0}
                phase={phase}
                assign={(node) => (chapterRefs.current[0] = node)}
              />
              {second && (
                <Chapter
                  chapter={second}
                  index={1}
                  phase={phase}
                  assign={(node) => (chapterRefs.current[1] = node)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One building's passage.
 *
 * The layout is the same for both — copy on the left, architecture on the
 * right, stacked on a phone — but the motion differs: see `.sig-sk-facade`
 * and `.sig-op-facade` in globals.css. What differs structurally is only what
 * each building has: a chapter with no verified plan and no verified room
 * renders neither, and offers no CTA.
 */
function Chapter({
  chapter,
  index,
  phase,
  assign,
}: {
  chapter: StoryChapter;
  index: 0 | 1 | number;
  phase: 'idle' | 'near' | 'all';
  assign: (node: HTMLDivElement | null) => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const first = index === 0;
  // Schulstraße loads a screen early; Opernstraße once the section is entered.
  const load = first ? phase !== 'idle' : phase === 'all';

  return (
    <div
      ref={assign}
      className={`${first ? 'sig-chapter-1' : 'sig-chapter-2 absolute inset-0'} 
                  grid items-center gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14`}
    >
      {/* ── Copy ──────────────────────────────────────────────────────── */}
      <div className={first ? 'sig-label-1' : 'sig-label-2'}>
        <h3 className="display-3">{chapter.title}</h3>

        {chapter.href ? (
          <>
            <p className="body-copy mt-3 max-w-[34ch] text-[14.5px]">
              {de
                ? 'Das Haus, der Grundriss, der Raum — in dieser Reihenfolge.'
                : 'The building, the plan, the room — in that order.'}
            </p>
            <div className="sig-cta-1 mt-6">
              <Link href={chapter.href} className="cta-secondary group">
                {de ? 'Apartment entdecken' : 'Discover the apartment'}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </>
        ) : (
          /*
            No plan and no photograph exist for this building, so the chapter
            says exactly that and stops. It offers no CTA: "discover the
            apartment" would promise a visual journey that does not exist yet.
            The wording is the same status the cards already carry.
          */
          <p className="sig-note-2 body-copy mt-3 max-w-[34ch] text-[14.5px]">
            {de
              ? 'In Vorbereitung. Die Wohnungen werden gerade hergerichtet — Grundriss und Aufnahmen folgen, sobald sie fertig sind.'
              : 'In preparation. The apartments are being fitted out — the floor plan and photographs follow once they are finished.'}
          </p>
        )}
      </div>

      {/* ── Architecture ──────────────────────────────────────────────── */}
      <div className="sig-layers relative aspect-[4/3] w-full lg:aspect-[5/4]">
        {/* The elevation. Contained on the page's own ground: it is a
            drawing of a whole building and must not be cropped. */}
        <div className={`sig-layer ${first ? 'sig-sk-facade' : 'sig-op-facade'} absolute inset-0`}>
          {load && (
            <Image
              src={chapter.elevation.image}
              alt={publicAltFor(chapter.elevation, locale)}
              fill
              sizes="(max-width: 1024px) 92vw, 620px"
              className="object-contain"
            />
          )}
        </div>

        {first ? <TraceSchulstrasse /> : <TraceOpernstrasse />}

        {chapter.floorPlan && (
          <div className="sig-layer sig-plan absolute inset-0">
            {load && (
              <Image
                src={chapter.floorPlan.src}
                alt={chapter.floorPlan.alt}
                fill
                sizes="(max-width: 1024px) 92vw, 620px"
                className="object-contain"
              />
            )}
          </div>
        )}

        {chapter.interior && (
          <div className="sig-layer sig-room sig-room-mask absolute inset-0 overflow-hidden">
            {load && (
              <Image
                src={chapter.interior.src}
                alt={chapter.interior.alt}
                fill
                sizes="(max-width: 1024px) 92vw, 620px"
                className="object-cover"
                style={{ borderRadius: 'var(--radius-lg)' }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Schulstraße's annotation: a horizontal datum drawn left to right, and a
 * band marking the residential storeys.
 *
 * It is an annotation over the drawing, not a redrawing of it — the elevation
 * itself is never altered. The band deliberately names no floor: which storey
 * a given apartment is on is not stated anywhere in this repository, and a
 * confident rectangle would be a claim.
 */
function TraceSchulstrasse() {
  return (
    <svg
      className="sig-trace pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 320"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="hsl(var(--champagne-dark))"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        style={{ ['--sig-dash' as string]: 400 }}
        strokeDasharray="400"
      >
        <line x1="40" y1="196" x2="360" y2="196" opacity="0.75" />
        <line x1="40" y1="196" x2="40" y2="176" opacity="0.5" />
        <line x1="360" y1="196" x2="360" y2="176" opacity="0.5" />
      </g>
      <rect
        className="sig-focus"
        x="118"
        y="96"
        width="164"
        height="92"
        rx="2"
        fill="hsl(var(--champagne) / 0.10)"
        stroke="hsl(var(--champagne-dark) / 0.7)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        style={{ transformOrigin: '200px 142px' }}
      />
    </svg>
  );
}

/**
 * Opernstraße's annotation runs the other way — a vertical datum with a
 * diagonal — so the second chapter is the same language spoken differently
 * rather than the first one repeated.
 */
function TraceOpernstrasse() {
  return (
    <svg
      className="sig-trace-op pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 320"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="hsl(var(--champagne-dark))"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        style={{ ['--sig-dash' as string]: 420 }}
        strokeDasharray="420"
      >
        <line x1="196" y1="40" x2="196" y2="270" opacity="0.65" />
        <path d="M196 96 L300 150" opacity="0.5" />
        <line x1="120" y1="270" x2="300" y2="270" opacity="0.6" />
      </g>
    </svg>
  );
}
