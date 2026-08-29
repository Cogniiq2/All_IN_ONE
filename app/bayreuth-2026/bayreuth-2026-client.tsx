'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Footprints, Ticket } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getArticleBySlug } from '@/lib/articles';
import { faqsByCategory } from '@/lib/faq';
import { apartments } from '@/lib/content/apartments';
import { tempImages, REFERENCE_IMAGE_LABEL } from '@/lib/content/media';
import { Reveal } from '@/components/ui-kit/reveal';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * Bayreuth & the Festival.
 *
 * Removed from the previous version: exact festival dates presented as fact,
 * the "15 Fahrminuten zum Festspielhaus" claim (contradicted elsewhere on the
 * same site), the five-apartment inventory, nightly prices, an Event schema
 * with an availability offer, and the unlicensed Bayerischer Rundfunk press
 * photograph.
 *
 * What is said here is general and checkable: the festival takes place in
 * summer, tickets are famously scarce, evenings are long, the town is small.
 */

const points = [
  {
    icon: Ticket,
    de: {
      title: 'Die Karten kommen zuerst',
      body: 'Fast alle Gäste haben ihre Karten lange vorher. Wer Karten hat, sollte die Unterkunft möglichst früh klären — in Bayreuth wird es zur Festspielzeit eng.',
    },
    en: {
      title: 'Tickets come first',
      body: 'Almost every guest has their tickets long in advance. If you have them, settle accommodation early — Bayreuth gets tight during festival weeks.',
    },
  },
  {
    icon: CalendarClock,
    de: {
      title: 'Die Abende sind lang',
      body: 'Ein Wagner-Abend beginnt am Nachmittag und endet spät. Danach möchte niemand noch eine weite Fahrt vor sich haben.',
    },
    en: {
      title: 'The evenings are long',
      body: 'A Wagner evening begins in the afternoon and ends late. Afterwards, nobody wants a long drive ahead of them.',
    },
  },
  {
    icon: Footprints,
    de: {
      title: 'Die Stadt ist klein',
      body: 'In Bayreuth erledigt man das meiste zu Fuß. Wer in der Innenstadt wohnt, braucht für den Alltag kein Auto.',
    },
    en: {
      title: 'The town is small',
      body: 'In Bayreuth most things are done on foot. Staying in the centre means you need no car for day-to-day life.',
    },
  },
];

