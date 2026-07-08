'use client';

import { useState } from 'react';
import { Key, Sparkles, Wine } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';

function PillarCard({
  pillar,
  index,
  isLast,
}: {
  pillar: { icon: React.ElementType; title: string; desc: string; number: string };
  index: number;
  isLast: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 44 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.8, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative p-11 lg:p-14 cursor-default overflow-hidden group"
      style={{
        borderRight: !isLast ? '1px solid hsl(38 20% 88% / 0.65)' : 'none',
        background: hovered ? 'hsl(36 18% 97.5%)' : 'transparent',
        transition: 'background 0.45s ease',
      }}
    >
      {/* Ambient glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.7 }}
        style={{
          background: 'radial-gradient(ellipse 80% 55% at 50% 115%, hsl(38 44% 60% / 0.09), transparent)',
        }}
      />

      {/* Corner glow */}
      <motion.div
        className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
        animate={{ opacity: hovered ? 0.7 : 0 }}
        transition={{ duration: 0.5 }}
        style={{
          background: 'radial-gradient(circle at top right, hsl(41 58% 58% / 0.08), transparent 70%)',
        }}
      />

      {/* Number */}
      <div className="mb-10">
        <span
          className="text-[8.5px] font-medium tracking-[0.44em] uppercase transition-colors duration-350"
          style={{ color: hovered ? 'hsl(38 44% 52% / 0.7)' : 'hsl(38 44% 52% / 0.36)' }}
        >
          {pillar.number}
        </span>
      </div>

      {/* Icon with ring effect */}
      <div className="relative w-11 h-11 mb-9">
        <motion.div
          animate={hovered ? { scale: 1.75, opacity: 0 } : { scale: 1, opacity: 0.12 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid hsl(38 44% 52% / 0.5)' }}
        />
        <div
          className="w-11 h-11 flex items-center justify-center transition-all duration-450"
          style={{
            borderRadius: 'var(--radius)',
            border: '1px solid',
            borderColor: hovered ? 'hsl(38 44% 52% / 0.48)' : 'hsl(38 44% 52% / 0.14)',
            background: hovered
              ? 'linear-gradient(135deg, hsl(38 44% 74% / 0.14), hsl(41 58% 58% / 0.08))'
              : 'transparent',
          }}
        >
          <pillar.icon
            className="w-[18px] h-[18px] transition-all duration-400"
            style={{
              color: hovered ? 'hsl(38 44% 68%)' : 'hsl(38 44% 50%)',
              transform: hovered && !shouldReduce ? 'scale(1.1) rotate(4deg)' : 'none',
            }}
          />
        </div>
      </div>

      {/* Title */}
      <div className="mb-4">
        <h3
          className="font-serif text-[1.2rem] lg:text-[1.35rem] font-semibold leading-tight tracking-tight transition-colors duration-300"
          style={{ color: hovered ? 'hsl(218 22% 9%)' : 'hsl(218 18% 14%)' }}
        >
          {pillar.title}
        </h3>
        <motion.div
          animate={{ scaleX: hovered ? 1 : 0, opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{
            transformOrigin: 'left',
            height: '0.5px',
            background: 'linear-gradient(90deg, hsl(34 40% 50% / 0.55), hsl(41 58% 58% / 0.3), transparent)',
            marginTop: 7,
          }}
        />
      </div>

      <p
        className="text-[13px] leading-relaxed transition-colors duration-350"
        style={{ color: hovered ? 'hsl(218 12% 28%)' : 'hsl(218 12% 48%)' }}
      >
        {pillar.desc}
      </p>
    </motion.div>
  );
}

export function PillarsSection() {
  const { t, locale } = useI18n();

  const pillars = [
    { icon: Key, title: t('pillars.arrivalTitle'), desc: t('pillars.arrivalDesc'), number: '01' },
    { icon: Sparkles, title: t('pillars.comfortTitle'), desc: t('pillars.comfortDesc'), number: '02' },
    { icon: Wine, title: t('pillars.wineTitle'), desc: t('pillars.wineDesc'), number: '03' },
  ];

  return (
    <section className="py-28 lg:py-40 overflow-hidden relative" style={{ background: 'hsl(36 20% 97.5%)' }}>
      <div className="container-luxury">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="mb-20 text-center"
        >
          <div className="ornament-rule mb-7">
            <span
              className="text-[8.5px] font-medium uppercase tracking-[0.38em]"
              style={{ color: 'hsl(38 38% 50%)' }}
            >
              All in One Residences
            </span>
          </div>
          <h2
            className="font-serif text-[2.2rem] lg:text-[3rem] font-semibold leading-tight tracking-tight"
            style={{ color: 'hsl(218 18% 12%)' }}
          >
            {locale === 'de'
              ? 'Drei Versprechen. Ein Aufenthalt.'
              : 'Three promises. One stay.'}
          </h2>
        </motion.div>

        <div
          className="grid grid-cols-1 md:grid-cols-3"
          style={{ border: '1px solid hsl(38 20% 88% / 0.5)', borderRadius: 'var(--radius)' }}
        >
          {pillars.map((pillar, i) => (
            <PillarCard key={i} pillar={pillar} index={i} isLast={i === pillars.length - 1} />
          ))}
        </div>
      </div>
    </section>
  );
}
