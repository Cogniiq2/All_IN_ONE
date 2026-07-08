'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, Shield, Star, Users, Quote, ArrowRight, Check, MessageCircle, Globe } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

const team = [
  {
    name: 'Milos Popovic',
    role: { de: 'Geschäftsführung & Operations', en: 'Management & Operations' },
    initial: 'M',
    desc: {
      de: 'Milos führt All in One Residences mit unternehmerischer Präzision und echter Leidenschaft für Hospitality. Er ist der erste Ansprechpartner und steht persönlich für jede Buchung ein.',
      en: 'Milos leads All in One Residences with entrepreneurial precision and genuine passion for hospitality. He is the first point of contact and personally stands behind every booking.',
    },
  },
  {
    name: 'Milica Popovic',
    role: { de: 'Guest Experience', en: 'Guest Experience' },
    initial: 'M',
    desc: {
      de: 'Milica sorgt dafür, dass jeder Gast mehr bekommt als erwartet — von der Ankunft bis zur Abreise. Sie kennt jede Residenz in jedem Detail.',
      en: 'Milica ensures every guest receives more than expected — from arrival to departure. She knows every residence in every detail.',
    },
  },
  {
    name: 'Bogdana Popovic',
    role: { de: 'Standards & Qualität', en: 'Standards & Quality' },
    initial: 'B',
    desc: {
      de: 'Bogdana wacht über Qualität und Konsistenz. Jede Residenz wird nach denselben Standards vorbereitet — damit Sie bei jedem Aufenthalt wissen, was Sie erwartet.',
      en: 'Bogdana oversees quality and consistency. Every residence is prepared to the same standard — so you know exactly what to expect on every stay.',
    },
  },
  {
    name: 'Lazar Popovic',
    role: { de: 'Hospitality-Projekte', en: 'Hospitality Projects' },
    initial: 'L',
    desc: {
      de: 'Lazar entwickelt neue Hospitality-Konzepte und denkt das Angebot konsequent weiter — immer mit dem Blick auf das Gäste-Erlebnis.',
      en: 'Lazar develops new hospitality concepts and continuously evolves the offering — always with guest experience in mind.',
    },
  },
  {
    name: 'Djordje Popovic',
    role: { de: 'Operations & Entwicklung', en: 'Operations & Development' },
    initial: 'D',
    desc: {
      de: 'Djordje optimiert Abläufe und stellt sicher, dass alles im Hintergrund reibungslos funktioniert — damit der Aufenthalt im Vordergrund steht.',
      en: 'Djordje optimizes processes and ensures everything runs smoothly behind the scenes — so that the stay itself stays center stage.',
    },
  },
];

const trustPillars = [
  {
    icon: Heart,
    de: {
      title: 'Familiengeführt',
      body: 'Kein anonymes Unternehmen — wir sind eine Familie, die persönlich für ihre Gäste da ist. Direkt erreichbar, verbindlich, verlässlich.',
    },
    en: {
      title: 'Family-run',
      body: 'No anonymous corporation — we are a family personally committed to our guests. Directly reachable, accountable, reliable.',
    },
  },
  {
    icon: Shield,
    de: {
      title: 'Verlässliche Standards',
      body: 'Jede Residenz wird nach denselben hohen Standards vorbereitet — Premium-Bettwäsche, geprüfte Ausstattung, sorgfältig gepflegtes Interieur.',
    },
    en: {
      title: 'Consistent standards',
      body: 'Every residence is prepared to the same high standard — premium linens, checked amenities, carefully maintained interiors.',
    },
  },
  {
    icon: Star,
    de: {
      title: '9.4 / 10 Bewertung',
      body: 'Unsere Gäste bewerten uns mit 9.4 von 10 — das Ergebnis echten Engagements, nicht optimierter Prozesse.',
    },
    en: {
      title: '9.4 / 10 rating',
      body: 'Our guests rate us 9.4 out of 10 — the result of genuine dedication, not optimized processes.',
    },
  },
  {
    icon: Globe,
    de: {
      title: 'Vier Sprachen',
      body: 'Wir sprechen Deutsch, Englisch, Französisch und Serbisch — damit sich jeder Gast von Anfang an verstanden fühlt.',
    },
    en: {
      title: 'Four languages',
      body: 'We speak German, English, French, and Serbian — so every guest feels understood from the very start.',
    },
  },
];

const commitments = [
  { de: 'Persönliche Ansprechpartner — kein Callcenter', en: 'Personal contacts — no call center' },
  { de: 'Einheitliche Qualität in allen fünf Residenzen', en: 'Consistent quality across all five residences' },
  { de: 'Digitaler Self Check-in, 24/7 verfügbar', en: 'Digital self check-in, available 24/7' },
  { de: 'Garagenparkplatz in jeder Residenz inklusive', en: 'Garage parking included at every residence' },
  { de: 'Vollausgestattete Küche und hochwertige Ausstattung', en: 'Fully equipped kitchen and premium furnishings' },
  { de: 'Transparent — ohne versteckte Kosten', en: 'Transparent — no hidden costs' },
  { de: 'Antwort auf Anfragen innerhalb von 2 Stunden', en: 'Response to inquiries within 2 hours' },
];

