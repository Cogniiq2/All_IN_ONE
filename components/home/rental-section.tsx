'use client';

/**
 * The long-term rental entry point on the homepage.
 *
 * This is the second business, and it has to be findable without competing
 * with the accommodation journey above it. So: a quiet, architectural band —
 * no photograph, no card grid, no price, and no CTA that could be mistaken for
 * a booking. "Beratung anfragen", never "Jetzt buchen".
 *
 * It is placed after the trust sections rather than beside the apartments, so
 * a guest looking for a few nights never has to decide between two products.
 * A visitor who wants to rent finds it in the navigation instead.
 *
 * Both columns are counted from the data, so a new unit or building appears
 * here without touching this file.
 */

import Link from 'next/link';
import { ArrowRight, Building2, Home } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { lettableUnits } from '@/lib/content/apartments';
import { Section, SectionHeader } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { label } from '@/components/ui-kit/cta';

export function RentalSection() {
  const { locale } = useI18n();
  const de = locale === 'de';

  const residential = lettableUnits('long-term-residential');
  const commercial = lettableUnits('long-term-commercial');

  // Nothing to let today means no section at all — better an absent path than
  // an empty one.
  if (residential.length === 0 && commercial.length === 0) return null;

  const columns = [
    residential.length > 0 && {
      icon: Home,
      title: de ? 'Wohnraum' : 'Residential',
      body: de
        ? 'Ausgewählte Wohnungen können statt tageweise auch dauerhaft über einen Wohnraummietvertrag vermietet werden. Ob das für einen bestimmten Zeitraum möglich ist, klären wir persönlich.'
        : 'Selected apartments can be let on a residential rental agreement instead of by the day. Whether that works for a given period is something we settle personally.',
      count: residential.length,
    },
    commercial.length > 0 && {
      icon: Building2,
      title: de ? 'Gewerbe' : 'Commercial',
      body: de
        ? 'Im Erdgeschoss unserer Häuser liegen Flächen mit Schaufenstern zur Straße — ausschließlich zur Miete über einen Gewerbemietvertrag, nicht als Unterkunft.'
        : 'The ground floors of our buildings hold units with display windows onto the street — let exclusively under a commercial rental agreement, never as accommodation.',
      count: commercial.length,
    },
  ].filter(Boolean) as {
    icon: typeof Home;
    title: string;
    body: string;
    count: number;
  }[];

  return (
    <Section id="mieten">
      <div className="container-luxury">
        <SectionHeader
          eyebrow={de ? 'Mieten statt übernachten' : 'Renting, not staying'}
          title={
            de
              ? 'Objekte zur regulären Vermietung'
              : 'Properties let on a rental agreement'
          }
          lede={
            de
              ? 'Nicht jede Anfrage betrifft ein paar Nächte. Einzelne unserer Objekte in der Bayreuther Innenstadt vermieten wir auch dauerhaft — an Privatpersonen und an Unternehmen, über einen regulären Mietvertrag. Dafür gibt es keinen Buchungsweg, sondern ein Gespräch.'
              : 'Not every enquiry is about a few nights. Some of our properties in central Bayreuth are also let long term — to private tenants and to businesses, under a conventional rental agreement. There is no booking path for that, there is a conversation.'
          }
        />

        <div className="mt-12 grid gap-px overflow-hidden md:grid-cols-2"
             style={{ background: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}>
          {columns.map((column) => (
            <div key={column.title} className="p-7 lg:p-9" style={{ background: 'hsl(var(--card))' }}>
              <column.icon
                className="w-5 h-5"
                style={{ color: 'hsl(var(--champagne-dark))' }}
                aria-hidden="true"
              />
              <h3 className="display-3 mt-5">{column.title}</h3>
              <p className="body-copy mt-3 text-[14px]">{column.body}</p>
              <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {column.count === 1
                  ? de
                    ? '1 Objekt'
                    : '1 property'
                  : de
                  ? `${column.count} Objekte`
                  : `${column.count} properties`}
              </p>
            </div>
          ))}
        </div>

        <Reveal delay={0.12}>
          <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-4">
            <Link href="/mieten" className="cta-secondary group">
              {label('exploreRentals', locale)}
              <ArrowRight
                className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
            <p className="text-[13px] text-muted-foreground max-w-[52ch]">
              {de
                ? 'Eine Mietanfrage ist unverbindlich und begründet kein Mietverhältnis. Konditionen besprechen wir persönlich.'
                : 'A rental enquiry is non-binding and does not create a tenancy. Terms are discussed personally.'}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
