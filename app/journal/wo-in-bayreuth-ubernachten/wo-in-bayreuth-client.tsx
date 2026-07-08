'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';
import { articles } from '@/lib/articles';

export default function WhereToStayBayreuthArticle() {
  const { locale } = useI18n();

  const related = articles.filter(
    (a) => a.slug !== 'wo-in-bayreuth-ubernachten' && (a.slug === 'bayreuth-festspiele-unterkunft-guide' || a.slug === 'wie-wir-arbeiten')
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
                {locale === 'de' ? 'Reiseplanung' : 'Travel Planning'}
              </span>
              <h1 className="font-serif text-3xl lg:text-5xl font-semibold mb-5 leading-tight">
                {locale === 'de'
                  ? 'Wo in Bayreuth übernachten: Ein ehrlicher Guide'
                  : 'Where to Stay in Bayreuth: An Honest Guide'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {locale === 'de' ? '6 Min. Lesezeit' : '6 min read'}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span>{locale === 'de' ? '18. März 2025' : 'March 18, 2025'}</span>
              </div>
            </div>

            <div className="relative aspect-[16/9] rounded-xl overflow-hidden mb-12">
              <Image
                src="https://images.pexels.com/photos/2029722/pexels-photo-2029722.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt={locale === 'de' ? 'Bayreuth Unterkunft Guide' : 'Bayreuth accommodation guide'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
              />
            </div>

            <div className="space-y-7 text-base leading-relaxed text-muted-foreground">

              <p className="text-lg text-foreground font-medium leading-relaxed">
                {locale === 'de'
                  ? 'Bayreuth ist keine Großstadt. Die Innenstadt ist kompakt, überschaubar und — wenn man richtig steht — innerhalb weniger Minuten zu Fuß zu erkunden. Aber "richtig stehen" ist das entscheidende Wort.'
                  : 'Bayreuth is not a large city. The city center is compact, manageable and — if you\'re in the right spot — explorable on foot within minutes. But "right spot" is the operative phrase.'}
              </p>

              <p>
                {locale === 'de'
                  ? 'Dieser Guide ist kein Werbeartikel. Er ist ein ehrlicher Blick auf die Unterkunftssituation in Bayreuth — was gut funktioniert, was nicht, und was Reisende mit Anspruch wissen sollten, bevor sie buchen.'
                  : 'This guide is not an advertisement. It\'s an honest look at the accommodation landscape in Bayreuth — what works well, what doesn\'t, and what discerning travelers should know before they book.'}
              </p>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Die Lagen: Was sie wirklich bedeuten' : 'The locations: what they actually mean'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Bayreuth hat eine kompakte Innenstadt, einen Gürtel mit ruhigen Wohngebieten und dann irgendwann die Stadtränder mit Gewerbegebiet und Tankstellen. Die Entfernung vom Zentrum klingt in Kilometern klein, fühlt sich zu Fuß aber schnell anders an.'
                  : 'Bayreuth has a compact city center, a ring of quiet residential areas, and then eventually the outskirts with industrial zones and petrol stations. The distance from the center sounds small in kilometers but feels very different on foot.'}
              </p>

              <div className="rounded-xl border border-border/60 overflow-hidden my-8">
                <div className="grid grid-cols-3 bg-secondary/30 border-b border-border/40">
                  <div className="p-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"></div>
                  <div className="p-4 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-champagne border-l border-border/40">
                    {locale === 'de' ? 'Innenstadt' : 'City center'}
                  </div>
                  <div className="p-4 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground border-l border-border/40">
                    {locale === 'de' ? 'Stadtrand' : 'Outskirts'}
                  </div>
                </div>
                {(locale === 'de' ? [
                  { feature: 'Restaurants & Bars zu Fuß', inner: true, outer: false },
                  { feature: 'ÖPNV zum Festspielhaus', inner: true, outer: false },
                  { feature: 'Tagesausflüge ohne Auto', inner: true, outer: false },
                  { feature: 'Ruhige Nacht', inner: true, outer: true },
                  { feature: 'Günstigere Preise', inner: false, outer: true },
                  { feature: 'Eigener Parkplatz', inner: false, outer: true },
                ] : [
                  { feature: 'Restaurants & bars walkable', inner: true, outer: false },
                  { feature: 'Public transport to Festspielhaus', inner: true, outer: false },
                  { feature: 'Day trips without a car', inner: true, outer: false },
                  { feature: 'Quiet nights', inner: true, outer: true },
                  { feature: 'Lower prices', inner: false, outer: true },
                  { feature: 'Own parking', inner: false, outer: true },
                ]).map((row, i) => (
                  <div key={i} className={`grid grid-cols-3 ${i < 5 ? 'border-b border-border/30' : ''}`}>
                    <div className="p-4 text-sm">{row.feature}</div>
                    <div className="p-4 flex justify-center border-l border-border/30 bg-champagne/4">
                      {row.inner ? <Check className="w-4 h-4 text-champagne" /> : <X className="w-4 h-4 text-muted-foreground/30" />}
                    </div>
                    <div className="p-4 flex justify-center border-l border-border/30">
                      {row.outer ? <Check className="w-4 h-4 text-muted-foreground/50" /> : <X className="w-4 h-4 text-muted-foreground/30" />}
                    </div>
                  </div>
                ))}
              </div>

              <p>
                {locale === 'de'
                  ? 'Was auffällt: Die Innenstadt hat in fast jeder Kategorie die besseren Karten — mit einer Ausnahme: Parkplatz. Wer zentral wohnt und trotzdem einen Garagenstellplatz hat, hat das Beste aus beiden Welten.'
                  : 'What stands out: the city center has the better hand in almost every category — with one exception: parking. Anyone who lives centrally and still has a garage space has the best of both worlds.'}
              </p>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Hotel, Airbnb oder Serviced Apartment?' : 'Hotel, Airbnb or Serviced Apartment?'}
              </h2>

              <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-8">
                <Image
                  src="https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt={locale === 'de' ? 'Moderne Wohnatmosphäre' : 'Modern living space'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>

              <p>
                {locale === 'de'
                  ? 'Ehrlich gesagt ist keine dieser Kategorien per se schlecht. Es kommt auf die Reiseart an. Für eine Nacht? Vielleicht reicht ein Hotel. Für eine Festspielwoche, für einen Projektmonat, für eine Familienreise mit Kindern? Da fängt der Unterschied an.'
                  : 'Honestly, none of these categories is inherently bad. It depends on the type of trip. For one night? A hotel might suffice. For a festival week, a project month, a family trip with children? That\'s where the difference begins.'}
              </p>

              <div className="space-y-5 my-8">
                {(locale === 'de' ? [
                  {
                    label: 'Hotels in Bayreuth',
                    pros: ['Frühstück möglich', 'Keine Selbstversorgung nötig'],
                    cons: ['Kleine Zimmer', 'Feste Zeiten', 'Kaum Küche', 'Wenig Privatsphäre', 'Hohe Preise zur Festspielzeit'],
                  },
                  {
                    label: 'Airbnb-Unterkünfte',
                    pros: ['Mehr Platz', 'Küche vorhanden', 'Günstiger'],
                    cons: ['Qualität schwer vorhersagbar', 'Kein fester Support', 'Check-in oft unpersönlich', 'Keine Rechnung für Firmen'],
                  },
                  {
                    label: 'Professionelle Serviced Apartments',
                    pros: ['Definierter Standard', 'Küche & Wohnbereich', 'Verlässlicher Ansprechpartner', 'Ordnungsgemäße Rechnung', 'Oft mit Parkplatz'],
                    cons: ['Meist höherer Preis als Airbnb', 'Weniger Auswahl als Hotels'],
                  },
                ] : [
                  {
                    label: 'Hotels in Bayreuth',
                    pros: ['Breakfast possible', 'No self-catering required'],
                    cons: ['Small rooms', 'Fixed schedules', 'No real kitchen', 'Little privacy', 'High prices during festival season'],
                  },
                  {
                    label: 'Airbnb accommodation',
                    pros: ['More space', 'Kitchen available', 'Cheaper'],
                    cons: ['Quality hard to predict', 'No dedicated support', 'Check-in often impersonal', 'No invoices for companies'],
                  },
                  {
                    label: 'Professional Serviced Apartments',
                    pros: ['Defined standard', 'Kitchen & living area', 'Reliable point of contact', 'Proper invoicing', 'Often with parking'],
                    cons: ['Usually higher price than Airbnb', 'Less selection than hotels'],
                  },
                ]).map((cat, i) => (
                  <div key={i} className="p-6 rounded-lg border border-border/40 bg-secondary/10">
                    <p className="font-semibold text-foreground text-sm mb-4">{cat.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-champagne mb-2">{locale === 'de' ? 'Vorteile' : 'Pros'}</p>
                        <ul className="space-y-1.5">
                          {cat.pros.map((p, j) => (
                            <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Check className="w-3.5 h-3.5 text-champagne flex-shrink-0 mt-0.5" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">{locale === 'de' ? 'Nachteile' : 'Cons'}</p>
                        <ul className="space-y-1.5">
                          {cat.cons.map((c, j) => (
                            <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <X className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Worauf Sie konkret achten sollten' : 'What to specifically look for'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Unabhängig von der Unterkunftsform: Diese fünf Punkte entscheiden über die Qualität Ihres Aufenthalts in Bayreuth mehr als jedes schön fotografierte Schlafzimmer.'
                  : 'Regardless of accommodation type: these five points determine the quality of your stay in Bayreuth more than any beautifully photographed bedroom.'}
              </p>

              <div className="space-y-3 my-6">
                {(locale === 'de' ? [
                  'Lage in der Innenstadt — nicht "nahe der Innenstadt"',
                  'Garagenparkplatz oder zumindest ein garantierter Stellplatz',
                  'Vollküche, nicht nur Kochnische',
                  'Namentlich bekannter Ansprechpartner mit direkter Nummer',
                  'Ordnungsgemäße Rechnung — wichtig für Geschäftsreisende und Festspiel-Gruppen',
                ] : [
                  'Location in the city center — not "near the city center"',
                  'Garage parking or at least a guaranteed space',
                  'Full kitchen, not just a kitchenette',
                  'Named contact person with a direct number',
                  'Proper invoicing — important for business travelers and festival groups',
                ]).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-lg border border-border/40 bg-card">
                    <div className="w-5 h-5 rounded-full bg-champagne/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-champagne">{i + 1}</span>
                    </div>
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>

            </div>

            <div className="bg-foreground text-primary-foreground rounded-xl p-8 lg:p-10 my-14">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/50 mb-3">
                {locale === 'de' ? 'All in One Residences · Bayreuth' : 'All in One Residences · Bayreuth'}
              </p>
              <h3 className="font-serif text-2xl font-semibold mb-4">
                {locale === 'de' ? 'Fünf Residenzen in bester Lage' : 'Five residences in prime location'}
              </h3>
              <p className="text-primary-foreground/70 mb-7 max-w-md leading-relaxed">
                {locale === 'de'
                  ? 'Am Sternplatz und in der Bayreuther Altstadt — zentral, ruhig, mit Garagenparkplatz und direktem Support. Für Kurzaufenthalte bis zum Monatsbetrieb.'
                  : 'At Sternplatz and in Bayreuth\'s old town — central, quiet, with garage parking and direct support. For short stays to monthly arrangements.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/residences"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-primary-foreground text-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity group"
                >
                  {locale === 'de' ? 'Alle Residenzen ansehen' : 'View all residences'}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 border border-primary-foreground/25 text-primary-foreground rounded-sm text-sm font-medium hover:border-primary-foreground/50 transition-colors"
                >
                  {locale === 'de' ? 'Jetzt anfragen' : 'Send enquiry'}
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
