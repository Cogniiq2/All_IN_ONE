'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Wifi, FileText, ChefHat, MapPin, Car, Key, Check, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function BusinessStaysClient() {
  const { locale } = useI18n();

  const benefits = locale === 'de'
    ? [
        {
          icon: MapPin,
          title: 'Zentrale Lage — zu Fuß zu allem',
          desc: 'Am Sternplatz oder in der Bayreuther Innenstadt — Restaurants, Einkauf, Bahnhof und Konferenzorte sind fußläufig erreichbar.',
        },
        {
          icon: Wifi,
          title: 'Schnelles WLAN & Arbeitsplatz',
          desc: 'Stabiles Breitband-Internet und ein ergonomischer Arbeitsplatz in jeder Residenz — zuverlässig für Videokonferenzen und Remote-Arbeit.',
        },
        {
          icon: ChefHat,
          title: 'Eigene Küche, eigener Rhythmus',
          desc: 'Vollausgestattete Küche mit Induktion, Backofen und Spülmaschine — frühstücken, wann Sie wollen, kochen, was Sie brauchen.',
        },
        {
          icon: Car,
          title: 'Garagenparkplatz inklusive',
          desc: 'Reservierter Garagenparkplatz bei jeder Residenz — ein seltener Vorteil in zentraler Bayreuth-Lage.',
        },
        {
          icon: Key,
          title: 'Self Check-in — komm und geh, wie du willst',
          desc: 'Kein Rezeptions-Zeitfenster, kein Warten. Digitaler Zugangscode, 24/7 verfügbar — auch bei Late-Arrivals nach Meetings.',
        },
        {
          icon: FileText,
          title: 'Ordentliche Rechnung für die Buchhaltung',
          desc: 'Ordnungsgemäße Rechnung nach dem Aufenthalt — auf Wunsch auch Proforma-Rechnung vorab für Ihre Reisekostenabrechnung.',
        },
      ]
    : [
        {
          icon: MapPin,
          title: 'Central location — walk to everything',
          desc: 'At Sternplatz or in Bayreuth\'s city center — restaurants, shops, train station, and meeting venues within walking distance.',
        },
        {
          icon: Wifi,
          title: 'Fast Wi-Fi & workspace',
          desc: 'Reliable broadband and an ergonomic workspace in every residence — dependable for video calls and remote work.',
        },
        {
          icon: ChefHat,
          title: 'Your own kitchen, your own rhythm',
          desc: 'Fully equipped kitchen with induction, oven, and dishwasher — breakfast when you want, cook what you need.',
        },
        {
          icon: Car,
          title: 'Garage parking included',
          desc: 'Reserved garage parking at every residence — a rare advantage in central Bayreuth.',
        },
        {
          icon: Key,
          title: 'Self check-in — come and go freely',
          desc: 'No reception window, no waiting. Digital access code, available 24/7 — including late arrivals after long meetings.',
        },
        {
          icon: FileText,
          title: 'Clean invoicing for your accounts',
          desc: 'Proper invoice after your stay — proforma invoice available on request for your expense report.',
        },
      ];

  const vs = locale === 'de'
    ? [
        'Mehr Platz — 58 bis 75 m² statt einem Hotelzimmer',
        'Eigene Küche statt Minibar und Roomservice',
        'Ruhigere Atmosphäre für konzentriertes Arbeiten',
        'Kein Rezeptionstrubel, kein Korridor-Lärm',
        'Persönlicher Kontakt statt anonymer Hotelkette',
        'Garagenparkplatz — kein Parkstress in der Innenstadt',
      ]
    : [
        'More space — 58 to 75 m² instead of a hotel room',
        'Your own kitchen instead of a minibar and room service',
        'Quieter atmosphere for focused work',
        'No lobby rush, no corridor noise',
        'Personal contact instead of an anonymous hotel chain',
        'Garage parking — no parking stress in the city center',
      ];

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-champagne mb-4">
                {locale === 'de' ? 'Geschäftsreisen' : 'Business Travel'}
              </span>
              <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-5 leading-tight">
                {locale === 'de'
                  ? 'Serviced Apartments für Geschäftsreisende in Bayreuth'
                  : 'Serviced Apartments for Business Travelers in Bayreuth'}
              </h1>
              <p className="text-muted-foreground leading-relaxed mb-5">
                {locale === 'de'
                  ? 'Zentrallage, schnelles WLAN, eigene Küche, Garagenparkplatz und persönlicher Support — alles, was Sie für eine produktive Dienstreise nach Bayreuth brauchen.'
                  : 'Central location, fast Wi-Fi, own kitchen, garage parking, and personal support — everything you need for a productive business trip to Bayreuth.'}
              </p>
              <p className="text-muted-foreground leading-relaxed mb-8">
                {locale === 'de'
                  ? 'Unsere Residenzen sind mehr als eine Übernachtungsmöglichkeit. Sie sind ein funktionaler, privater Rückzugsort — mit allem, was modernes Arbeiten und echte Erholung ermöglicht.'
                  : 'Our residences are more than accommodation. They are a functional, private base — with everything that enables focused work and genuine rest.'}
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-foreground text-primary-foreground rounded-sm text-sm font-medium tracking-wide hover:opacity-90 transition-opacity group"
              >
                {locale === 'de' ? 'Angebot anfragen' : 'Request a quote'}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden">
              <Image
                src="https://images.pexels.com/photos/3688263/pexels-photo-3688263.jpeg?auto=compress&cs=tinysrgb&w=800"
                alt={locale === 'de' ? 'Business-Apartment Bayreuth — Arbeitsplatz und Komfort' : 'Business apartment Bayreuth — workspace and comfort'}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          {benefits.map((benefit, i) => (
            <SectionReveal key={i} delay={i * 0.06}>
              <div className="p-6 rounded-lg bg-secondary/30 border border-border/40 h-full">
                <benefit.icon className="w-5 h-5 text-champagne mb-4" />
                <h3 className="font-semibold text-sm mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{benefit.desc}</p>
              </div>
            </SectionReveal>
          ))}
        </div>

        <SectionReveal>
          <div className="max-w-2xl mx-auto mb-20">
            <h2 className="font-serif text-2xl lg:text-3xl font-semibold mb-8 text-center">
              {locale === 'de'
                ? 'Serviced Apartment vs. Hotel — was den Unterschied macht'
                : 'Serviced apartment vs. hotel — what makes the difference'}
            </h2>
            <ul className="space-y-3">
              {vs.map((item, i) => (
                <li key={i} className="flex items-start gap-3 p-4 rounded-lg bg-secondary/20 border border-border/40">
                  <Check className="w-4 h-4 mt-0.5 text-champagne flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </SectionReveal>

        <SectionReveal>
          <div className="bg-foreground text-primary-foreground rounded-lg p-10 lg:p-14 text-center max-w-3xl mx-auto">
            <h2 className="font-serif text-2xl lg:text-3xl font-semibold mb-4">
              {locale === 'de' ? 'Bereit für Ihre Dienstreise?' : 'Ready for your business trip?'}
            </h2>
            <p className="text-primary-foreground/70 mb-8 max-w-lg mx-auto">
              {locale === 'de'
                ? 'Kontaktieren Sie uns für ein individuelles Angebot inkl. Rechnungsstellung — oder sehen Sie sich die Residenzen direkt an.'
                : 'Contact us for a personalized quote including invoicing — or browse the residences directly.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-7 py-3.5 bg-primary-foreground text-foreground rounded-sm text-sm font-medium tracking-wide hover:opacity-90 transition-opacity"
              >
                {locale === 'de' ? 'Anfrage senden' : 'Send inquiry'}
              </Link>
              <Link
                href="/residences"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-primary-foreground/20 rounded-sm text-sm font-medium tracking-wide hover:border-primary-foreground/40 transition-colors"
              >
                {locale === 'de' ? 'Residenzen ansehen' : 'View residences'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </SectionReveal>

        {/* Related pages */}
        <SectionReveal>
          <div className="mt-16 pt-12 border-t border-border/30">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-6 text-center">
              {locale === 'de' ? 'Auch interessant' : 'Also relevant'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { href: '/long-stay', label: locale === 'de' ? 'Langzeitaufenthalt' : 'Long stays', sub: locale === 'de' ? 'Ab 7 Nächten' : 'From 7 nights' },
                { href: '/book-direct', label: locale === 'de' ? 'Direkt buchen' : 'Book direct', sub: locale === 'de' ? 'Beste Konditionen' : 'Best rates' },
                { href: '/residences', label: locale === 'de' ? 'Alle Residenzen' : 'All residences', sub: locale === 'de' ? '5 Apartments' : '5 apartments' },
                { href: '/faq', label: 'FAQ', sub: locale === 'de' ? 'Häufige Fragen' : 'Common questions' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group p-4 rounded-sm border border-border/40 hover:border-champagne/30 transition-all duration-300 hover:shadow-sm"
                >
                  <p className="font-medium text-[12px] mb-1 group-hover:text-champagne transition-colors">{item.label}</p>
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