export default function AboutClient() {
  const { locale } = useI18n();
  const shouldReduce = useReducedMotion();
  const de = locale === 'de';

  return (
    <div className="py-12 lg:py-24">
      <div className="container-luxury">

        {/* Hero */}
        <SectionReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-20 lg:mb-28">
            <div>
              <div className="flex items-center gap-3 mb-7">
                <div className="section-header-accent" />
                <span className="text-eyebrow-gold">All in One Residences</span>
              </div>

              <h1
                className="font-serif font-semibold leading-tight tracking-tight mb-7"
                style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4rem)', letterSpacing: '-0.025em' }}
              >
                {de ? (
                  <>Familie.<br />
                  <span style={{ color: 'hsl(var(--champagne-dark))' }}>Nicht Konzern.</span></>
                ) : (
                  <>Family.<br />
                  <span style={{ color: 'hsl(var(--champagne-dark))' }}>Not a corporation.</span></>
                )}
              </h1>

              <p className="text-muted-foreground leading-relaxed mb-5 text-[15px]">
                {de
                  ? 'All in One Residences ist ein familiengeführter Betrieb mit fünf exklusiven Apartments im Herzen von Bayreuth. Kein anonymes Buchungsportal — sondern Menschen, die persönlich für Ihren Aufenthalt einstehen.'
                  : 'All in One Residences is a family-run business with five exclusive apartments in the heart of Bayreuth. No anonymous booking portal — just people who personally stand behind your stay.'}
              </p>
              <p className="text-muted-foreground leading-relaxed mb-9 text-[15px]">
                {de
                  ? 'Was uns von Airbnb-Vermietern und Hotelketten unterscheidet: Jede Residenz wird persönlich betreut. Wir kennen jedes Detail. Und wir sind direkt erreichbar — nicht durch ein Ticketsystem.'
                  : 'What sets us apart from Airbnb hosts and hotel chains: every residence is personally managed. We know every detail. And we are directly reachable — not through a ticket system.'}
              </p>

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
                  {de ? 'Kontakt aufnehmen' : 'Get in touch'}
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
                  {de ? 'Residenzen entdecken' : 'Explore residences'}
                </Link>
              </div>
            </div>

            <div
              className="relative overflow-hidden"
              style={{ aspectRatio: '4/3', borderRadius: 'var(--radius)' }}
            >
              <Image
                src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=800"
                alt={de
                  ? 'All in One Residences — Serviced Apartments im Herzen von Bayreuth'
                  : 'All in One Residences — serviced apartments in the heart of Bayreuth'}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.22), transparent 60%)' }}
              />
            </div>
          </div>
        </SectionReveal>

        {/* Quote */}
        <SectionReveal>
          <div
            className="max-w-3xl mx-auto mb-20 lg:mb-28 p-8 lg:p-10 relative overflow-hidden"
            style={{
              background: 'hsl(36 14% 96% / 0.6)',
              border: '1px solid hsl(34 16% 85% / 0.5)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div
              className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
              style={{ background: 'radial-gradient(circle at top right, hsl(38 44% 60% / 0.06), transparent 70%)' }}
            />
            <Quote className="w-6 h-6 mb-6" style={{ color: 'hsl(38 44% 58%)' }} />
            <p className="font-serif italic text-[1.1rem] lg:text-[1.25rem] leading-relaxed mb-7" style={{ color: 'hsl(218 18% 16%)' }}>
              {de
                ? '"Wir betreiben unsere Residenzen wie Boutique-Hospitality — mit Liebe zum Detail, klaren Standards und dem Anspruch, dass sich jeder Gast persönlich betreut fühlt. Nicht wie ein Gast. Wie ein Mensch."'
                : '"We run our residences like boutique hospitality — with attention to detail, clear standards, and the conviction that every guest should feel personally cared for. Not like a guest. Like a person."'}
            </p>
            <div className="flex items-center gap-3.5">
              <div
                className="w-10 h-10 flex items-center justify-center font-serif font-semibold text-sm"
                style={{
                  background: 'hsl(38 44% 74% / 0.12)',
                  border: '1px solid hsl(38 44% 74% / 0.28)',
                  borderRadius: '50%',
                  color: 'hsl(34 40% 44%)',
                }}
              >
                M
              </div>
              <div>
                <p className="font-semibold text-[13.5px]">Milos Popovic</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {de ? 'Geschäftsführer' : 'Managing Director'}
                </p>
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-20 lg:mb-28">
          {[
            {
              num: '5',
              label: { de: 'Residenzen in Bayreuth', en: 'Residences in Bayreuth' },
              sub: { de: 'Sternplatz & Innenstadt', en: 'Sternplatz & City Center' },
            },
            {
              num: '9.4',
              label: { de: 'Durchschnittsbewertung', en: 'Average rating' },
              sub: { de: 'Von 48+ echten Gästen', en: 'From 48+ real guests' },
            },
            {
              num: '4',
              label: { de: 'Gesprochene Sprachen', en: 'Languages spoken' },
              sub: { de: 'DE · EN · FR · SR', en: 'DE · EN · FR · SR' },
            },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="p-8 text-center"
              style={{
                background: 'white',
                border: '1px solid hsl(38 44% 74% / 0.2)',
                borderRadius: 'var(--radius)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
              }}
            >
              <p
                className="font-serif font-semibold leading-none mb-2"
                style={{ fontSize: '3rem', color: 'hsl(34 40% 46%)' }}
              >
                {stat.num}
              </p>
              <p className="font-semibold text-[13.5px] mb-1">{stat.label[de ? 'de' : 'en']}</p>
              <p className="text-[11.5px] text-muted-foreground">{stat.sub[de ? 'de' : 'en']}</p>
            </motion.div>
          ))}
        </div>

        {/* Trust pillars */}
        <SectionReveal>
          <div className="flex items-center gap-3 mb-10">
            <div className="section-header-accent" />
            <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight">
              {de ? 'Was uns auszeichnet' : 'What sets us apart'}
            </h2>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-20 lg:mb-28">
          {trustPillars.map((pillar, i) => {
            const content = pillar[de ? 'de' : 'en'];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="p-7 transition-all duration-350"
                style={{
                  background: 'hsl(36 14% 96% / 0.5)',
                  border: '1px solid hsl(34 16% 85% / 0.5)',
                  borderRadius: 'var(--radius)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'white';
                  (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.28)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'hsl(36 14% 96% / 0.5)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.5)';
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
                  <pillar.icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
                </div>
                <h3 className="font-semibold text-[14px] mb-3 leading-snug">{content.title}</h3>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed">{content.body}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Commitments */}
        <SectionReveal>
          <div className="max-w-2xl mx-auto mb-20 lg:mb-28">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-3 mb-5">
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
                <span className="text-eyebrow-gold">
                  {de ? 'Unser Versprechen' : 'Our promise'}
                </span>
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
              </div>
              <h2 className="font-serif text-[2rem] font-semibold tracking-tight">
                {de ? 'Was Sie bei uns immer bekommen' : 'What you always get with us'}
              </h2>
            </div>
            <div className="space-y-2.5">
              {commitments.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: shouldReduce ? 0 : -10 }}
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
                  <span className="text-[13px]">{item[de ? 'de' : 'en']}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionReveal>

        {/* Team */}
        <SectionReveal>
          <div className="flex items-center gap-3 mb-3">
            <div className="section-header-accent" />
            <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight">
              {de ? 'Die Familie hinter den Residenzen' : 'The family behind the residences'}
            </h2>
          </div>
          <p className="text-muted-foreground text-[14px] mb-10 max-w-lg">
            {de
              ? 'Fünf Personen, eine Mission — Ihren Aufenthalt so persönlich und unvergesslich zu gestalten wie möglich.'
              : 'Five people, one mission — making your stay as personal and memorable as possible.'}
          </p>
        </SectionReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-20 lg:mb-28">
          {team.map((member, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 18 }}
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
                (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.28)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.55)';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
                (e.currentTarget as HTMLElement).style.transform = '';
              }}
            >
              <div
                className="w-11 h-11 flex items-center justify-center font-serif text-[1.15rem] font-semibold mb-5"
                style={{
                  background: 'hsl(38 44% 74% / 0.1)',
                  border: '1px solid hsl(38 44% 74% / 0.25)',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(34 40% 44%)',
                }}
              >
                {member.initial}
              </div>
              <h3 className="font-semibold text-[14px] mb-1">{member.name}</h3>
              <p
                className="text-[11px] font-medium uppercase tracking-[0.12em] mb-4"
                style={{ color: 'hsl(38 44% 52%)' }}
              >
                {member.role[de ? 'de' : 'en']}
              </p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {member.desc[de ? 'de' : 'en']}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA block */}
        <SectionReveal>
          <div
            className="relative overflow-hidden p-10 lg:p-16 text-center"
            style={{
              background: 'linear-gradient(135deg, hsl(218 22% 7%), hsl(218 18% 11%))',
              borderRadius: 'var(--radius)',
              border: '1px solid hsl(38 44% 52% / 0.15)',
            }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-44 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, hsl(38 44% 60% / 0.08), transparent 70%)' }}
            />
            <div className="relative z-10">
              <h2 className="font-serif text-[2rem] lg:text-[2.8rem] font-semibold text-white mb-4 tracking-tight">
                {de ? 'Jeder Aufenthalt ist ein Versprechen.' : 'Every stay is a promise.'}
              </h2>
              <p className="mb-9 max-w-md mx-auto text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {de
                  ? 'Wir stehen persönlich hinter jeder Buchung — mit unserem Namen, unserer Zeit und unserem Engagement.'
                  : 'We personally stand behind every booking — with our name, our time, and our commitment.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
                  {de ? 'Kontakt aufnehmen' : 'Get in touch'}
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
            </div>
          </div>
        </SectionReveal>

      </div>
    </div>
  );
}
