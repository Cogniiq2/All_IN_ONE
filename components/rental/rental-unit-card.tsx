'use client';

/**
 * A unit presented for conventional rental.
 *
 * Deliberately not the apartment card. The accommodation card sells a stay:
 * photograph first, guests, nights, "Verfügbarkeit anfragen". This one is a
 * property record: what the unit is, which mode it is offered in, and an
 * invitation to talk. Nothing here counts nights or offers a booking.
 *
 * The mode line is the important part. A visitor must be able to tell at a
 * glance whether they are looking at a flat that is primarily let by the night
 * and *may* also be let on a contract, or at a unit that is only ever let on a
 * contract. That distinction is read from `rentalModes`, never from the slug.
 */

import Link from 'next/link';
import { ArrowRight, Building2, Home, Ruler } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  isCommercial,
  lettingStatusOf,
  longTermModesOf,
  supportsShortTerm,
  type RentalUnit,
} from '@/lib/content/apartments';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { label } from '@/components/ui-kit/cta';

/** The one sentence that tells a visitor which commercial mode they are in. */
function modeNote(unit: RentalUnit, de: boolean): string {
  const commercial = isCommercial(unit);

  if (commercial) {
    return de
      ? 'Ausschließlich zur Miete über einen Gewerbemietvertrag — keine Vermietung als Unterkunft, keine Buchung nach Nächten.'
      : 'Let exclusively under a commercial rental agreement — not available as accommodation, never booked by the night.';
  }

  if (supportsShortTerm(unit)) {
    return de
      ? 'Diese Wohnung vermieten wir in erster Linie tageweise als Unterkunft. Eine dauerhafte Vermietung über einen Mietvertrag ist grundsätzlich denkbar — ob sie möglich ist, klären wir im persönlichen Gespräch.'
      : 'We let this apartment primarily by the day, as accommodation. A conventional tenancy under a rental agreement is possible in principle — whether it works is something we settle in conversation.';
  }

  return de
    ? 'Zur Vermietung über einen Wohnraummietvertrag.'
    : 'Let under a residential rental agreement.';
}

export function RentalUnitCard({
  unit,
  headingLevel = 'h3',
}: {
  unit: RentalUnit;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  const { locale } = useI18n();
  const de = locale === 'de';
  const commercial = isCommercial(unit);
  const upcoming = unit.status === 'in-preparation';
  const modes = longTermModesOf(unit);
  const Icon = commercial ? Building2 : Home;

  const facts = [
    unit.sizeSqm && {
      icon: Ruler,
      // "ca." because the figure the owners gave is approximate.
      text: de ? `ca. ${unit.sizeSqm} m²` : `approx. ${unit.sizeSqm} m²`,
    },
    unit.floor && { icon: Icon, text: unit.floor[locale] },
  ].filter(Boolean) as { icon: typeof Ruler; text: string }[];

  return (
    <article
      className="flex flex-col p-7 lg:p-8"
      style={{
        background: upcoming ? 'hsl(var(--secondary) / 0.6)' : 'hsl(var(--card))',
        border: upcoming ? '1px dashed hsl(var(--border))' : '1px solid hsl(var(--border) / 0.85)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-sm"
          style={{
            background: upcoming ? 'hsl(var(--ink))' : 'hsl(var(--accent))',
            color: upcoming ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))',
          }}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {lettingStatusOf(unit)[locale]}
        </span>

        {modes.map((mode) => (
          <span
            key={mode}
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'hsl(var(--champagne-dark))' }}
          >
            {mode === 'long-term-commercial'
              ? de
                ? 'Gewerbe'
                : 'Commercial'
              : de
              ? 'Wohnraum'
              : 'Residential'}
          </span>
        ))}
      </div>

      <Heading className="display-3 mt-4">{unit.name[locale]}</Heading>

      <p className="mt-2 text-[13px] font-medium" style={{ color: 'hsl(var(--champagne-dark))' }}>
        {unit.positioning[locale]}
      </p>

      <p className="body-copy mt-4 text-[14px]">{unit.intro[locale]}</p>

      {facts.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {facts.map((fact) => (
            <li
              key={fact.text}
              className="inline-flex items-center gap-2 text-[13px] text-muted-foreground"
            >
              <fact.icon
                className="w-4 h-4 shrink-0"
                style={{ color: 'hsl(var(--champagne-dark))' }}
                aria-hidden="true"
              />
              {fact.text}
            </li>
          ))}
        </ul>
      )}

      {'features' in unit && unit.features && unit.features.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {unit.features.map((feature) => (
            <li key={feature.de} className="flex items-start gap-2.5 text-[14px]">
              <span
                aria-hidden="true"
                className="mt-[9px] h-1 w-1 shrink-0 rotate-45"
                style={{ background: 'hsl(var(--champagne-dark))' }}
              />
              {feature[locale]}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground border-l-2 pl-4"
         style={{ borderColor: 'hsl(var(--champagne) / 0.6)' }}>
        {modeNote(unit, de)}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        {upcoming ? (
          // Nothing in preparation gets a rental CTA. It is listed so the
          // building is described honestly, not so it can be enquired about.
          <p className="text-[13px] text-muted-foreground">
            {de
              ? 'Noch nicht zu vermieten. Sprechen Sie uns an, wenn Sie informiert werden möchten.'
              : 'Not yet available to let. Get in touch if you would like to be kept informed.'}
          </p>
        ) : (
          <>
            <EnquiryButton kind="long-term" apartmentSlug={unit.slug} />
            {!commercial && (
              <Link href={`/apartments/${unit.slug}`} className="cta-secondary group/link">
                {label('viewApartment', locale)}
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  );
}
