'use client';

/**
 * The one unit card, used by both journeys.
 *
 * Same proportions, same type, same motion whether it opens a stay or a
 * tenancy — the brand should not change voice between its two businesses. What
 * differs is only what the card *says* and where it leads, driven by `mode`:
 *
 *   'stay'  → nights. Badge reads bookable / in preparation. CTA opens the
 *             detail view, from which a booking can be started.
 *   'rent'  → a rental agreement. Badge reads on request / to let / in
 *             preparation. CTA opens the detail view, from which an
 *             appointment can be requested. Never a booking.
 *
 * The whole card is one button. A card that looks clickable but only responds
 * on a small link is a conversion leak, and a nested link inside a button is
 * invalid — so there is exactly one control, and the visible CTA is its label.
 */

import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { UnitVisual } from '@/components/units/unit-visual';
import { BuildingCover } from '@/components/units/building-cover';
import { buildingForStreet } from '@/lib/content/buildings';
import { coverFor } from '@/lib/content/property-media';
import {
  formatArea,
  isCommercial,
  lettingStatusOf,
  longTermModesOf,
  STATUS_LABEL,
  type RentalUnit,
} from '@/lib/content/apartments';

export type UnitCardMode = 'stay' | 'rent';

export function UnitCard({
  unit,
  mode,
  onOpen,
  priority = false,
  headingLevel = 'h3',
}: {
  unit: RentalUnit;
  mode: UnitCardMode;
  onOpen: (unit: RentalUnit) => void;
  priority?: boolean;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  const { locale } = useI18n();
  const de = locale === 'de';
  const commercial = isCommercial(unit);
  const upcoming = unit.status === 'in-preparation';
  // Real photography where the unit has it, the reference set where it does
  // not. One resolver, so a card never has to know which.
  const cover = coverFor(unit, locale);
  const area = formatArea(unit.sizeSqm, locale);

  /*
    ── What a card without photography shows ──────────────────────────────
    Photography always wins: a unit that has its own pictures is untouched by
    any of this, which is why the Schulstraße cards look exactly as they did.

    Where there is none, an apartment now shows its BUILDING's elevation
    rather than the drawn shopfront. The shopfront panel was drawn for a
    ground-floor unit with display windows, and it stays the fallback for
    commercial space — that drawing is right for a shop and wrong for a flat
    on the fourth floor. The decision is made from `isCommercial` and the
    unit's street, both data; no slug is consulted, and a building with no
    elevation of its own falls through to the same neutral ground.
  */
  const building = commercial ? undefined : buildingForStreet(unit.street);
  const showBuildingCover = !cover && building !== undefined;


  // The badge speaks the language of the journey the card sits in.
  const badge = mode === 'stay' ? STATUS_LABEL[unit.status][locale] : lettingStatusOf(unit)[locale];

  const kindLabel =
    mode === 'rent'
      ? longTermModesOf(unit)
          .map((m) => (m === 'long-term-commercial' ? (de ? 'Gewerbe' : 'Commercial') : de ? 'Wohnraum' : 'Residential'))
          .join(' · ')
      : commercial
      ? null
      : de
      ? 'Apartment'
      : 'Apartment';

  const cta =
    mode === 'stay'
      ? upcoming
        ? de ? 'Ansehen' : 'Take a look'
        : de ? 'Ansehen & buchen' : 'View & book'
      : de
      ? 'Details & Termin'
      : 'Details & appointment';

  return (
    <article className="h-full">
      <button
        type="button"
        onClick={() => onOpen(unit)}
        className="card-surface group flex h-full w-full flex-col overflow-hidden text-left"
        aria-label={`${unit.name[locale]} — ${cta}`}
      >
        <div className="relative">
          {/*
            No provenance chip on the card. It returns on the large image inside
            the detail view, together with the full note — see UnitVisual.
          */}
          {showBuildingCover ? (
            <BuildingCover
              cover={building?.cover}
              buildingName={building?.publicName ?? unit.street}
              priority={priority}
              className="aspect-[4/3] w-full"
            />
          ) : (
            <UnitVisual
              image={cover?.image}
              alt={cover?.alt}
              street={unit.street}
              commercial={commercial}
              priority={priority}
              showBadge={false}
              className="aspect-[4/3] w-full"
            />
          )}
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1.5
                       text-[11px] font-semibold"
            style={{
              background: upcoming ? 'hsl(var(--ink) / 0.82)' : 'hsl(var(--background) / 0.94)',
              color: upcoming ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))',
              backdropFilter: 'blur(8px)',
            }}
          >
            {badge}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-6 lg:p-7">
          {kindLabel && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]"
               style={{ color: 'hsl(var(--champagne-dark))' }}>
              {kindLabel}
            </p>
          )}

          <Heading className="display-3 mt-2 transition-colors group-hover:text-[hsl(var(--champagne-dark))]">
            {unit.name[locale]}
          </Heading>

          <p className="mt-2 text-[13px] font-medium" style={{ color: 'hsl(var(--champagne-dark))' }}>
            {unit.positioning[locale]}
          </p>

          <p className="body-copy mt-4 flex-1 text-[14px]">{unit.intro[locale]}</p>

          {area && (
            <p className="mt-5 text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {area}
            </p>
          )}

          <span className="link-quiet mt-6 self-start">
            {cta}
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </div>
      </button>
    </article>
  );
}

/** One grid definition, so every unit grid on the site matches. */
export const UNIT_GRID = 'grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8';