export default function BayreuthClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const bayreuthFaqs = faqsByCategory('bayreuth');
  /* The pieces that genuinely continue this page's subject, named explicitly
     rather than sliced off the top of the list, so the cluster is stable when
     articles are added. */
  const cluster = ['bayreuth-festspiele-unterkunft-guide', 'wo-in-bayreuth-ubernachten', 'richard-wagner-bayreuth-mythos']
    .map(getArticleBySlug)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <>
      <header className="relative overflow-hidden" style={{ background: 'hsl(var(--ink))' }}>
        <div className="absolute inset-0 opacity-40">
          <Image
            src={tempImages.bedroom.src}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            aria-hidden="true"
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, hsl(var(--ink)) 8%, hsl(var(--ink) / 0.82) 55%, hsl(var(--ink) / 0.68) 100%)',
          }}
        />
        <div className="container-luxury relative py-20 lg:py-28">
          <Reveal>
            <p className="eyebrow-on-dark">{de ? 'Bayreuth' : 'Bayreuth'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[16ch]" style={{ color: 'hsl(var(--on-dark))' }}>
              {de ? 'Übernachten in einer Festspielstadt' : 'Staying in a festival town'}
            </h1>
            <p
              className="mt-6 max-w-[54ch] text-[17px] leading-relaxed"
              style={{ color: 'hsl(var(--on-dark-muted))' }}
            >
              {de
                ? 'Im Sommer richtet sich Bayreuth nach dem Festspielhaus. Den Rest des Jahres ist es eine ruhige oberfränkische Stadt mit Barock, Hofgarten und Universität. Beides lässt sich gut von der Innenstadt aus erleben.'
                : 'In summer, Bayreuth arranges itself around the Festspielhaus. The rest of the year it is a quiet Upper Franconian town of baroque architecture, gardens and a university. Both are best experienced from the centre.'}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <EnquiryButton invert withArrow />
              <CtaLink href="/apartments" variant="secondary" invert>
                {label('exploreApartments', locale)}
              </CtaLink>
            </div>
          </Reveal>
        </div>
        <span className="absolute bottom-4 right-4 ref-badge">{REFERENCE_IMAGE_LABEL[locale]}</span>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {points.map((point, i) => {
              const copy = de ? point.de : point.en;
              return (
                <Reveal key={copy.title} delay={i * 0.07}>
                  <div
                    className="h-full p-7"
                    style={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    <point.icon
                      className="w-5 h-5 mb-4"
                      style={{ color: 'hsl(var(--champagne-dark))' }}
                      aria-hidden="true"
                    />
                    <h2 className="text-[16px] font-semibold">{copy.title}</h2>
                    <p className="body-copy mt-2.5 text-[14px]">{copy.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={0.1}>
            <div
              className="mt-10 p-6 text-[14px] leading-relaxed"
              style={{
                background: 'hsl(var(--secondary) / 0.6)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-lg)',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {de
                ? 'Spielplan und Termine der Bayreuther Festspiele veröffentlicht die Festspiele GmbH selbst — wir geben hier bewusst keine Daten wieder, die sich ändern können.'
                : 'The Bayreuth Festival publishes its own programme and dates — we deliberately do not reproduce dates here that may change.'}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Orientation ────────────────────────────────────────────────
          What a visitor planning a stay actually needs to know about the
          town, and why a central address matters here specifically.

          Deliberately absent: walking times, driving times, distances in
          metres and any transport claim. None of those are verified in this
          repository, and the previous site published three different figures
          for the same distance. Everything below holds without measurement. */}
      <section className="section-pad-sm border-t border-border/70" aria-labelledby="orientierung">
        <div className="container-luxury">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal>
              <div>
                <p className="eyebrow">{de ? 'Orientierung' : 'Getting your bearings'}</p>
                <div className="rule-gold mb-6 mt-4" aria-hidden="true" />
                <h2 id="orientierung" className="display-2">
                  {de ? 'Wie die Stadt gebaut ist' : 'How the town is laid out'}
                </h2>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="space-y-5">
                <p className="body-copy text-[15.5px]">
                  {de
                    ? 'Bayreuth hat zwei Zentren, die nicht dasselbe sind. Das eine ist die historische Innenstadt mit dem markgräflichen Barock, dem Hofgarten, den Geschäften und der Gastronomie. Das andere ist das Festspielhaus auf dem Grünen Hügel, das im Sommer den Takt der ganzen Stadt vorgibt.'
                    : 'Bayreuth has two centres, and they are not the same place. One is the historic old town with its margravial baroque, the Hofgarten, the shops and the restaurants. The other is the Festspielhaus on the Green Hill, which in summer sets the rhythm of the entire town.'}
                </p>
                <p className="body-copy text-[15.5px]">
                  {de
                    ? 'Dazu kommt die Universität im Süden, die der Stadt außerhalb der Festspielzeit ihren Alltag gibt, und ein Umfeld aus mittelständischen Unternehmen, das Geschäftsreisende nach Bayreuth bringt. Wer zentral wohnt, liegt zwischen diesen Polen statt am Rand eines einzelnen davon.'
                    : 'Then there is the university to the south, which gives the town its everyday life outside the festival season, and a surrounding economy of mid-sized companies that brings business travellers here. Staying centrally puts you between these poles rather than on the edge of one of them.'}
                </p>
                <p className="body-copy text-[15.5px]">
                  {de
                    ? 'Unsere Wohnungen liegen in der Innenstadt — in der Schulstraße und in der Opernstraße. Konkrete Geh- und Fahrzeiten nennen wir hier bewusst nicht: die hängen davon ab, wo genau Sie hinwollen, und ungeprüfte Minutenangaben helfen niemandem bei der Planung.'
                    : 'Our apartments are in the town centre — on Schulstraße and on Opernstraße. We deliberately quote no walking or driving times here: they depend on exactly where you are going, and unverified figures help nobody plan.'}
                </p>
              </div>
            </Reveal>
          </div>

          {/* Contextual route into the inventory, from the page that explains
              why the location matters. */}
          <Reveal delay={0.12}>
            <div
              className="mt-12 flex flex-col gap-6 p-7 lg:flex-row lg:items-center lg:justify-between lg:p-9"
              style={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div>
                <h3 className="display-3">
                  {de ? 'Wohnen mitten in Bayreuth' : 'Stay in the middle of Bayreuth'}
                </h3>
                <p className="body-copy mt-3 text-[14px]">
                  {de
                    ? `${apartments.length} Wohnungen in zwei Häusern in der Innenstadt, alle in Familienbesitz und von uns selbst betreut.`
                    : `${apartments.length} apartments in two buildings in the town centre, all family-owned and looked after by us.`}
                </p>
              </div>
              <CtaLink href="/apartments" withArrow>
                {label('exploreApartments', locale)}
              </CtaLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Bayreuth FAQ ──────────────────────────────────────────────── */}
      {bayreuthFaqs.length > 0 && (
        <section className="section-pad-sm" aria-labelledby="bayreuth-faq">
          <div className="container-luxury">
            <Reveal>
              <p className="eyebrow">{de ? 'Häufige Fragen' : 'Common questions'}</p>
              <h2 id="bayreuth-faq" className="display-2 mt-4 max-w-[20ch]">
                {de ? 'Was Gäste zu Bayreuth fragen' : 'What guests ask about Bayreuth'}
              </h2>
            </Reveal>

            <dl className="mt-10 grid gap-6 md:grid-cols-3 lg:gap-8">
              {bayreuthFaqs.map((faq, i) => (
                <Reveal key={faq.id} delay={i * 0.07}>
                  <div
                    className="h-full p-7"
                    style={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    <dt className="text-[16px] font-semibold">{faq.question[locale]}</dt>
                    <dd className="body-copy mt-3 text-[14px]">{faq.answer[locale]}</dd>
                  </div>
                </Reveal>
              ))}
            </dl>

            <Reveal delay={0.1}>
              <div className="mt-8">
                <Link href="/faq" className="link-quiet">
                  {de ? 'Alle Fragen' : 'All questions'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Journal cluster ───────────────────────────────────────────
          Three pieces that continue this page's subject rather than one
          featured post. This is the internal-linking spine between the
          location page and the Journal: Bayreuth explains the place, the
          articles go deeper, both route back to the apartments. */}
      {cluster.length > 0 && (
        <section className="section-pad-sm" style={{ background: 'hsl(var(--secondary) / 0.5)' }}
                 aria-labelledby="bayreuth-journal">
          <div className="container-luxury">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="eyebrow">{de ? 'Aus dem Journal' : 'From the journal'}</p>
                  <h2 id="bayreuth-journal" className="display-2 mt-4 max-w-[24ch]">
                    {de ? 'Weiterlesen über Bayreuth' : 'More about Bayreuth'}
                  </h2>
                </div>
                <Link href="/journal" className="link-quiet">
                  {de ? 'Alle Beiträge' : 'All pieces'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>

            <ul className="mt-10 grid gap-6 md:grid-cols-3 lg:gap-8">
              {cluster.map((article, i) => (
                <Reveal as="li" key={article.slug} delay={i * 0.07} className="h-full">
                  <article className="card-surface flex h-full flex-col p-7">
                    <p className="eyebrow">{article.category[locale]}</p>
                    <h3 className="display-3 mt-3 text-[19px]">
                      <Link
                        href={`/journal/${article.slug}`}
                        className="transition-colors hover:text-[hsl(var(--champagne-dark))]"
                      >
                        {article.title[locale]}
                      </Link>
                    </h3>
                    <p className="body-copy mt-3 flex-1 text-[14px]">{article.excerpt[locale]}</p>
                    <span className="mt-5 text-[12px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {article.readTime[locale]}
                    </span>
                  </article>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

    </>
  );
}
