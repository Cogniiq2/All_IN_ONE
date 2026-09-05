'use client';

/**
 * A unit that is let, shown for reference only.
 *
 * ── What it shares with UnitCard, and what it must not ───────────────────
 * The surface, the proportions, the 4:3 cover area, the badge in the same
 * corner, the same type scale and the same padding: on the page it belongs to
 * the same set as the lettable cards, because it is the same company's
 * property.
 *
 * What it does NOT share is behaviour. `UnitCard` is one large button that
 * opens the detail view; this is an `<article>` with no control in it at all.
 * There is no click handler, no href, nothing focusable, no pointer cursor,
 * and the hover lift is suppressed (`card-surface-static`) so the card never
 * suggests it would answer. A disabled button or a dead link would still be
 * announced to a screen reader as a control that exists but does not work;
 * having no control is both simpler and more honest.
 *
 * ── What it says ─────────────────────────────────────────────────────────
 * The unit's label, that it is currently rented, and nothing else. No size,
 * no rooms, no beds, no amenities, no price, no availability, no CTA — none
 * of which the owners have supplied for these units, and none of which may be
 * guessed. See lib/content/rented-inventory.ts.
 */

import { useI18n } from '@/lib/i18n';
import {
  RENTED_BADGE,
  RENTED_DESCRIPTION,
  type RentedUnit,
} from '@/lib/content/rented-inventory';

export function RentedUnitCard({ unit }: { unit: RentedUnit }) {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <article className="card-surface card-surface-static flex h-full flex-col overflow-hidden">
      {/*
        The cover area is kept at the lettable card's exact proportions so the
        grid is already final when photography arrives — the pictures drop in,
        the layout does not move. Until then it is the brand's own quiet
        ground and nothing else: no stock interior, no photograph of another
        flat, no architectural drawing borrowed from a different building.
        Marked decorative, so a screen reader is not told there is a picture
        of this apartment to look at.
      */}
      <div className="relative">
        <div
          className="aspect-[4/3] w-full"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(158deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 58%, hsl(var(--stone) / 0.55) 100%)',
          }}
        >
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p
              className="font-serif text-[19px] leading-tight"
              style={{ color: 'hsl(var(--champagne-dark))' }}
            >
              {unit.address}
            </p>
            <p
              className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              {de ? 'Foto folgt' : 'Photograph to follow'}
            </p>
          </div>
        </div>

        {/* Same corner, same chip as the lettable cards carry. */}
        <span
          className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1.5
                     text-[11px] font-semibold"
          style={{
            background: 'hsl(var(--background) / 0.94)',
            color: 'hsl(var(--foreground))',
            backdropFilter: 'blur(8px)',
          }}
        >
          {RENTED_BADGE[locale]}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6 lg:p-7">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: 'hsl(var(--champagne-dark))' }}
        >
          {de ? 'Apartment' : 'Apartment'}
        </p>

        {/* h3 under the building's h2 — the address is the heading above. */}
        <h3 className="display-3 mt-2">{unit.unitLabel[locale]}</h3>

        <p className="body-copy mt-4 flex-1 text-[14px]">{RENTED_DESCRIPTION[locale]}</p>
      </div>
    </article>
  );
}
