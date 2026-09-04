'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '@/lib/i18n';
import { Reveal } from '@/components/ui-kit/reveal';
import { SectionHeader } from '@/components/ui-kit/section';
import { portfolioBuildings } from '@/lib/content/portfolio-buildings';

/**
 * The property portfolio, drawn rather than photographed.
 *
 * ── What it must not say ─────────────────────────────────────────────────
 * Six buildings are shown; two apartments are lettable today and a third is
 * in renovation. The copy therefore speaks about *properties developed and
 * looked after*, never about availability, and nothing here links into the
 * enquiry flow. `lib/content/apartments.ts` stays the only place that says
 * what a guest can book.
 *
 * ── How the loop works ───────────────────────────────────────────────────
 * The sequence is rendered twice into one flex track, so the track is exactly
 * two periods wide and every item sits at `i × (slide + gap)`. One CSS
 * animation drives the whole thing:
 *
 *     from  translate3d(-1 × sequence, 0, 0)   → the second copy fills the frame
 *     to    translate3d(0, 0, 0)               → the first copy fills the frame
 *
 * Because the two copies are identical and exactly one period apart, the last
 * frame of a cycle is pixel-identical to the first, so the restart is
 * invisible. The transform *increases* over the cycle, which is what makes
 * the buildings travel LEFT → RIGHT: a building leaving on the right is
 * already re-entering on the left as its counterpart from the other copy.
 *
 * Geometry lives in CSS custom properties (`--bp-slide-w`, `--bp-gap`,
 * `--bp-sketch-h`) in `app/globals.css`, so the period is derived, never
 * measured. Nothing drives the motion from JavaScript: no rAF loop, no
 * per-frame state, no ResizeObserver, no scroll listener.
 *
 * The duplicate half carries `data-clone`, which is what the reduced-motion
 * block uses to drop it and turn the track into a plain scrollable row.
 *
 * ── Why the images are not simply `loading="lazy"` ───────────────────────
 * Native lazy loading only reacts to the *vertical* viewport. Slides parked a
 * few thousand pixels to the right of the frame never intersect it, so they
 * stay unloaded until the drift has already carried them into view — and then
 * pop in blank. One IntersectionObserver arms the whole set as the section
 * approaches, after which every drawing is fetched at low priority, well
 * before the reader reaches it. The observer fires once and disconnects: this
 * is the only JavaScript the section runs, and none of it is per frame.
 */
export function PortfolioProcession() {
  const { locale } = useI18n();
  const de = locale === 'de';

  const frame = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;

    // No IntersectionObserver (or nothing to observe) — fetch rather than
    // risk a permanently empty procession.
    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setArmed(true);
        observer.disconnect();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Two passes over the same data. The clone is decorative: it is hidden from
  // assistive technology so each building is announced exactly once.
  const track = [
    ...portfolioBuildings.map((b) => ({ building: b, clone: false })),
    ...portfolioBuildings.map((b) => ({ building: b, clone: true })),
  ];

  return (
    <section className="section-pad-sm border-t border-border/70" aria-labelledby="portfolio">
      <div className="container-luxury">
        <div className="mx-auto max-w-[760px]">
          <SectionHeader
            eyebrow={de ? 'Portfolio' : 'Portfolio'}
            title={
              <span id="portfolio">
                {de ? 'Unser Portfolio in Bayreuth' : 'Our Portfolio in Bayreuth'}
              </span>
            }
            lede={
              de
                ? 'Sechs Immobilien in Bayreuth — einzeln entwickelt, betreut und mit einem gemeinsamen Anspruch an Qualität.'
                : 'Six properties in Bayreuth — individually developed and looked after, with one shared standard of quality.'
            }
          />
        </div>
      </div>

      <Reveal delay={0.1}>
        <div
          ref={frame}
          className="portfolio-procession mt-14 md:mt-16"
          style={{ '--bp-count': portfolioBuildings.length } as CSSProperties}
          role="group"
          aria-label={
            de
              ? 'Architekturzeichnungen der BoLaGio Immobilien in Bayreuth'
              : 'Architectural sketches of the BoLaGio properties in Bayreuth'
          }
        >
          <ul className="portfolio-procession__track">
            {track.map(({ building, clone }) => (
              <li
                key={`${building.id}${clone ? '-clone' : ''}`}
                className="portfolio-procession__item"
                data-clone={clone || undefined}
                aria-hidden={clone || undefined}
              >
                <div className="portfolio-procession__figure">
                  <Image
                    src={building.image}
                    alt={clone ? '' : building.alt[locale]}
                    width={building.width}
                    height={building.height}
                    loading={armed ? 'eager' : 'lazy'}
                    fetchPriority="low"
                    draggable={false}
                  />
                </div>
                <p className="portfolio-procession__name">{building.name}</p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
