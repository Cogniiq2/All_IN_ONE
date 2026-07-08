'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Wine, Headphones, Receipt, Clock, Check, X, ArrowRight, MessageCircle,
  Search, Send, FileCheck, MapPin, ExternalLink, Shield, BadgeCheck,
  ChevronDown, Phone,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function BookDirectClient() {
  const { locale } = useI18n();
  const shouldReduce = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const steps = locale === 'de'
    ? [
        {
          number: '01',
          icon: Search,
          title: 'Residenz auswählen',
          desc: 'Alle fünf Residenzen im Überblick — am Sternplatz, der Opernstraße und in der Innenstadt. Wählen Sie nach Lage, Stil und Aufenthaltslänge.',
        },
        {
          number: '02',
          icon: Send,
          title: 'Anfrage senden',
          desc: 'Per Kontaktformular, WhatsApp oder E-Mail — mit Ihren Wunschdaten, Gästezahl und einem kurzen Hinweis zu Ihrem Aufenthalt.',
        },
        {
          number: '03',
          icon: FileCheck,
          title: 'Bestätigung innerhalb 24 Stunden',
          desc: 'Sie erhalten eine persönliche Buchungsbestätigung, eine vollständige Rechnung und Ihren privaten Zugangscode.',
        },
        {
          number: '04',
          icon: MapPin,
          title: 'Ankommen & loslegen',
          desc: 'Self Check-in 24/7 — Ihr Code öffnet Apartment und Tiefgarage. Kein Empfang, kein Warten. Und wir sind per Handy jederzeit erreichbar.',
        },
      ]
    : [
        {
          number: '01',
          icon: Search,
          title: 'Choose your residence',
          desc: 'All five residences at a glance — at Sternplatz, Opernstraße, and in the city center. Choose by location, style, and length of stay.',
        },
        {
          number: '02',
          icon: Send,
          title: 'Send your request',
          desc: 'Via contact form, WhatsApp, or email — with your preferred dates, number of guests, and a brief note about your stay.',
        },
        {
          number: '03',
          icon: FileCheck,
          title: 'Confirmation within 24 hours',
          desc: 'You receive a personal booking confirmation, a complete invoice, and your private access code.',
        },
        {
          number: '04',
          icon: MapPin,
          title: 'Arrive and settle in',
          desc: 'Self check-in 24/7 — your code opens both the apartment and the underground garage. No reception, no waiting. And we are reachable by phone at any time.',
        },
      ];

  const benefits = locale === 'de'
    ? [
        {
          icon: Wine,
          title: 'Willkommenswein',
          desc: 'Eine kuratierte Flasche Wein erwartet Sie bei Anreise — persönlich ausgewählt, exklusiv für Direktbuchungen. Nicht bei Airbnb oder Booking.com buchbar.',
          exclusive: true,
        },
        {
          icon: Receipt,
          title: 'Keine Plattformgebühren',
          desc: 'Was Sie sehen, zahlen Sie. Keine Airbnb-Aufschläge, keine Booking.com-Servicegebühren. Ihr Geld kommt direkt bei uns an.',
          exclusive: false,
        },
        {
          icon: Headphones,
          title: 'Persönlicher Ansprechpartner',
          desc: 'Direkter Kontakt per WhatsApp oder Telefon — vor, während und nach Ihrem Aufenthalt. Kein Callcenter, kein Ticketsystem.',
          exclusive: false,
        },
        {
          icon: Clock,
          title: 'Flexible Check-in Zeiten',
          desc: 'Wir stimmen Check-in und Check-out flexibel mit Ihnen ab — nicht über ein Portal, sondern direkt und unkompliziert.',
          exclusive: false,
        },
        {
          icon: BadgeCheck,
          title: 'Rechnung & Buchungsbestätigung',
          desc: 'Sie erhalten eine vollständige Rechnung mit allen steuerlichen Angaben — ideal für Geschäftsreisende und Firmenbuchungen.',
          exclusive: false,
        },
        {
          icon: MessageCircle,
          title: 'Sonderkonditionen für Langzeitgäste',
          desc: 'Bei Aufenthalten ab 7 Nächten sprechen Sie direkt mit uns — individuelle Preise und Bedingungen statt starrer Portallogik.',
          exclusive: false,
        },
      ]
    : [
        {
          icon: Wine,
          title: 'Welcome wine',
          desc: 'A curated bottle of wine awaits your arrival — personally selected, exclusively for direct bookings. Not available through Airbnb or Booking.com.',
          exclusive: true,
        },
        {
          icon: Receipt,
          title: 'No platform fees',
          desc: 'What you see is what you pay. No Airbnb surcharges, no Booking.com service fees. Your money goes directly to us.',
          exclusive: false,
        },
        {
          icon: Headphones,
          title: 'Personal point of contact',
          desc: 'Direct contact via WhatsApp or phone — before, during, and after your stay. No call centers, no ticket systems.',
          exclusive: false,
        },
        {
          icon: Clock,
          title: 'Flexible check-in times',
          desc: 'We coordinate check-in and check-out flexibly with you — not through a portal, but directly and simply.',
          exclusive: false,
        },
        {
          icon: BadgeCheck,
          title: 'Invoice & booking confirmation',
          desc: 'You receive a complete invoice with all relevant details — ideal for business travelers and company bookings.',
          exclusive: false,
        },
        {
          icon: MessageCircle,
          title: 'Special rates for long stays',
          desc: 'For stays of 7+ nights, speak with us directly about individual pricing and terms — no rigid platform logic.',
          exclusive: false,
        },
      ];

  const comparison = locale === 'de'
    ? [
        { feature: 'Persönlicher direkter Support', direct: true, ota: false },
        { feature: 'Keine Servicegebühren', direct: true, ota: false },
        { feature: 'Flexible Check-in Zeiten', direct: true, ota: false },
        { feature: 'Rechnung & Steuerbeleg', direct: true, ota: false },
        { feature: 'Sonderkonditionen für Langzeitgäste', direct: true, ota: false },
        { feature: 'Stammgäste-Vorteile', direct: true, ota: false },
        { feature: 'Willkommenswein bei Ankunft', direct: true, ota: false },
        { feature: 'Antwort innerhalb von 24 Stunden', direct: true, ota: true },
        { feature: 'Stornierungsbedingungen vorhanden', direct: true, ota: true },
      ]
    : [
        { feature: 'Direct personal support', direct: true, ota: false },
        { feature: 'No service fees', direct: true, ota: false },
        { feature: 'Flexible check-in times', direct: true, ota: false },
        { feature: 'Invoice & receipt', direct: true, ota: false },
        { feature: 'Special rates for long stays', direct: true, ota: false },
        { feature: 'Returning guest benefits', direct: true, ota: false },
        { feature: 'Welcome wine on arrival', direct: true, ota: false },
        { feature: 'Response within 24 hours', direct: true, ota: true },
        { feature: 'Cancellation policy', direct: true, ota: true },
      ];

  const faqs = locale === 'de' ? [
    {
      q: 'Ist eine Direktbuchung bei Ihnen sicher — bekomme ich eine offizielle Bestätigung?',
      a: 'Ja, vollständig. Nach Ihrer Anfrage erhalten Sie persönlich eine Buchungsbestätigung per E-Mail mit allen Details Ihres Aufenthalts, eine vollständige Rechnung und Ihren Zugangscode. Wir sind ein eingetragenes Unternehmen in Bayreuth — keine anonyme Privatperson auf einer Plattform.',
    },
    {
      q: 'Wie schnell werde ich nach meiner Anfrage kontaktiert?',
      a: 'Wir antworten in der Regel innerhalb von 2 Stunden — werktags und am Wochenende. Für dringende Anfragen sind Sie auch direkt per WhatsApp willkommen.',
    },
    {
      q: 'Kann ich auch eine Rechnung für meine Firma erhalten?',
      a: 'Selbstverständlich. Alle Buchungen erhalten eine vollständige Rechnung mit USt-ID, Unternehmensdaten und allen steuerlich relevanten Angaben — ideal für Geschäftsreisende und Firmen.',
    },
    {
      q: 'Zahle ich bei Direktbuchung wirklich weniger?',
      a: 'Sie zahlen mindestens denselben Preis wie auf Booking.com oder Airbnb — aber ohne die Servicegebühren der Plattform, die typischerweise 10–20 % zusätzlich betragen. Was Sie direkt zahlen, ist der Preis. Keine Extras.',
    },
    {
      q: 'Wie funktioniert der Self Check-in?',
      a: 'Vor Ihrer Ankunft erhalten Sie Ihren persönlichen Zugangscode per SMS oder WhatsApp. Dieser öffnet die Haustür, das Apartment und den Tiefgaragenstellplatz. Check-in ist jederzeit möglich — unabhängig von Ihrer Ankunftszeit.',
    },
  ] : [
    {
      q: 'Is booking directly with you secure — will I receive an official confirmation?',
      a: 'Yes, completely. After your inquiry you will personally receive a booking confirmation by email with all stay details, a complete invoice, and your access code. We are a registered company in Bayreuth — not an anonymous private individual on a platform.',
    },
    {
      q: 'How quickly will I be contacted after my inquiry?',
      a: 'We typically respond within 2 hours — on weekdays and weekends alike. For urgent inquiries you are also welcome to reach us directly via WhatsApp.',
    },
    {
      q: 'Can I receive an invoice for my company?',
      a: 'Of course. All bookings receive a complete invoice with VAT ID, company details, and all relevant information — ideal for business travelers and company bookings.',
    },
    {
      q: 'Do I really pay less when booking direct?',
      a: 'You pay at least the same price as on Booking.com or Airbnb — but without the platform service fees, which typically add 10–20%. What you pay direct is the price. No extras.',
    },
    {
      q: 'How does self check-in work?',
      a: 'Before your arrival you receive your personal access code via SMS or WhatsApp. This opens the main entrance, the apartment, and the underground garage space. Check-in is possible at any time — independent of your arrival time.',
    },
  ];

  return (
    <div className="py-12 lg:py-24">
      <div className="container-luxury">

        {/* Hero header */}
        <SectionReveal>
          <div className="max-w-3xl mb-20 lg:mb-28">
            <div className="flex items-center gap-3 mb-7">
              <div className="section-header-accent" />
              <span className="text-eyebrow-gold">
                {locale === 'de' ? 'Direktbuchung' : 'Book Direct'}
              </span>
            </div>
            <h1
              className="font-serif font-semibold leading-tight tracking-tight mb-7"
              style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', letterSpacing: '-0.025em' }}
            >
              {locale === 'de' ? (
                <>Direkt buchen.<br />
                <span style={{ color: 'hsl(var(--champagne-dark))' }}>Besser ankommen.</span></>
              ) : (
                <>Book direct.<br />
                <span style={{ color: 'hsl(var(--champagne-dark))' }}>Arrive better.</span></>
              )}
            </h1>
            <p className="text-muted-foreground text-[15px] leading-relaxed max-w-xl">
              {locale === 'de'
                ? 'Warum den Umweg über Buchungsportale nehmen? Bei uns direkt zu buchen bringt echte Vorteile — und kostet nicht mehr. Kein Callcenter. Kein Aufschlag. Keine Kompromisse.'
                : 'Why take the detour through booking platforms? Booking directly with us brings real advantages — and costs no more. No call centers. No surcharges. No compromises.'}
            </p>
          </div>
        </SectionReveal>

        {/* 4 Steps */}
        <SectionReveal>
          <div className="mb-24 lg:mb-32">
            <div className="flex items-center gap-3 mb-10">
              <div className="section-header-accent" />
              <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight">
                {locale === 'de' ? 'Wie Direktbuchung funktioniert' : 'How direct booking works'}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {steps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: shouldReduce ? 0 : 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="relative p-7 h-full"
                  style={{
                    background: 'white',
                    border: '1px solid hsl(34 16% 85% / 0.55)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  {i < steps.length - 1 && (
                    <div
                      className="hidden lg:block absolute top-8 left-[calc(100%+10px)] w-5 h-px"
                      style={{ background: 'hsl(38 44% 74% / 0.4)' }}
                    />
                  )}
                  <div className="flex items-center gap-2.5 mb-6">
                    <span
                      className="text-[9px] font-bold tracking-[0.22em]"
                      style={{ color: 'hsl(38 44% 58% / 0.6)' }}
                    >
                      {step.number}
                    </span>
                    <div
                      className="w-8 h-8 flex items-center justify-center"
                      style={{
                        background: 'hsl(38 44% 74% / 0.1)',
                        border: '1px solid hsl(38 44% 74% / 0.22)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      <step.icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
                    </div>
                  </div>
                  <h3 className="font-semibold text-[13.5px] mb-2.5 leading-snug">{step.title}</h3>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
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
                {locale === 'de' ? 'Jetzt anfragen' : 'Send an inquiry'}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="https://wa.me/491601832917"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-medium transition-all duration-350"
                style={{
                  border: '1px solid hsl(34 16% 85% / 0.65)',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(218 8% 38%)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(38 44% 74% / 0.35)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(34 16% 85% / 0.65)';
                }}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            </div>
          </div>
        </SectionReveal>

        {/* Benefits grid */}
        <SectionReveal>
          <div className="flex items-center gap-3 mb-10">
            <div className="section-header-accent" />
            <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight">
              {locale === 'de' ? 'Was Sie nur direkt bekommen' : 'What you only get direct'}
            </h2>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-24 lg:mb-32">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              className="p-7 h-full flex flex-col transition-all duration-350"
              style={{
                background: b.exclusive
                  ? 'linear-gradient(135deg, hsl(218 22% 7%), hsl(218 18% 11%))'
                  : 'white',
                border: b.exclusive
                  ? '1px solid hsl(38 44% 52% / 0.2)'
                  : '1px solid hsl(34 16% 85% / 0.55)',
                borderRadius: 'var(--radius)',
              }}
              onMouseEnter={e => {
                if (!b.exclusive) {
                  (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.3)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.06)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                }
              }}
              onMouseLeave={e => {
                if (!b.exclusive) {
                  (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.55)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '';
                  (e.currentTarget as HTMLElement).style.transform = '';
                }
              }}
            >
              <div
                className="w-9 h-9 flex items-center justify-center mb-6"
                style={{
                  background: b.exclusive ? 'hsl(38 44% 74% / 0.12)' : 'hsl(38 44% 74% / 0.1)',
                  border: `1px solid ${b.exclusive ? 'hsl(38 44% 74% / 0.3)' : 'hsl(38 44% 74% / 0.22)'}`,
                  borderRadius: 'var(--radius)',
                }}
              >
                <b.icon
                  className="w-3.5 h-3.5"
                  style={{ color: b.exclusive ? 'hsl(38 44% 68%)' : 'hsl(34 40% 48%)' }}
                />
              </div>
              {b.exclusive && (
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.2em] mb-2.5 block"
                  style={{ color: 'hsl(38 44% 62% / 0.65)' }}
                >
                  {locale === 'de' ? 'Nur bei Direktbuchung' : 'Exclusive to direct bookings'}
                </span>
              )}
              <h3
                className="font-semibold text-[14px] mb-3 leading-snug"
                style={{ color: b.exclusive ? 'white' : 'hsl(218 18% 12%)' }}
              >
                {b.title}
              </h3>
              <p
                className="text-[12.5px] leading-relaxed flex-1"
                style={{ color: b.exclusive ? 'rgba(255,255,255,0.48)' : 'hsl(218 8% 44%)' }}
              >
                {b.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Comparison table */}
        <SectionReveal>
          <div className="max-w-3xl mx-auto mb-24 lg:mb-32">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-3 mb-5">
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
                <span className="text-eyebrow-gold">
                  {locale === 'de' ? 'Vergleich' : 'Comparison'}
                </span>
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
              </div>
              <h2 className="font-serif text-[2rem] font-semibold tracking-tight">
                {locale === 'de' ? 'Direktbuchung vs. Portal' : 'Direct booking vs. platform'}
              </h2>
            </div>

            <div
              className="overflow-hidden"
              style={{
                background: 'white',
                border: '1px solid hsl(34 16% 85% / 0.6)',
                borderRadius: 'var(--radius)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
              }}
            >
              <div
                className="grid grid-cols-3"
                style={{ borderBottom: '1px solid hsl(34 16% 85% / 0.5)' }}
              >
                <div className="p-5 col-span-1" />
                <div
                  className="p-5 text-center"
                  style={{ borderLeft: '1px solid hsl(34 16% 85% / 0.4)', background: 'hsl(38 44% 74% / 0.05)' }}
                >
                  <p
                    className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1"
                    style={{ color: 'hsl(38 44% 52%)' }}
                  >
                    {locale === 'de' ? 'Empfohlen' : 'Recommended'}
                  </p>
                  <p className="font-semibold text-[13px]">
                    {locale === 'de' ? 'Direktbuchung' : 'Direct Booking'}
                  </p>
                </div>
                <div
                  className="p-5 text-center"
                  style={{ borderLeft: '1px solid hsl(34 16% 85% / 0.4)' }}
                >
                  <p className="text-[13px] text-muted-foreground font-medium">
                    {locale === 'de' ? 'Portale' : 'Platforms'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/55">Airbnb · Booking.com</p>
                </div>
              </div>

              {comparison.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3"
                  style={{ borderBottom: i !== comparison.length - 1 ? '1px solid hsl(34 16% 85% / 0.35)' : 'none' }}
                >
                  <div className="p-4 lg:p-5 flex items-center">
                    <p className="text-[12.5px]">{item.feature}</p>
                  </div>
                  <div
                    className="p-4 lg:p-5 flex items-center justify-center"
                    style={{ borderLeft: '1px solid hsl(34 16% 85% / 0.4)', background: 'hsl(38 44% 74% / 0.04)' }}
                  >
                    {item.direct ? (
                      <Check className="w-4 h-4" style={{ color: 'hsl(34 40% 48%)' }} />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/25" />
                    )}
                  </div>
                  <div
                    className="p-4 lg:p-5 flex items-center justify-center"
                    style={{ borderLeft: '1px solid hsl(34 16% 85% / 0.4)' }}
                  >
                    {item.ota ? (
                      <Check className="w-4 h-4 text-muted-foreground/40" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/25" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>

        {/* FAQ — objection handling */}
        <SectionReveal>
          <div className="max-w-2xl mx-auto mb-24 lg:mb-32">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-3 mb-5">
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
                <span className="text-eyebrow-gold">
                  {locale === 'de' ? 'Häufige Fragen' : 'Common questions'}
                </span>
                <div className="h-px w-8" style={{ background: 'hsl(38 44% 74% / 0.4)' }} />
              </div>
              <h2 className="font-serif text-[2rem] font-semibold tracking-tight">
                {locale === 'de' ? 'Ihre Fragen zur Direktbuchung' : 'Your questions about direct booking'}
              </h2>
            </div>

            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  style={{
                    border: '1px solid',
                    borderColor: openFaq === i ? 'hsl(38 44% 74% / 0.32)' : 'hsl(34 16% 85% / 0.5)',
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
                      className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-300 ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
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

        {/* Booking.com note */}
        <SectionReveal>
          <div
            className="max-w-3xl mx-auto mb-16 p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
            style={{
              background: 'hsl(213 100% 17% / 0.04)',
              border: '1px solid hsl(213 100% 40% / 0.12)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div>
              <p className="font-medium text-[13.5px] mb-1.5">
                {locale === 'de' ? 'Lieber über Booking.com buchen?' : 'Prefer to book on Booking.com?'}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {locale === 'de'
                  ? 'Unsere Apartments sind auch dort verfügbar — bitte beachten Sie, dass dabei Servicegebühren anfallen.'
                  : 'Our apartments are also listed there — please note that platform service fees apply.'}
              </p>
            </div>
            <a
              href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
              target="_blank"
              rel="noopener noreferrer"
              className="group shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-[12px] font-medium transition-all duration-300 whitespace-nowrap"
              style={{
                background: 'hsl(213 100% 17% / 0.07)',
                border: '1px solid hsl(213 100% 40% / 0.22)',
                color: 'hsl(213 100% 32%)',
                borderRadius: 'var(--radius)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'hsl(213 100% 17% / 0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'hsl(213 100% 17% / 0.07)'; }}
            >
              {locale === 'de' ? 'Auf Booking.com' : 'On Booking.com'}
              <ExternalLink className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </SectionReveal>

        {/* Booking terms */}
        <SectionReveal>
          <div className="max-w-xl mx-auto mb-20">
            <h2 className="font-serif text-[1.6rem] font-semibold mb-6 text-center">
              {locale === 'de' ? 'Buchungshinweise' : 'Booking terms'}
            </h2>
            <div className="space-y-3">
              {(locale === 'de' ? [
                '100 % Zahlung bei Buchungsbestätigung — keine versteckten Kosten',
                'Persönliche Bestätigung innerhalb von 24 Stunden',
                'Einheitliche Stornierungsbedingungen für alle Residenzen',
              ] : [
                '100% payment upon booking confirmation — no hidden costs',
                'Personal confirmation within 24 hours',
                'Uniform cancellation policy across all residences',
              ]).map((term, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-4"
                  style={{
                    background: 'hsl(36 14% 96% / 0.5)',
                    border: '1px solid hsl(34 16% 85% / 0.45)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(38 44% 58%)' }} />
                  <span className="text-[13px]">{term}</span>
                </div>
              ))}
              <div className="text-center pt-1">
                <Link
                  href="/agb"
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium transition-colors"
                  style={{ color: 'hsl(34 40% 48%)' }}
                >
                  {locale === 'de' ? 'Vollständige AGB ansehen' : 'View full terms & conditions'}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* Final CTA */}
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
              className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, hsl(38 44% 60% / 0.08), transparent 70%)' }}
            />
            <div className="relative z-10">
              <h2 className="font-serif text-[2rem] lg:text-[2.8rem] font-semibold text-white mb-4 tracking-tight">
                {locale === 'de' ? 'Bereit zu buchen?' : 'Ready to book?'}
              </h2>
              <p className="text-white/45 mb-9 max-w-md mx-auto text-[14px] leading-relaxed">
                {locale === 'de'
                  ? 'Wählen Sie Ihre Residenz und buchen Sie direkt — für das vollständige Erlebnis und alle Direktbuchungsvorteile.'
                  : 'Choose your residence and book directly — for the complete experience and all direct booking advantages.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/residences"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-350"
                  style={{
                    background: 'hsl(36 22% 97%)',
                    color: 'hsl(218 18% 9%)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                    (e.currentTarget as HTMLElement).style.transform = '';
                  }}
                >
                  {locale === 'de' ? 'Residenzen ansehen' : 'View residences'}
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
                    (e.currentTarget as HTMLAnchorElement).style.color = 'white';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.15)';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.7)';
                  }}
                >
                  <Phone className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              </div>

              {/* Micro trust signals */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                {[
                  { icon: Shield, text: locale === 'de' ? 'Sichere Zahlung' : 'Secure payment' },
                  { icon: BadgeCheck, text: locale === 'de' ? 'Offizielle Bestätigung' : 'Official confirmation' },
                  { icon: Clock, text: locale === 'de' ? 'Antwort < 24h' : 'Reply < 24h' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <item.icon className="w-3 h-3" style={{ color: 'hsl(38 44% 58% / 0.6)' }} />
                    <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.32)' }}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionReveal>

      </div>
    </div>
  );
}
