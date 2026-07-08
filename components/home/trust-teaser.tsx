'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MessageCircle, Globe as Globe2, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';

function TrustPillarCard({
  pillar,
  index,
}: {
  pillar: { icon: React.ElementType; label: string; desc: string };
  index: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.58, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="flex items-start gap-4.5 p-6 relative overflow-hidden cursor-default"
      style={{
        background: hovered ? 'white' : 'hsl(36 14% 96% / 0.85)',
        border: '1px solid',
        borderColor: hovered ? 'hsl(38 44% 74% / 0.3)' : 'hsl(34 16% 85% / 0.5)',
        borderRadius: 'var(--radius)',
        boxShadow: hovered
          ? '0 8px 28px rgba(0,0,0,0.06), 0 0 0 1px hsl(38 44% 74% / 0.07)'
          : 'none',
        transition: 'border-color 0.35s, box-shadow 0.35s, background 0.35s, padding-left 0.35s',
        paddingLeft: hovered ? '24px' : '24px',
      }}
    >
      {/* Animated left accent bar */}
      <motion.div
        animate={{ scaleY: hovered ? 1 : 0, opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-4 bottom-4 w-0.5"
        style={{
          background: 'linear-gradient(to bottom, hsl(34 40% 50%), hsl(41 58% 58%))',
          transformOrigin: 'top',
          borderRadius: '0 1px 1px 0',
        }}
      />

      <div
        className="w-9 h-9 flex items-center justify-center flex-shrink-0 transition-all duration-320"
        style={{
          background: hovered
            ? 'linear-gradient(135deg, hsl(38 44% 74% / 0.18), hsl(41 58% 58% / 0.12))'
            : 'hsl(38 44% 74% / 0.1)',
          border: '1px solid',
          borderColor: hovered ? 'hsl(38 44% 74% / 0.35)' : 'hsl(38 44% 74% / 0.18)',
          borderRadius: 'var(--radius)',
        }}
      >
        <pillar.icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
      </div>

      <div>
        <p
          className="font-semibold text-[13px] mb-1.5 leading-tight transition-colors duration-300"
          style={{ color: hovered ? 'hsl(218 18% 12%)' : 'hsl(218 12% 22%)' }}
        >
          {pillar.label}
        </p>
        <p
          className="text-[12.5px] leading-relaxed transition-colors duration-300"
          style={{ color: hovered ? 'hsl(218 8% 36%)' : 'hsl(218 8% 46%)' }}
        >
          {pillar.desc}
        </p>
      </div>
    </motion.div>
  );
}

export function TrustTeaser() {
  const { locale } = useI18n();

  const pillars = locale === 'de'
    ? [
        {
          icon: MessageCircle,
          label: 'Persönlich erreichbar',
          desc: 'WhatsApp, Telefon, E-Mail — direkter Kontakt, kein Portal dazwischen.',
        },
        {
          icon: Globe2,
          label: 'Vier Sprachen',
          desc: 'DE · EN · FR · SR — wir betreuen Sie in Ihrer Sprache.',
        },
        {
          icon: Clock,
          label: 'Antwort innerhalb von 2 Stunden',
          desc: 'Persönlich bearbeitet, werktags und am Wochenende.',
        },
      ]
    : [
        {
          icon: MessageCircle,
          label: 'Personally reachable',
          desc: 'WhatsApp, phone, email — direct contact, no platform in between.',
        },
        {
          icon: Globe2,
          label: 'Four languages',
          desc: 'DE · EN · FR · SR — we support you in your language.',
        },
        {
          icon: Clock,
          label: 'Reply within 2 hours',
          desc: 'Handled personally, on weekdays and weekends.',
        },
      ];

  return (
    <section className="py-28 lg:py-40" style={{ background: 'hsl(36 14% 95% / 0.4)' }}>
      <div className="container-luxury">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-28 items-center">

          {/* Left — brand statement */}
          <motion.div
            initial={{ opacity: 0, x: -28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="section-header-accent" />
              <span className="text-eyebrow-gold">
                {locale === 'de' ? 'Über uns' : 'About us'}
              </span>
            </div>

            <h2 className="font-serif text-[2.4rem] lg:text-[3.2rem] font-semibold leading-[1.04] mb-6 tracking-tight">
              {locale === 'de' ? (
                <>Familiengeführt.<br />Persönlich. Verbindlich.</>
              ) : (
                <>Family-run.<br />Personal. Committed.</>
              )}
            </h2>

            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.58, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8"
              style={{
                transformOrigin: 'left',
                height: 1,
                width: 44,
                background: 'linear-gradient(90deg, hsl(34 40% 50% / 0.45), hsl(41 58% 58% / 0.35))',
              }}
            />

            <p className="text-muted-foreground leading-relaxed mb-10 max-w-md text-[14px]">
              {locale === 'de'
                ? 'Wir sind kein anonymes Buchungsportal und keine Hotelkette. Ein Familienbetrieb, der fünf Apartments in Bayreuth mit echtem Engagement betreibt — persönlicher Kontakt, eigene Standards und eine klare Haltung: Jeder Gast verdient einen Aufenthalt, an den er sich erinnert.'
                : 'We are not an anonymous booking platform or hotel chain. A family business running five apartments in Bayreuth with genuine commitment — personal contact, our own standards, and one clear principle: every guest deserves a stay worth remembering.'}
            </p>

            <Link
              href="/about"
              className="group inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              <span
                className="h-px transition-all duration-500 group-hover:w-10"
                style={{ width: '20px', background: 'hsl(34 40% 50% / 0.5)' }}
              />
              {locale === 'de' ? 'Mehr über uns' : 'More about us'}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>

          {/* Right — trust pillars */}
          <div className="space-y-3.5">
            {pillars.map((p, i) => (
              <TrustPillarCard key={i} pillar={p} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
