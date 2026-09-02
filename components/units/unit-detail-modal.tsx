'use client';

/**
 * The large unit detail view.
 *
 * One layout, two endings. Everything above the action rail — imagery, the
 * description, the facts, the location note — is shared, because a flat is the
 * same flat whichever journey you arrived in. What changes is the rail at the
 * bottom of the left column:
 *
 *   stay journey  a stay panel: dates carried from the hero bar, and "Buchen".
 *   rent journey  a tenancy panel: what the unit could suit, and an
 *                 appointment request. No calendar. No price. No booking.
 *
 * The detail content lives on the unit (`detail`, `longTermUse`) rather than
 * here, so adding a building is a data change.
 */

import { ArrowRight, Building2, CalendarDays, Hammer, Home, MapPin, Ruler } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { coverFor, propertyMediaFor } from '@/lib/content/property-media';
import { factsFor } from '@/lib/content/property-facts';
import { PropertyGallery } from '@/components/property/property-gallery';
import { PropertyFactsSection } from '@/components/property/property-facts';
import {
  formatArea,
  isCommercial,
  lettingStatusOf,
  STATUS_LABEL,
  type RentalUnit,
} from '@/lib/content/apartments';
import { brand } from '@/lib/content/brand';
import { REFERENCE_IMAGE_NOTE } from '@/lib/content/media';
import { nightsBetween } from '@/lib/booking/availability';
import { formatDate } from '@/lib/booking/date-format';
import { useStay } from '@/lib/booking/stay-context';
import { LargeModal, LargeModalClose, LargeModalTitle } from '@/components/ui-kit/modal';
import { UnitVisual } from '@/components/units/unit-visual';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { CtaButton, label } from '@/components/ui-kit/cta';

