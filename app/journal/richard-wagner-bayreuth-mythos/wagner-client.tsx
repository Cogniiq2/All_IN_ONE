'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowLeft, ArrowRight, Music, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';
import { articles } from '@/lib/articles';

export default function WagnerBayreuthArticle() {
  const { locale } = useI18n();

  const related = articles.filter(
    (a) => a.slug !== 'richard-wagner-bayreuth-mythos' && (a.slug === 'bayreuth-festspiele-unterkunft-guide' || a.slug === 'wie-wir-arbeiten')
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
                {locale === 'de' ? 'Kultur & Geschichte' : 'Culture & History'}
              </span>
              <h1 className="font-serif text-3xl lg:text-5xl font-semibold mb-5 leading-tight">
                {locale === 'de'
                  ? 'Richard Wagner und Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde'
                  : 'Richard Wagner and Bayreuth: How a City Became a Place of Pilgrimage'}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {locale === 'de' ? '7 Min. Lesezeit' : '7 min read'}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span>{locale === 'de' ? '28. Februar 2025' : 'February 28, 2025'}</span>
              </div>
            </div>

            <div className="relative aspect-[16/9] rounded-xl overflow-hidden mb-12">
              <Image
                src="/images/richard-wagner-in-bayreuth-with-festspielhaus-festival-house-and-villa-KD6MMB.jpg"
                alt={locale === 'de' ? 'Richard Wagner Bayreuth Mythos' : 'Richard Wagner Bayreuth myth'}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
              />
            </div>

            <div className="space-y-7 text-base leading-relaxed text-muted-foreground">

              <p className="text-lg text-foreground font-medium leading-relaxed">
                {locale === 'de'
                  ? 'Es gibt Orte auf der Welt, deren Bedeutung weit über ihre Größe hinausgeht. Bayreuth ist einer davon. Eine Stadt mit 75.000 Einwohnern, die jedes Jahr Menschen anzieht, die jahrelang auf einen einzigen Abend gewartet haben. Der Grund: ein Komponist, der im 19. Jahrhundert beschloss, die Regeln der Opernwelt neu zu schreiben.'
                  : 'There are places in the world whose significance far exceeds their size. Bayreuth is one of them. A city of 75,000 inhabitants that every year attracts people who have waited years for a single evening. The reason: a composer who in the 19th century decided to rewrite the rules of the opera world.'}
              </p>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Warum Wagner Bayreuth wählte' : 'Why Wagner chose Bayreuth'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Richard Wagner war ein Mensch der totalen Vision. Er schrieb nicht nur Musik — er komponierte Gesamtkunstwerke, in denen Libretto, Bühne, Licht, Orchester und Gesang ein untrennbares Ganzes bilden sollten. Und er erkannte früh: Das war in einem normalen Opernhaus nicht möglich.'
                  : "Richard Wagner was a man of total vision. He didn't just write music — he composed Gesamtkunstwerke, in which libretto, stage, lighting, orchestra, and singing were to form an inseparable whole. And he recognized early: this was not possible in a normal opera house."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Die bestehenden Opernhäuser seiner Zeit — prunkvoll, sozial hierarchisch, mit sichtbarem Orchestergraben und plauderndem Publikum in den Rängen — waren das Gegenteil dessen, was Wagner wollte. Er wollte Konzentration. Dunkelheit. Versenkung.'
                  : "The existing opera houses of his time — ornate, socially hierarchical, with a visible orchestra pit and chattering audiences in the galleries — were the opposite of what Wagner wanted. He wanted concentration. Darkness. Immersion."}
              </p>

              <div className="relative aspect-[16/9] rounded-xl overflow-hidden my-10">
                <Image
                  src="https://images.pexels.com/photos/164977/pexels-photo-164977.jpeg?auto=compress&cs=tinysrgb&w=1200"
                  alt={locale === 'de' ? 'Festspielhaus Bayreuth' : 'Festspielhaus Bayreuth'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Das Festspielhaus: Ein Theater nach Wagners Regeln' : "The Festspielhaus: A theater by Wagner's rules"}
              </h2>

              <p>
                {locale === 'de'
                  ? '1876 eröffnete Wagner das Bayreuther Festspielhaus auf dem Grünen Hügel am Stadtrand Bayreuths. Was er dort baute, war ohne Vorbild: ein Amphitheater ohne Ränge, ohne Logen, ohne die sozialen Schichtungen der damaligen Opernhäuser. Jeder Sitz sah gleich gut. Das Orchester war unter der Bühne versenkt — unsichtbar, aber hörbar in einer Qualität, die es bis heute nicht übertrifft.'
                  : "In 1876 Wagner opened the Bayreuth Festspielhaus on the Grüner Hügel on the outskirts of Bayreuth. What he built there was without precedent: an amphitheater without galleries, without boxes, without the social stratification of opera houses of the time. Every seat had an equally good view. The orchestra was sunk beneath the stage — invisible, but audible in a quality that has never been surpassed."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Der Graben ist so tief und so gestaltet, dass das Orchester nie als eigenständige Klangquelle wahrgenommen wird, sondern als Teil einer Gesamtatmosphäre. Wagner nannte ihn den "mystischen Abgrund". Der Name ist geblieben.'
                  : "The pit is designed so deep and shaped such that the orchestra is never perceived as an independent sound source, but as part of an overall atmosphere. Wagner called it the 'mystical abyss'. The name has stuck."}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-10">
                <div className="p-6 rounded-xl border border-border/50 bg-secondary/10">
                  <Music className="w-6 h-6 text-champagne mb-4" />
                  <h3 className="font-serif text-base font-semibold mb-2">
                    {locale === 'de' ? 'Der versunkene Orchestergraben' : 'The sunken orchestra pit'}
                  </h3>
                  <p className="text-sm leading-relaxed">
                    {locale === 'de'
                      ? 'Wagners "mystischer Abgrund" ist bis heute unverändert. Das Orchester ist unsichtbar, der Klang durchdringt den Raum ohne erkennbare Quelle.'
                      : 'Wagner\'s "mystical abyss" remains unchanged. The orchestra is invisible, the sound permeates the space without a discernible source.'}
                  </p>
                </div>
                <div className="p-6 rounded-xl border border-border/50 bg-secondary/10">
                  <MapPin className="w-6 h-6 text-champagne mb-4" />
                  <h3 className="font-serif text-base font-semibold mb-2">
                    {locale === 'de' ? 'Kein anderer Ort' : 'No other place'}
                  </h3>
                  <p className="text-sm leading-relaxed">
                    {locale === 'de'
                      ? 'Wagners Werke werden weltweit gespielt. Aber "Der Ring" auf dem Grünen Hügel ist ein Erlebnis, das es nirgendwo sonst gibt — das weiß jeder, der einmal dort war.'
                      : "Wagner's works are performed worldwide. But 'The Ring' on the Grüner Hügel is an experience that exists nowhere else — anyone who has been there once knows this."}
                  </p>
                </div>
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Die Festspiele heute: Kult, Warteschlange, Weltereignis' : 'The festival today: cult, waiting list, world event'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Die Warteliste für Karten ist legendär. Bis zu zehn Jahre kann es dauern, bis man einen Platz bekommt. Wer einmal drin ist, kommt meist wieder. Die Treue des Publikums hat etwas Religiöses.'
                  : "The ticket waiting list is legendary. It can take up to ten years to get a seat. Those who get in once usually return. The audience's loyalty has something almost religious about it."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Jedes Jahr präsentiert die Festspielleitung neue Inszenierungen — mal traditionell, mal radikal modern, immer diskutiert. Das Publikum ist international und hochgebildet. Die Pausen, in denen man in Abendgarderobe über die Wiesen des Grünen Hügels spaziert und diniert, sind Teil des Erlebnisses.'
                  : "Each year the festival presents new productions — sometimes traditional, sometimes radically modern, always discussed. The audience is international and highly educated. The intervals, where one strolls and dines in evening dress across the meadows of the Grüner Hügel, are part of the experience."}
              </p>

              <div
                className="rounded-lg p-6 my-8"
                style={{ background: 'hsl(38 42% 46% / 0.06)', border: '1px solid hsl(38 42% 46% / 0.2)' }}
              >
                <blockquote className="font-serif text-lg italic text-foreground leading-relaxed mb-3">
                  {locale === 'de'
                    ? '"Bayreuth ist der einzige Ort, an dem Oper nicht als Konzert, sondern als existenzielles Erlebnis stattfindet."'
                    : '"Bayreuth is the only place where opera happens not as a concert, but as an existential experience."'}
                </blockquote>
                <p className="text-xs text-muted-foreground">
                  {locale === 'de' ? '— Häufig zitiert unter Besuchern des Festspielhauses' : '— Frequently quoted among visitors to the Festspielhaus'}
                </p>
              </div>

              <h2 className="font-serif text-2xl lg:text-3xl font-semibold text-foreground mt-14 mb-4">
                {locale === 'de' ? 'Wagner und Bayreuth — eine unlösliche Verbindung' : 'Wagner and Bayreuth — an inseparable connection'}
              </h2>

              <p>
                {locale === 'de'
                  ? 'Wagner starb 1883, aber Bayreuth ist lebendig geblieben. Seine Nachkommen führten die Festspiele fort, mal glorreicher, mal umstrittener. Das Haus auf dem Grünen Hügel steht noch immer genau so, wie er es entworfen hat — funktional, akustisch perfekt, unprunkvoll.'
                  : "Wagner died in 1883, but Bayreuth has remained alive. His descendants continued the festival, sometimes gloriously, sometimes controversially. The house on the Grüner Hügel still stands exactly as he designed it — functional, acoustically perfect, unornamented."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Und die Stadt selbst? Sie hat sich mit dieser Geschichte arrangiert. Bayreuth ist stolz auf Wagner, manchmal ambivalent, immer bewusst. Das Wagner-Museum, das Nationalarchiv der Richard-Wagner-Stiftung, Wahnfried — sein Haus — und natürlich das Festspielhaus: Wer Bayreuth kennen lernen will, kommt an Wagner nicht vorbei.'
                  : "And the city itself? It has come to terms with this history. Bayreuth is proud of Wagner, sometimes ambivalent, always aware. The Wagner Museum, the National Archive of the Richard Wagner Foundation, Wahnfried — his house — and of course the Festspielhaus: anyone who wants to get to know Bayreuth cannot avoid Wagner."}
              </p>

              <p>
                {locale === 'de'
                  ? 'Vielleicht ist das auch der Grund, warum ein Aufenthalt in Bayreuth besonders ist. Man wohnt nicht einfach in einer Stadt. Man wohnt in einem Kapitel Kulturgeschichte.'
                  : "Perhaps that is also the reason why a stay in Bayreuth is special. You are not simply staying in a city. You are staying in a chapter of cultural history."}
              </p>

            </div>

            <div className="bg-foreground text-primary-foreground rounded-xl p-8 lg:p-10 my-14">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/50 mb-3">
                {locale === 'de' ? 'All in One Residences · Bayreuth' : 'All in One Residences · Bayreuth'}
              </p>
              <h3 className="font-serif text-2xl font-semibold mb-4">
                {locale === 'de' ? 'Ihr Zuhause für die Festspiele' : 'Your home for the festival'}
              </h3>
              <p className="text-primary-foreground/70 mb-7 max-w-md leading-relaxed">
                {locale === 'de'
                  ? 'Fünf Residenzen in der Bayreuther Innenstadt — zentral, ruhig, mit Garagenparkplatz. Für Festspielgäste mit einem Anspruch an das Gesamterlebnis.'
                  : 'Five residences in Bayreuth\'s city center — central, quiet, with garage parking. For festival guests who expect the complete experience.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/bayreuth-2026"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-primary-foreground text-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity group"
                >
                  {locale === 'de' ? 'Bayreuth 2026 planen' : 'Plan Bayreuth 2026'}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/residences"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 border border-primary-foreground/25 text-primary-foreground rounded-sm text-sm font-medium hover:border-primary-foreground/50 transition-colors"
                >
                  {locale === 'de' ? 'Residenzen ansehen' : 'View residences'}
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
