'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, X, ArrowRight, Wine, MessageCircle, Clock, Tag, Gift, RefreshCw, ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function DirectBookingSection() {
  const { locale } = useI18n();
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: '-80px' });
  const shouldReduce = useReducedMotion();

  const benefits = locale === 'de'
    ? [
        { icon: Wine, label: 'Willkommenswein bei Ankunft', desc: 'Eine kuratierte Flasche Wein — nur für Direktbuchungen.' },
        { icon: MessageCircle, label: 'Direkter persönlicher Support', desc: 'WhatsApp, Telefon, E-Mail — kein Callcenter.' },
        { icon: Clock, label: 'Flexible Check-in/out Zeiten', desc: 'Wir passen uns Ihrer Reiseroute an.' },
        { icon: Tag, label: 'Langzeit-Sonderkonditionen', desc: 'Beste Konditionen für Aufenthalte ab einer Woche.' },
        { icon: Gift, label: 'Keine Plattform-Gebühren', desc: 'Was Sie zahlen, kommt vollständig uns zugute.' },
        { icon: RefreshCw, label: 'Wiederkehrende Gäste-Vorteile', desc: 'Stammgäste profitieren von exklusiven Vorzügen.' },
      ]
    : [
        { icon: Wine, label: 'Welcome wine on arrival', desc: 'A curated bottle of wine — exclusive to direct bookings.' },
        { icon: MessageCircle, label: 'Direct personal support', desc: 'WhatsApp, phone, email — no call center.' },
        { icon: Clock, label: 'Flexible check-in/out times', desc: 'We adapt to your travel schedule.' },
        { icon: Tag, label: 'Long-stay special rates', desc: 'Best rates for stays of one week or more.' },
        { icon: Gift, label: 'No platform fees', desc: 'What you pay goes entirely to us.' },
        { icon: RefreshCw, label: 'Returning guest benefits', desc: 'Loyal guests enjoy exclusive perks.' },
      ];

  return (
    <section className="py-28 lg:py-40" style={{ background: 'hsl(36 14% 95% / 0.35)' }}>
      <div className="container-luxury">
        <div ref={sectionRef} className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-28 items-start">

          {/* Left — headline + CTA */}
          <motion.div
            initial={{ opacity: 0, x: shouldReduce ? 0 : -28 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="section-header-accent" />
              <span className="text-eyebrow-gold">
                {locale === 'de' ? 'Direktbuchung' : 'Book Direct'}
              </span>
            </div>
            <h2 className="font-serif text-[2.4rem] lg:text-[3.2rem] font-semibold leading-[1.04] mb-6 tracking-tight">
              {locale === 'de' ? (
                <>Direkt buchen.<br />Mehr erhalten.</>
              ) : (
                <>Book direct.<br />Get more.</>
              )}
            </h2>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.58, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8"
              style={{
                transformOrigin: 'left',
                height: 1,
                width: 44,
                background: 'linear-gradient(90deg, hsl(34 40% 50% / 0.45), hsl(41 58% 58% / 0.35))',
              }}
            />

            <p className="text-muted-foreground leading-relaxed mb-10 max-w-sm text-[14px]">
              {locale === 'de'
                ? 'Wenn Sie direkt bei uns buchen, profitieren Sie von Vorteilen, die keine Plattform bieten kann — persönlicher Kontakt inklusive.'
                : 'When you book directly with us, you benefit from advantages no platform can offer — personal contact included.'}
            </p>

            {/* Comparison badges */}
            <div className="flex flex-wrap items-center gap-3.5 mb-9">
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{
                  background: 'hsl(218 22% 10%)',
                  color: 'hsl(36 22% 96%)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <Check className="w-3.5 h-3.5" style={{ color: 'hsl(38 44% 74%)' }} />
                <span className="text-[11px] font-semibold tracking-[0.08em]">
                  {locale === 'de' ? 'Direktbuchung' : 'Direct Booking'}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">vs.</span>
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{
                  border: '1px solid hsl(34 16% 85% / 0.65)',
                  color: 'hsl(218 8% 55%)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <X className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium tracking-[0.06em]">
                  Airbnb / Booking.com
                </span>
              </div>
            </div>

            {/* Booking.com fallback */}
            <p className="text-[11.5px] text-muted-foreground mb-11 flex items-center gap-1.5 flex-wrap">
              <span>{locale === 'de' ? 'Oder buchen Sie über' : 'Or book via'}</span>
              <a
                href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1 font-medium transition-colors duration-200 hover:underline underline-offset-2"
                style={{ color: 'hsl(213 100% 38%)' }}
              >
                Booking.com
                <ExternalLink className="w-2.5 h-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
              <span className="text-muted-foreground/55">—</span>
              <span className="italic text-muted-foreground/65 text-[11px]">
                {locale === 'de' ? 'Direktbuchung spart Servicegebühren.' : 'direct booking saves service fees.'}
              </span>
            </p>

            <Link href="/book-direct" className="btn-luxury-primary group">
              {locale === 'de' ? 'Mehr über Direktbuchung' : 'More about direct booking'}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>

          {/* Right — benefits grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {benefits.map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.52, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="p-5 lg:p-6 group transition-all duration-350"
                style={{
                  background: 'white',
                  border: '1px solid hsl(34 16% 85% / 0.5)',
                  borderRadius: 'var(--radius)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.3)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.06)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.5)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '';
                  (e.currentTarget as HTMLElement).style.transform = '';
                }}
              >
                <div
                  className="w-8 h-8 flex items-center justify-center mb-4"
                  style={{
                    background: 'linear-gradient(135deg, hsl(38 44% 74% / 0.12), hsl(41 58% 58% / 0.08))',
                    border: '1px solid hsl(38 44% 74% / 0.22)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <benefit.icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
                </div>
                <p className="font-semibold text-[12.5px] text-foreground mb-1.5 leading-snug">{benefit.label}</p>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">{benefit.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
