/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE /apartments PAGE, ORGANISED BY BUILDING
 *
 * One ordered list of building groups. The lettable apartments come first,
 * grouped by the street they are actually in, followed by the rented
 * reference buildings in the order the owners gave.
 *
 * ── Nothing here branches on a slug ──────────────────────────────────────
 * The lettable groups are derived by reading each unit's own `street` field
 * and preserving the order `lib/content/buildings.ts` declares, so adding a
 * unit in a third street produces a third group with no change to this file.
 * The public label — with a house number for the two addresses that have one,
 * without for the rest — comes from that same file, so a heading here can
 * never disagree with the About procession.
 *
 * ── Two pages, one arrangement ───────────────────────────────────────────
 * /apartments and /mieten both group by building, and both use this module.
 * What differs is only which lettable units each page is entitled to show —
 * /apartments shows the apartments, /mieten shows what may be let long term,
 * apartments and commercial units alike — so the caller passes those in and
 * the grouping itself is written once.
 *
 * ── Two kinds of group ───────────────────────────────────────────────────
 * A group is discriminated by `kind` so the page renders the right card for
 * each and cannot accidentally hand a rented reference to the interactive
 * card, or a lettable apartment to the non-interactive one.
 *
 *   'lettable'  the existing units, exactly as they are elsewhere on the
 *               site. Their records are passed through untouched.
 *   'rented'    occupied units, read-only. See lib/content/rented-inventory.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { apartments, commercialUnits, supportsLongTerm, type RentalUnit } from '@/lib/content/apartments';
import { buildings, publicNameForStreet } from '@/lib/content/buildings';
import { rentedProperties, type RentedUnit } from '@/lib/content/rented-inventory';

export type ApartmentGroup =
  | { id: string; address: string; kind: 'lettable'; units: RentalUnit[] }
  | { id: string; address: string; kind: 'rented'; units: RentedUnit[] };

/**
 * Groups a set of lettable units by building, in the order buildings.ts
 * declares. A building with none of the given units produces no group.
 */
function lettableGroups(units: RentalUnit[]): ApartmentGroup[] {
  return buildings
    .filter((building) => building.street)
    .map((building) => ({
      id: building.id,
      address: building.publicName,
      kind: 'lettable' as const,
      units: units.filter((unit) => unit.street === building.street),
    }))
    .filter((group) => group.units.length > 0);
}

/** The rented reference buildings, in their declared order. */
const rentedGroups: ApartmentGroup[] = rentedProperties.map((property) => ({
  id: property.id,
  address: property.address,
  kind: 'rented',
  units: property.units,
}));

/**
 * A unit whose street is not in the registry still deserves a heading rather
 * than silently disappearing; it is grouped under its own street name.
 */
function orphanGroups(units: RentalUnit[]): ApartmentGroup[] {
  const known = buildings.map((building) => building.street).filter(Boolean);
  const orphans = units.filter((unit) => !known.includes(unit.street));
  const streets = orphans
    .map((unit) => unit.street)
    .filter((street, i, all) => all.indexOf(street) === i);
  return streets.map((street) => ({
    id: `street-${street.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    address: publicNameForStreet(street),
    kind: 'lettable' as const,
    units: orphans.filter((unit) => unit.street === street),
  }));
}

/** Lettable units first, grouped by building, then the rented references. */
function groupsFor(lettable: RentalUnit[]): ApartmentGroup[] {
  return [...lettableGroups(lettable), ...orphanGroups(lettable), ...rentedGroups];
}

/** /apartments: the bookable inventory, then the reference buildings. */
export const apartmentGroups: ApartmentGroup[] = groupsFor(apartments);

/**
 * /mieten: everything that may be let on a tenancy — apartments and the
 * ground-floor commercial units alike — grouped under the same headings, so a
 * building's residential and commercial space sit together rather than in two
 * separate lists. The reference buildings follow, exactly as on /apartments.
 */
export const rentalGroups: ApartmentGroup[] = groupsFor([
  ...apartments.filter(supportsLongTerm),
  ...commercialUnits.filter(supportsLongTerm),
]);

/** Total cards in a set of groups. */
export function groupUnitCount(groups: ApartmentGroup[]): number {
  return groups.reduce((total, group) => total + group.units.length, 0);
}

/** Total cards rendered on /apartments. */
export const apartmentGroupUnitCount = groupUnitCount(apartmentGroups);
