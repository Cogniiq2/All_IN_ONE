'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Star, ArrowRight, Quote } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { reviews } from '@/lib/reviews';
import type { Review } from '@/lib/reviews';

function ReviewCard({
  review,
  locale,
  index,
  shouldReduce,
}: {
  review: Review;
  locale: string;
  index: number;
  shouldReduce: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const offsets = [0, 32, 16];
  const topOffset = offsets[index % 3];

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.8, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="flex flex-col relative overflow-hidden cursor-default"
      style={{
        marginTop: shouldReduce ? 0 : topOffset,
        background: hovered ? 'hsl(36 20% 98.5%)' : 'white',
        border: '1px solid',
        borderColor: hovered ? 'hsl(38 44% 74% / 0.3)' : 'hsl(34 16% 86% / 0.6)',
        borderRadius: 'var(--radius)',
        boxShadow: hovered
          ? '0 28px 72px rgba(0,0,0,0.08), 0 4px 20px rgba(0,0,0,0.04)'
          : '0 2px 12px rgba(0,0,0,0.02)',
        transform: hovered && !shouldReduce ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'all 0.5s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Top shimmer line */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, hsl(38 44% 74% / 0.7) 30%, hsl(41 58% 64% / 0.6) 70%, transparent 100%)',
        }}
      />

      {/* Ambient glow */}
      <motion.div
        className="absolute -top-12 -right-12 w-48 h-48 pointer-events-none"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.55 }}
        style={{
          background: 'radial-gradient(circle, hsl(38 44% 74% / 0.07), transparent 70%)',
        }}
      />

      <div className="p-8 lg:p-9 flex flex-col flex-1">
        {/* Quote icon + stars row */}
        <div className="flex items-start justify-between mb-5">
          <div
            className="w-8 h-8 flex items-center justify-center transition-all duration-400"
            style={{
              background: hovered
                ? 'linear-gradient(135deg, hsl(38 44% 74% / 0.18), hsl(41 58% 58% / 0.12))'
                : 'hsl(38 44% 74% / 0.1)',
              border: '1px solid',
              borderColor: hovered ? 'hsl(38 44% 74% / 0.35)' : 'hsl(38 44% 74% / 0.2)',
              borderRadius: 'var(--radius)',
            }}
          >
            <Quote className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 50%)' }} />
          </div>

          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.4 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.07 + i * 0.04, type: 'spring', stiffness: 380, damping: 18 }}
              >
                <Star className="w-3 h-3 fill-current" style={{ color: 'hsl(41 58% 56%)' }} />
              </motion.div>
            ))}
          </div>
        </div>

        <p
          className="text-[13.5px] italic leading-[1.8] mb-7 flex-1 transition-colors duration-300"
          style={{ color: hovered ? 'hsl(218 10% 22%)' : 'hsl(218 8% 34%)' }}
        >
          {review.quote[locale as 'de' | 'en']}
        </p>

        {/* Footer */}
        <div
          className="pt-5 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid hsl(34 16% 85% / 0.45)' }}
        >
          <div>
            <p className="font-semibold text-[12.5px] text-foreground leading-none mb-1">{review.guestName}</p>
            <p className="text-[10px] text-muted-foreground tracking-[0.04em]">
              {review.guestLocation[locale as 'de' | 'en']} &middot; {review.date}
            </p>
          </div>
          <motion.div
            animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.75 }}
            transition={{ duration: 0.3 }}
            className="w-6 h-6 flex items-center justify-center flex-shrink-0"
            style={{
              background: 'hsl(38 44% 74% / 0.14)',
              border: '1px solid hsl(38 44% 74% / 0.24)',
              borderRadius: 'var(--radius)',
            }}
          >
            <Star className="w-2.5 h-2.5 fill-current" style={{ color: 'hsl(41 58% 56%)' }} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export function ReviewsSection() {
  const { locale } = useI18n();
  const featured = reviews.slice(0, 3);
  const shouldReduce = useReducedMotion();

  return (
    <section className="py-28 lg:py-40 relative overflow-hidden" style={{ background: 'hsl(36 14% 95% / 0.3)' }}>

      {/* Faint background rating watermark */}
      <div
        className="absolute right-0 top-1/2 font-serif leading-none pointer-events-none select-none hidden xl:block"
        style={{
          fontSize: '18vw',
          color: 'transparent',
          WebkitTextStroke: '1px hsl(34 16% 85% / 0.2)',
          letterSpacing: '-0.05em',
          right: '-4vw',
          transform: 'translateY(-50%)',
        }}
      >
        9.4
      </div>

      <div className="container-luxury relative">
        <motion.div
          className="mb-14 lg:mb-20"
          initial={{ opacity: 0, y: shouldReduce ? 0 : 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lg:flex lg:items-end lg:justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="section-header-accent" />
                <span className="text-eyebrow-gold">
                  {locale === 'de' ? 'Gästebewertungen' : 'Guest Reviews'}
                </span>
              </div>
              <h2 className="font-serif text-[2.4rem] lg:text-[3.4rem] font-semibold leading-[1.02] mb-7 tracking-tight">
                {locale === 'de' ? 'Was unsere Gäste sagen' : 'What our guests say'}
              </h2>

              {/* Rating pill */}
              <div
                className="inline-flex items-center gap-3.5 px-4 py-2.5"
                style={{
                  background: 'white',
                  border: '1px solid hsl(34 16% 85% / 0.6)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                }}
              >
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-current" style={{ color: 'hsl(41 58% 56%)' }} />
                  ))}
                </div>
                <div className="w-px h-3.5" style={{ background: 'hsl(34 16% 85%)' }} />
                <span className="text-[13.5px] font-bold text-foreground" style={{ letterSpacing: '-0.02em' }}>9.4</span>
                <span className="text-[10.5px] text-muted-foreground">
                  {locale === 'de' ? '/ 10 · 48+ Bewertungen' : '/ 10 · 48+ reviews'}
                </span>
              </div>
            </div>

            <Link
              href="/reviews"
              className="group hidden lg:inline-flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors duration-350 shrink-0 pb-1"
            >
              <span
                className="h-px transition-all duration-500 group-hover:w-10"
                style={{ width: '18px', background: 'hsl(34 40% 50% / 0.5)' }}
              />
              {locale === 'de' ? 'Alle Bewertungen' : 'All reviews'}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1.5" />
            </Link>
          </div>
        </motion.div>

        {/* Staggered review cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start mb-12">
          {featured.map((review, i) => (
            <ReviewCard key={review.id} review={review} locale={locale} index={i} shouldReduce={!!shouldReduce} />
          ))}
        </div>

        <motion.div
          className="text-center lg:hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Link
            href="/reviews"
            className="group inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors"
          >
            {locale === 'de' ? 'Alle Bewertungen lesen' : 'Read all reviews'}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
