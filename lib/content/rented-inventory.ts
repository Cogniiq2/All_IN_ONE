/**
 * ══════════════════════════════════════════════════════════════════════════
 * RENTED REFERENCE INVENTORY
 *
 * Units that are let and occupied. They exist on /apartments as portfolio
 * reference — proof of what BoLaGio owns and looks after — and nowhere else.
 *
 * ── Why this is a separate file from lib/content/apartments.ts ───────────
 * `apartments` is consumed by the homepage, the footer, the sitemap, the
 * journal, /bayreuth-2026, the booking form and the /apartments/[slug]
 * routes. Adding a rented unit to that array would put it on every one of
 * those surfaces and mint a detail route for a flat nobody can have. Keeping
 * this inventory in its own module makes that propagation impossible rather
 * than merely discouraged: a surface has to import this file on purpose.
 *
 * `displayScope` records the same intent in data, so the rule survives a
 * future refactor that does merge the two lists.
 *
 * ── What these records may say ───────────────────────────────────────────
 * Almost nothing, and deliberately. The owners have supplied the buildings,
 * the number of units in each, and the fact that they are currently let.
 * They have NOT supplied sizes, room counts, bed counts, amenities,
 * descriptions, floor plans, photography or rents, so none of those fields
 * exists here — an absent field cannot be filled in with a guess.
 *
 * "Currently rented" is the only claim these cards make. Nothing here implies
 * demand, a waiting list, tenant satisfaction, occupancy rates, or that these
 * are short-stay accommodation — they are not.
 *
 * NEEDS CONFIRMATION — unit sizes, room counts, photography and final unit
 * names for all fourteen.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Localized } from '@/lib/content/apartments';
import { buildingById } from '@/lib/content/buildings';

/** Where a record is allowed to be rendered. */
export type DisplayScope = 'homepage' | 'apartments' | 'rentals';

/** What a visitor can do with a card. `none` is a card that is only read. */
export type InteractionMode = 'none' | 'detail';

/** The letting state this file exists to express. */
export type OccupancyStatus = 'rented';

export interface RentedUnit {
  id: string;
  /** The building it belongs to; see `rentedProperties` below. */
  propertyId: string;
  /** "Apartment 1" — the address comes from the group heading above it. */
  unitLabel: Localized;
  /**
   * The building's public label — a street, and a house number only for the
   * two addresses a visitor is actually sent to. Read from
   * lib/content/buildings.ts, never written here.
   */
  address: string;
  occupancyStatus: OccupancyStatus;
  displayScope: DisplayScope[];
  interactionMode: InteractionMode;
  /**
   * Always null for now. Photography arrives in a later task; until it does,
   * the card draws its own neutral placeholder rather than borrowing a
   * picture of some other flat.
   */
  media: null;
}

/** One building, and the units in it. */
export interface PortfolioProperty {
  id: string;
  /** Rendered as the group heading. */
  address: string;
  units: RentedUnit[];
}

export const RENTED_BADGE: Localized = {
  de: 'Aktuell vermietet',
  en: 'Currently rented',
};

export const RENTED_DESCRIPTION: Localized = {
  de: 'Derzeit vermietete Wohneinheit in Bayreuth.',
  en: 'Currently rented residential unit in Bayreuth.',
};

/**
 * Builds a building's units from nothing but its address and how many it has.
 *
 * Fourteen near-identical records written out by hand would be fourteen
 * chances to mistype an address or drift a wording. Everything that is the
 * same for every unit is stated once, here.
 */
function property(id: string, unitCount: number): PortfolioProperty {
  const building = buildingById(id);
  if (!building) throw new Error(`rented inventory: no building "${id}"`);
  const address = building.publicName;

  return {
    id,
    address,
    units: Array.from({ length: unitCount }, (_, i) => {
      const n = i + 1;
      return {
        id: `${id}-apartment-${n}`,
        propertyId: id,
        unitLabel: { de: `Apartment ${n}`, en: `Apartment ${n}` },
        address,
        occupancyStatus: 'rented' as const,
        // Not the homepage, which stays at the five lettable apartments, and
        // not /mieten, which lists what can actually be rented.
        displayScope: ['apartments'] as DisplayScope[],
        interactionMode: 'none' as const,
        media: null,
      };
    }),
  };
}

/** Buildings in the order they appear on /apartments, after the lettable ones. */
export const rentedProperties: PortfolioProperty[] = [
  property('harburgerstrasse', 4),
  property('mainstrasse', 4),
  property('am-main', 3),
  property('riedingerstrasse', 1),
  property('tunnelstrasse', 2),
];

/** Every rented unit, flattened. Used for counts and for tests. */
export const rentedUnits: RentedUnit[] = rentedProperties.flatMap((p) => p.units);

/** True where a record may appear on the given surface. */
export function isVisibleOn(unit: RentedUnit, scope: DisplayScope): boolean {
  return unit.displayScope.includes(scope);
}
