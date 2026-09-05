'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BUILDING PROCESSION
 *
 * The six BoLaGio buildings, drawn, moving slowly from left to right across
 * the About page. It reads as an architectural conveyor rather than a
 * carousel: no controls, no cards, no frames — the drawings sit directly on
 * the page, on one shared ground line, each with its street name beneath it.
 *
 * ── How it moves ─────────────────────────────────────────────────────────
 * The track holds the six buildings twice, and one CSS animation
 * (`portfolio-drift` in app/globals.css) runs its transform from -50% to 0.
 *
 *   at -50%   the ECHO copy fills the frame:   [1][2][3][4][5][6]
 *   moving →  everything travels rightwards, and the LEAD copy's sixth
 *             building arrives from the left as the echo's sixth leaves
 *             on the right:                    [6][1][2][3][4][5]
 *   at 0      the LEAD copy fills the frame — pixel-identical to the start,
 *             so the next iteration continues with no reset and no gap.
 *
 * A conventional marquee runs 0 → -50% and drifts the other way. The
 * direction here is the whole point of the section, so it is asserted in the
 * keyframes and verified in the browser, not assumed.
 *
 * ── What it costs ────────────────────────────────────────────────────────
 * One composited `transform` on one element. There is no timer, no
 * requestAnimationFrame, no scroll listener, and no measurement of anything.
 *
 * The drawings are fetched once, when the section is first approached, by a
 * single IntersectionObserver that disconnects the moment it fires — one
 * state change for the life of the component, and nothing at all on the
 * page's critical path. `loading="lazy"` cannot do this job here: the track
 * is far wider than the viewport, so most buildings are outside it
 * HORIZONTALLY at any moment and the browser's own heuristic would either
 * never fetch them or fetch them one at a time as they drift in, popping
 * into view. Their boxes are sized in CSS from the aspect ratio below, so
 * the track's geometry is complete before any byte arrives and an image
 * turning up late can never knock the loop out of step.
 *
 * ── Duplication and assistive technology ─────────────────────────────────
 * The echo copy exists only to make the loop seamless. It is `aria-hidden`
 * and its images carry empty alt text, so a screen reader is read the six
 * buildings once, in order, and the section makes complete sense with no
 * motion at all. Under `prefers-reduced-motion` the echo is hidden outright
 * and the six wrap into a static portfolio.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Reveal } from '@/components/ui-kit/reveal';
import { portfolioBuildings } from '@/lib/content/portfolio';
import { publicAltFor, publicLabelFor } from '@/lib/content/portfolio-labels';

export function PortfolioProcession() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { ref: frameRef, near: load } = useNearViewport<HTMLDivElement>();

  return (
    <section
      className="section-pad-sm border-t border-border/70"
      aria-labelledby="portfolio-heading"
    >
      <div className="container-luxury">
        <div className="mx-auto max-w-[760px]">
          <Reveal>
            <p className="eyebrow">{de ? 'Portfolio' : 'Portfolio'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h2 id="portfolio-heading" className="display-2">
              {de ? 'Unser Portfolio in Bayreuth' : 'Our portfolio in Bayreuth'}
            </h2>
            <p className="lede mt-5">
              {de
                ? 'Sechs Immobilien in Bayreuth — einzeln entwickelt, selbst betreut und mit einem gemeinsamen Anspruch an Qualität.'
                : 'Six properties in Bayreuth — individually developed and managed with one shared standard of quality.'}
            </p>
          </Reveal>
        </div>
      </div>

      {/*
        Deliberately outside container-luxury: the procession runs the full
        width of the page, which is what makes it read as a passing façade
        rather than a widget sitting in a column.
      */}
      <Reveal delay={0.12} className="mt-12 lg:mt-16">
        <div className="portfolio-frame" ref={frameRef}>
          <div className="portfolio-track">
            <Sequence locale={locale} load={load} />
            <Sequence locale={locale} load={load} echo />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/**
 * One pass of the six buildings.
 *
 * The echo is the same markup with nothing to say: hidden from the
 * accessibility tree, and hidden outright under reduced motion via the
 * `data-portfolio-copy` hook.
 */
function Sequence({
  locale,
  load,
  echo = false,
}: {
  locale: 'de' | 'en';
  /** False until the section is approached; see useNearViewport. */
  load: boolean;
  echo?: boolean;
}) {
  return (
    <div
      className="flex items-end"
      data-portfolio-copy={echo ? 'echo' : 'lead'}
      aria-hidden={echo || undefined}
    >
      {portfolioBuildings.map((building) => (
        <figure key={building.id} className="portfolio-item m-0">
          {/*
            A plain <img> on purpose. `images.unoptimized` is true in
            next.config.js (the Cloudflare worker has no image optimizer),
            so next/image would emit this same tag with no srcset and no
            resizing — a wrapper and a little client runtime for nothing.
            The rendered size is decided entirely in CSS here, which
            next/image's width/height contract does not express well.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={load ? building.image : undefined}
            alt={echo ? '' : publicAltFor(building, locale)}
            // The box is laid out from this, not from the bitmap.
            style={{ ['--ar' as string]: building.width / building.height }}
            decoding="async"
            draggable={false}
          />
          {/* The public label, not the record's own name: house numbers are
              published for the two addresses a visitor is sent to and for no
              others. See lib/content/buildings.ts. */}
          <figcaption className="portfolio-name">{publicLabelFor(building)}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * True once the element has come within a screen of the viewport, and true
 * from then on.
 *
 * One observer, disconnected on its first hit: the drawings are fetched
 * together, slightly before they are needed, and nothing observes anything
 * afterwards. `rootMargin` is deliberately generous — a visitor scrolling
 * quickly should meet a finished procession, not one still filling in.
 */
function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') {
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
      { rootMargin: '100% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  return { ref, near };
}
