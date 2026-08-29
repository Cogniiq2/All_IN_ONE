'use client';

/**
 * The apartment selection view.
 *
 * The first screen of the booking journey and the destination of the hero bar.
 * Three cards, nothing expanded: choosing comes before reading. A card opens
 * the large detail modal, and booking starts from there.
 *
 * ── What the carried-over stay does here ─────────────────────────────────
 * When a visitor arrives from the hero bar, their dates and party size are in
 * the URL and in StayContext. This page ACKNOWLEDGES them — it echoes the
 * selection back and offers to clear it — but it does not filter or reorder the
 * cards by them, and it marks nothing as free. There is no availability source
 * (lib/booking/availability.ts), so any "3 of 3 available for your dates" here
 * would be invented. The values travel on into the booking dialog, where they
 * arrive pre-filled.
 *
 * When the PMS is connected, this is where the filter goes: the same values,
 * a real answer, and the cards sorted or marked by it.
 */

import Link from 'next/link';
import { ArrowRight, CalendarDays, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { apartments } from '@/lib/content/apartments';
import { contact } from '@/lib/content/brand';
import { nightsBetween } from '@/lib/booking/availability';
import { useStay } from '@/lib/booking/stay-context';
import { Reveal } from '@/components/ui-kit/reveal';
import { UnitCard, UNIT_GRID } from '@/components/units/unit-card';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { label } from '@/components/ui-kit/cta';

export function ApartmentsClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { openDetail } = useUnitFlow();
  const { stay, hasStay, setStay } = useStay();

  const nights = nightsBetween(stay.arrival, stay.departure);
  const fmt = (d?: string) =>
    d
      ? new Date(`${d}T00:00:00Z`).toLocaleDateString(de ? 'de-DE' : 'en-GB', {
          day: '2-digit', month: 'short', timeZone: 'UTC',
        })
      : null;

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
                ? `Zwei Wohnungen in der ${contact.street} und eine in der Opernstraße — alle in Familienbesitz und von uns selbst betreut. Wählen Sie eine aus, um sie im Detail zu sehen.`
                : `Two apartments on ${contact.street} and one on Opernstraße — all family-owned and looked after by us. Choose one to see it in detail.`}
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
                  borderRadius: 'var(--radius)',
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
          <div className={UNIT_GRID}>
            {apartments.map((apartment, i) => (
              <Reveal key={apartment.slug} delay={i * 0.08} className="h-full">
                <UnitCard
                  unit={apartment}
                  mode="stay"
                  priority={i === 0}
                  headingLevel="h2"
                  onOpen={(unit) => openDetail(unit, 'stay')}
                />
              </Reveal>
            ))}
          </div>

          {/*
            The other journey, offered once, after the apartments — never beside
            them. A visitor here came for nights.
          */}
          <Reveal delay={0.1}>
            <div
              className="mt-14 flex flex-col gap-5 p-7 lg:flex-row lg:items-center lg:justify-between lg:p-9"
              style={{
                background: 'hsl(var(--secondary) / 0.5)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
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
