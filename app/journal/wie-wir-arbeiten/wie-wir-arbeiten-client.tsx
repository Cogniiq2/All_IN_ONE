'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowLeft, ArrowRight, Phone, Key, Wine, Heart, MessageCircle, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';
import { articles } from '@/lib/articles';

export default function HowWeWorkArticle() {
  const { locale } = useI18n();

  const related = articles.filter(
    (a) => a.slug !== 'wie-wir-arbeiten' && (a.slug === 'wo-in-bayreuth-ubernachten' || a.slug === 'serviced-apartments-bayreuth-geschaftsreisen')
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
                {locale === 'de' ? 'Über uns' : 'About us'}
              </span>
              <h1 className="font-serif text-3xl lg:text-5xl font-semibold mb-5 leading-tight">
                {locale === 'de'
                  ? 'Hinter den Kulissen: Wie wir All in One Residences betreiben'
                  : 'Behind the Scenes: How We Run All in One Residences'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {locale === 'de' ? '5 Min. Lesezeit' : '5 min read'}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span>{locale === 'de' ? '5. März 2025' : 'March 5, 2025'}</span>
              </div>
            </div>

            <div className="relative aspect-[16/9] rounded-xl overflow-hidden mb-12">
              <Image
                src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt={locale === 'de' ? 'All in One Residences Bayreuth' : 'All in One Residences Bayreuth'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
              />
            </div>

            <div className="space-y-7 text-base leading-relaxed text-muted-foreground">

              <p className="text-lg text-foreground font-medium leading-relaxed">
                {locale === 'de'
                  ? 'Fünf Apartments. Kein Rezeptionist. Kein Callcenter. Kein Franchise-System, das vorschreibt, wie das Frühstücksbuffet aussehen soll. Nur wir, unsere Gäste und eine Überzeugung: dass persönlicher Service nicht bedeutet, immer physisch präsent zu sein — sondern immer erreichbar, immer verlässlich, immer menschlich.'
                  : "Five apartments. No receptionist. No call center. No franchise system dictating what the breakfast buffet should look like. Just us, our guests, and a conviction: that personal service doesn't mean always being physically present — but always reachable, always reliable, always human."}
              </p>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Wie alles begann' : 'How it all began'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'All in One Residences ist kein Investorenprodukt. Es begann mit einer Immobilie in Bayreuth, einem Verständnis für die Lücke zwischen Hotelzimmer und Airbnb-Schuhschachtel — und dem Wunsch, es besser zu machen. Nicht mit mehr Betten, sondern mit mehr Sorgfalt.'
                  : "All in One Residences is not an investor product. It began with a property in Bayreuth, an understanding of the gap between hotel room and Airbnb shoebox — and the desire to do it better. Not with more beds, but with more care."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Mit der Zeit kamen weitere Residenzen dazu — immer in der Innenstadt, immer mit Garagenparkplatz, immer mit demselben Qualitätsanspruch. Fünf Apartments heute. Alle von uns persönlich betreut.'
                  : "Over time, more residences were added — always in the city center, always with garage parking, always with the same quality standard. Five apartments today. All personally managed by us."}
              </p>

              <div className="relative aspect-[3/2] rounded-xl overflow-hidden my-10">
                <Image
                  src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt={locale === 'de' ? 'Persönlicher Service' : 'Personal service'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Was "persönlich" für uns bedeutet' : 'What "personal" means to us'}
              </h2>

              <p>
                {locale === 'de'
                  ? '"Persönlicher Service" ist ein Begriff, den viele Anbieter verwenden und wenige wirklich meinen. Für uns bedeutet er konkret: Sie kommunizieren immer mit einer echten Person. Sie bekommen Antworten, keine Tickets. Wenn Sie uns um 22 Uhr schreiben, weil der Zugangscode nicht funktioniert, sind wir da.'
                  : '"Personal service" is a phrase many providers use and few truly mean. For us it means specifically: you always communicate with a real person. You get answers, not tickets. If you write to us at 10pm because the access code isn\'t working, we are there.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
                {(locale === 'de' ? [
                  { icon: Phone, title: 'Direkte Nummer', body: 'Keine versteckte Kontaktseite, kein Formular. Jeder Gast hat unsere direkte Nummer — vor dem Einzug, während des Aufenthalts, danach.' },
                  { icon: Key, title: 'Self Check-in, menschlich', body: 'Self Check-in bedeutet bei uns nicht: allein gelassen werden. Es bedeutet: Freiheit. Der Code kommt pünktlich, mit allen Infos, die Sie brauchen.' },
                  { icon: Wine, title: 'Willkommenswein', body: 'Bei Direktbuchung wartet ein kuratierter Wein in der Wohnung. Persönlich ausgewählt. Kein Promo-Artikel, sondern eine Geste.' },
                  { icon: Heart, title: 'Rückkehrende Gäste', body: 'Wer wiederkommt, ist kein Datensatz. Wir erinnern uns. Und wir zeigen es.' },
                ] : [
                  { icon: Phone, title: 'Direct number', body: "No hidden contact page, no form. Every guest has our direct number — before check-in, during the stay, afterwards." },
                  { icon: Key, title: 'Self check-in, human', body: "Self check-in for us doesn't mean being left alone. It means freedom. The code arrives on time, with all the information you need." },
                  { icon: Wine, title: 'Welcome wine', body: "For direct bookings, a curated wine awaits in the apartment. Personally selected. Not a promo item, but a gesture." },
                  { icon: Heart, title: 'Returning guests', body: "Those who return are not data entries. We remember. And we show it." },
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
                {locale === 'de' ? 'Unsere Apartments: Curated, nicht cookie-cutter' : 'Our apartments: curated, not cookie-cutter'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Jede unserer Residenzen hat ihre eigene Persönlichkeit. Die Maison Sternplatz ist großzügig und ruhig. Die Atelier Opernstraße hat einen Balkon über den Dächern. Die Loge am Sternplatz ist das ideale Apartment für Alleinreisende oder Paare. Wir haben sie nicht aus einem Katalog eingerichtet, sondern mit Überzeugung.'
                  : "Each of our residences has its own personality. Maison Sternplatz is generous and quiet. Atelier Opernstraße has a balcony above the rooftops. Loge am Sternplatz is the ideal apartment for solo travelers or couples. We didn't furnish them from a catalog, but with conviction."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Das bedeutet: hochwertige Matratzen, nicht das billigste Modell. Küchenausstattung, mit der man tatsächlich kochen kann. Bettwäsche, die weich ist und nicht nach Wäschekette riecht. Details, die kein Foto zeigt, aber jeder Gast spürt.'
                  : "That means: high-quality mattresses, not the cheapest model. Kitchen equipment with which you can actually cook. Bed linen that is soft and doesn't smell of a laundry chain. Details that no photo shows, but every guest feels."}
              </p>

              <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-10">
                <Image
                  src="https://images.pexels.com/photos/1648771/pexels-photo-1648771.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt={locale === 'de' ? 'All in One Residences Wohnqualität' : 'All in One Residences living quality'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Warum wir auf Direktbuchungen setzen' : 'Why we focus on direct bookings'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Plattformen wie Airbnb und Booking.com haben ihre Berechtigung — und ja, auch unsere Apartments sind dort zu finden. Aber wir glauben, dass das beste Erlebnis entsteht, wenn wir direkt mit unseren Gästen kommunizieren.'
                  : "Platforms like Airbnb and Booking.com have their place — and yes, our apartments are also listed there. But we believe the best experience emerges when we communicate directly with our guests."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Direktbuchung bedeutet: Sie zahlen keine Servicegebühren. Sie kommunizieren von Anfang an mit uns, nicht mit einem Algorithmus. Und Sie bekommen einen Willkommenswein — weil wir das möchten, nicht weil es eine Plattformregel vorschreibt.'
                  : "Direct booking means: you pay no service fees. You communicate with us from the start, not with an algorithm. And you receive a welcome wine — because we want to, not because a platform rule dictates it."}
              </p>

              <div className="flex items-start gap-4 p-6 rounded-lg border border-champagne/20 bg-champagne/5 my-8">
                <MessageCircle className="w-5 h-5 text-champagne flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground text-sm mb-2">
                    {locale === 'de' ? 'Eine direkte Frage?' : 'A direct question?'}
                  </p>
                  <p className="text-sm leading-relaxed mb-3">
                    {locale === 'de'
                      ? 'Wenn Sie sich unsicher sind, welche Residenz zu Ihrem Aufenthalt passt — schreiben Sie uns einfach. Kein Formular, keine Hotline. Eine direkte Nachricht reicht.'
                      : "If you're unsure which residence suits your stay — just write to us. No form, no hotline. A direct message is enough."}
                  </p>
                  <a
                    href="https://wa.me/491601832917"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-champagne hover:underline underline-offset-2"
                  >
                    {locale === 'de' ? 'Per WhatsApp schreiben' : 'Message via WhatsApp'}
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Was uns antreibt' : 'What drives us'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Wir machen das nicht, weil es einfach ist. Wir machen es, weil wir glauben, dass Reisen besser sein kann. Dass man in einer fremden Stadt ankommen und sich sofort zu Hause fühlen kann. Dass ein Aufenthalt nicht nur ein Dach über dem Kopf ist, sondern ein Erlebnis.'
                  : "We don't do this because it's easy. We do it because we believe travel can be better. That you can arrive in a foreign city and immediately feel at home. That a stay is not just a roof over your head, but an experience."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Bayreuth ist eine außergewöhnliche Stadt. Wir versuchen, Unterkünfte zu schaffen, die dem gerecht werden.'
                  : "Bayreuth is an exceptional city. We try to create accommodation that does it justice."}
              </p>

            </div>

            <div className="bg-foreground text-primary-foreground rounded-xl p-8 lg:p-10 my-14">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-primary-foreground/60" />
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/50">
                  {locale === 'de' ? 'All in One Residences · Bayreuth' : 'All in One Residences · Bayreuth'}
                </p>
              </div>
              <h3 className="font-serif text-2xl font-semibold mb-4">
                {locale === 'de' ? 'Lernen Sie uns kennen' : 'Get to know us'}
              </h3>
              <p className="text-primary-foreground/70 mb-7 max-w-md leading-relaxed">
                {locale === 'de'
                  ? 'Fünf Residenzen, ein Team, eine Überzeugung. Direkt buchen, persönlicher Service, kein Callcenter.'
                  : 'Five residences, one team, one conviction. Direct booking, personal service, no call center.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/about"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-primary-foreground text-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity group"
                >
                  {locale === 'de' ? 'Über uns lesen' : 'Read about us'}
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
