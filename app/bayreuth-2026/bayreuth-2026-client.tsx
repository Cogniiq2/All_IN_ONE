'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Footprints, Ticket } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { articles } from '@/lib/articles';
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
  const featured = articles[0];

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
                      borderRadius: 'var(--radius)',
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
                borderRadius: 'var(--radius)',
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

      {featured && (
        <section className="section-pad-sm" style={{ background: 'hsl(var(--secondary) / 0.5)' }}>
          <div className="container-luxury">
            <Reveal>
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="eyebrow">{de ? 'Aus dem Journal' : 'From the journal'}</p>
                  <h2 className="display-2 mt-4 max-w-[22ch]">{featured.title[locale]}</h2>
                  <p className="lede mt-4">{featured.excerpt[locale]}</p>
                </div>
                <Link href={`/journal/${featured.slug}`} className="cta-secondary group shrink-0">
                  {de ? 'Lesen' : 'Read'}
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}
    </>
  );
}
