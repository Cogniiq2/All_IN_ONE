'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarClock, Car, Key, Moon, Star, Clock, MapPin, Ticket, Check, ArrowRight,
  MessageCircle, ChevronDown, Shield, BadgeCheck, Flame,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

const festivalFacts = [
  { icon: Ticket, de: { label: 'Warteliste', value: 'Bis zu 10 Jahre' }, en: { label: 'Waitlist', value: 'Up to 10 years' } },
  { icon: Star, de: { label: 'Prestige', value: 'Weltklasse' }, en: { label: 'Prestige', value: 'World-class' } },
  { icon: Clock, de: { label: 'Festspiele 2026', value: '25. Juli — 28. Aug.' }, en: { label: 'Festival 2026', value: 'Jul 25 — Aug 28' } },
  { icon: MapPin, de: { label: 'Lage', value: 'Stadtzentrum' }, en: { label: 'Location', value: 'City center' } },
];

export default function Bayreuth2026Client() {
  const { locale } = useI18n();
  const shouldReduce = useReducedMotion();
  const de = locale === 'de';
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const advantages = de ? [
    {
      icon: Flame,
      title: 'Zentrale Lage — keine Kompromisse',
      body: 'Alle fünf Residenzen liegen im Herzen Bayreuths. Zu Fuß zur Oper, zu Restaurants, zum Hofgarten und zu den besten Cafés. Nach dem letzten Akt nicht in den Bus, sondern einfach nach Hause gehen.',
    },
    {
      icon: Car,
      title: 'Eigener Garagenstellplatz',
      body: 'Jede Residenz beinhaltet einen reservierten Tiefgaragenplatz — ein seltenes Privileg im Zentrum Bayreuths, besonders während der Festspielzeit.',
    },
    {
      icon: Key,
      title: 'Self Check-in — jederzeit',
      body: 'Kein Warten, keine Schlüsselübergabe. Ihr Zugangscode erreicht Sie digital vor der Anreise. Ob nach dem letzten Akt um Mitternacht oder am frühen Morgen — Sie bestimmen, wann Sie ankommen.',
    },
    {
      icon: Moon,
      title: 'Echte Erholung zwischen den Aufführungen',
      body: 'Premium-Betten, ruhige Räume, vollständig ausgestattete Küche — eigenes Kochen statt Restaurantzwang. Boutique-Hotel-Qualität in Ihrem eigenen Apartment.',
    },
  ] : [
    {
      icon: Flame,
      title: 'Central location — no compromises',
      body: 'All five residences are in the heart of Bayreuth. Walk to the opera, restaurants, Hofgarten, and the best cafés. After the final act, no bus — just walk home.',
    },
    {
      icon: Car,
      title: 'Your own garage space',
      body: 'Every residence includes a reserved underground parking spot — a rare privilege in central Bayreuth, especially during festival season.',
    },
    {
      icon: Key,
      title: 'Self check-in — at any time',
      body: 'No waiting, no key handover. Your access code arrives digitally before your stay. Whether after the final act at midnight or early in the morning — you decide when you arrive.',
    },
    {
      icon: Moon,
      title: 'Real rest between performances',
      body: 'Premium beds, quiet rooms, fully equipped kitchen — cook your own meals instead of relying on restaurants. Boutique hotel quality in your own apartment.',
    },
  ];

  const whyUs = de ? [
    'Fünf Residenzen — alle im Zentrum von Bayreuth, zu Fuß zur Festspielhalle',
    'Direktbuchung: kein Aufpreis, keine Plattformgebühr',
    'Persönlicher Support auf Deutsch, Englisch, Französisch und Serbisch',
    'Bewertung 9.4/10 von echten Festspielgästen',
    'Tiefgaragenstellplatz inklusive in jeder Residenz',
    'Self Check-in 24/7 — kein Zeitfenster erforderlich',
    'Willkommenswein bei Direktbuchung',
  ] : [
    'Five residences — all in central Bayreuth, walking distance to the Festspielhalle',
    'Direct booking: no markup, no platform service fee',
    'Personal support in German, English, French, and Serbian',
    'Rated 9.4/10 by real festival guests',
    'Underground garage space included at every residence',
    'Self check-in 24/7 — no time window required',
    'Welcome wine for direct bookings',
  ];

  const faqs = de ? [
    {
      q: 'Sind Ihre Apartments während der Bayreuther Festspiele verfügbar?',
      a: 'Verfügbarkeit während der Festspiele ist begrenzt und variiert je nach Residence und Zeitraum. Wir empfehlen, so früh wie möglich anzufragen — idealerweise mehrere Monate im Voraus. Kontaktieren Sie uns direkt für aktuelle Verfügbarkeiten.',
    },
    {
      q: 'Wie nah liegen Ihre Apartments am Festspielhaus?',
      a: 'Alle fünf Residenzen liegen im Herzen Bayreuths. Das Festspielhaus ist mit dem Auto oder Taxi in wenigen Minuten erreichbar. Die Bayreuther Innenstadt mit ihren Restaurants und Cafés ist zu Fuß zugänglich.',
    },
    {
      q: 'Ist ein Parkplatz während der Festspielzeit inklusive?',
      a: 'Ja — jede Residenz beinhaltet einen festen Tiefgaragenstellplatz. Das ist besonders während der Festspielzeit ein echter Vorteil, wenn Parkplätze in der Innenstadt rar sind.',
    },
    {
      q: 'Kann ich für mehrere Wochen während der gesamten Festspiele buchen?',
      a: 'Ja, Langzeitaufenthalte sind möglich und willkommen. Sprechen Sie uns direkt an — wir finden die beste Lösung für Ihren Aufenthaltszeitraum und bieten bei längeren Buchungen gerne individuelle Konditionen.',
    },
    {
      q: 'Bieten Sie Gruppenunterkünfte für Festspielbesucher an?',
      a: 'Mit fünf separaten Apartments können wir auch mehrere Parteien oder eine größere Gruppe unterbringen. Sprechen Sie uns an, um die optimale Kombination für Ihre Gruppe zu finden.',
    },
  ] : [
    {
      q: 'Are your apartments available during the Bayreuth Festival?',
      a: 'Availability during the festival is limited and varies by residence and time period. We recommend inquiring as early as possible — ideally several months in advance. Contact us directly for current availability.',
    },
    {
      q: 'How close are your apartments to the Festspielhaus?',
      a: 'All five residences are in the heart of Bayreuth. The Festspielhaus is reachable by car or taxi in just a few minutes. Bayreuth\'s city center with its restaurants and cafés is walkable.',
    },
    {
      q: 'Is parking included during festival season?',
      a: 'Yes — every residence includes a dedicated underground garage space. That is particularly valuable during festival season when parking in the city center is scarce.',
    },
    {
      q: 'Can I book for multiple weeks during the entire festival period?',
      a: 'Yes, long stays are possible and welcome. Contact us directly — we will find the best solution for your stay period and are happy to offer individual terms for longer bookings.',
    },
    {
      q: 'Do you offer group accommodation for festival visitors?',
      a: 'With five separate apartments we can accommodate multiple parties or a larger group. Get in touch to find the optimal combination for your group.',
    },
  ];

  return (
    <div className="py-12 lg:py-24">
      <div className="container-luxury">

        {/* Hero */}
        <SectionReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-20 lg:mb-28">
            <div>
              <div className="flex items-center gap-3 mb-7">
                <div className="section-header-accent" />
                <span className="text-eyebrow-gold">
                  {de ? 'Bayreuther Festspiele 2026' : 'Bayreuth Festival 2026'}
                </span>
              </div>

              <h1
                className="font-serif font-semibold leading-tight tracking-tight mb-7"
                style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', letterSpacing: '-0.025em' }}
              >
                {de ? (
                  <>Unterkunft für<br />
                  <span style={{ color: 'hsl(var(--champagne-dark))' }}>die Festspiele 2026.</span></>
                ) : (
                  <>Accommodation for<br />
                  <span style={{ color: 'hsl(var(--champagne-dark))' }}>the 2026 Festival.</span></>
                )}
              </h1>

              <p className="text-muted-foreground leading-relaxed mb-5 text-[15px]">
                {de
                  ? 'Die Bayreuther Festspiele 2026 finden vom 25. Juli bis 28. August statt. Zentrale Unterkünfte mit echtem Komfort sind rar — alle fünf unserer Residenzen liegen im Herzen Bayreuths.'
                  : 'The Bayreuth Festival 2026 runs from July 25 to August 28. Central accommodation with genuine comfort is scarce — all five of our residences are in the heart of Bayreuth.'}
              </p>
              <p className="text-muted-foreground leading-relaxed mb-9 text-[15px]">
                {de
                  ? 'Nach sechs Stunden Wagner brauchen Sie kein Hotelzimmer. Sie brauchen ein Zuhause: mit eigener Küche, ruhigen Räumen und einem eigenen Garagenstellplatz direkt im Zentrum.'
                  : 'After six hours of Wagner you do not need a hotel room. You need a home: with your own kitchen, quiet rooms, and a private garage space right in the center.'}
              </p>

              {/* Urgency note */}
              <div
                className="flex items-center gap-3 p-4 mb-8"
                style={{
                  background: 'hsl(38 44% 74% / 0.08)',
                  border: '1px solid hsl(38 44% 74% / 0.22)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <Flame className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(38 44% 58%)' }} />
                <p className="text-[12.5px]" style={{ color: 'hsl(34 40% 38%)' }}>
                  <strong>{de ? 'Begrenzte Verfügbarkeit:' : 'Limited availability:'}</strong>{' '}
                  {de
                    ? 'Festspielzeit-Unterkünfte in zentraler Lage sind jedes Jahr schnell vergeben. Jetzt anfragen.'
                    : 'Festival-season accommodation in central locations sells out every year. Inquire now.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/contact"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-350"
                  style={{
                    background: 'hsl(218 22% 9%)',
                    color: 'hsl(36 22% 96%)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'hsl(218 22% 13%)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.16)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'hsl(218 22% 9%)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                  }}
                >
                  {de ? 'Jetzt anfragen' : 'Inquire now'}
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/residences"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-medium transition-all duration-350"
                  style={{
                    border: '1px solid hsl(34 16% 85% / 0.7)',
                    borderRadius: 'var(--radius)',
                    color: 'hsl(218 8% 38%)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.35)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.7)';
                  }}
                >
                  {de ? 'Alle Residenzen' : 'All residences'}
                </Link>
              </div>
            </div>

            <div
              className="relative overflow-hidden"
              style={{ aspectRatio: '4/3', borderRadius: 'var(--radius)' }}
            >
              <Image
                src="/images/733083360 copy.jpg"
                alt={de
                  ? 'Bayreuth Festspielhaus 2026 — Premium Unterkunft im Zentrum'
                  : 'Bayreuth Festival 2026 — premium accommodation in the city center'}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.28), transparent 60%)' }}
              />
            </div>
          </div>
        </SectionReveal>

        {/* Festival facts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-20 lg:mb-28">
          {festivalFacts.map((fact, i) => {
            const content = fact[de ? 'de' : 'en'];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: shouldReduce ? 0 : 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="p-6 text-center"
                style={{
                  background: 'white',
                  border: '1px solid hsl(34 16% 85% / 0.55)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div
                  className="w-9 h-9 flex items-center justify-center mx-auto mb-4"
                  style={{
                    background: 'hsl(38 44% 74% / 0.1)',
                    border: '1px solid hsl(38 44% 74% / 0.22)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <fact.icon className="w-4 h-4" style={{ color: 'hsl(34 40% 48%)' }} />
                </div>
                <p className="font-serif font-semibold text-[1.25rem] mb-1 tracking-tight">
                  {content.value}
                </p>
                <p
                  className="text-[9.5px] font-medium uppercase tracking-[0.18em]"
                  style={{ color: 'hsl(218 8% 52%)' }}
                >
                  {content.label}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* 4 Advantages */}
        <SectionReveal>
          <div className="flex items-center gap-3 mb-10">
            <div className="section-header-accent" />
            <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight">
              {de ? 'Vier Gründe, früh zu buchen' : 'Four reasons to book early'}
            </h2>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-20 lg:mb-28">
          {advantages.map((adv, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="p-7 transition-all duration-350"
              style={{
                background: 'white',
                border: '1px solid hsl(34 16% 85% / 0.55)',
                borderRadius: 'var(--radius)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.3)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.06)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.55)';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
                (e.currentTarget as HTMLElement).style.transform = '';
              }}
            >
              <div
                className="w-9 h-9 flex items-center justify-center mb-6"
                style={{
                  background: 'hsl(38 44% 74% / 0.1)',
                  border: '1px solid hsl(38 44% 74% / 0.22)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <adv.icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
              </div>
              <h3 className="font-semibold text-[14px] mb-3 leading-snug">{adv.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{adv.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Why choose us */}
        <SectionReveal>
          <div className="max-w-2xl mx-auto mb-20 lg:mb-28">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-3 mb-5">
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
                <span className="text-eyebrow-gold">
                  {de ? 'Warum wir' : 'Why us'}
                </span>
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
              </div>
              <h2 className="font-serif text-[2rem] font-semibold tracking-tight">
                {de
                  ? 'All in One Residences für die Festspiele'
                  : 'All in One Residences for the festival'}
              </h2>
            </div>
            <div className="space-y-2.5">
              {whyUs.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: shouldReduce ? 0 : -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-3.5 p-4"
                  style={{
                    background: 'hsl(36 14% 96% / 0.5)',
                    border: '1px solid hsl(34 16% 85% / 0.45)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(38 44% 58%)' }} />
                  <span className="text-[13px]">{item}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionReveal>

        {/* Festspiele FAQ */}
        <SectionReveal>
          <div className="max-w-2xl mx-auto mb-20 lg:mb-28">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-3 mb-5">
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
                <span className="text-eyebrow-gold">FAQ</span>
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
              </div>
              <h2 className="font-serif text-[2rem] font-semibold tracking-tight">
                {de ? 'Fragen zur Festspielunterkunft' : 'Festival accommodation questions'}
              </h2>
            </div>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  style={{
                    border: '1px solid',
                    borderColor: openFaq === i ? 'hsl(38 44% 74% / 0.3)' : 'hsl(34 16% 85% / 0.5)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    transition: 'border-color 0.3s',
                    background: openFaq === i ? 'hsl(36 14% 96% / 0.5)' : 'white',
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-start justify-between p-5 text-left"
                  >
                    <span className="text-[13.5px] font-medium pr-4 leading-snug">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {openFaq === i && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="px-5 pb-5"
                    >
                      <p className="text-[13px] text-muted-foreground leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>

        {/* CTA dark block */}
        <SectionReveal>
          <div
            className="relative overflow-hidden p-10 lg:p-16 text-center mb-16"
            style={{
              background: 'linear-gradient(135deg, hsl(218 22% 7%), hsl(218 18% 11%))',
              borderRadius: 'var(--radius)',
              border: '1px solid hsl(38 44% 52% / 0.15)',
            }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-44 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, hsl(38 44% 60% / 0.09), transparent 70%)' }}
            />
            <div className="relative z-10">
              <p
                className="text-[9px] font-bold uppercase tracking-[0.28em] mb-4"
                style={{ color: 'hsl(38 44% 58% / 0.55)' }}
              >
                {de ? 'Begrenzte Festspiel-Verfügbarkeit' : 'Limited festival availability'}
              </p>
              <h2 className="font-serif text-[2rem] lg:text-[2.8rem] font-semibold text-white mb-4 tracking-tight">
                {de ? 'Sichern Sie sich Ihren Platz für 2026.' : 'Secure your place for 2026.'}
              </h2>
              <p className="mb-9 max-w-md mx-auto text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {de
                  ? 'Zentraler geht es nicht. Komfortabler auch nicht. Verfügbarkeit während der Festspiele ist begrenzt — sprechen Sie uns jetzt an.'
                  : 'It does not get more central. Or more comfortable. Festival availability is limited — reach out now.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                <Link
                  href="/contact"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-350"
                  style={{
                    background: 'hsl(36 22% 97%)',
                    color: 'hsl(218 18% 9%)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.28)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                    (e.currentTarget as HTMLElement).style.transform = '';
                  }}
                >
                  {de ? 'Jetzt anfragen' : 'Inquire now'}
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
                <a
                  href="https://wa.me/491601832917"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-medium transition-all duration-350"
                  style={{
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.7)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.35)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.15)';
                  }}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
                <Link
                  href="/residences"
                  className="group inline-flex items-center justify-center gap-2 px-8 py-4 text-[11px] font-medium transition-all duration-350"
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.55)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.28)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
                  }}
                >
                  {de ? 'Residenzen entdecken' : 'Explore residences'}
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6">
                {[
                  { icon: Shield, text: de ? 'Sichere Direktbuchung' : 'Secure direct booking' },
                  { icon: BadgeCheck, text: de ? 'Persönliche Bestätigung' : 'Personal confirmation' },
                  { icon: CalendarClock, text: de ? 'Antwort < 24h' : 'Reply < 24h' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <item.icon className="w-3 h-3" style={{ color: 'hsl(38 44% 58% / 0.55)' }} />
                    <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* Related pages */}
        <SectionReveal>
          <div className="pt-10" style={{ borderTop: '1px solid hsl(34 16% 85% / 0.4)' }}>
            <p
              className="text-[9.5px] uppercase tracking-[0.22em] mb-6 text-center font-medium"
              style={{ color: 'hsl(218 8% 52%)' }}
            >
              {de ? 'Weitere Informationen' : 'More information'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { href: '/book-direct', label: de ? 'Direkt buchen' : 'Book direct', sub: de ? 'Beste Konditionen' : 'Best rates' },
                { href: '/reviews', label: de ? 'Gästestimmen' : 'Guest reviews', sub: '9.4/10 · 48+' },
                { href: '/journal/bayreuth-festspiele-unterkunft-guide', label: de ? 'Unterkunfts-Guide' : 'Accommodation guide', sub: de ? 'Journal-Artikel' : 'Journal article' },
                { href: '/faq', label: 'FAQ', sub: de ? 'Häufige Fragen' : 'Common questions' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group p-4 transition-all duration-300"
                  style={{
                    border: '1px solid hsl(34 16% 85% / 0.5)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.32)';
                    (e.currentTarget as HTMLElement).style.background = 'white';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.05)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.5)';
                    (e.currentTarget as HTMLElement).style.background = '';
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                  }}
                >
                  <p
                    className="font-medium text-[12.5px] mb-1 transition-colors group-hover:text-foreground"
                    style={{ color: 'hsl(218 12% 22%)' }}
                  >
                    {item.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </SectionReveal>

      </div>
    </div>
  );
}
