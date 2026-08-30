'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { bookableApartments } from '@/lib/content/apartments';
import { brand } from '@/lib/content/brand';
import { heroImage, REFERENCE_IMAGE_LABEL } from '@/lib/content/media';
import { Wordmark } from '@/components/brand/logo';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * The signature entrance.
 *
 * B · L · G resolves into the BoLaGio wordmark while the hero composition
 * settles. It runs once, takes about 1.4s, and blocks nothing: the headline
 * and both CTAs animate in on their own schedule and are interactive
 * immediately. Under prefers-reduced-motion the wordmark is simply present.
 */
function BrandEntrance() {
  /*
   * No reduced-motion branch: returning a bare wordmark for those users made
   * the server and client render different trees. MotionConfig in ClientLayout
   * drops the per-letter rise and leaves the fade.
   */
  return (
    <span className="relative inline-flex items-center" style={{ minHeight: '1.15em' }}>
      {/* Monogram — leads, then hands over */}
      <motion.span
        aria-hidden="true"
        className="absolute left-0 top-0 inline-flex items-center"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: 0.92, duration: 0.34, ease: 'easeOut' }}
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: '44px',
          fontWeight: 500,
          color: 'hsl(var(--on-dark))',
          gap: '0.42em',
          lineHeight: 1.15,
        }}
      >
        {brand.monogram.map((letter, i) => (
          <motion.span
            key={letter}
            className="inline-flex items-center"
            style={{ gap: '0.42em' }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.11, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {letter}
            {i < brand.monogram.length - 1 && (
              <span
                style={{
                  width: '3px',
                  height: '3px',
                  background: 'hsl(var(--on-dark-gold))',
                  transform: 'rotate(45deg)',
                  display: 'inline-block',
                }}
              />
            )}
          </motion.span>
        ))}
      </motion.span>

      {/* Wordmark — arrives as the monogram leaves */}
      <motion.span
        className="inline-flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.02, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Wordmark size="xl" invert />
      </motion.span>
    </span>
  );
}

/**
 * The headline states how many apartments are actually lettable, so it stays
 * true when a unit opens or closes. German and English both read better with a
 * word than a digit at these counts; anything larger falls back to the digit.
 */
const NUMERAL: Record<number, { de: string; en: string }> = {
  1: { de: 'Ein', en: 'One' },
  2: { de: 'Zwei', en: 'Two' },
  3: { de: 'Drei', en: 'Three' },
  4: { de: 'Vier', en: 'Four' },
  5: { de: 'Fünf', en: 'Five' },
};

