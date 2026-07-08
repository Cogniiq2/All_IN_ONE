'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { residences } from '@/lib/residences';
import { ResidenceCard } from '@/components/shared/residence-card';

export function ResidencesPreview() {
  const { t, locale } = useI18n();
  const shouldReduce = useReducedMotion();

  const sternplatz = residences.filter((r) => r.collection === 'sternplatz');
  const altstadt = residences.filter((r) => r.collection === 'innenstadt');

  return (
    <section className="py-24 lg:py-32">
      <div className="container-luxury">

        {/* Section header */}
        <motion.div
          className="mb-16 lg:flex lg:items-end lg:justify-between gap-10"
          initial={{ opacity: 0, y: shouldReduce ? 0 : 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <span className="text-eyebrow-gold block mb-5">
              {locale === 'de' ? 'Unsere Residenzen' : 'Our Residences'}
            </span>
            <h2 className="font-serif text-[2.2rem] lg:text-[2.8rem] font-semibold leading-tight mb-4">
              {t('residencesSection.title')}
            </h2>
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mb-5"
              style={{ transformOrigin: 'left', height: 1, width: 40, background: 'hsl(38 42% 52% / 0.4)' }}
            />
            <p className="text-muted-foreground max-w-lg text-[14px] leading-relaxed">
              {t('residencesSection.subtitle')}
            </p>
          </div>
          <Link
            href="/residences"
            className="group hidden lg:inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors duration-300 shrink-0 mb-1"
          >
            {locale === 'de' ? 'Alle Residenzen' : 'All residences'}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        {/* Sternplatz Collection */}
        <div className="mb-14">
          <motion.div
            className="flex items-center gap-4 mb-7"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'hsl(38 42% 52%)' }}>
              Sternplatz Collection
            </span>
            <div className="flex-1 h-px" style={{ background: 'hsl(35 18% 87%)' }} />
            <span className="text-[10px] font-medium" style={{ color: 'hsl(220 8% 60%)' }}>
              3 {locale === 'de' ? 'Apartments' : 'Apartments'}
            </span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sternplatz.map((r, i) => (
              <motion.div
                key={r.slug}
                initial={{ opacity: 0, y: shouldReduce ? 0 : 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              >
                <ResidenceCard residence={r} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Innenstadt Collection */}
        <div className="mb-12">
          <motion.div
            className="flex items-center gap-4 mb-7"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'hsl(38 42% 52%)' }}>
              {locale === 'de' ? 'Innenstadt Collection' : 'City Center Collection'}
            </span>
            <div className="flex-1 h-px" style={{ background: 'hsl(35 18% 87%)' }} />
            <span className="text-[10px] font-medium" style={{ color: 'hsl(220 8% 60%)' }}>
              2 {locale === 'de' ? 'Apartments' : 'Apartments'}
            </span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {altstadt.map((r, i) => (
              <motion.div
                key={r.slug}
                initial={{ opacity: 0, y: shouldReduce ? 0 : 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              >
                <ResidenceCard residence={r} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Mobile CTA */}
        <motion.div
          className="text-center lg:hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Link
            href="/residences"
            className="group inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
          >
            {locale === 'de' ? 'Alle Residenzen ansehen' : 'View all residences'}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

      </div>
    </section>
  );
}
