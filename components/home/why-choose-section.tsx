'use client';

import { useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { MapPin, ChefHat, Users, Phone, BadgeCheck, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const icons = [MapPin, ChefHat, Sparkles, Phone, Users, BadgeCheck];

function ReasonCard({
  icon: Icon,
  title,
  desc,
  index,
  number,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  index: number;
  number: string;
}) {
  const shouldReduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.75, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="group relative p-7 lg:p-8 overflow-hidden cursor-default"
      style={{
        background: hovered ? 'white' : 'hsl(36 14% 96% / 0.6)',
        border: '1px solid',
        borderColor: hovered ? 'hsl(38 44% 74% / 0.32)' : 'hsl(34 16% 85% / 0.45)',
        borderRadius: 'var(--radius)',
        transition: 'all 0.45s cubic-bezier(0.22,1,0.36,1)',
        transform: hovered && !shouldReduce ? 'translateY(-5px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 24px 64px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)'
          : 'none',
      }}
    >
      {/* Large faded outline number */}
      <div
        className="absolute -top-3 -right-2 font-serif leading-none pointer-events-none select-none transition-opacity duration-500"
        style={{
          fontSize: '5rem',
          color: 'transparent',
          WebkitTextStroke: `1px hsl(38 44% 74% / ${hovered ? '0.16' : '0.07'})`,
          letterSpacing: '-0.06em',
        }}
      >
        {number}
      </div>

      {/* Top ambient glow */}
      <motion.div
        className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        style={{
          background: 'radial-gradient(circle at top right, hsl(41 58% 58% / 0.07), transparent 65%)',
        }}
      />

      {/* Icon */}
      <div
        className="w-9 h-9 flex items-center justify-center mb-6 relative z-10 transition-all duration-350"
        style={{
          background: hovered
            ? 'linear-gradient(135deg, hsl(38 44% 74% / 0.16), hsl(41 58% 58% / 0.1))'
            : 'hsl(38 44% 74% / 0.09)',
          border: '1px solid',
          borderColor: hovered ? 'hsl(38 44% 74% / 0.38)' : 'hsl(38 44% 74% / 0.18)',
          borderRadius: 'var(--radius)',
        }}
      >
        <Icon
          className="w-3.5 h-3.5 transition-all duration-400"
          style={{
            color: hovered ? 'hsl(34 40% 42%)' : 'hsl(34 40% 54%)',
            transform: hovered && !shouldReduce ? 'scale(1.12) rotate(3deg)' : 'scale(1) rotate(0)',
          }}
        />
      </div>

      {/* Title + animated rule */}
      <div className="mb-3 relative z-10">
        <h3 className="font-semibold text-[13.5px] leading-snug text-foreground">{title}</h3>
        <motion.div
          animate={{ scaleX: hovered ? 1 : 0, opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{
            transformOrigin: 'left',
            height: 1,
            background: 'linear-gradient(90deg, hsl(34 40% 50% / 0.5), transparent)',
            marginTop: 5,
          }}
        />
      </div>

      <p
        className="text-[12.5px] leading-relaxed relative z-10 transition-colors duration-300"
        style={{ color: hovered ? 'hsl(218 12% 30%)' : 'hsl(218 8% 44%)' }}
      >
        {desc}
      </p>
    </motion.div>
  );
}

export function WhyChooseSection() {
  const { locale } = useI18n();
  const headingRef = useRef<HTMLDivElement>(null);
  const headingInView = useInView(headingRef, { once: true, margin: '-80px' });
  const shouldReduce = useReducedMotion();

  const reasons =
    locale === 'de'
      ? [
          { title: 'Herz von Bayreuth', desc: 'Alle fünf Residenzen am Sternplatz, der Opernstraße oder in der Innenstadt — zu Fuß zu Restaurants, Opernhaus und Hofgarten.' },
          { title: 'Volle Küche, echter Raum', desc: 'Induktionskochfeld, Backofen, Spülmaschine, Nespresso — mehr Freiheit als jedes Hotelzimmer, auf 58–75 m².' },
          { title: 'Boutique-Qualität', desc: 'Hochwertige Bettwäsche, Premium-Bad, durchdachtes Interieur — jede Residenz von uns persönlich eingerichtet und gepflegt.' },
          { title: 'Echter Mensch, kein Portal', desc: 'Sie erreichen uns direkt per WhatsApp oder Telefon — auf Deutsch, Englisch, Französisch oder Serbisch. Antwort in unter 2 Stunden.' },
          { title: 'Familie statt Konzern', desc: 'Kein wechselnder Gastgeber, kein anonymer Vermieter. Wir kennen unsere Apartments — und stehen persönlich dafür.' },
          { title: '9,4 / 10 Gästebewertung', desc: 'Aus 48+ echten Bewertungen — bewertet für Lage, Komfort, Sauberkeit und persönlichen Service.' },
        ]
      : [
          { title: 'Heart of Bayreuth', desc: 'All five residences at Sternplatz, Opernstraße, or the city center — walking distance to restaurants, opera house, and Hofgarten.' },
          { title: 'Full kitchen, real space', desc: 'Induction hob, oven, dishwasher, Nespresso — more freedom than any hotel room, across 58–75 m².' },
          { title: 'Boutique quality', desc: 'Premium linens, quality bathrooms, thoughtful interiors — every residence personally furnished and maintained by us.' },
          { title: 'Real person, not a platform', desc: 'Reach us directly via WhatsApp or phone — in German, English, French, or Serbian. Reply within 2 hours.' },
          { title: 'Family, not a corporation', desc: 'No rotating host, no anonymous landlord. We know our apartments — and personally stand behind every stay.' },
          { title: '9.4 / 10 guest rating', desc: 'From 48+ real reviews — rated for location, comfort, cleanliness, and personal service.' },
        ];

  return (
    <section className="py-28 lg:py-44 relative overflow-hidden" style={{ background: 'hsl(36 14% 95% / 0.35)' }}>

      {/* Decorative vertical center line */}
      <div
        className="absolute left-1/2 top-0 bottom-0 w-px pointer-events-none hidden xl:block"
        style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--champagne) / 0.14) 20%, hsl(var(--champagne) / 0.14) 80%, transparent)' }}
      />

      {/* Large decorative background text */}
      <div
        className="absolute left-0 bottom-0 font-serif leading-none pointer-events-none select-none hidden lg:block"
        style={{
          fontSize: '22vw',
          color: 'transparent',
          WebkitTextStroke: '1px hsl(34 16% 85% / 0.18)',
          letterSpacing: '-0.06em',
          bottom: '-8vw',
          left: '-3vw',
        }}
      >
        06
      </div>

      <div className="container-luxury">
        {/* Header */}
        <div ref={headingRef} className="mb-16 lg:mb-20">
          <div className="lg:flex lg:items-end lg:gap-24">
            <div className="flex-1">
              <motion.div
                className="flex items-center gap-3 mb-7"
                initial={{ opacity: 0 }}
                animate={headingInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.6 }}
              >
                <div className="section-header-accent" />
                <span className="text-eyebrow-gold">
                  {locale === 'de' ? 'Warum All in One Residences?' : 'Why All in One Residences?'}
                </span>
              </motion.div>

              <motion.h2
                className="font-serif text-[2.6rem] lg:text-[3.8rem] font-semibold leading-[1.01] tracking-tight max-w-2xl"
                initial={{ opacity: 0, y: shouldReduce ? 0 : 28 }}
                animate={headingInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                {locale === 'de' ? (
                  <>Mehr als ein Airbnb.<br /><span style={{ color: 'hsl(var(--champagne-dark))' }}>Mehr als ein Hotel.</span></>
                ) : (
                  <>More than an Airbnb.<br /><span style={{ color: 'hsl(var(--champagne-dark))' }}>More than a hotel.</span></>
                )}
              </motion.h2>
            </div>

            {/* Large outline number */}
            <motion.div
              className="hidden lg:block shrink-0"
              initial={{ opacity: 0, y: 12 }}
              animate={headingInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="font-serif leading-none select-none block"
                style={{
                  fontSize: '8rem',
                  color: 'transparent',
                  WebkitTextStroke: '1px hsl(38 44% 74% / 0.2)',
                  letterSpacing: '-0.05em',
                }}
              >
                06
              </span>
            </motion.div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 lg:gap-4">
          {reasons.map((r, i) => (
            <ReasonCard
              key={i}
              icon={icons[i]}
              title={r.title}
              desc={r.desc}
              index={i}
              number={String(i + 1).padStart(2, '0')}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
