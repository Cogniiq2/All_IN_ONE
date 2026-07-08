'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Star, Car, Key, MapPin, ArrowRight, ExternalLink, ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function CursorGlow() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const springX = useSpring(x, { stiffness: 120, damping: 22 });
  const springY = useSpring(y, { stiffness: 120, damping: 22 });

  useEffect(() => {
    const move = (e: MouseEvent) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [x, y]);

  return (
    <motion.div
      className="fixed pointer-events-none z-[9998] mix-blend-screen"
      style={{
        left: springX,
        top: springY,
        translateX: '-50%',
        translateY: '-50%',
        width: 320,
        height: 320,
        borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(38 44% 74% / 0.07) 0%, transparent 70%)',
      }}
    />
  );
}

export function HeroSection() {
  const { locale } = useI18n();
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    if (prefersReducedMotion) return;
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [prefersReducedMotion]);

  const parallaxY = prefersReducedMotion ? 0 : scrollY * 0.38;
  const contentParallax = prefersReducedMotion ? 0 : scrollY * -0.12;

  const statCards = locale === 'de'
    ? [
        { icon: Star, label: '9.4 / 10', sub: '48+ Bewertungen', href: '/reviews' },
        { icon: Car, label: 'Garage', sub: 'Bei jeder Residenz', href: '/residences' },
        { icon: Key, label: '24/7 Check-in', sub: 'Flexibel & kontaktlos', href: '/book-direct' },
        { icon: MapPin, label: 'Sternplatz', sub: 'Bayreuth Zentrum', href: '/residences' },
      ]
    : [
        { icon: Star, label: '9.4 / 10', sub: '48+ reviews', href: '/reviews' },
        { icon: Car, label: 'Garage', sub: 'Every residence', href: '/residences' },
        { icon: Key, label: '24/7 check-in', sub: 'Flexible & contactless', href: '/book-direct' },
        { icon: MapPin, label: 'Sternplatz', sub: 'Bayreuth center', href: '/residences' },
      ];

  return (
    <>
      {!prefersReducedMotion && <CursorGlow />}

      <section
        ref={heroRef}
        className="relative min-h-[100svh] flex flex-col overflow-hidden bg-[hsl(218_22%_5%)]"
        aria-label="All in One Residences Bayreuth"
      >
        {/* Background image with parallax */}
        <div
          className="absolute inset-0 will-change-transform"
          style={{ transform: `translateY(${parallaxY}px) scale(1.15)` }}
        >
          <Image
            src="/images/723934204 copy.jpg"
            alt="Luxury apartment interior — All in One Residences Bayreuth"
            fill
            className="object-cover"
            priority
            sizes="100vw"
            onLoad={() => setIsLoaded(true)}
          />
        </div>

        {/* Multi-layer cinematic overlays */}
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(to bottom, rgba(6,7,12,0.22) 0%, rgba(6,7,12,0.08) 28%, rgba(6,7,12,0.78) 68%, rgba(6,7,12,0.98) 100%)' }} />
        <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(108deg, rgba(6,7,12,0.88) 0%, rgba(6,7,12,0.22) 40%, transparent 68%)' }} />
        <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 80% 60% at 72% 42%, transparent 0%, rgba(6,7,12,0.32) 100%)' }} />

        {/* Ambient gold orb top-right */}
        {!prefersReducedMotion && (
          <motion.div
            className="absolute z-[2] pointer-events-none rounded-full"
            style={{
              right: '-5%',
              top: '8%',
              width: 600,
              height: 600,
              background: 'radial-gradient(circle, hsl(38 44% 66% / 0.09) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Grid lines overlay */}
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
            maskImage: 'radial-gradient(ellipse 90% 85% at center, black 40%, transparent 100%)',
          }}
        />

        {/* Vertical side labels */}
        {isLoaded && (
          <>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 2.8, duration: 1 }}
              className="absolute left-7 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col items-center gap-3"
            >
              <div className="h-12 w-px" style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.2))' }} />
              <span className="text-[8px] font-light tracking-[0.38em] uppercase text-white/28 [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
                All in One Residences · Bayreuth
              </span>
              <div className="h-12 w-px" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)' }} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 3, duration: 1 }}
              className="absolute right-7 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col items-end gap-2"
            >
              <span className="text-[7.5px] font-light tracking-[0.32em] uppercase text-white/20">Deutschland</span>
              <div className="w-5 h-px bg-white/18" />
              <span className="text-[7.5px] font-light tracking-[0.32em] uppercase text-white/20">Bayern</span>
            </motion.div>
          </>
        )}

        {/* Main content */}
        <div
          className="container-luxury relative z-10 flex flex-col justify-end flex-1 pb-14 lg:pb-24 pt-36"
          style={{ transform: `translateY(${contentParallax}px)` }}
        >
          <div className="max-w-[920px]">

            {/* Eyebrow badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8"
            >
              <div className="inline-flex items-center gap-3.5">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.55, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className="h-px flex-shrink-0 origin-left"
                  style={{ width: 40, background: 'linear-gradient(90deg, transparent, hsl(38 44% 72% / 0.8), hsl(41 58% 62%))' }}
                />
                <span className="text-[9px] font-normal uppercase tracking-[0.42em]" style={{ color: 'hsl(38 44% 62% / 0.8)' }}>
                  {locale === 'de' ? 'Serviced Apartments · Bayreuth' : 'Serviced Apartments · Bayreuth'}
                </span>
              </div>
            </motion.div>

            {/* Headline — word-by-word reveal */}
            <h1
              className="font-serif font-semibold text-white mb-8 overflow-hidden"
              style={{ letterSpacing: '-0.032em', lineHeight: 0.95 }}
              aria-label={locale === 'de' ? 'Fünf Apartments. Mitten in Bayreuth.' : 'Five Apartments. In the Heart of Bayreuth.'}
            >
              {locale === 'de' ? (
                <>
                  <div className="split-line">
                    <motion.span
                      initial={{ y: '108%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{ delay: 0.4, duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                      className="block text-[3.4rem] sm:text-[4.8rem] lg:text-[6.2rem] xl:text-[7.4rem]"
                    >
                      Fünf Apartments.
                    </motion.span>
                  </div>
                  <div className="split-line mt-1">
                    <motion.span
                      initial={{ y: '108%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{ delay: 0.6, duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                      className="block text-[3.4rem] sm:text-[4.8rem] lg:text-[6.2rem] xl:text-[7.4rem]"
                      style={{
                        background: 'linear-gradient(122deg, hsl(38 44% 90%) 0%, hsl(41 62% 72%) 30%, hsl(38 52% 82%) 60%, hsl(43 68% 68%) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Mitten in Bayreuth.
                    </motion.span>
                  </div>
                </>
              ) : (
                <>
                  <div className="split-line">
                    <motion.span
                      initial={{ y: '108%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{ delay: 0.4, duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                      className="block text-[3.4rem] sm:text-[4.8rem] lg:text-[6.2rem] xl:text-[7.4rem]"
                    >
                      Five Apartments.
                    </motion.span>
                  </div>
                  <div className="split-line mt-1">
                    <motion.span
                      initial={{ y: '108%', opacity: 0 }}
                      animate={{ y: '0%', opacity: 1 }}
                      transition={{ delay: 0.6, duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                      className="block text-[3.4rem] sm:text-[4.8rem] lg:text-[6.2rem] xl:text-[7.4rem]"
                      style={{
                        background: 'linear-gradient(122deg, hsl(38 44% 90%) 0%, hsl(41 62% 72%) 30%, hsl(38 52% 82%) 60%, hsl(43 68% 68%) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      In the Heart of Bayreuth.
                    </motion.span>
                  </div>
                </>
              )}
            </h1>

            {/* Subline */}
            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="text-[0.975rem] lg:text-[1.05rem] text-white/46 mb-10 max-w-[520px] leading-relaxed font-light"
              style={{ letterSpacing: '-0.007em' }}
            >
              {locale === 'de'
                ? '5 exklusive Serviced Apartments — am Sternplatz & in der Innenstadt. Garagenparkplatz, Self Check-in 24/7, ab €109/Nacht.'
                : '5 exclusive serviced apartments — at Sternplatz & in the city center. Garage parking, self check-in 24/7, from €109/night.'}
            </motion.p>

            {/* CTA row */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col sm:flex-row gap-3 mb-10"
            >
              <Link
                href="/residences"
                className="group relative inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[10.5px] font-medium uppercase tracking-[0.16em] overflow-hidden transition-all duration-500"
                style={{
                  background: 'hsl(36 22% 97%)',
                  color: 'hsl(218 18% 9%)',
                  borderRadius: 'var(--radius)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = '0 16px 56px rgba(0,0,0,0.38)';
                  el.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = '';
                  el.style.transform = '';
                }}
              >
                <span className="relative z-10">{locale === 'de' ? 'Residenzen entdecken' : 'Explore residences'}</span>
                <ArrowRight className="relative z-10 w-3.5 h-3.5 transition-transform duration-400 group-hover:translate-x-1.5" />
                {/* shimmer */}
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.3) 50%, transparent 65%)', transform: 'translateX(-100%)', animation: 'shimmer-move 0.9s ease 0.1s forwards' }}
                />
              </Link>

              <Link
                href="/book-direct"
                className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[10.5px] font-medium uppercase tracking-[0.16em] text-white transition-all duration-400"
                style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius)' }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(255,255,255,0.38)';
                  el.style.background = 'rgba(255,255,255,0.06)';
                  el.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = 'rgba(255,255,255,0.15)';
                  el.style.background = 'transparent';
                  el.style.transform = '';
                }}
              >
                {locale === 'de' ? 'Direkt buchen' : 'Book direct'}
              </Link>
            </motion.div>

            {/* Booking.com alt */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25, duration: 0.8 }}
              className="flex items-center gap-3 mb-10"
            >
              <div className="h-px w-5 bg-white/16" />
              <span className="text-[8px] uppercase tracking-[0.28em] text-white/22">
                {locale === 'de' ? 'Auch auf' : 'Also on'}
              </span>
              <a
                href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1.5 text-[10px] font-medium text-white/32 hover:text-white/60 transition-all duration-350"
              >
                Booking.com
                <ExternalLink className="w-2.5 h-2.5 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </motion.div>

            {/* Stat chips row */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-wrap gap-2"
            >
              {statCards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 12, scale: 0.96 }}
                  animate={prefersReducedMotion ? {} : { opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 1.45 + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -3, transition: { duration: 0.3 } }}
                >
                  <Link
                    href={card.href}
                    className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-all duration-350"
                    style={{
                      background: 'rgba(255,255,255,0.048)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 'var(--radius)',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = 'hsl(38 44% 68% / 0.28)';
                      el.style.background = 'rgba(255,255,255,0.072)';
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = 'rgba(255,255,255,0.08)';
                      el.style.background = 'rgba(255,255,255,0.048)';
                    }}
                  >
                    <div
                      className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                      style={{ background: 'hsl(38 44% 68% / 0.14)', borderRadius: '2px' }}
                    >
                      <card.icon className="w-2.5 h-2.5" style={{ color: 'hsl(38 44% 76%)' }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium leading-none text-white/90 mb-0.5">{card.label}</p>
                      <p className="text-[8px] leading-none text-white/34">{card.sub}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3, duration: 1.2 }}
          className="absolute bottom-9 right-10 z-20 hidden lg:flex flex-col items-center gap-2.5"
        >
          <motion.div
            animate={{ y: [0, 6, 0], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="w-4 h-4 text-white/38" />
          </motion.div>
          <span className="text-[7px] uppercase tracking-[0.3em] text-white/22 [writing-mode:vertical-rl]">
            {locale === 'de' ? 'Scrollen' : 'Scroll'}
          </span>
        </motion.div>

        {/* Bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-px z-20" style={{ background: 'hsl(36 22% 96%)' }} />
      </section>
    </>
  );
}