export function UnitDetailModal() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { unit, journey, stage, openBooking, openAppointment, close } = useUnitFlow();
  const { stay } = useStay();
  const open = stage === 'detail' && Boolean(unit);
  if (!unit) return <LargeModal open={false} onOpenChange={() => close()}>{null}</LargeModal>;

  // One resolver for the cover, one for the gallery. A unit either has
  // photography of its own or it does not; nothing here branches on which unit.
  const cover = coverFor(unit, locale);
  const gallery = propertyMediaFor(unit.slug);
  const amenities = factsFor(unit.slug);
  const commercial = isCommercial(unit);
  const upcoming = unit.status === 'in-preparation';
  const area = formatArea(unit.sizeSqm, locale);
  const isStay = journey === 'stay';
  const nights = nightsBetween(stay.arrival, stay.departure);

  const facts = [
    area && { icon: Ruler, text: area },
    unit.floor && { icon: commercial ? Building2 : Home, text: unit.floor[locale] },
    { icon: MapPin, text: `${unit.street}, ${brand.city}` },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];

  return (
    <LargeModal open={open} onOpenChange={(next) => !next && close()}>
      <LargeModalClose />

      <div className="modal-scroll">
        <div className="grid lg:grid-cols-[1.15fr_1fr]">
          {/* ── Imagery ───────────────────────────────────────────── */}
          <div className="relative lg:sticky lg:top-0 lg:h-full">
            {/*
              Contained, not cropped. This photography is mostly 3:4 portrait
              and the frame is wider than that, so filling it was cutting the
              top and the bottom off the room — the ceiling and the floor, which
              is most of what tells you about a space. The whole photograph is
              shown on the brand's own neutral ground instead. The frame, the
              two-column composition and the proportions are unchanged.
            */}
            <UnitVisual
              image={cover?.image}
              alt={cover?.alt}
              street={unit.street}
              commercial={commercial}
              priority
              fit="contain"
              zoomOnHover={false}
              showBadge={!cover?.verified}
              sizes="(max-width: 1024px) 100vw, 640px"
              className="aspect-[4/3] w-full lg:aspect-auto lg:h-full lg:min-h-[520px]"
            />
          </div>

          {/* ── Content ───────────────────────────────────────────── */}
          <div className="flex flex-col p-6 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1.5 text-[11px] font-semibold"
                style={{
                  background: upcoming ? 'hsl(var(--ink))' : 'hsl(var(--accent))',
                  color: upcoming ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))',
                }}
              >
                {upcoming && <Hammer className="h-3.5 w-3.5" aria-hidden="true" />}
                {isStay ? STATUS_LABEL[unit.status][locale] : lettingStatusOf(unit)[locale]}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'hsl(var(--champagne-dark))' }}>
                {isStay
                  ? de ? 'Unterkunft auf Zeit' : 'Accommodation'
                  : de ? 'Miete auf Vertrag' : 'Let on a contract'}
              </span>
            </div>

            <LargeModalTitle className="display-2 mt-4">
              {unit.name[locale]}
            </LargeModalTitle>
            <p className="mt-3 text-[14px] font-medium" style={{ color: 'hsl(var(--champagne-dark))' }}>
              {unit.positioning[locale]}
            </p>

            {facts.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
                {facts.map((f) => (
                  <li key={f.text} className="inline-flex items-center gap-2 text-[13.5px]"
                      style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <f.icon className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
                    {f.text}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-7 space-y-4">
              {(unit.detail ?? [{ de: unit.intro.de, en: unit.intro.en }]).map((para, i) => (
                <p key={i} className="body-copy text-[15px]">{para[locale]}</p>
              ))}
            </div>

            {/* Only says "these are reference images" while they still are. */}
            {cover && !cover.verified && (
              <p className="mt-6 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {REFERENCE_IMAGE_NOTE[locale]}
              </p>
            )}

            {/* ── The action rail — the one place the journeys differ ── */}
            <div className="mt-8 border-t border-border/70 pt-8">
              {isStay ? (
                <StayPanel
                  upcoming={upcoming}
                  nights={nights}
                  arrival={stay.arrival}
                  departure={stay.departure}
                  guests={stay.guests}
                  onBook={() => openBooking(unit)}
                />
              ) : (
                <RentPanel unit={unit} onRequest={() => openAppointment(unit)} />
              )}
            </div>
          </div>
        </div>

        {/*
          The gallery, below the approved top area and inside the same scrolling
          container — so the detail view simply gained a length, and the visitor
          scrolls down into the rooms. A unit without photography of its own
          renders nothing here at all: an empty room heading would be worse than
          no gallery, and no unit borrows another's photographs.
        */}
        {/*
          What the flat offers, then the rooms it offers them in. Both are
          data: a unit without a fact sheet or without photography renders
          neither, and neither section knows which unit it is showing.

          `isStay` decides scope, not content — a tenancy conversation drops
          the short-stay services and keeps everything that is the flat itself.
        */}
        {amenities && <PropertyFactsSection facts={amenities} shortTerm={isStay} />}
        {gallery && <PropertyGallery media={gallery} unit={unit} />}
      </div>
    </LargeModal>
  );
}

/* ── Short-term ─────────────────────────────────────────────────────────── */

function StayPanel({
  upcoming,
  nights,
  arrival,
  departure,
  guests,
  onBook,
}: {
  upcoming: boolean;
  nights?: number;
  arrival?: string;
  departure?: string;
  guests?: number;
  onBook: () => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';

  // A unit in preparation has no booking path at all, in any state.
  if (upcoming) {
    return (
      <div>
        <p className="eyebrow">{de ? 'Noch nicht buchbar' : 'Not yet bookable'}</p>
        <p className="body-copy mt-3 text-[14px]">
          {de
            ? 'Dieses Apartment wird gerade hergerichtet und lässt sich noch nicht buchen. Wir melden uns gern, sobald ein Termin feststeht.'
            : 'This apartment is being prepared and cannot be booked yet. We are happy to be in touch as soon as a date is set.'}
        </p>
        <div className="mt-6">
          <CtaButton variant="secondary" onClick={onBook}>
            {de ? 'Informiert werden' : 'Keep me posted'}
          </CtaButton>
        </div>
      </div>
    );
  }

  // One date shape across the whole site — see lib/booking/date-format.ts.
  const fmt = (d?: string) => formatDate(d) ?? null;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <CalendarDays className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
        <p className="text-[13px] font-semibold">{de ? 'Ihr Aufenthalt' : 'Your stay'}</p>
      </div>

      {/* Echoes what the hero bar already collected, so the visitor sees it survived. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
        {arrival || departure ? (
          <span style={{ color: 'hsl(var(--foreground))' }}>
            {fmt(arrival) ?? '—'} → {fmt(departure) ?? '—'}
            {nights ? (
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                {' '}· {nights} {de ? (nights === 1 ? 'Nacht' : 'Nächte') : nights === 1 ? 'night' : 'nights'}
              </span>
            ) : null}
          </span>
        ) : (
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de ? 'Zeitraum wählen Sie im nächsten Schritt' : 'You choose your dates in the next step'}
          </span>
        )}
        {guests ? (
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
            {guests} {de ? (guests === 1 ? 'Person' : 'Personen') : guests === 1 ? 'guest' : 'guests'}
          </span>
        ) : null}
      </div>

      <div className="mt-7">
        <CtaButton onClick={onBook} withArrow full>
          {label('bookNow', locale)}
        </CtaButton>
      </div>

      {/*
        The honest frame around the words "Jetzt buchen". The dialog it opens collects a
        complete booking, but no availability source and no live payment stand
        behind it yet, so it is confirmed by a person before it binds.
      */}
      <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {de
          ? 'Preis und Verfügbarkeit bestätigen wir persönlich, bevor etwas verbindlich wird. Es wird online nichts abgebucht.'
          : 'We confirm price and availability personally before anything becomes binding. Nothing is charged online.'}
      </p>
    </div>
  );
}

/* ── Long-term ──────────────────────────────────────────────────────────── */

function RentPanel({ unit, onRequest }: { unit: RentalUnit; onRequest: () => void }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const upcoming = unit.status === 'in-preparation';
  const commercial = isCommercial(unit);

  return (
    <div>
      <p className="eyebrow">
        {commercial
          ? de ? 'Gewerbemietvertrag' : 'Commercial rental agreement'
          : de ? 'Wohnraummietvertrag' : 'Residential rental agreement'}
      </p>

      {unit.longTermUse && unit.longTermUse.length > 0 && (
        <>
          <p className="mt-4 text-[13px] font-semibold">
            {de ? 'Denkbar wäre etwa' : 'What it could suit'}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {unit.longTermUse.map((use) => (
              <li key={use.de} className="flex items-start gap-2.5 text-[14px]">
                <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rotate-45"
                      style={{ background: 'hsl(var(--champagne-dark))' }} />
                {use[locale]}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Neither a permitted-use statement nor a promise of acceptance. */}
      <p className="mt-5 border-l-2 pl-4 text-[13px] leading-relaxed"
         style={{ borderColor: 'hsl(var(--champagne) / 0.6)', color: 'hsl(var(--muted-foreground))' }}>
        {commercial
          ? de
            ? 'Welche Nutzung baurechtlich zulässig ist, hängt vom Vorhaben ab und wird vor einem Vertrag gemeinsam geklärt. Die Punkte oben sind Gesprächsangebote, keine Zusagen.'
            : 'Which use is permissible under building regulations depends on the plan and is established together before any contract. The points above open a conversation; they are not assurances.'
          : de
            ? 'Diese Wohnung vermieten wir in erster Linie tageweise als Unterkunft. Ob eine dauerhafte Vermietung für Ihren Zeitraum möglich ist, klären wir im persönlichen Gespräch.'
            : 'We let this apartment primarily by the day, as accommodation. Whether a permanent tenancy works for your period is settled in a personal conversation.'}
      </p>

      {upcoming ? (
        <p className="mt-7 text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Diese Einheit steht noch nicht zur Vermietung. Sprechen Sie uns an, wenn wir uns melden sollen, sobald sie verfügbar ist.'
            : 'This unit is not yet available to let. Get in touch if you would like us to contact you once it is.'}
        </p>
      ) : null}

      <div className="mt-7">
        <CtaButton onClick={onRequest} withArrow full>
          {upcoming
            ? de ? 'Informiert werden' : 'Keep me posted'
            : label('requestViewing', locale)}
        </CtaButton>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {de
          ? 'Eine Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis und keinen Anspruch auf einen Mietvertrag.'
          : 'An enquiry is non-binding. It creates no tenancy and no entitlement to a rental agreement.'}
      </p>
    </div>
  );
}
