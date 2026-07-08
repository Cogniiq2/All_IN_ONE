'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Calendar } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';

export function BayreuthTeaser() {
  const { t, locale } = useI18n();
  const [hovered, setHovered] = useState(false);
  const shouldReduce = useReducedMotion();

  return (
    <section className="py-24 lg:py-32 overflow-hidden">
      <div className="container-luxury">
        <div
          className="relative overflow-hidden"
          style={{ minHeight: 500, borderRadius: 'var(--radius)' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Background image */}
          <Image
            src="/images/bayreuther-festspielhaus-blumen-wagner-100~_h-558_v-img__16__9__xl_w-994_-e1d284d92729d9396a907e303225e0f2d9fa53b4 copy.jpg"
            alt="Bayreuth Festspielhaus 2026"
            fill
            className="object-cover"
            style={{
              transform: hovered ? 'scale(1.04)' : 'scale(1.0)',
              transition: 'transform 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            sizes="(max-width: 1280px) 100vw, 1280px"
          />

          {/* Layered overlays */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(110deg, rgba(5,4,3,0.97) 0%, rgba(5,4,3,0.78) 42%, rgba(5,4,3,0.24) 100%)' }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.18) 0%, transparent 45%)' }} />

          {/* Animated top gold line */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background: 'linear-gradient(90deg, hsl(38 44% 74% / 0.55), hsl(41 58% 64% / 0.65), hsl(38 44% 74% / 0.55))',
              transformOrigin: 'left',
            }}
          />

          {/* Grid lines accent */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(to right, hsl(38 44% 74%) 1px, transparent 1px), linear-gradient(to bottom, hsl(38 44% 74%) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />

          {/* Content */}
          <div className="relative z-10 p-12 lg:p-16 xl:p-20 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-12">
            <motion.div
              className="max-w-[520px]"
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Year / event badge */}
              <div className="flex items-center gap-3 mb-9">
                <div
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <Calendar className="w-3 h-3" style={{ color: 'hsl(38 44% 62%)' }} />
                  <span className="text-[8.5px] font-bold uppercase tracking-[0.3em]" style={{ color: 'hsl(38 44% 64%)' }}>
                    Bayreuth 2026
                  </span>
                </div>
                <div className="h-px flex-1 max-w-[40px]" style={{ background: 'hsl(38 44% 52% / 0.4)' }} />
              </div>

              <h2 className="font-serif text-[2.2rem] lg:text-[2.9rem] font-semibold text-white leading-[1.04] mb-6 tracking-tight">
                {t('bayreuthTeaser.title')}
              </h2>

              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.65, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="mb-7"
                style={{
                  transformOrigin: 'left',
                  height: '0.5px',
                  width: 44,
                  background: 'linear-gradient(90deg, hsl(38 44% 64% / 0.8), transparent)',
                }}
              />

              <p className="text-white/45 mb-10 leading-relaxed text-[13.5px] max-w-[400px]">
                {t('bayreuthTeaser.desc')}
              </p>

              <Link
                href="/bayreuth-2026"
                className="group inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all duration-350"
                style={{ color: 'hsl(38 44% 72%)' }}
              >
                <motion.span
                  animate={{ width: hovered && !shouldReduce ? 32 : 20 }}
                  transition={{ duration: 0.45 }}
                  className="h-px flex-shrink-0"
                  style={{ background: 'hsl(38 44% 56% / 0.7)' }}
                />
                <span className="group-hover:text-white transition-colors duration-300">
                  {t('bayreuthTeaser.cta')}
                </span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1.5" />
              </Link>
            </motion.div>

            {/* Right ornament stats */}
            <motion.div
              className="hidden lg:flex flex-col items-end gap-5 text-right"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: 'hsl(38 44% 52% / 0.5)' }}>
                  Wagner Festival
                </p>
                <div className="w-full h-px" style={{ background: 'hsl(38 44% 52% / 0.25)' }} />
                <p className="font-serif text-[1.8rem] font-semibold leading-none" style={{ color: 'hsl(38 44% 62% / 0.35)', letterSpacing: '-0.04em' }}>
                  2026
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
