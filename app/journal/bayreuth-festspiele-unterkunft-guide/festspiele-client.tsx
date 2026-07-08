'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowLeft, ArrowRight, TriangleAlert as AlertTriangle, Star, MapPin, Car, Calendar } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';
import { articles } from '@/lib/articles';

export default function FestivalAccommodationArticle() {
  const { locale } = useI18n();

  const related = articles.filter(
    (a) => a.slug !== 'bayreuth-festspiele-unterkunft-guide' && (a.slug === 'richard-wagner-bayreuth-mythos' || a.slug === 'wo-in-bayreuth-ubernachten')
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
                {locale === 'de' ? 'Festspiele 2026' : 'Festival 2026'}
              </span>
              <h1 className="font-serif text-3xl lg:text-5xl font-semibold mb-5 leading-tight">
                {locale === 'de'
                  ? 'Festspiele 2026: Warum Unterkunft dieses Jahr anders denken muss'
                  : 'Festival 2026: Why Accommodation Needs to Be Rethought This Year'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {locale === 'de' ? '8 Min. Lesezeit' : '8 min read'}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span>{locale === 'de' ? '12. Januar 2025' : 'January 12, 2025'}</span>
              </div>
            </div>

            <div className="relative aspect-[16/9] rounded-xl overflow-hidden mb-12">
              <Image
                src="https://images.pexels.com/photos/1763067/pexels-photo-1763067.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt={locale === 'de' ? 'Bayreuth Festspiele 2026' : 'Bayreuth Festival 2026'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <p className="text-white/70 text-xs tracking-wide">
                  {locale === 'de' ? 'Bayreuth, Bayern — Festspielzeit' : 'Bayreuth, Bavaria — Festival season'}
                </p>
              </div>
            </div>

            <div className="space-y-7 text-base leading-relaxed text-muted-foreground">

              <p className="text-lg text-foreground font-medium leading-relaxed">
                {locale === 'de'
                  ? 'Es gibt Abende, die man nicht zweimal erlebt. Einen Abend in Bayreuth gehört dazu — dieser gepflegte Wahnsinn, sechs Stunden Wagner in einem Haus, das der Meister selbst entworfen hat, umgeben von Menschen aus aller Welt, die alle dasselbe wollen: den Moment.'
                  : 'There are evenings you don\'t experience twice. An evening in Bayreuth is one of them — that refined madness of six hours of Wagner in a house the master himself designed, surrounded by people from all over the world who all want the same thing: the moment.'}
              </p>

              <p>
                {locale === 'de'
                  ? 'Wer dann nach dem letzten Akt, nach dem langen Applaus und der langsamen Stille, die sich über das Festspielhaus legt, in ein Auto steigen und eine Stunde nach Nürnberg fahren muss — der hat einen Teil dieses Abends verpasst. Den besten Teil vielleicht.'
                  : 'Whoever then has to get into a car and drive an hour to Nuremberg after the final act, after the long applause and the slow silence that settles over the Festspielhaus — has missed part of that evening. Perhaps the best part.'}
              </p>

              <div
                className="rounded-lg p-6 my-8"
                style={{ background: 'hsl(38 42% 46% / 0.08)', borderLeft: '3px solid hsl(38 42% 46%)' }}
              >
                <div className="flex gap-4">
                  <AlertTriangle className="w-5 h-5 text-champagne flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-2 text-sm">
                      {locale === 'de' ? 'Zentrale Unterkunft: Jetzt buchen, nicht warten' : 'Central accommodation: Book now, don\'t wait'}
                    </h3>
                    <p className="text-sm leading-relaxed">
                      {locale === 'de'
                        ? 'Die Bayreuther Festspiele 2026 finden vom 25. Juli bis 28. August statt. Qualitative Unterkünfte in Innenstadtnähe sind erfahrungsgemäß 12 bis 18 Monate im Voraus ausgebucht. Wer im Herbst 2025 sucht, sucht zu spät.'
                        : 'The Bayreuth Festival 2026 runs from July 25 to August 28. Quality accommodations near the city center are typically fully booked 12 to 18 months in advance. Anyone searching in autumn 2025 is searching too late.'}
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Was die Festspiele von allem anderen unterscheidet' : 'What sets the festival apart from everything else'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Die Bayreuther Festspiele sind kein Konzert. Sie sind eine Wallfahrt. Wer einen der begehrten Plätze ergattert hat, hat dafür oft Jahre gewartet — und bereitet sich mit einer Ernsthaftigkeit vor, die andere Kulturereignisse nicht kennen. Abendgarderobe ist Pflicht. Die Pausen dauern eine Stunde. Man speist in der Zwischenzeit, diskutiert, atmet.'
                  : 'The Bayreuth Festival is not a concert. It is a pilgrimage. Whoever has obtained one of the coveted tickets has often waited years for it — and prepares with a seriousness that other cultural events don\'t know. Evening dress is required. The intervals last one hour. One dines in between, discusses, breathes.'}
              </p>

              <p>
                {locale === 'de'
                  ? 'In diesem Kontext bekommt "Unterkunft" eine andere Bedeutung. Es geht nicht um einen Ort zum Schlafen. Es geht um den Rahmen. Um den Abend vor der Aufführung, die Stunden danach. Um ein Zuhause auf Zeit, das dem Erlebnis gerecht wird.'
                  : 'In this context, "accommodation" takes on a different meaning. It\'s not about a place to sleep. It\'s about the setting. About the evening before the performance, the hours after. About a temporary home that does justice to the experience.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-10">
                {[
                  {
                    icon: Calendar,
                    label: locale === 'de' ? 'Festspieldauer' : 'Festival duration',
                    value: locale === 'de' ? '25. Juli – 28. Aug. 2026' : 'July 25 – Aug. 28, 2026',
                  },
                  {
                    icon: Clock,
                    label: locale === 'de' ? 'Aufführungsdauer' : 'Performance length',
                    value: locale === 'de' ? '4–7 Stunden' : '4–7 hours',
                  },
                  {
                    icon: Star,
                    label: locale === 'de' ? 'Wartezeit für Karten' : 'Wait for tickets',
                    value: locale === 'de' ? 'Bis zu 10 Jahre' : 'Up to 10 years',
                  },
                ].map(({ icon: Icon, label, value }, i) => (
                  <div key={i} className="p-5 rounded-lg border border-border/50 bg-secondary/20 text-center">
                    <Icon className="w-5 h-5 text-champagne mx-auto mb-2" />
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">{label}</p>
                    <p className="font-semibold text-sm text-foreground">{value}</p>
                  </div>
                ))}
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Das Problem der Festspielzeit: alle wollen dasselbe' : 'The festival\'s accommodation problem: everyone wants the same thing'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Jedes Jahr strömen rund 60.000 Besucher zu den Festspielen — aus Japan, den USA, aus ganz Europa. Die meisten bleiben mehrere Tage. Die meisten wollen dasselbe: zentral, ruhig, komfortabel, mit Parkplatz. Und die Kapazität ist begrenzt.'
                  : 'Every year around 60,000 visitors stream to the festival — from Japan, the USA, from across Europe. Most stay for several days. Most want the same thing: central, quiet, comfortable, with parking. And capacity is limited.'}
              </p>

              <p>
                {locale === 'de'
                  ? 'Hotels in Bayreuth haben während der Festspielzeit astronomische Preise. Viele verfügen über keine Tiefgarage. Wer ein Auto hat, sucht nach Alternativen. Wer nach einer langen Aufführung nicht in einer lauten Unterkunft schlafen will, auch.'
                  : 'Hotels in Bayreuth charge astronomical prices during festival time. Many don\'t have underground parking. Anyone with a car looks for alternatives. Anyone who doesn\'t want to sleep in a noisy accommodation after a long performance does too.'}
              </p>

              <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-10">
                <Image
                  src="https://images.pexels.com/photos/2034335/pexels-photo-2034335.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt={locale === 'de' ? 'Bayreuth Innenstadt' : 'Bayreuth city center'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Was gute Festspiel-Unterkunft auszeichnet' : 'What good festival accommodation looks like'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Wir haben über die Jahre viele Festspielgäste begleitet und wissen, worauf es wirklich ankommt. Es sind nicht die Dinge, die auf Fotos gut aussehen.'
                  : 'Over the years we have hosted many festival guests and know what really matters. It\'s not the things that look good in photos.'}
              </p>

              <div className="space-y-4 my-8">
                {(locale === 'de' ? [
                  { title: 'Lage, die Zeit spart', body: 'Das Festspielhaus liegt am Hang des Grünen Hügels — zu Fuß nicht erreichbar, mit ÖPNV oder dem eigenen Auto. Wer zentral wohnt, hat Optionen. Wer am Stadtrand wohnt, ist auf das Auto angewiesen.' },
                  { title: 'Stille nach Mitternacht', body: 'Festspielabende enden spät. Manchmal nach 23 Uhr. Wer dann erst schlafen kann, wenn Straßenlärm und Kneipengeräusche aufgehört haben, verpasst den Schlaf. Unsere Apartments liegen ruhig — aber zentral.' },
                  { title: 'Eigener Garagenparkplatz', body: 'Parking in Bayreuth während der Festspiele ist ein eigenes Thema. Die Innenstadt ist dicht. Wer einen festen Garagenplatz hat, erspart sich täglich 20–30 Minuten Parkplatzsuche und das Risiko einer Strafzettel.' },
                  { title: 'Platz zum Ankommen', body: 'Nach sechs Stunden Wagner möchte man nicht in einem 18-Quadratmeter-Zimmer ankommen. Man möchte sich setzen. Einen Aperitif in Ruhe trinken. Nachlesen, was man gerade erlebt hat. Unsere Apartments haben Raum dafür.' },
                  { title: 'Verlässlichkeit', body: 'Kein anonymer Host, der die Schlüsselübergabe per Blechkasten organisiert. Kein Airbnb-Profil, das nach der Festspielzeit nicht mehr reagiert. Ein persönlicher Ansprechpartner — vor, während und nach dem Aufenthalt.' },
                ] : [
                  { title: 'Location that saves time', body: 'The Festspielhaus sits on the hillside of the Grüner Hügel — not walkable, accessible by public transport or your own car. Those staying centrally have options. Those on the outskirts are car-dependent.' },
                  { title: 'Silence after midnight', body: 'Festival evenings end late. Sometimes after 11pm. Anyone who can only sleep when street noise and bar sounds have stopped misses out on sleep. Our apartments are quiet — but central.' },
                  { title: 'Private garage parking', body: 'Parking in Bayreuth during the festival is its own topic. The city center is dense. Anyone with a fixed garage space saves themselves 20–30 minutes of parking search daily and the risk of a ticket.' },
                  { title: 'Space to arrive', body: 'After six hours of Wagner you don\'t want to arrive in an 18-square-meter room. You want to sit down. Quietly drink an aperitif. Re-read what you just experienced. Our apartments have room for this.' },
                  { title: 'Reliability', body: 'No anonymous host organizing key handover via a lockbox. No Airbnb profile that stops responding after festival season. A personal contact — before, during, and after your stay.' },
                ]).map((item, i) => (
                  <div key={i} className="flex gap-4 p-5 rounded-lg border border-border/40 bg-secondary/10">
                    <div className="w-6 h-6 rounded-full bg-champagne/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-champagne">{i + 1}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm mb-1">{item.title}</p>
                      <p className="text-sm leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Unsere Residenzen zur Festspielzeit' : 'Our residences during festival season'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Alle fünf unserer Residenzen liegen in der Bayreuther Innenstadt. Am Sternplatz, direkt in der Altstadt, und an der Opernstraße. Das Festspielhaus ist in 15 Fahrminuten erreichbar; der Hauptbahnhof und die Bushaltestellen zum Grünen Hügel sind zu Fuß erreichbar.'
                  : 'All five of our residences are located in Bayreuth\'s city center. At Sternplatz, directly in the old town, and on Opernstraße. The Festspielhaus is a 15-minute drive away; the main station and bus stops to the Grüner Hügel are walkable.'}
              </p>

              <p>
                {locale === 'de'
                  ? 'Jede Residenz verfügt über einen eigenen Garagenstellplatz im Haus. Self Check-in ab 15 Uhr, flexible Abreise nach Absprache. Für Festspielgäste bieten wir Aufenthalte von einer Woche oder länger an — und kennen die Abläufe gut genug, um Ihnen vor Ankunft alle wichtigen Informationen zu schicken.'
                  : 'Every residence includes its own garage parking space in the building. Self check-in from 3pm, flexible departure by arrangement. For festival guests we offer stays of one week or longer — and know the routines well enough to send you all important information before arrival.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-8">
                {[
                  { icon: MapPin, text: locale === 'de' ? 'Zentrale Innenstadtlage' : 'Central city location' },
                  { icon: Car, text: locale === 'de' ? 'Garagenstellplatz inklusive' : 'Garage parking included' },
                  { icon: Star, text: locale === 'de' ? 'Bewertung 9.4 / 10' : 'Rating 9.4 / 10' },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-lg bg-secondary/20 border border-border/40">
                    <Icon className="w-4 h-4 text-champagne flex-shrink-0" />
                    <span className="text-sm font-medium">{text}</span>
                  </div>
                ))}
              </div>

            </div>

            <div className="bg-foreground text-primary-foreground rounded-xl p-8 lg:p-10 my-14">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/50 mb-3">
                {locale === 'de' ? 'All in One Residences · Bayreuth' : 'All in One Residences · Bayreuth'}
              </p>
              <h3 className="font-serif text-2xl font-semibold mb-4">
                {locale === 'de' ? 'Jetzt für die Festspiele 2026 anfragen' : 'Enquire now for Festival 2026'}
              </h3>
              <p className="text-primary-foreground/70 mb-7 max-w-md leading-relaxed">
                {locale === 'de'
                  ? 'Verfügbarkeit und Preise für die Festspielzeit 2026 auf Anfrage. Wir beraten Sie gerne bei der Wahl der passenden Residenz.'
                  : 'Availability and pricing for festival season 2026 on request. We\'re happy to advise you on choosing the right residence.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/bayreuth-2026"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-primary-foreground text-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity group"
                >
                  {locale === 'de' ? 'Bayreuth 2026 entdecken' : 'Discover Bayreuth 2026'}
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
