'use client';

/**
 * The apartment selection view.
 *
 * The first screen of the booking journey and the destination of the hero bar.
 * One card per apartment, nothing expanded: choosing comes before reading. A
 * card opens the large detail modal, and booking starts from there.
 *
 * ── What the carried-over stay does here ─────────────────────────────────
 * When a visitor arrives from the hero bar, their dates and party size are in
 * the URL and in StayContext. This page ACKNOWLEDGES them — it echoes the
 * selection back and offers to clear it — but it does not filter or reorder the
 * cards by them, and it marks nothing as free. There is no availability source
 * (lib/booking/availability.ts), so any "3 of 5 available for your dates" here
 * would be invented. The values travel on into the booking dialog, where they
 * arrive pre-filled.
 *
 * When the PMS is connected, this is where the filter goes: the same values,
 * a real answer, and the cards sorted or marked by it.
 */

import Link from 'next/link';
import { ArrowRight, CalendarDays, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { apartments, countWordInline, unitsByStreet } from '@/lib/content/apartments';
import { nightsBetween } from '@/lib/booking/availability';
import { formatDate } from '@/lib/booking/date-format';
import { useStay } from '@/lib/booking/stay-context';
import { Reveal } from '@/components/ui-kit/reveal';
import { UnitCard, UNIT_GRID } from '@/components/units/unit-card';
import { BuildingGroupHeading } from '@/components/units/building-group-heading';
import { RentedUnitCard } from '@/components/units/rented-unit-card';
import { apartmentGroups } from '@/lib/content/apartment-groups';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { label } from '@/components/ui-kit/cta';

export function ApartmentsClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { openDetail } = useUnitFlow();
  const { stay, hasStay, setStay } = useStay();

  // "Zwei Wohnungen in der Schulstraße, drei in der Opernstraße" — counted from
  // the inventory, so a new unit or a new building rewrites the sentence.
  const perStreet = unitsByStreet(apartments)
    .map(({ street, count }, i) => {
      // The noun is carried by the first group only; the rest read as a list.
      const noun = de
        ? i === 0
          ? count === 1
            ? ' Wohnung'
            : ' Wohnungen'
          : ''
        : i === 0
        ? count === 1
          ? ' apartment'
          : ' apartments'
        : '';
      return de
        ? `${countWordInline(count, 'de')}${noun} in der ${street}`
        : `${countWordInline(count, 'en')}${noun} on ${street}`;
    })
    .join(', ');
  const perStreetSentence = perStreet.charAt(0).toUpperCase() + perStreet.slice(1);

  const nights = nightsBetween(stay.arrival, stay.departure);
  // One date shape across the whole site — see lib/booking/date-format.ts.
  const fmt = (d?: string) => formatDate(d) ?? null;

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Unsere Apartments' : 'Our apartments'}</p>
            <div className="rule-gold mb-6 mt-4" aria-hidden="true" />
            <h1 className="display-1 max-w-[16ch]">
              {de ? 'Wohnen mitten in Bayreuth' : 'Stay in the middle of Bayreuth'}
            </h1>
            <p className="lede mt-6">
              {de
                ? `${perStreetSentence} — alle in Familienbesitz und von uns selbst betreut. Wählen Sie eine aus, um sie im Detail zu sehen.`
                : `${perStreetSentence} — all family-owned and looked after by us. Choose one to see it in detail.`}
            </p>
          </Reveal>

          {/* The hero bar's selection, echoed back so it is visibly still there. */}
          {hasStay && (
            <Reveal delay={0.06}>
              <div
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4"
                style={{
                  background: 'hsl(var(--secondary) / 0.6)',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <CalendarDays
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'hsl(var(--champagne-dark))' }}
                  aria-hidden="true"
                />
                <p className="text-[14px]">
                  <span className="font-semibold">{de ? 'Ihre Auswahl:' : 'Your selection:'}</span>{' '}
                  {stay.arrival || stay.departure ? (
                    <>
                      {fmt(stay.arrival) ?? '—'} → {fmt(stay.departure) ?? '—'}
                      {nights ? (
                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {' '}· {nights} {de ? (nights === 1 ? 'Nacht' : 'Nächte') : nights === 1 ? 'night' : 'nights'}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {stay.guests ? (
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {stay.arrival || stay.departure ? ' · ' : ''}
                      {stay.guests}{' '}
                      {de ? (stay.guests === 1 ? 'Person' : 'Personen') : stay.guests === 1 ? 'guest' : 'guests'}
                    </span>
                  ) : null}
                </p>
                <p className="text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {de
                    ? 'Wir übernehmen das in Ihre Buchung. Ob der Zeitraum frei ist, bestätigen wir persönlich.'
                    : 'We carry this into your booking. Whether the dates are free is something we confirm personally.'}
                </p>
                <button
                  type="button"
                  onClick={() => setStay({ arrival: undefined, departure: undefined, guests: undefined })}
                  className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 text-[13px] transition-colors"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {de ? 'Zurücksetzen' : 'Clear'}
                </button>
              </div>
            </Reveal>
          )}
        </div>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          {/*
            One group per building, in the order lib/content/apartment-groups
            declares: the lettable apartments first, then the buildings whose
            units are let. Every group uses the same grid and the same card
            sizing, so a card is the same object whichever building it belongs
            to — only the group it sits under changes.

            The lettable cards are the same <UnitCard> in the same 'stay' mode
            they were rendered in before; nothing about them is re-specified
            here beyond where they sit on the page.
          */}
          {apartmentGroups.map((group, groupIndex) => (
            <section
              key={group.id}
              aria-labelledby={`group-${group.id}`}
              className={groupIndex === 0 ? '' : 'mt-16 lg:mt-20'}
            >
              <BuildingGroupHeading
                id={`group-${group.id}`}
                address={group.address}
                count={group.units.length}
              />

              <div className={`${UNIT_GRID} mt-7 lg:mt-8`}>
                {group.kind === 'lettable'
                  ? group.units.map((apartment, i) => (
                      <Reveal key={apartment.slug} delay={i * 0.08} className="h-full">
                        <UnitCard
                          unit={apartment}
                          mode="stay"
                          priority={groupIndex === 0 && i === 0}
                          headingLevel="h3"
                          onOpen={(unit) => openDetail(unit, 'stay')}
                        />
                      </Reveal>
                    ))
                  : group.units.map((unit, i) => (
                      <Reveal key={unit.id} delay={i * 0.08} className="h-full">
                        <RentedUnitCard unit={unit} />
                      </Reveal>
                    ))}
              </div>
            </section>
          ))}

          {/*
            The other journey, offered once, after the apartments — never beside
            them. A visitor here came for nights.
          */}
          <Reveal delay={0.1}>
            <div
              className="mt-16 flex flex-col gap-5 p-7 lg:mt-20 lg:flex-row lg:items-center lg:justify-between lg:p-9"
              style={{
                background: 'hsl(var(--secondary) / 0.5)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div>
                <h2 className="display-3">
                  {de ? 'Sie möchten dauerhaft mieten?' : 'Looking to rent long term?'}
                </h2>
                <p className="body-copy mt-3 text-[14px]">
                  {de
                    ? 'Einzelne Objekte vermieten wir auch regulär über einen Mietvertrag — Wohnraum ebenso wie zwei Gewerbeflächen im Erdgeschoss. Das läuft nicht über eine Buchung, sondern über ein Gespräch.'
                    : 'Some properties are also let conventionally under a rental agreement — residential space as well as two ground-floor commercial units. That runs through a conversation, not a booking.'}
                </p>
              </div>
              <Link href="/mieten" className="cta-secondary group shrink-0">
                {label('exploreRentals', locale)}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
