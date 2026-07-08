'use client';

import { useState } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Users, Car, Star, MapPin, Clock, Key, ChefHat, Bath, Moon, Wifi, Wine, Landmark,
  MessageCircle, CreditCard, ChevronDown, ArrowRight, Check, ExternalLink, ChevronRight,
  Shield, BadgeCheck, Phone, CalendarCheck,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getResidenceBySlug, residences, type Residence } from '@/lib/residences';
import { Gallery } from '@/components/shared/gallery';
import { BookingModal } from '@/components/shared/booking-modal';
import { SectionReveal } from '@/components/shared/section-reveal';
import { SidebarDatePicker, nightsBetween } from '@/components/shared/sidebar-date-picker';

const iconMap: Record<string, typeof MapPin> = {
  MapPin, Car, Key, ChefHat, Bath, Moon, Wifi, Wine, Landmark, Star,
};

function ResidenceDetailContent({ residence }: { residence: Residence }) {
  const { locale, t } = useI18n();
  const shouldReduce = useReducedMotion();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const cleaningFee = 60;
  const subtotal = nights * residence.priceFrom;
  const total = subtotal + cleaningFee;

  const faqs = locale === 'de' ? [
    {
      q: 'Ist die Buchung direkt bei Ihnen offiziell und sicher?',
      a: 'Ja — vollständig. Sie erhalten eine Buchungsbestätigung mit Rechnung, Ihren persönlichen Zugangscode und unsere direkte Handynummer. Wir sind ein registriertes Unternehmen in Bayreuth, keine anonyme Plattform.',
    },
    {
      q: 'Wie funktioniert der Check-in genau?',
      a: 'Vor Ihrer Anreise erhalten Sie alle Details: Ihre persönliche Zugangscode für das Apartment und die Tiefgarage, die genaue Adresse und unsere Handynummer für alle Fragen. Self Check-in ist 24/7 möglich — Sie sind nicht an feste Ankunftszeiten gebunden.',
    },
    {
      q: 'Ist ein Parkplatz inklusive?',
      a: 'Ja — jede unserer fünf Residenzen beinhaltet einen festen Tiefgaragenstellplatz. Keine Parkplatzsuche, kein Aufpreis. Gerade in der Bayreuther Innenstadt ist das ein echtes Privileg.',
    },
    {
      q: 'Erhalte ich eine Rechnung für meine Buchung?',
      a: 'Ja, selbstverständlich. Nach Ihrer Buchungsbestätigung erhalten Sie eine vollständige Rechnung mit allen steuerlich relevanten Angaben — ideal auch für Geschäftsreisende.',
    },
    {
      q: 'Was passiert, wenn ich kurzfristig Hilfe benötige?',
      a: 'Sie haben unsere persönliche Handynummer — kein Callcenter, kein Ticketsystem. Wir sind werktags und am Wochenende erreichbar und antworten in der Regel innerhalb von 2 Stunden.',
    },
    {
      q: 'Welche Stornierungsbedingungen gelten?',
      a: 'Unsere Stornierungsbedingungen sind transparent und einheitlich für alle Residenzen. Details finden Sie in unseren AGB — bei Fragen sprechen Sie uns direkt an.',
    },
  ] : [
    {
      q: 'Is booking directly with you official and secure?',
      a: 'Absolutely. You receive a booking confirmation with invoice, your personal access code, and our direct mobile number. We are a registered company in Bayreuth — not an anonymous platform.',
    },
    {
      q: 'How exactly does check-in work?',
      a: 'Before your arrival you receive everything: your personal access code for the apartment and parking garage, the exact address, and our mobile number for any questions. Self check-in is available 24/7 — you are not tied to fixed arrival times.',
    },
    {
      q: 'Is parking included?',
      a: 'Yes — every one of our five residences includes a dedicated underground garage space. No searching for parking, no surcharge. In central Bayreuth, that is a genuine privilege.',
    },
    {
      q: 'Do I receive an invoice for my booking?',
      a: 'Yes, of course. After your booking confirmation you receive a complete invoice with all relevant details — ideal for business travelers and expense reporting.',
    },
    {
      q: 'What if I need help urgently during my stay?',
      a: 'You have our personal mobile number — no call center, no ticket system. We are available on weekdays and weekends and typically respond within 2 hours.',
    },
    {
      q: 'What are the cancellation terms?',
      a: 'Our cancellation policy is transparent and uniform across all residences. Details are in our terms and conditions — for questions, contact us directly.',
    },
  ];

  const walkingTimes = [
    { place: t('detail.walkPlace1'), time: t('detail.walkTime1') },
    { place: t('detail.walkPlace2'), time: t('detail.walkTime2') },
    { place: t('detail.walkPlace3'), time: t('detail.walkTime3') },
    { place: t('detail.walkPlace4'), time: t('detail.walkTime4') },
  ];

  const otherResidences = residences.filter(r => r.slug !== residence.slug);

  return (
    <div className="py-10 lg:py-16">
      <div className="container-luxury">

        {/* Breadcrumb */}
        <SectionReveal>
          <nav aria-label="Breadcrumb" className="mb-7">
            <ol className="flex items-center flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors">
                  {locale === 'de' ? 'Startseite' : 'Home'}
                </Link>
              </li>
              <li><ChevronRight className="w-3 h-3 opacity-40" /></li>
              <li>
                <Link href="/residences" className="hover:text-foreground transition-colors">
                  {locale === 'de' ? 'Alle Residenzen' : 'All residences'}
                </Link>
              </li>
              <li><ChevronRight className="w-3 h-3 opacity-40" /></li>
              <li>
                <Link href={`/collections/${residence.collection}`} className="hover:text-foreground transition-colors">
                  {residence.collectionLabel[locale]}
                </Link>
              </li>
              <li><ChevronRight className="w-3 h-3 opacity-40" /></li>
              <li className="text-foreground font-medium">{residence.name}</li>
            </ol>
          </nav>
        </SectionReveal>

        {/* Hero header */}
        <SectionReveal>
          <div className="mb-8 lg:mb-10">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Link
                href={`/collections/${residence.collection}`}
                className="text-[10px] font-semibold uppercase tracking-[0.15em] px-3 py-1.5 transition-colors hover:text-foreground"
                style={{
                  background: 'hsl(36 14% 95%)',
                  border: '1px solid hsl(34 16% 85% / 0.6)',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(218 8% 44%)',
                }}
              >
                {residence.collectionLabel[locale]}
              </Link>
              <span
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] px-3 py-1.5"
                style={{
                  background: 'hsl(38 44% 74% / 0.12)',
                  border: '1px solid hsl(38 44% 74% / 0.28)',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(34 40% 44%)',
                }}
              >
                <Star className="w-3 h-3 fill-current" style={{ color: 'hsl(38 44% 60%)' }} />
                9.4 / 10
              </span>
              {residence.size && (
                <span className="text-[11px] text-muted-foreground">{residence.size}</span>
              )}
            </div>

            <h1
              className="font-serif text-[2.2rem] lg:text-[3.4rem] font-semibold leading-tight tracking-tight mb-4"
              style={{ letterSpacing: '-0.02em' }}
            >
              {residence.name}
            </h1>

            <p className="text-muted-foreground max-w-2xl mb-6 leading-relaxed text-[15px]">
              {residence.longDescription[locale]}
            </p>

            <div className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" style={{ color: 'hsl(34 40% 54%)' }} />
                {t('detail.sleeps')}
              </span>
              <span className="flex items-center gap-1.5">
                <Car className="w-4 h-4" style={{ color: 'hsl(34 40% 54%)' }} />
                {t('detail.garageIncluded')}
              </span>
              <span className="flex items-center gap-1.5">
                <Key className="w-4 h-4" style={{ color: 'hsl(34 40% 54%)' }} />
                {locale === 'de' ? 'Self Check-in 24/7' : 'Self Check-in 24/7'}
              </span>
              {residence.hasBalcony && (
                <span className="flex items-center gap-1.5 font-medium" style={{ color: 'hsl(34 40% 44%)' }}>
                  <Landmark className="w-4 h-4" />
                  {locale === 'de' ? 'Panorama-Balkon' : 'Panoramic Balcony'}
                </span>
              )}
            </div>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-14">
          {/* Left column */}
          <div className="lg:col-span-3 space-y-16">
            <SectionReveal>
              <Gallery images={residence.images} name={residence.name} />
            </SectionReveal>

            {/* Ideal for */}
            {residence.idealFor && residence.idealFor.length > 0 && (
              <SectionReveal>
                <div
                  className="p-7"
                  style={{
                    background: 'hsl(36 14% 96% / 0.6)',
                    border: '1px solid hsl(34 16% 85% / 0.5)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <h3
                    className="text-[9.5px] font-bold uppercase tracking-[0.22em] mb-5"
                    style={{ color: 'hsl(38 44% 52%)' }}
                  >
                    {locale === 'de' ? 'Perfekt für' : 'Perfect for'}
                  </h3>
                  <div className="flex flex-wrap gap-2.5">
                    {residence.idealFor.map((item, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 text-[12.5px] px-4 py-2"
                        style={{
                          background: 'white',
                          border: '1px solid hsl(34 16% 85% / 0.65)',
                          borderRadius: 'var(--radius)',
                          color: 'hsl(218 12% 28%)',
                        }}
                      >
                        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(38 44% 60%)' }} />
                        {item[locale]}
                      </span>
                    ))}
                  </div>
                </div>
              </SectionReveal>
            )}

            {/* Highlights */}
            <SectionReveal>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="section-header-accent" />
                  <h2 className="font-serif text-[1.7rem] font-semibold tracking-tight">
                    {t('detail.highlights')}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {residence.highlights.map((h, i) => {
                    const Icon = iconMap[h.icon] || MapPin;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: shouldReduce ? 0 : 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-center gap-3.5 p-4.5 transition-all duration-300"
                        style={{
                          background: 'hsl(36 14% 96% / 0.5)',
                          border: '1px solid hsl(34 16% 85% / 0.45)',
                          borderRadius: 'var(--radius)',
                          padding: '14px 18px',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.35)';
                          (e.currentTarget as HTMLElement).style.background = 'white';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.45)';
                          (e.currentTarget as HTMLElement).style.background = 'hsl(36 14% 96% / 0.5)';
                        }}
                      >
                        <div
                          className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                          style={{
                            background: 'hsl(38 44% 74% / 0.1)',
                            border: '1px solid hsl(38 44% 74% / 0.22)',
                            borderRadius: 'var(--radius)',
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
                        </div>
                        <span className="text-[13px] leading-snug">{h[locale]}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </SectionReveal>

            {/* Features */}
            <SectionReveal>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="section-header-accent" />
                  <h2 className="font-serif text-[1.7rem] font-semibold tracking-tight">
                    {locale === 'de' ? 'Ausstattung im Detail' : 'Full amenities'}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  {residence.features.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 py-2.5"
                      style={{ borderBottom: '1px solid hsl(34 16% 85% / 0.3)' }}
                    >
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(38 44% 60%)' }} />
                      <span className="text-[13px] text-muted-foreground">{f[locale]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionReveal>

            {/* Location */}
            <SectionReveal>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="section-header-accent" />
                  <h2 className="font-serif text-[1.7rem] font-semibold tracking-tight">
                    {t('detail.location')}
                  </h2>
                </div>

                <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-7 max-w-lg">
                  {locale === 'de'
                    ? `${residence.name} liegt im Herzen von Bayreuth — zu Fuß erreichbar sind das Markgräfliche Opernhaus, der Hofgarten, das Neue Schloss und die gesamte Gastronomie der Innenstadt.`
                    : `${residence.name} sits in the heart of Bayreuth — walkable to the Margravial Opera House, Hofgarten, Neues Schloss, and the full dining and shopping scene.`}
                </p>

                <h3
                  className="text-[9.5px] font-bold uppercase tracking-[0.22em] mb-4"
                  style={{ color: 'hsl(38 44% 52%)' }}
                >
                  {t('detail.walkingTimes')}
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {walkingTimes.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-3 px-4"
                      style={{
                        background: 'hsl(36 14% 96% / 0.5)',
                        border: '1px solid hsl(34 16% 85% / 0.45)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      <span className="text-[12.5px]">{w.place}</span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground font-medium">
                        <Clock className="w-3 h-3" />
                        {w.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionReveal>

            {/* Direct booking benefit card */}
            <SectionReveal>
              <div
                className="p-7 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, hsl(218 22% 7%), hsl(218 18% 11%))',
                  borderRadius: 'var(--radius)',
                  border: '1px solid hsl(38 44% 52% / 0.18)',
                }}
              >
                <div
                  className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at top right, hsl(38 44% 60% / 0.08), transparent 65%)',
                  }}
                />
                <div className="relative z-10">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-10 h-10 flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: 'hsl(38 44% 74% / 0.14)',
                        border: '1px solid hsl(38 44% 74% / 0.28)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      <Wine className="w-4.5 h-4.5" style={{ color: 'hsl(38 44% 68%)' }} />
                    </div>
                    <div className="flex-1">
                      <p
                        className="text-[9px] font-bold uppercase tracking-[0.2em] mb-2"
                        style={{ color: 'hsl(38 44% 62% / 0.65)' }}
                      >
                        {locale === 'de' ? 'Exklusiv bei Direktbuchung' : 'Exclusive for direct bookings'}
                      </p>
                      <h3 className="font-semibold text-[14px] text-white mb-2 leading-snug">
                        {locale === 'de'
                          ? 'Willkommenswein bei Ihrer Ankunft'
                          : 'Welcome wine upon your arrival'}
                      </h3>
                      <p className="text-[12.5px] mb-4 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {locale === 'de'
                          ? 'Eine kuratierte Flasche Wein erwartet Sie bei der Ankunft — persönlich ausgewählt, exklusiv für Direktbuchungen.'
                          : 'A curated bottle of wine awaits your arrival — personally selected, exclusively for guests who book direct.'}
                      </p>
                      <Link
                        href="/book-direct"
                        className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors duration-300 group"
                        style={{ color: 'hsl(38 44% 68%)' }}
                      >
                        {locale === 'de' ? 'Direktbuchungsvorteile' : 'Direct booking benefits'}
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </SectionReveal>

            {/* FAQ */}
            <SectionReveal>
              <div>
                <div className="flex items-center gap-3 mb-7">
                  <div className="section-header-accent" />
                  <h2 className="font-serif text-[1.7rem] font-semibold tracking-tight">
                    {locale === 'de' ? 'Häufige Fragen' : 'Frequently asked questions'}
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
                      }}
                    >
                      <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-5 text-left transition-colors"
                        style={{ background: openFaq === i ? 'hsl(36 14% 96% / 0.5)' : 'transparent' }}
                      >
                        <span className="text-[13.5px] font-medium pr-4 leading-snug">{faq.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-300 ${
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

            {/* Policies */}
            <SectionReveal>
              <div
                className="p-6"
                style={{
                  background: 'hsl(36 14% 96% / 0.4)',
                  border: '1px solid hsl(34 16% 85% / 0.5)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <h3 className="font-semibold text-[13px] mb-3">{t('detail.policies')}</h3>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed">{t('detail.policiesText')}</p>
                <Link
                  href="/agb"
                  className="inline-flex items-center gap-1.5 mt-3 text-[11px] font-medium transition-colors"
                  style={{ color: 'hsl(34 40% 48%)' }}
                >
                  {locale === 'de' ? 'AGB & Stornierungsbedingungen' : 'Terms & cancellation policy'}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </SectionReveal>
          </div>

          {/* Sticky sidebar */}
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <SectionReveal>
                <div
                  className="shadow-sm"
                  style={{
                    background: 'white',
                    border: '1px solid hsl(34 16% 85% / 0.65)',
                    borderRadius: 'var(--radius)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Price header */}
                  <div className="p-6 pb-5" style={{ borderBottom: '1px solid hsl(34 16% 85% / 0.4)' }}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <div>
                        <span className="font-serif text-[1.9rem] font-semibold" style={{ color: 'hsl(218 18% 8%)' }}>
                          &euro;{residence.priceFrom}
                        </span>
                        <span className="text-[12px] text-muted-foreground ml-1">{t('detail.nightRate')}</span>
                      </div>
                      <div
                        className="flex items-center gap-1 px-2.5 py-1"
                        style={{
                          background: 'hsl(38 44% 74% / 0.1)',
                          border: '1px solid hsl(38 44% 74% / 0.25)',
                          borderRadius: 'var(--radius)',
                        }}
                      >
                        <Star className="w-2.5 h-2.5 fill-current" style={{ color: 'hsl(38 44% 60%)' }} />
                        <span className="text-[10px] font-semibold" style={{ color: 'hsl(34 40% 44%)' }}>9.4</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {locale === 'de'
                        ? 'Direktpreis — kein Airbnb-Aufschlag, keine Booking.com-Gebühr'
                        : 'Direct price — no Airbnb surcharge, no Booking.com fee'}
                    </p>
                  </div>

                  <div className="p-6 space-y-5">
                    <SidebarDatePicker
                      locale={locale}
                      maxGuests={residence.guests}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      guests={guests}
                      onCheckIn={setCheckIn}
                      onCheckOut={setCheckOut}
                      onGuests={setGuests}
                    />

                    {/* Price breakdown */}
                    <div
                      className="p-4 space-y-2"
                      style={{
                        background: 'hsl(36 14% 96% / 0.5)',
                        border: '1px solid hsl(34 16% 85% / 0.4)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      {nights > 0 ? (
                        <>
                          <div className="flex justify-between text-[12.5px]">
                            <span className="text-muted-foreground">
                              {nights} {locale === 'de' ? (nights === 1 ? 'Nacht' : 'Nächte') : (nights === 1 ? 'night' : 'nights')} × €{residence.priceFrom}
                            </span>
                            <span className="font-medium">€{subtotal}</span>
                          </div>
                          <div className="flex justify-between text-[12.5px]">
                            <span className="text-muted-foreground">{t('detail.cleaningFee')}</span>
                            <span className="font-medium">€{cleaningFee}</span>
                          </div>
                          <div
                            className="flex justify-between font-semibold pt-2"
                            style={{ borderTop: '1px solid hsl(34 16% 85% / 0.5)' }}
                          >
                            <span className="text-[13px]">{t('detail.total')}</span>
                            <span className="font-serif text-[1.1rem]" style={{ color: 'hsl(34 40% 42%)' }}>
                              €{total}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-1">
                          <p className="text-[12px] text-muted-foreground">
                            {locale === 'de' ? 'Daten wählen für genaue Preisberechnung' : 'Select dates for exact pricing'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Payment icons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] text-muted-foreground"
                        style={{ border: '1px solid hsl(34 16% 85% / 0.6)', borderRadius: 'var(--radius)' }}
                      >
                        <CreditCard className="w-3 h-3" /> Stripe
                      </div>
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] text-muted-foreground"
                        style={{ border: '1px solid hsl(34 16% 85% / 0.6)', borderRadius: 'var(--radius)' }}
                      >
                        <CreditCard className="w-3 h-3" /> PayPal
                      </div>
                      <p className="text-[10.5px] text-muted-foreground/60 flex-1 text-right">
                        {locale === 'de' ? 'Sichere Zahlung' : 'Secure payment'}
                      </p>
                    </div>

                    <button
                      onClick={() => setBookingOpen(true)}
                      className="w-full py-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-350 group flex items-center justify-center gap-2"
                      style={{
                        background: 'hsl(218 22% 9%)',
                        color: 'hsl(36 22% 96%)',
                        borderRadius: 'var(--radius)',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'hsl(218 22% 13%)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'hsl(218 22% 9%)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '';
                      }}
                    >
                      <CalendarCheck className="w-3.5 h-3.5" />
                      {t('detail.bookNow')}
                    </button>

                    <a
                      href="https://wa.me/491601832917"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-3.5 text-[11px] font-medium transition-all duration-300"
                      style={{
                        border: '1px solid hsl(34 16% 85% / 0.6)',
                        borderRadius: 'var(--radius)',
                        color: 'hsl(218 8% 38%)',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(38 44% 74% / 0.35)';
                        (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 18% 16%)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(34 16% 85% / 0.6)';
                        (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 38%)';
                      }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {t('detail.questionsWhatsApp')}
                    </a>

                    {/* Trust signals */}
                    <div
                      className="p-4 space-y-2"
                      style={{
                        background: 'hsl(38 44% 74% / 0.05)',
                        border: '1px solid hsl(38 44% 74% / 0.18)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      {[
                        { icon: BadgeCheck, text: locale === 'de' ? 'Offizielle Buchungsbestätigung & Rechnung' : 'Official booking confirmation & invoice' },
                        { icon: Shield, text: locale === 'de' ? 'Persönlicher Ansprechpartner' : 'Personal point of contact' },
                        { icon: Wine, text: locale === 'de' ? 'Willkommenswein bei Direktbuchung' : 'Welcome wine for direct bookings' },
                        { icon: Phone, text: locale === 'de' ? 'Antwort innerhalb von 2 Stunden' : 'Response within 2 hours' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <item.icon className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(38 44% 58%)' }} />
                          <span className="text-[11px] text-muted-foreground">{item.text}</span>
                        </div>
                      ))}
                    </div>

                    {/* Booking.com */}
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px" style={{ background: 'hsl(34 16% 85% / 0.5)' }} />
                      <span className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/50">
                        {locale === 'de' ? 'oder' : 'or'}
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'hsl(34 16% 85% / 0.5)' }} />
                    </div>

                    <a
                      href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group w-full flex items-center justify-center gap-2 py-3 text-[11.5px] font-medium transition-all duration-300"
                      style={{
                        background: 'hsl(213 100% 17% / 0.05)',
                        border: '1px solid hsl(213 100% 40% / 0.16)',
                        color: 'hsl(213 100% 32%)',
                        borderRadius: 'var(--radius)',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLAnchorElement).style.background = 'hsl(213 100% 17% / 0.1)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLAnchorElement).style.background = 'hsl(213 100% 17% / 0.05)';
                      }}
                    >
                      {locale === 'de' ? 'Bei Booking.com ansehen' : 'View on Booking.com'}
                      <ExternalLink className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </a>

                    <p className="text-[10px] text-muted-foreground/50 text-center">
                      <Link href="/agb" className="hover:text-muted-foreground transition-colors underline underline-offset-2">
                        {t('detail.cancellationPolicy')}
                      </Link>
                    </p>
                  </div>
                </div>
              </SectionReveal>
            </div>
          </div>
        </div>
      </div>

      {/* Related residences */}
      <div className="mt-24 pt-16" style={{ borderTop: '1px solid hsl(34 16% 85% / 0.4)' }}>
        <div className="container-luxury">
          <SectionReveal>
            <div className="mb-10">
              <span className="text-eyebrow-gold block mb-3">
                {locale === 'de' ? 'Weitere Residenzen' : 'More residences'}
              </span>
              <div className="flex items-end justify-between gap-6">
                <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight">
                  {locale === 'de' ? 'Andere Apartments entdecken' : 'Explore our other apartments'}
                </h2>
                <Link
                  href="/residences"
                  className="hidden sm:flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  {locale === 'de' ? 'Alle 5 ansehen' : 'See all 5'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {otherResidences.map((r, i) => (
                <motion.div
                  key={r.slug}
                  initial={{ opacity: 0, y: shouldReduce ? 0 : 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    href={`/residences/${r.slug}`}
                    className="group block overflow-hidden transition-all duration-400"
                    style={{
                      background: 'white',
                      border: '1px solid hsl(34 16% 85% / 0.6)',
                      borderRadius: 'var(--radius)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.35)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.6)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '';
                      (e.currentTarget as HTMLElement).style.transform = '';
                    }}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-secondary/30">
                      {r.images[0] && (
                        <Image
                          src={r.images[0]}
                          alt={r.name}
                          width={400}
                          height={300}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108"
                          style={{ transition: 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
                        />
                      )}
                    </div>
                    <div className="p-4">
                      <p
                        className="text-[9px] uppercase tracking-[0.18em] mb-1.5 font-medium"
                        style={{ color: 'hsl(38 42% 52%)' }}
                      >
                        {r.collectionLabel[locale]}
                      </p>
                      <h3 className="font-semibold text-[13px] mb-1.5 leading-snug transition-colors group-hover:text-foreground">
                        {r.name}
                      </h3>
                      <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                        {locale === 'de' ? 'ab' : 'from'}
                        <span className="font-serif font-semibold text-[13px]" style={{ color: 'hsl(218 18% 14%)' }}>
                          €{r.priceFrom}
                        </span>
                        <span>/{locale === 'de' ? 'Nacht' : 'night'}</span>
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
            <div className="mt-8 text-center sm:hidden">
              <Link
                href="/residences"
                className="group inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
              >
                {locale === 'de' ? 'Alle 5 Residenzen ansehen' : 'View all 5 residences'}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </SectionReveal>
        </div>
      </div>

      <BookingModal residence={residence} open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  );
}

export default function ResidenceDetailClient({ slug }: { slug: string }) {
  const residence = getResidenceBySlug(slug);
  if (!residence) return notFound();
  return <ResidenceDetailContent residence={residence} />;
}
