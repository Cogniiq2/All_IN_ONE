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
 * and preserving the order the inventory declares, so adding a sixth
 * apartment in a third street produces a third group with no change to this
 * file. The published house number comes from `lib/content/locations.ts`,
 * which is where the site already states the two addresses — this file does
 * not restate them, and a building with no published address falls back to
 * its street name rather than inventing a number.
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

import { apartments, type Apartment } from '@/lib/content/apartments';
import { LOCATIONS } from '@/lib/content/locations';
import { rentedProperties, type RentedUnit } from '@/lib/content/rented-inventory';

export type ApartmentGroup =
  | { id: string; address: string; kind: 'lettable'; units: Apartment[] }
  | { id: string; address: string; kind: 'rented'; units: RentedUnit[] };

/**
 * The published address for a street, or the street itself.
 *
 * `BaseUnit.street` deliberately carries no house number — units used to keep
 * theirs private. The two numbers are public now (they are on the contact
 * page), and LOCATIONS is where they live, so the heading reads "Schulstraße
 * 1" without a second copy of that fact existing anywhere.
 */
function addressForStreet(street: string): string {
  return LOCATIONS.find((location) => location.street.startsWith(street))?.street ?? street;
}

/** A slug for the heading's id, from an address rather than a hardcoded map. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The lettable apartments, grouped by street, in inventory order. */
function lettableGroups(): ApartmentGroup[] {
  const groups: ApartmentGroup[] = [];
  for (const apartment of apartments) {
    const address = addressForStreet(apartment.street);
    const existing = groups.find((group) => group.address === address);
    if (existing) {
      (existing.units as Apartment[]).push(apartment);
    } else {
      groups.push({ id: slugify(address), address, kind: 'lettable', units: [apartment] });
    }
  }
  return groups;
}

export const apartmentGroups: ApartmentGroup[] = [
  ...lettableGroups(),
  ...rentedProperties.map(
    (property): ApartmentGroup => ({
      id: property.id,
      address: property.address,
      kind: 'rented',
      units: property.units,
    })
  ),
];

/** Total cards rendered on /apartments. */
export const apartmentGroupUnitCount = apartmentGroups.reduce(
  (total, group) => total + group.units.length,
  0
);
