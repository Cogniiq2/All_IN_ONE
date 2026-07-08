'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform, useReducedMotion, AnimatePresence } from 'framer-motion';
import { ArrowRight, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface Collection {
  title: string;
  eyebrow: string;
  headline: string;
  desc: string;
  tags: string[];
  href: string;
  image: string;
  cta: string;
  count: string;
  index: number;
}

function CollectionCard({ col }: { col: Collection }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const shouldReduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const imgY = useTransform(scrollYProgress, [0, 1], shouldReduce ? ['0%', '0%'] : ['-8%', '8%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (shouldReduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: shouldReduce ? 0 : 72 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 1.0, delay: col.index * 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={col.href}
        className="block group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={handleMouseMove}
      >
        {/* Aspect-ratio image container */}
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: col.index === 0 ? '3/4' : '4/5',
            borderRadius: 'var(--radius)',
          }}
        >
          {/* Cursor-following spotlight */}
          <AnimatePresence>
            {hovered && !shouldReduce && (
              <motion.div
                className="absolute pointer-events-none z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  left: cursorPos.x - 120,
                  top: cursorPos.y - 120,
                  width: 240,
                  height: 240,
                  background: 'radial-gradient(circle, hsl(38 44% 74% / 0.12) 0%, transparent 70%)',
                  borderRadius: '50%',
                }}
              />
            )}
          </AnimatePresence>

          {/* Parallax image */}
          <motion.div
            className="absolute inset-0 w-full"
            style={{ y: imgY, top: '-10%', height: '120%' }}
          >
            <Image
              src={col.image}
              alt={`${col.title} — Serviced Apartments Bayreuth`}
              fill
              className="object-cover"
              style={{
                transform: hovered ? 'scale(1.07)' : 'scale(1)',
                transition: 'transform 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </motion.div>

          {/* Dark cinematic vignette */}
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              background: hovered
                ? 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.12) 100%)'
                : 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.28) 50%, transparent 100%)',
            }}
          />

          {/* Top badges */}
          <div className="absolute top-5 left-5 right-5 flex items-start justify-between z-10">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5"
              style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 'var(--radius)',
              }}
            >
              <MapPin className="w-2.5 h-2.5" style={{ color: 'hsl(38 44% 68%)' }} />
              <span className="text-[8px] font-medium tracking-[0.22em] uppercase text-white/70">
                {col.eyebrow}
              </span>
            </div>
            <div
              className="px-2.5 py-1.5"
              style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 'var(--radius)',
              }}
            >
              <span className="text-[8px] font-medium text-white/50 tracking-[0.16em]">{col.count}</span>
            </div>
          </div>

          {/* Bottom content */}
          <div className="absolute bottom-0 left-0 right-0 p-7 lg:p-9 z-10">
            <motion.div
              animate={{ y: hovered && !shouldReduce ? -10 : 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {col.tags.map((tag, ti) => (
                  <span
                    key={ti}
                    className="text-[7.5px] font-medium tracking-[0.18em] uppercase px-2 py-0.5"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.58)',
                      borderRadius: '2px',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h3
                className="font-serif text-[1.75rem] lg:text-[2.1rem] font-semibold text-white leading-tight mb-5"
                style={{ letterSpacing: '-0.025em' }}
              >
                {col.headline}
              </h3>

              {/* CTA row */}
              <div className="flex items-center gap-2.5">
                <motion.div
                  animate={{ width: hovered && !shouldReduce ? 32 : 18 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="h-px flex-shrink-0"
                  style={{ background: 'hsl(38 44% 68%)' }}
                />
                <span
                  className="text-[9.5px] font-medium tracking-[0.16em] uppercase transition-colors duration-300"
                  style={{ color: hovered ? 'hsl(41 58% 76%)' : 'hsl(38 44% 68%)' }}
                >
                  {col.cta}
                </span>
                <motion.div
                  animate={{ x: hovered && !shouldReduce ? 5 : 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <ArrowRight
                    className="w-3.5 h-3.5"
                    style={{ color: hovered ? 'hsl(41 58% 76%)' : 'hsl(38 44% 68%)' }}
                  />
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Inset border on hover */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: hovered ? 1 : 0 }}
            transition={{ duration: 0.5 }}
            style={{
              boxShadow: 'inset 0 0 0 1px rgba(214,181,122,0.32)',
              borderRadius: 'var(--radius)',
            }}
          />

          {/* Index number — large decorative */}
          <div
            className="absolute top-5 right-20 font-serif leading-none pointer-events-none select-none transition-opacity duration-500"
            style={{
              color: 'transparent',
              WebkitTextStroke: `1px rgba(255,255,255,${hovered ? '0.08' : '0.04'})`,
              fontSize: 'clamp(4rem, 10vw, 7rem)',
              letterSpacing: '-0.05em',
            }}
          >
            0{col.index + 1}
          </div>
        </div>

        {/* Below-card text */}
        <div className="pt-5 px-1">
          <div className="flex items-center gap-3 mb-1.5">
            <h4
              className="font-serif text-[1rem] font-semibold tracking-tight transition-colors duration-300"
              style={{ color: hovered ? 'hsl(218 18% 10%)' : 'hsl(218 18% 16%)' }}
            >
              {col.title}
            </h4>
            <motion.div
              animate={{ scaleX: hovered ? 1 : 0, opacity: hovered ? 1 : 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 h-px origin-left"
              style={{ background: 'hsl(38 44% 74% / 0.35)' }}
            />
          </div>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-sm">
            {col.desc}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

export function CollectionsTeaser() {
  const { locale } = useI18n();

  const collections: Collection[] = [
    {
      index: 0,
      title: 'Sternplatz Collection',
      count: locale === 'de' ? '3 Residenzen' : '3 Residences',
      eyebrow: 'Sternplatz',
      headline: locale === 'de' ? 'Urban. Kulturell. Mittendrin.' : 'Urban. Cultural. Central.',
      desc: locale === 'de'
        ? 'Direkt am Sternplatz und der Opernstraße — fußläufig zum Markgräflichen Opernhaus, zu Restaurants und zur Einkaufsmeile.'
        : 'Right at Sternplatz and on Opernstraße — walking distance to the Margravial Opera House, restaurants, and the shopping street.',
      tags: locale === 'de'
        ? ['Sternplatz & Opernstraße', '5 Min. zur Oper', 'Stadtleben']
        : ['Sternplatz & Opernstraße', '5 min to opera', 'City life'],
      href: '/collections/sternplatz',
      image: 'https://images.pexels.com/photos/1457847/pexels-photo-1457847.jpeg?auto=compress&cs=tinysrgb&w=900',
      cta: 'Sternplatz Collection',
    },
    {
      index: 1,
      title: locale === 'de' ? 'Innenstadt Collection' : 'City Center Collection',
      count: locale === 'de' ? '2 Residenzen' : '2 Residences',
      eyebrow: locale === 'de' ? 'Innenstadt' : 'City Center',
      headline: locale === 'de' ? 'Zentral. Ruhig. Besonders.' : 'Central. Calm. Distinct.',
      desc: locale === 'de'
        ? 'Im Herzen der Bayreuther Innenstadt — mit dem einzigen Balkon und Panoramablick über die Stadt.'
        : 'In the heart of central Bayreuth — including the only apartment with a private balcony and panoramic city view.',
      tags: locale === 'de'
        ? ['Bayreuther Innenstadt', 'Einziger Balkon', 'Ruhige Lage']
        : ['Bayreuth city center', 'Only balcony', 'Calm location'],
      href: '/collections/altstadt',
      image: 'https://images.pexels.com/photos/2462015/pexels-photo-2462015.jpeg?auto=compress&cs=tinysrgb&w=900',
      cta: locale === 'de' ? 'Innenstadt Collection' : 'City Center Collection',
    },
  ];

  return (
    <section className="py-28 lg:py-44 relative overflow-hidden">

      {/* Massive background number */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 font-serif leading-none pointer-events-none select-none hidden xl:block"
        style={{
          fontSize: '28vw',
          color: 'transparent',
          WebkitTextStroke: '1px hsl(34 16% 85% / 0.25)',
          letterSpacing: '-0.06em',
          transform: 'translateY(-50%) translateX(30%)',
        }}
      >
        II
      </div>

      <div className="container-luxury relative">
        {/* Section header */}
        <motion.div
          className="mb-20 lg:mb-28"
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:gap-24">
            <div>
              <div className="flex items-center gap-3 mb-7">
                <div className="section-header-accent" />
                <span className="text-eyebrow-gold">
                  {locale === 'de' ? 'Alle fünf Apartments in Bayreuth' : 'All five apartments in Bayreuth'}
                </span>
              </div>
              <h2 className="font-serif text-[2.6rem] lg:text-[3.8rem] font-semibold leading-[1.01] tracking-tight max-w-xl">
                {locale === 'de' ? (
                  <>Zwei Collections.<br />
                  <em
                    className="not-italic"
                    style={{ color: 'hsl(var(--champagne-dark))' }}
                  >Ein Zentrum.</em></>
                ) : (
                  <>Two Collections.<br />
                  <em
                    className="not-italic"
                    style={{ color: 'hsl(var(--champagne-dark))' }}
                  >One City Center.</em></>
                )}
              </h2>
            </div>

            <div className="mt-6 lg:mt-0 max-w-[260px] lg:pb-2">
              <div className="h-px w-full mb-5" style={{ background: 'linear-gradient(90deg, hsl(var(--champagne) / 0.4), transparent)' }} />
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {locale === 'de'
                  ? 'Jede Collection hat ihren eigenen Charakter — beide im Herzen Bayreuths, mit Garage und Self Check-in.'
                  : 'Each collection has its own character — both in the heart of Bayreuth, with garage and self check-in.'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Staggered cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 lg:items-start">
          <div>
            <CollectionCard col={collections[0]} />
          </div>
          <div className="lg:mt-24">
            <CollectionCard col={collections[1]} />
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-20 flex items-center justify-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.5 }}
        >
          <Link
            href="/residences"
            className="group inline-flex items-center gap-4 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors duration-400"
          >
            <span
              className="h-px transition-all duration-500 group-hover:w-11"
              style={{ width: '24px', background: 'hsl(34 40% 50% / 0.45)' }}
            />
            {locale === 'de' ? 'Alle 5 Residenzen ansehen' : 'View all 5 residences'}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1.5 duration-400" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
