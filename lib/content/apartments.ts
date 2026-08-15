/**
 * ══════════════════════════════════════════════════════════════════════════
 * BoLaGio — the real inventory.
 *
 * Three units, and only three:
 *   • two apartments in the Schulstraße (lettable)
 *   • one apartment in the Opernstraße (renovation in progress, NOT bookable)
 *
 * The previous site listed five invented apartments with identical sizes,
 * guest counts and amenity lists. That inventory has been deleted.
 *
 * ── HOW UNKNOWN DATA IS HANDLED ───────────────────────────────────────────
 * Every field that has not been verified by the owners is OPTIONAL and left
 * `undefined`. The UI omits the corresponding section entirely rather than
 * rendering a placeholder or inventing a value. Search this file for
 * `NEEDS CONFIRMATION` to find everything still outstanding.
 *
 * Do not add a fact here unless the owners have confirmed it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { tempGalleries, type TempImage } from '@/lib/content/media';

export type Locale = 'de' | 'en';
export type Localized = { de: string; en: string };

export type ApartmentStatus =
  /** Lettable now — enquiry CTAs shown. */
  | 'available'
  /** Renovation in progress — no booking or payment CTA anywhere. */
  | 'in-preparation';

export interface Bedroom {
  label: Localized;
  beds: Localized;
}

export interface AmenityGroup {
  title: Localized;
  items: Localized[];
}

export interface Apartment {
  slug: string;
  /** Provisional working name. NEEDS CONFIRMATION — final names to follow. */
  name: Localized;
  status: ApartmentStatus;
  /** Street only. House numbers are shared after booking, not published. */
  street: string;
  /** One honest sentence of positioning — no superlatives, no invented facts. */
  positioning: Localized;
  /** Two to three sentences. Must not assert unverified specifics. */
  intro: Localized;

  // ── Everything below is UNCONFIRMED and therefore optional ──────────────
  // The detail template renders each block only when its data exists.

  /** NEEDS CONFIRMATION — Wohnfläche in m². */
  sizeSqm?: number;
  /** NEEDS CONFIRMATION — number of rooms. */
  rooms?: number;
  /** NEEDS CONFIRMATION — maximum occupancy. */
  maxGuests?: number;
  /** NEEDS CONFIRMATION — number of bathrooms. */
  bathrooms?: number;
  /** NEEDS CONFIRMATION — floor, and whether there is a lift. */
  floor?: Localized;
  /** NEEDS CONFIRMATION — room-by-room sleeping layout. */
  bedrooms?: Bedroom[];
  /** NEEDS CONFIRMATION — verified amenities only, grouped. */
  amenityGroups?: AmenityGroup[];
  /** NEEDS CONFIRMATION — path to a floor-plan drawing. */
  floorPlan?: string;
  /** NEEDS CONFIRMATION — who this apartment genuinely suits. */
  goodFit?: Localized[];
  /** NEEDS CONFIRMATION — honest limitations. Publishing these builds trust. */
  notSuitable?: Localized[];
  /** NEEDS CONFIRMATION — nightly rate by season. No price is shown until set. */
  priceFromEur?: number;
  /** NEEDS CONFIRMATION — minimum stay in nights. */
  minNights?: number;
  /** Expected availability, for units in preparation. */
  expectedAvailability?: Localized;
}

export const apartments: Apartment[] = [
  {
    slug: 'schulstrasse-i',
    name: {
      de: 'Apartment Schulstraße I',
      en: 'Apartment Schulstraße I',
    },
    status: 'available',
    street: 'Schulstraße',
    positioning: {
      de: 'Innenstadt Bayreuth — im selben Haus wie Apartment II.',
      en: 'Bayreuth city centre — in the same building as Apartment II.',
    },
    intro: {
      de: 'Ein Apartment in der Schulstraße, mitten in der Bayreuther Innenstadt. Es gehört unserer Familie, wird von uns selbst betreut und für jeden Aufenthalt persönlich vorbereitet. Grundriss, Ausstattung und Preise stimmen wir direkt mit Ihnen ab.',
      en: 'An apartment on Schulstraße, in the centre of Bayreuth. It belongs to our family, we look after it ourselves, and we prepare it personally for every stay. Layout, furnishings and rates are agreed with you directly.',
    },
    // NEEDS CONFIRMATION: sizeSqm, rooms, maxGuests, bathrooms, floor,
    // bedrooms, amenityGroups, floorPlan, goodFit, notSuitable,
    // priceFromEur, minNights.
  },
  {
    slug: 'schulstrasse-ii',
    name: {
      de: 'Apartment Schulstraße II',
      en: 'Apartment Schulstraße II',
    },
    status: 'available',
    street: 'Schulstraße',
    positioning: {
      de: 'Innenstadt Bayreuth — im selben Haus wie Apartment I.',
      en: 'Bayreuth city centre — in the same building as Apartment I.',
    },
    intro: {
      de: 'Das zweite unserer beiden Apartments in der Schulstraße. Wer mit mehreren Personen anreist, kann beide Wohnungen im selben Haus zusammen anfragen — für Familien und Festspielgruppen ist das oft die bessere Lösung als zwei Hotelzimmer.',
      en: 'The second of our two apartments on Schulstraße. If you are travelling as a larger group, both apartments in the same building can be enquired about together — for families and festival parties that is often better than two hotel rooms.',
    },
    // NEEDS CONFIRMATION: same field list as Schulstraße I.
  },
  {
    slug: 'opernstrasse',
    name: {
      de: 'Apartment Opernstraße',
      en: 'Apartment Opernstraße',
    },
    status: 'in-preparation',
    street: 'Opernstraße',
    positioning: {
      de: 'In Vorbereitung — Renovierung läuft.',
      en: 'In preparation — renovation under way.',
    },
    intro: {
      de: 'Unser drittes Apartment in der Opernstraße wird derzeit renoviert. Es ist noch nicht buchbar. Wenn Sie möchten, melden wir uns, sobald ein Termin für die Eröffnung feststeht.',
      en: 'Our third apartment on Opernstraße is currently being renovated. It is not yet bookable. If you would like, we will get in touch as soon as an opening date is set.',
    },
    // NEEDS CONFIRMATION: expected completion date. Left undefined so the UI
    // says "in preparation" rather than promising a month that may slip.
  },
];

export const STATUS_LABEL: Record<ApartmentStatus, Localized> = {
  available: { de: 'Buchbar', en: 'Available' },
  'in-preparation': { de: 'In Vorbereitung', en: 'In preparation' },
};

export function getApartment(slug: string): Apartment | undefined {
  return apartments.find((a) => a.slug === slug);
}

export function bookableApartments(): Apartment[] {
  return apartments.filter((a) => a.status === 'available');
}

export function upcomingApartments(): Apartment[] {
  return apartments.filter((a) => a.status === 'in-preparation');
}

export function galleryFor(slug: string): TempImage[] {
  return tempGalleries[slug] ?? [];
}

/**
 * True when we have enough verified detail to show the factual blocks.
 * While this is false the detail page routes visitors to a personal enquiry
 * instead of showing an empty specification table.
 */
export function hasVerifiedDetails(a: Apartment): boolean {
  return Boolean(a.sizeSqm || a.rooms || a.maxGuests || a.bedrooms?.length);
}