export function Hero() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const ref = useRef<HTMLElement>(null);

  const reduce = useReducedMotion();
  const [parallax, setParallax] = useState(false);
  useEffect(() => {
    if (!reduce) setParallax(true);
  }, [reduce]);

  const countNumber = bookableApartments().length;
  const count = NUMERAL[countNumber]?.[locale] ?? String(countNumber);

  /**
   * Compositor-friendly parallax. The previous hero wrote window.scrollY into
   * React state on every scroll event, re-rendering the entire section
   * continuously. useScroll drives a transform value instead — no re-render.
   */
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '14%']);

  return (
    <section
      ref={ref}
      className="relative grain flex min-h-[92svh] flex-col justify-end overflow-hidden
                 -mt-[70px] lg:-mt-[84px]"
      style={{ background: 'hsl(var(--ink))' }}
    >
      {/*
        Parallax is enabled only after mount, and never for a visitor who asked
        for reduced motion. Reading that preference during render would make the
        first client render disagree with the server; `parallax` is false in both
        and turns on a tick later, so hydration matches and nobody who opted out
        ever sees the image move.
      */}
      <motion.div
        className="absolute inset-0"
        style={{ y: parallax ? imageY : 0, scale: 1.08 }}
      >
        <motion.div
          className="relative w-full h-full"
          initial={{ scale: 1.04, opacity: 0.82 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <Image
            src={heroImage.src}
            alt={heroImage.alt[locale]}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>
      </motion.div>

      {/* Legibility scrim — two layers, tuned so the headline clears AA */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(to top, hsl(var(--ink) / 0.95) 0%, hsl(var(--ink) / 0.7) 38%, hsl(var(--ink) / 0.28) 70%, hsl(var(--ink) / 0.4) 100%)',
        }}
      />
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(105deg, hsl(var(--ink) / 0.72) 0%, hsl(var(--ink) / 0.28) 46%, transparent 72%)',
        }}
      />
      {/*
        Header band scrim. The navbar is transparent over this hero, so its
        legibility must not depend on what the photograph happens to show at
        the top right — a bright ceiling would leave white nav text at roughly
        2:1. This guarantees a dark band behind the header at any image.
      */}
      <div
        className="absolute inset-x-0 top-0 z-[1] h-[180px] pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, hsl(var(--ink) / 0.78) 0%, hsl(var(--ink) / 0.45) 55%, transparent 100%)',
        }}
      />

      <div className="container-luxury relative z-10 pb-16 pt-36 lg:pb-24 lg:pt-44">
        <div className="max-w-[760px]">
          <div className="mb-8">
            <BrandEntrance />
          </div>

          <motion.h1
            className="display-1"
            style={{ color: 'hsl(var(--on-dark))' }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            {de ? (
              <>
                {count} {countNumber === 1 ? 'Apartment' : 'Apartments'} in Bayreuth.
                <br />
                <span style={{ color: 'hsl(var(--on-dark-gold))' }}>Eine Familie dahinter.</span>
              </>
            ) : (
              <>
                {count} {countNumber === 1 ? 'apartment' : 'apartments'} in Bayreuth.
                <br />
                <span style={{ color: 'hsl(var(--on-dark-gold))' }}>
                  {countNumber === 1 ? 'One family behind it.' : 'One family behind them.'}
                </span>
              </>
            )}
          </motion.h1>

          <motion.p
            className="mt-6 max-w-[52ch] text-[17px] leading-relaxed"
            style={{ color: 'hsl(var(--on-dark-muted))' }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {de
              ? 'Wir vermieten unsere eigenen Wohnungen in der Bayreuther Innenstadt — persönlich betreut, direkt angefragt, ohne Plattform dazwischen.'
              : 'We let our own apartments in central Bayreuth — looked after personally, enquired about directly, with no platform in between.'}
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.62, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <CtaLink href="/apartments" invert withArrow>
              {label('exploreApartments', locale)}
            </CtaLink>
            <EnquiryButton variant="secondary" invert />
          </motion.div>

          {/*
            The second audience, kept deliberately quiet. A prospective tenant
            landing on the homepage needs a way in; a guest looking for a few
            nights must not be given a second thing to weigh against the CTAs
            above. Hence a text link, not a third button.
          */}
          <motion.p
            className="mt-7 text-[13px] leading-relaxed"
            style={{ color: 'hsl(var(--on-dark-muted))' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            {de ? 'Sie möchten dauerhaft mieten?' : 'Looking to rent long term?'}{' '}
            <Link
              href="/mieten"
              className="group inline-flex items-center gap-1.5 py-1.5 font-semibold"
              style={{
                color: 'hsl(var(--on-dark))',
                borderBottom: '1px solid hsl(var(--on-dark-gold) / 0.6)',
              }}
            >
              {de ? 'Wohnraum und Gewerbeflächen' : 'Residential and commercial space'}
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </motion.p>
        </div>
      </div>

      {/* Provisional-photography marker — this is not a real photo of our rooms.
          Raised on large screens so the availability panel, which lifts into
          the bottom of the hero there, never sits on top of it. */}
      <div className="absolute bottom-4 right-4 z-10 lg:bottom-24 lg:right-6">
        <span className="ref-badge">{REFERENCE_IMAGE_LABEL[locale]}</span>
      </div>
    </section>
  );
}
