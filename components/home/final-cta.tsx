'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function FinalCta() {
  const { locale } = useI18n();
  const shouldReduce = useReducedMotion();

  return (
    <section
      className="py-32 lg:py-56 relative overflow-hidden"
      style={{ background: 'hsl(218 22% 7%)' }}
    >
      {/* Deep ambient center glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={shouldReduce ? {} : { opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: 'radial-gradient(ellipse 60% 45% at 50% 115%, hsl(38 44% 56% / 0.1), transparent)',
        }}
      />

      {/* Top gradient border */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, hsl(38 44% 74% / 0.2), hsl(41 58% 64% / 0.28), hsl(38 44% 74% / 0.2), transparent)' }}
      />

      {/* Bottom gradient border */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, hsl(38 44% 74% / 0.1), transparent)' }}
      />

      {/* Floating left orb */}
      {!shouldReduce && (
        <>
          <motion.div
            className="absolute -left-40 top-1/2 w-96 h-96 rounded-full pointer-events-none"
            animate={{ y: [0, -18, 0], opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: 'radial-gradient(circle, hsl(38 44% 58% / 0.07), transparent 68%)',
              filter: 'blur(32px)',
              transform: 'translateY(-50%)',
            }}
          />
          <motion.div
            className="absolute -right-40 top-1/2 w-96 h-96 rounded-full pointer-events-none"
            animate={{ y: [0, 18, 0], opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
            style={{
              background: 'radial-gradient(circle, hsl(38 44% 56% / 0.06), transparent 68%)',
              filter: 'blur(32px)',
              transform: 'translateY(-50%)',
            }}
          />
        </>
      )}

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, hsl(38 44% 74% / 0.025) 1px, transparent 1px), linear-gradient(to bottom, hsl(38 44% 74% / 0.025) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <div className="container-luxury relative">
        <motion.div
          className="max-w-[700px] mx-auto text-center"
          initial={{ opacity: 0, y: shouldReduce ? 0 : 48 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Eyebrow ornament */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="ornament-rule mb-9"
          >
            <span className="text-[8px] font-light uppercase tracking-[0.4em]" style={{ color: 'hsl(38 44% 56% / 0.6)' }}>
              {locale === 'de' ? 'Fünf Apartments. Ein Kontakt.' : 'Five apartments. One contact.'}
            </span>
          </motion.div>

          {/* Large headline with gradient text on second line */}
          <motion.h2
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.95, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-[2.8rem] lg:text-[4.2rem] xl:text-[5rem] font-semibold leading-[1.0] mb-8 tracking-tight text-white"
          >
            {locale === 'de'
              ? <>Ihr nächster Aufenthalt<br />
                <span style={{
                  background: 'linear-gradient(135deg, hsl(38 44% 80%), hsl(41 58% 70%), hsl(38 44% 78%))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>in Bayreuth beginnt hier.</span></>
              : <>Your next stay<br />
                <span style={{
                  background: 'linear-gradient(135deg, hsl(38 44% 80%), hsl(41 58% 70%), hsl(38 44% 78%))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>in Bayreuth begins here.</span></>}
          </motion.h2>

          {/* Gold divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.75, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-9"
            style={{
              transformOrigin: 'center',
              height: '0.5px',
              width: 52,
              background: 'linear-gradient(90deg, transparent, hsl(38 44% 66% / 0.85), hsl(41 58% 66% / 0.95), hsl(38 44% 66% / 0.85), transparent)',
            }}
          />

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.75, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mb-12 leading-relaxed text-[14px] max-w-[440px] mx-auto"
            style={{ color: 'hsl(218 10% 55%)' }}
          >
            {locale === 'de'
              ? 'Direkt buchen — persönliche Bestätigung, kein Callcenter, kein Portal. Und für Direktbuchungen: eine kuratierte Flasche Wein bei Anreise.'
              : 'Book directly — personal confirmation, no call center, no platform. And for direct bookings: a curated bottle of wine on arrival.'}
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.32 }}
            className="flex flex-col sm:flex-row gap-3.5 justify-center mb-11"
          >
            <Link
              href="/residences"
              className="group inline-flex items-center justify-center gap-2.5 px-10 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all duration-400"
              style={{
                background: 'hsl(36 22% 95%)',
                color: 'hsl(218 22% 10%)',
                borderRadius: 'var(--radius)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'white';
                el.style.transform = 'translateY(-2px)';
                el.style.boxShadow = '0 18px 52px rgba(0,0,0,0.45)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'hsl(36 22% 95%)';
                el.style.transform = '';
                el.style.boxShadow = '';
              }}
            >
              {locale === 'de' ? 'Residenzen entdecken' : 'Explore residences'}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1.5" />
            </Link>

            <motion.a
              href="https://wa.me/491601832917"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 px-10 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all duration-400"
              style={{
                color: 'hsl(38 44% 68%)',
                border: '1px solid hsl(38 44% 58% / 0.28)',
                borderRadius: 'var(--radius)',
              }}
              whileHover={shouldReduce ? {} : {
                borderColor: 'hsl(38 44% 64% / 0.6)',
                backgroundColor: 'hsl(38 44% 58% / 0.07)',
                y: -2,
              }}
              transition={{ duration: 0.28 }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </motion.a>
          </motion.div>

          {/* Footer micro-links */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="space-y-3"
          >
            <p
              className="text-[9px] tracking-[0.12em]"
              style={{ color: 'hsl(218 10% 34%)' }}
            >
              {locale === 'de'
                ? 'Antwort in unter 2 Stunden · DE · EN · FR · SR'
                : 'Reply within 2 hours · DE · EN · FR · SR'}
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {[
                { href: '/bayreuth-2026', labelDe: 'Festspiele 2026 →', labelEn: 'Festival 2026 →' },
                { href: '/business-stays', labelDe: 'Geschäftsreisen →', labelEn: 'Business stays →' },
                { href: '/long-stay', labelDe: 'Langzeitaufenthalte →', labelEn: 'Long stays →' },
              ].map((item, i) => (
                <span key={i} className="flex items-center gap-4">
                  {i > 0 && <span style={{ color: 'hsl(218 10% 20%)' }}>·</span>}
                  <Link
                    href={item.href}
                    className="text-[8.5px] uppercase tracking-[0.16em] transition-colors duration-300"
                    style={{ color: 'hsl(38 44% 46% / 0.6)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'hsl(38 44% 64%)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'hsl(38 44% 46% / 0.6)'; }}
                  >
                    {locale === 'de' ? item.labelDe : item.labelEn}
                  </Link>
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
