'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowLeft, ArrowRight, Check, Briefcase, Wifi, Car, Receipt, Coffee } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';
import { articles } from '@/lib/articles';

export default function BusinessTravelArticle() {
  const { locale } = useI18n();

  const related = articles.filter(
    (a) => a.slug !== 'serviced-apartments-bayreuth-geschaftsreisen' && (a.slug === 'wo-in-bayreuth-ubernachten' || a.slug === 'wie-wir-arbeiten')
  );

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">

        <Link
          href="/journal"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          {locale === 'de' ? 'Zurück zum Journal' : 'Back to Journal'}
        </Link>

        <SectionReveal>
          <article className="max-w-3xl mx-auto">

            <div className="mb-8">
              <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-champagne mb-4">
                {locale === 'de' ? 'Geschäftsreisen' : 'Business Travel'}
              </span>
              <h1 className="font-serif text-3xl lg:text-5xl font-semibold mb-5 leading-tight">
                {locale === 'de'
                  ? 'Bayreuth für Geschäftsreisende: Was das Hotelzimmer nicht kann'
                  : 'Bayreuth for Business Travelers: What the Hotel Room Cannot Do'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {locale === 'de' ? '5 Min. Lesezeit' : '5 min read'}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span>{locale === 'de' ? '22. März 2025' : 'March 22, 2025'}</span>
              </div>
            </div>

            <div className="relative aspect-[16/9] rounded-xl overflow-hidden mb-12">
              <Image
                src="https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt={locale === 'de' ? 'Business Travel Bayreuth' : 'Business travel Bayreuth'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
              />
            </div>

            <div className="space-y-7 text-base leading-relaxed text-muted-foreground">

              <p className="text-lg text-foreground font-medium leading-relaxed">
                {locale === 'de'
                  ? 'Bayreuth ist kein Hotspot auf der mentalen Karte der meisten Geschäftsreisenden. Zu Unrecht. Die Region zwischen Kulmbach, Weiden und Bayreuth ist industriell dichter, als viele denken — und wer einmal für eine Woche nach Bayreuth kommt, merkt schnell: Das Hotelzimmer reicht nicht.'
                  : "Bayreuth is not a hotspot on most business travelers' mental map. Unfairly so. The region between Kulmbach, Weiden, and Bayreuth is industrially denser than many think — and anyone who comes to Bayreuth for a week quickly realizes: the hotel room isn't enough."}
              </p>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Bayreuth als Wirtschaftsstandort' : 'Bayreuth as a business location'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Linde Engineering hat einen bedeutenden Standort in der Region. Knorr-Bremse, Schaeffler, Siemens-Zulieferer, die Universität Bayreuth mit ihren Forschungspartnern — die Liste der Unternehmen, die regelmäßig Dienstreisende nach Bayreuth bringen, ist länger als erwartet.'
                  : 'Linde Engineering has a significant presence in the region. Knorr-Bremse, Schaeffler, Siemens suppliers, the University of Bayreuth with its research partners — the list of companies that regularly bring business travelers to Bayreuth is longer than expected.'}
              </p>

              <p>
                {locale === 'de'
                  ? 'Hinzu kommen Projekte im Gesundheitswesen (Klinikum Bayreuth ist einer der größten Arbeitgeber Oberfrankens), Bauvorhaben in der Region und natürlich die jährliche Festspielzeit, die auch geschäftliche Anlässe anzieht.'
                  : 'Add to this projects in healthcare (Klinikum Bayreuth is one of Upper Franconia\'s largest employers), construction projects in the region, and of course the annual festival season which also attracts business occasions.'}
              </p>

              <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-10">
                <Image
                  src="/images/733083360.jpg"
                  alt={locale === 'de' ? 'Arbeiten auf Geschäftsreise' : 'Working on a business trip'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Was Hotelzimmer strukturell nicht lösen können' : 'What hotel rooms structurally cannot solve'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Es geht nicht um schlechte Hotels. Es geht um strukturelle Grenzen. Ein Hotelzimmer ist ein Ort zum Schlafen — nicht zum Leben. Wer drei bis fünf Tage auf Dienstreise ist, lebt aber.'
                  : "It's not about bad hotels. It's about structural limitations. A hotel room is a place to sleep — not to live. But anyone on a business trip for three to five days does live."}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
                {(locale === 'de' ? [
                  { icon: Wifi, title: 'WLAN für echte Arbeit', body: 'Nicht das gethrottelte Hotel-WLAN mit 20 Geräten im selben Netz. Dedizierte Glasfaserverbindung — stabil genug für Videokonferenzen, Cloud-Arbeit und VPN.' },
                  { icon: Coffee, title: 'Eigene Küche', body: 'Frühstück, wenn Sie es brauchen. Mittagessen zwischen zwei Calls. Abends kochen statt eine Speisekarte durchscrollen — Kontrolle über Ihren Tag.' },
                  { icon: Briefcase, title: 'Echter Arbeitsbereich', body: 'Ein Schreibtisch, der für Arbeit gebaut ist. Nicht das Hotelbett mit Laptop auf dem Schoß. Ergonomisch, ruhig, abtrennbar vom Schlafbereich.' },
                  { icon: Car, title: 'Parkplatz ohne Tagesgebühr', body: 'Garagenstellplatz inklusive. Kein Parkhaus, keine Parkscheibe, kein Aufwachen und fragen, ob der Wagen noch da steht.' },
                  { icon: Receipt, title: 'Ordnungsgemäße Rechnung', body: 'Für die Reisekostenabrechnung: vollständige Rechnung mit Mehrwertsteuerausweis. Keine Airbnb-Quittung, die die Buchhaltung zurückschickt.' },
                  { icon: Check, title: 'Persönlicher Kontakt', body: 'Direkte Nummer für Fragen, Probleme und Wünsche. Kein Ticketsystem. Kein "Ihre Anfrage wird in 48 Stunden bearbeitet".' },
                ] : [
                  { icon: Wifi, title: 'Wi-Fi for real work', body: "Not throttled hotel Wi-Fi with 20 devices on the same network. Dedicated fiber connection — stable enough for video conferences, cloud work, and VPN." },
                  { icon: Coffee, title: 'Own kitchen', body: 'Breakfast when you need it. Lunch between two calls. Cooking in the evening instead of scrolling a menu — control over your day.' },
                  { icon: Briefcase, title: 'Real workspace', body: 'A desk built for work. Not the hotel bed with a laptop on your lap. Ergonomic, quiet, separable from the sleeping area.' },
                  { icon: Car, title: 'Parking without daily fees', body: 'Garage space included. No parking garage, no parking disc, no waking up wondering if the car is still there.' },
                  { icon: Receipt, title: 'Proper invoicing', body: 'For expense reporting: complete invoice with VAT breakdown. No Airbnb receipt that accounting sends back.' },
                  { icon: Check, title: 'Personal contact', body: 'Direct number for questions, problems, and requests. No ticket system. No "your inquiry will be processed in 48 hours".' },
                ]).map(({ icon: Icon, title, body }, k) => (
                  <div key={k} className="p-5 rounded-lg border border-border/40 bg-secondary/10">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-champagne/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-champagne" />
                      </div>
                      <p className="font-semibold text-foreground text-sm">{title}</p>
                    </div>
                    <p className="text-sm leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Langzeitaufenthalte: Wenn ein Projekt Wochen dauert' : 'Extended stays: when a project lasts weeks'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Für Aufenthalte ab einer Woche ändern sich die Maßstäbe grundlegend. Wochenlang aus dem Koffer zu leben, täglich im Restaurant zu essen und keinen eigenen Rückzugsort zu haben — das kostet Energie, die man für die Arbeit braucht.'
                  : "When stays exceed a week, standards fundamentally change. Living out of a suitcase for weeks, eating in restaurants daily, having no private retreat — that costs energy you need for work."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Unsere Langzeitgäste — Ingenieure, Berater, Projektleiter — schätzen besonders die Möglichkeit, sich einzurichten: Lebensmittel einzukaufen, eine Routine zu finden, nach der Arbeit abzuschalten, ohne ins Hotel "gehen zu müssen".'
                  : "Our long-stay guests — engineers, consultants, project managers — particularly appreciate the ability to settle in: buy groceries, find a routine, switch off after work without having to 'go back to the hotel'."}
              </p>

              <div className="rounded-lg border border-border/50 p-6 bg-card my-8">
                <blockquote className="font-serif text-lg italic text-foreground leading-relaxed mb-3">
                  {locale === 'de'
                    ? '„Ich war drei Wochen in Bayreuth für ein Projekt. Nach zwei Nächten im Hotel bin ich zu All in One Residences gewechselt. Den Unterschied merkt man ab Tag drei."'
                    : '"I was in Bayreuth for three weeks for a project. After two nights in a hotel I switched to All in One Residences. You notice the difference from day three."'}
                </blockquote>
                <p className="text-xs text-muted-foreground">
                  {locale === 'de' ? '— Gast, 3 Wochen Aufenthalt, 2024' : '— Guest, 3-week stay, 2024'}
                </p>
              </div>

            </div>

            <div className="bg-foreground text-primary-foreground rounded-xl p-8 lg:p-10 my-14">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/50 mb-3">
                {locale === 'de' ? 'All in One Residences · Bayreuth' : 'All in One Residences · Bayreuth'}
              </p>
              <h3 className="font-serif text-2xl font-semibold mb-4">
                {locale === 'de' ? 'Business Stays in Bayreuth' : 'Business stays in Bayreuth'}
              </h3>
              <p className="text-primary-foreground/70 mb-7 max-w-md leading-relaxed">
                {locale === 'de'
                  ? 'Schnelles WLAN, vollausgestattete Küche, Garagenstellplatz, ordnungsgemäße Rechnung und direkter Ansprechpartner. Für eine Nacht oder einen Monat.'
                  : 'Fast Wi-Fi, fully equipped kitchen, garage parking, proper invoicing, and direct contact. For one night or one month.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/business-stays"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-primary-foreground text-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity group"
                >
                  {locale === 'de' ? 'Business Stays entdecken' : 'Discover Business Stays'}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/residences"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 border border-primary-foreground/25 text-primary-foreground rounded-sm text-sm font-medium hover:border-primary-foreground/50 transition-colors"
                >
                  {locale === 'de' ? 'Alle Residenzen ansehen' : 'View all residences'}
                </Link>
              </div>
            </div>

          </article>
        </SectionReveal>

        {related.length > 0 && (
          <div className="max-w-3xl mx-auto mt-16 pt-12 border-t border-border/40">
            <h3 className="font-serif text-xl font-semibold mb-8">
              {locale === 'de' ? 'Weitere Beiträge' : 'More articles'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {related.map((a) => (
                <Link
                  key={a.slug}
                  href={`/journal/${a.slug}`}
                  className="group p-5 rounded-lg border border-border/40 hover:border-champagne/40 transition-colors bg-card"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-champagne">
                    {a.category[locale]}
                  </span>
                  <h4 className="font-serif text-base font-semibold mt-2 mb-3 group-hover:text-champagne transition-colors leading-snug">
                    {a.title[locale]}
                  </h4>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-champagne transition-colors">
                    {locale === 'de' ? 'Weiterlesen' : 'Read more'}
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
