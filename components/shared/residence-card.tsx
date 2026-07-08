'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { Users, Car, Landmark, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Residence } from '@/lib/residences';

interface ResidenceCardProps {
  residence: Residence;
}

export function ResidenceCard({ residence }: ResidenceCardProps) {
  const { locale, t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      whileHover={shouldReduce ? {} : { y: -6 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group overflow-hidden relative"
      style={{
        background: 'white',
        border: `1px solid ${hovered ? 'hsl(38 44% 74% / 0.4)' : 'hsl(34 16% 85% / 0.6)'}`,
        borderRadius: 'var(--radius)',
        boxShadow: hovered && !shouldReduce
          ? '0 28px 72px rgba(0,0,0,0.11), 0 6px 22px rgba(0,0,0,0.06), 0 0 0 1px hsl(38 44% 74% / 0.1)'
          : '0 2px 10px rgba(0,0,0,0.03)',
        transition: 'box-shadow 0.45s ease, border-color 0.45s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link href={`/residences/${residence.slug}`} className="block">
        {/* Image with refined overlay */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={residence.images[0]}
            alt={`${residence.name} — ${residence.shortDescription[locale]}`}
            fill
            className="object-cover"
            style={{
              transform: hovered ? 'scale(1.08)' : 'scale(1.0)',
              transition: 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />

          {/* Gradient overlay */}
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.28) 0%, transparent 60%)',
              opacity: hovered ? 1 : 0,
            }}
          />

          {/* Top-left shimmer line on hover */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            animate={{ opacity: hovered ? 1 : 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background: 'linear-gradient(90deg, transparent, hsl(38 44% 74% / 0.6), hsl(41 58% 64% / 0.5), transparent)',
            }}
          />

          {/* Badges */}
          <div className="absolute top-3.5 left-3.5 flex flex-col gap-1.5 z-10">
            <span
              className="inline-block px-2.5 py-1 text-[8.5px] font-semibold uppercase tracking-[0.16em]"
              style={{
                background: 'hsl(36 22% 96% / 0.92)',
                backdropFilter: 'blur(12px)',
                borderRadius: 'var(--radius)',
                color: 'hsl(218 18% 16%)',
              }}
            >
              {residence.collectionLabel[locale]}
            </span>
            {residence.hasBalcony && (
              <span
                className="inline-block px-2.5 py-1 text-[8.5px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  background: 'hsl(38 44% 74% / 0.92)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(218 18% 8%)',
                }}
              >
                {locale === 'de' ? 'Panorama-Balkon' : 'Panoramic Balcony'}
              </span>
            )}
          </div>

          {residence.size && (
            <div className="absolute bottom-3 right-3 z-10">
              <span
                className="inline-block px-2.5 py-1 text-[10px] font-medium"
                style={{
                  background: 'rgba(0,0,0,0.52)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 'var(--radius)',
                  color: 'rgba(255,255,255,0.78)',
                }}
              >
                {residence.size}
              </span>
            </div>
          )}

          {/* Inset border on hover */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: hovered ? 1 : 0 }}
            transition={{ duration: 0.45 }}
            style={{
              boxShadow: 'inset 0 0 0 1px rgba(214,181,122,0.24)',
              borderRadius: 'var(--radius)',
            }}
          />
        </div>

        {/* Card content */}
        <div className="p-6 lg:p-7">
          <div className="mb-3.5">
            <p
              className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5 transition-colors duration-300"
              style={{ color: hovered ? 'hsl(34 40% 44%)' : 'hsl(34 40% 52%)' }}
            >
              {residence.differentiator[locale]}
            </p>
            <h3 className="font-serif text-[1.2rem] font-semibold leading-tight tracking-tight transition-colors duration-300"
              style={{ color: hovered ? 'hsl(218 22% 8%)' : 'hsl(218 18% 13%)' }}
            >
              {residence.name}
            </h3>
          </div>

          <p className="text-[12.5px] text-muted-foreground mb-5 leading-relaxed line-clamp-2">
            {residence.shortDescription[locale]}
          </p>

          {/* Feature row */}
          <div
            className="flex flex-wrap gap-3 mb-5 pb-5"
            style={{ borderBottom: '1px solid hsl(34 16% 85% / 0.4)' }}
          >
            <span
              className="flex items-center gap-1.5 text-[11px] transition-colors duration-300"
              style={{ color: hovered ? 'hsl(218 12% 28%)' : 'hsl(218 8% 48%)' }}
            >
              <Users className="w-3.5 h-3.5" />
              {t('residencesSection.sleeps')}
            </span>
            <span
              className="flex items-center gap-1.5 text-[11px] transition-colors duration-300"
              style={{ color: hovered ? 'hsl(218 12% 28%)' : 'hsl(218 8% 48%)' }}
            >
              <Car className="w-3.5 h-3.5" />
              {t('residencesSection.garage')}
            </span>
            {residence.hasBalcony && (
              <span
                className="flex items-center gap-1.5 text-[11px] font-medium transition-colors duration-300"
                style={{ color: hovered ? 'hsl(34 40% 42%)' : 'hsl(34 40% 54%)' }}
              >
                <Landmark className="w-3.5 h-3.5" />
                {t('residencesSection.balcony')}
              </span>
            )}
          </div>

          {/* Price + CTA */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10.5px] text-muted-foreground">{t('residencesSection.from')} </span>
              <span
                className="font-serif text-[1.4rem] font-semibold transition-colors duration-300"
                style={{ color: hovered ? 'hsl(218 22% 7%)' : 'hsl(218 18% 13%)' }}
              >
                &euro;{residence.priceFrom}
              </span>
              <span className="text-[10.5px] text-muted-foreground">{t('residencesSection.perNight')}</span>
            </div>

            <span
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-all duration-300"
              style={{ color: hovered ? 'hsl(34 40% 46%)' : 'hsl(218 8% 58%)' }}
            >
              {t('residencesSection.checkAvailability')}
              <ArrowRight
                className="w-3 h-3 transition-transform duration-350"
                style={{ transform: hovered ? 'translateX(3px)' : 'translateX(0)' }}
              />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
