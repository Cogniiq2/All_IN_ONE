'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
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
  const reduce = useReducedMotion();

  if (reduce) {
    return <Wordmark size="xl" invert />;
  }

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

export function Hero() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

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
      <motion.div
        className="absolute inset-0"
        style={{ y: reduce ? 0 : imageY, scale: 1.08 }}
      >
        <motion.div
          className="relative w-full h-full"
          initial={reduce ? false : { scale: 1.04, opacity: 0.82 }}
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
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            {de ? (
              <>
                Zwei Apartments in Bayreuth.
                <br />
                <span style={{ color: 'hsl(var(--on-dark-gold))' }}>Eine Familie dahinter.</span>
              </>
            ) : (
              <>
                Two apartments in Bayreuth.
                <br />
                <span style={{ color: 'hsl(var(--on-dark-gold))' }}>One family behind them.</span>
              </>
            )}
          </motion.h1>

          <motion.p
            className="mt-6 max-w-[52ch] text-[17px] leading-relaxed"
            style={{ color: 'hsl(var(--on-dark-muted))' }}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {de
              ? 'Wir vermieten unsere eigenen Wohnungen in der Bayreuther Innenstadt — persönlich betreut, direkt angefragt, ohne Plattform dazwischen.'
              : 'We let our own apartments in central Bayreuth — looked after personally, enquired about directly, with no platform in between.'}
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col sm:flex-row gap-3"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.62, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <CtaLink href="/apartments" invert withArrow>
              {label('exploreApartments', locale)}
            </CtaLink>
            <EnquiryButton variant="secondary" invert />
          </motion.div>
        </div>
      </div>

      {/* Provisional-photography marker — this is not a real photo of our rooms */}
      <div className="absolute bottom-4 right-4 z-10 lg:bottom-6 lg:right-6">
        <span className="ref-badge">{REFERENCE_IMAGE_LABEL[locale]}</span>
      </div>
    </section>
  );
}
