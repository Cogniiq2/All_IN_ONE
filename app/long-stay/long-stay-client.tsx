'use client';

import Link from 'next/link';
import Image from 'next/image';
import { TrendingDown, Chrome as Home, Users, ShieldCheck, Check, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function LongStayClient() {
  const { locale } = useI18n();

  const benefits = locale === 'de'
    ? [
        {
          icon: TrendingDown,
          title: 'Attraktive Konditionen ab 7 Nächten',
          desc: 'Je länger der Aufenthalt, desto besser der Preis. Sprechen Sie uns direkt an — wir erstellen ein individuelles Angebot.',
        },
        {
          icon: Home,
          title: 'Ein echtes Zuhause auf Zeit',
          desc: 'Vollausgestattete Küche, Waschmaschine, Kleiderschrank, Arbeitsplatz — auf 58 bis 75 m². Kein Hotelflair, kein Korridor.',
        },
        {
          icon: Users,
          title: 'Persönliche Begleitung',
          desc: 'Wir sind direkt erreichbar. Bei Fragen, Anpassungswünschen oder Verlängerungen — ein kurzes WhatsApp genügt.',
        },
        {
          icon: ShieldCheck,
          title: 'Transparente Konditionen',
          desc: 'Klarer Preis, faire Stornierungsbedingungen, alle Nebenkosten inklusive — keine Überraschungen, kein Kleingedrucktes.',
        },
      ]
    : [
        {
          icon: TrendingDown,
          title: 'Attractive rates from 7 nights',
          desc: 'The longer the stay, the better the price. Contact us directly — we\'ll create an individual offer for you.',
        },
        {
          icon: Home,
          title: 'A real home away from home',
          desc: 'Fully equipped kitchen, washing machine, wardrobe, workspace — across 58 to 75 m². No hotel feel, no corridor.',
        },
        {
          icon: Users,
          title: 'Personal support throughout',
          desc: 'We are directly reachable. Questions, adjustments, or extensions — a quick WhatsApp is all it takes.',
        },
        {
          icon: ShieldCheck,
          title: 'Transparent terms',
          desc: 'Clear pricing, fair cancellation policy, all utilities included — no surprises, no fine print.',
        },
      ];

  const useCases = locale === 'de'
    ? [
        {
          title: 'Relocation & Umzug',
          desc: 'Sie ziehen nach Bayreuth und brauchen Zeit für die Wohnungssuche? Unsere Residenzen sind die ideale Zwischenlösung — zentral, komfortabel, flexibel.',
        },
        {
          title: 'Projektarbeit',
          desc: 'Mehrwöchige Projekte, Beratungsmandaten oder Montagephasen in Bayreuth — wohnen Sie komfortabel und produktiv, ohne Hotelkompromisse.',
        },
        {
          title: 'Sabbatical & Auszeit',
          desc: 'Eine Auszeit in einer der kulturreichsten Städte Deutschlands — Bayreuth, Opernhaus, Hofgarten, kulinarische Vielfalt. Zentral, ruhig, mit allem Komfort.',
        },
      ]
    : [
        {
          title: 'Relocation',
          desc: 'Moving to Bayreuth and need time to find a flat? Our residences are the ideal interim solution — central, comfortable, flexible.',
        },
        {
          title: 'Project work',
          desc: 'Multi-week projects, consulting mandates, or on-site work in Bayreuth — live comfortably and productively without hotel compromises.',
        },
        {
          title: 'Sabbatical & time out',
          desc: 'A break in one of Germany\'s most culturally rich cities — Bayreuth, opera house, Hofgarten, culinary variety. Central, quiet, fully equipped.',
        },
      ];

  const included = locale === 'de'
    ? [
        'Vollausgestattete Küche (Induktion, Backofen, Spülmaschine)',
        'Hochwertige Bettwäsche & Handtücher',
        'Waschmaschine & Wäschetrockner',
        'Schnelles WLAN & Arbeitsplatz',
        'Garagenparkplatz',
        'Self Check-in, 24/7',
        'Alle Nebenkosten inklusive',
        'Persönlicher Support auf Abruf',
      ]
    : [
        'Fully equipped kitchen (induction, oven, dishwasher)',
        'Premium bed linens & towels',
        'Washing machine & dryer',
        'Fast Wi-Fi & workspace',
        'Garage parking',
        'Self check-in, 24/7',
        'All utilities included',
        'Personal support on demand',
      ];

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="max-w-2xl mb-16">
            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-champagne mb-4">
              {locale === 'de' ? 'Langzeitaufenthalte' : 'Long-Term Stays'}
            </span>
            <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-5 leading-tight">
              {locale === 'de'
                ? 'Langzeitwohnen in Bayreuth'
                : 'Long-Term Living in Bayreuth'}
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-lg">
              {locale === 'de'
                ? 'Mehr Komfort als ein Hotel, mehr Flexibilität als eine Wohnung. Unsere Residenzen sind ideal für Aufenthalte ab einer Woche — mit eigener Küche, persönlichem Support und Sonderkonditionen, die wirklich fair sind.'
                : 'More comfort than a hotel, more flexibility than an apartment. Our residences are ideal for stays from one week upward — with your own kitchen, personal support, and rates that are genuinely fair.'}
            </p>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
          {benefits.map((benefit, i) => (
            <SectionReveal key={i} delay={i * 0.06}>
              <div className="p-6 rounded-lg bg-secondary/30 border border-border/40 h-full">
                <benefit.icon className="w-5 h-5 text-champagne mb-4" />
                <h3 className="font-semibold text-sm mb-2">{benefit.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{benefit.desc}</p>
              </div>
            </SectionReveal>
          ))}
        </div>

        <SectionReveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden order-2 lg:order-1">
              <Image
                src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=800"
                alt={locale === 'de' ? 'Langzeitaufenthalt Bayreuth — Wohnen auf Zeit' : 'Long-term stay Bayreuth — temporary living'}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="font-serif text-2xl lg:text-3xl font-semibold mb-6">
                {locale === 'de' ? 'Ideal für' : 'Ideal for'}
              </h2>
              <div className="space-y-6">
                {useCases.map((useCase, i) => (
                  <div key={i} className="border-l-2 border-champagne/30 pl-4">
                    <h3 className="font-semibold text-sm mb-1">{useCase.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{useCase.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionReveal>

        <SectionReveal>
          <div className="max-w-2xl mx-auto mb-20">
            <h2 className="font-serif text-2xl font-semibold mb-8 text-center">
              {locale === 'de' ? 'Alles inklusive' : 'Everything included'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {included.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-lg bg-secondary/20 border border-border/40">
                  <Check className="w-4 h-4 text-champagne flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>

        <SectionReveal>
          <div className="bg-foreground text-primary-foreground rounded-lg p-10 lg:p-14 text-center max-w-3xl mx-auto">
            <h2 className="font-serif text-2xl lg:text-3xl font-semibold mb-4">
              {locale === 'de' ? 'Individuelles Angebot anfragen' : 'Request a personalized quote'}
            </h2>
            <p className="text-primary-foreground/70 mb-8 max-w-lg mx-auto">
              {locale === 'de'
                ? 'Teilen Sie uns Ihre Daten mit — wir melden uns persönlich und erstellen ein maßgeschneidertes Angebot für Ihren Aufenthalt.'
                : 'Share your details with us — we\'ll get back to you personally and create a tailored quote for your stay.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-primary-foreground text-foreground rounded-sm text-sm font-medium tracking-wide hover:opacity-90 transition-opacity group"
              >
                {locale === 'de' ? 'Jetzt anfragen' : 'Inquire now'}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
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
                { href: '/business-stays', label: locale === 'de' ? 'Geschäftsreisen' : 'Business stays', sub: locale === 'de' ? 'Dienstreise & Montage' : 'Work trips & projects' },
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
