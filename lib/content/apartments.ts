/**
 * ══════════════════════════════════════════════════════════════════════════
 * BoLaGio — the real inventory.
 *
 * Accommodation units (Apartment[]):
 *   • two apartments in the Schulstraße (lettable)
 *   • one apartment in the Opernstraße (renovation in progress, NOT bookable)
 *
 * Commercial units (CommercialUnit[]):
 *   • the ground-floor storefront unit in the Schulstraße
 *   • a ground-floor storefront unit in the Opernstraße (in preparation)
 *
 * The previous site listed five invented apartments with identical sizes,
 * guest counts and amenity lists. That inventory has been deleted.
 *
 * ── TWO COMMERCIAL MODES, NEVER MIXED ─────────────────────────────────────
 * BoLaGio runs two different businesses out of the same buildings:
 *
 *   'short-term'             nightly / short accommodation. Discovery, dates,
 *                            and later a real booking. Guests, not tenants.
 *   'long-term-residential'  a conventional residential tenancy under an
 *                            individual rental agreement (Mietvertrag).
 *   'long-term-commercial'   a conventional commercial tenancy.
 *
 * `rentalModes` states which of these a unit supports. Nothing in the UI may
 * infer a mode from a slug, a street or a description — read this field.
 * A unit without 'short-term' can never enter the booking or availability
 * flow, and no long-term mode is ever directly bookable on the website.
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

export type UnitStatus =
  /** Lettable now — enquiry CTAs shown. */
  | 'available'
  /** Renovation in progress — no booking or payment CTA anywhere. */
  | 'in-preparation';

/** Kept as the historical name for the accommodation-side status. */
export type ApartmentStatus = UnitStatus;

/**
 * The commercial mode a unit is offered in. A unit may support more than one —
 * the two Schulstraße apartments are primarily short-term accommodation and
 * may *additionally* be discussed for a conventional tenancy.
 *
 * These are not steps of one funnel. Each mode has its own journey, its own
 * CTA and its own enquiry.
 */
export type RentalMode =
  /** Nightly / short accommodation. The only mode that may ever be bookable. */
  | 'short-term'
  /** Conventional residential tenancy (Wohnraummietvertrag). Enquiry only. */
  | 'long-term-residential'
  /** Conventional commercial tenancy (Gewerbemietvertrag). Enquiry only. */
  | 'long-term-commercial';

export const LONG_TERM_MODES = [
  'long-term-residential',
  'long-term-commercial',
] as const satisfies readonly RentalMode[];

export type LongTermMode = (typeof LONG_TERM_MODES)[number];

export interface Bedroom {
  label: Localized;
  beds: Localized;
}

export interface AmenityGroup {
  title: Localized;
  items: Localized[];
}

/** Fields every lettable unit carries, whatever mode it is offered in. */
export interface BaseUnit {
  slug: string;
  /** Provisional working name. NEEDS CONFIRMATION — final names to follow. */
  name: Localized;
  status: UnitStatus;
  /**
   * Which commercial modes this unit is offered in. Drives every routing
   * decision in the UI — never branch on `slug`.
   */
  rentalModes: RentalMode[];
  /** Street only. House numbers are shared after booking, not published. */
  street: string;
  /** One honest sentence of positioning — no superlatives, no invented facts. */
  positioning: Localized;
  /** Two to three sentences. Must not assert unverified specifics. */
  intro: Localized;
  /** NEEDS CONFIRMATION — floor area in m². */
  sizeSqm?: number;
  /** NEEDS CONFIRMATION — floor, and whether there is a lift. */
  floor?: Localized;
  /** Expected availability, for units in preparation. */
  expectedAvailability?: Localized;
}

export interface Apartment extends BaseUnit {
  /** Discriminant, so a commercial unit can never be handed to guest UI. */
  kind?: 'apartment';

  // ── Everything below is UNCONFIRMED and therefore optional ──────────────
  // The detail template renders each block only when its data exists.

  /** NEEDS CONFIRMATION — number of rooms. */
  rooms?: number;
  /** NEEDS CONFIRMATION — maximum occupancy. */
  maxGuests?: number;
  /** NEEDS CONFIRMATION — number of bathrooms. */
  bathrooms?: number;
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
}

/**
 * A commercial / storefront unit. Deliberately a separate type from
 * `Apartment`: it has no guest count, no nightly rate and no gallery, it is
 * never routed under /apartments, and the accommodation components cannot
 * accept one by mistake.
 */
export interface CommercialUnit extends BaseUnit {
  kind: 'commercial';
  /** Verified, visible characteristics only — no invented specifications. */
  features?: Localized[];
  // NEEDS CONFIRMATION — Kaltmiete, Nebenkosten, Kaution, Grundriss, frühester
  // Mietbeginn. Deliberately absent from this type: none of it is verified, and
  // an optional field invites someone to fill it with a guess.
}

export type RentalUnit = Apartment | CommercialUnit;

export const apartments: Apartment[] = [
  {
    slug: 'schulstrasse-i',
    name: {
      de: 'Apartment Schulstraße I',
      en: 'Apartment Schulstraße I',
    },
    status: 'available',
    // Primarily short-term accommodation. The owners may additionally discuss a
    // conventional residential tenancy for this flat — that is a separate
    // conversation on /mieten, never a booking.
    rentalModes: ['short-term', 'long-term-residential'],
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
    rentalModes: ['short-term', 'long-term-residential'],
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
    // Both modes are *intended*. `status` keeps the unit out of every active
    // list until the renovation is finished, so nothing here markets it.
    rentalModes: ['short-term', 'long-term-residential'],
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

/**
 * Commercial / storefront units.
 *
 * These are let under a conventional commercial rental agreement and are NOT
 * accommodation. They are deliberately kept out of `apartments`, so they are
 * never routed under /apartments/[slug], never appear in the availability or
 * booking flow, and never reach a component that would offer nights.
 */
export const commercialUnits: CommercialUnit[] = [
  {
    slug: 'schulstrasse-gewerbeflaeche',
    kind: 'commercial',
    name: {
      de: 'Gewerbefläche Schulstraße',
      en: 'Commercial unit Schulstraße',
    },
    status: 'available',
    rentalModes: ['long-term-commercial'],
    street: 'Schulstraße',
    // Confirmed by the owners: ground floor of the Schulstraße building,
    // roughly 120 m², with shop windows onto the street.
    sizeSqm: 120,
    floor: { de: 'Erdgeschoss', en: 'Ground floor' },
    positioning: {
      de: 'Erdgeschoss mit Schaufenstern — nur zur Miete, nicht als Unterkunft.',
      en: 'Ground floor with display windows — to let only, not accommodation.',
    },
    intro: {
      de: 'Im Erdgeschoss unseres Hauses in der Schulstraße steht eine Gewerbefläche von rund 120 m² mit Schaufenstern zur Straße zur Verfügung. Sie wird ausschließlich über einen regulären Mietvertrag vermietet — Grundriss, Nutzung und Konditionen besprechen wir persönlich.',
      en: 'On the ground floor of our Schulstraße building there is a commercial unit of roughly 120 m² with display windows onto the street. It is let exclusively under a conventional rental agreement — layout, intended use and terms are discussed personally.',
    },
    features: [
      { de: 'Rund 120 m² Fläche', en: 'Approximately 120 m² of floor space' },
      { de: 'Schaufenster zur Straße', en: 'Display windows onto the street' },
      { de: 'Erdgeschoss, ebenerdiger Zugang', en: 'Ground floor, street-level entrance' },
    ],
    // NEEDS CONFIRMATION: Kaltmiete, Nebenkosten, Kaution, exakte Fläche,
    // Grundriss, Vornutzung, zulässige Nutzungsarten, frühester Mietbeginn,
    // Stellplätze, Barrierefreiheit, Energieausweis (§ 87 GEG: die Kennwerte
    // sind in einer Immobilienanzeige pflichtig, sobald einer vorliegt).
  },
  {
    slug: 'opernstrasse-gewerbeflaeche',
    kind: 'commercial',
    name: {
      de: 'Gewerbefläche Opernstraße',
      en: 'Commercial unit Opernstraße',
    },
    status: 'in-preparation',
    rentalModes: ['long-term-commercial'],
    street: 'Opernstraße',
    positioning: {
      de: 'In Vorbereitung — noch nicht zu vermieten.',
      en: 'In preparation — not yet available to let.',
    },
    intro: {
      de: 'Im Erdgeschoss unseres Hauses in der Opernstraße ist eine weitere Gewerbefläche vorgesehen. Das Gebäude wird derzeit hergerichtet; die Fläche steht noch nicht zur Vermietung. Wenn Sie möchten, melden wir uns, sobald sie verfügbar ist.',
      en: 'A further commercial unit is planned for the ground floor of our Opernstraße building. The building is currently being prepared and the unit is not yet available to let. If you would like, we will be in touch once it is.',
    },
    // NEEDS CONFIRMATION: everything — size, layout, intended use, and when the
    // unit will actually be available. Nothing beyond "it is planned" is stated.
  },
];

/** Every lettable unit, accommodation and commercial alike. */
export const rentalUnits: RentalUnit[] = [...apartments, ...commercialUnits];

export const STATUS_LABEL: Record<ApartmentStatus, Localized> = {
  available: { de: 'Buchbar', en: 'Available' },
  'in-preparation': { de: 'In Vorbereitung', en: 'In preparation' },
};

/**
 * Status wording for the rental side. "Buchbar" would be actively wrong there:
 * nothing on /mieten is bookable, it is let under a contract.
 */
export const LETTING_STATUS_LABEL: Record<UnitStatus, Localized> = {
  available: { de: 'Zu vermieten', en: 'Available to let' },
  'in-preparation': { de: 'In Vorbereitung', en: 'In preparation' },
};

/** Short public label for a unit's long-term mode. */
export const LONG_TERM_MODE_LABEL: Record<LongTermMode, Localized> = {
  'long-term-residential': { de: 'Wohnraum', en: 'Residential' },
  'long-term-commercial': { de: 'Gewerbe', en: 'Commercial' },
};

export function getApartment(slug: string): Apartment | undefined {
  return apartments.find((a) => a.slug === slug);
}

export function getRentalUnit(slug: string): RentalUnit | undefined {
  return rentalUnits.find((u) => u.slug === slug);
}

export function isCommercial(unit: RentalUnit): unit is CommercialUnit {
  return unit.kind === 'commercial';
}

export function supportsMode(unit: RentalUnit, mode: RentalMode): boolean {
  return unit.rentalModes.includes(mode);
}

export function supportsShortTerm(unit: RentalUnit): boolean {
  return supportsMode(unit, 'short-term');
}

export function supportsLongTerm(unit: RentalUnit): boolean {
  return LONG_TERM_MODES.some((mode) => supportsMode(unit, mode));
}

/** The long-term modes a unit is actually offered in, in display order. */
export function longTermModesOf(unit: RentalUnit): LongTermMode[] {
  return LONG_TERM_MODES.filter((mode) => supportsMode(unit, mode));
}

/**
 * The single gate into the accommodation journey.
 *
 * A unit reaches the availability panel, the enquiry dialog's apartment list
 * and every "request availability" affordance only through this function. A
 * unit that does not declare 'short-term' — every commercial unit, today —
 * therefore cannot be offered for nights anywhere on the site, and a unit in
 * preparation cannot either.
 */
export function bookableApartments(): Apartment[] {
  return apartments.filter((a) => a.status === 'available' && supportsShortTerm(a));
}

export function upcomingApartments(): Apartment[] {
  return apartments.filter((a) => a.status === 'in-preparation');
}

/**
 * Units that may be discussed under a conventional rental agreement today.
 * Enquiry and consultation only — never bookable, whatever else the unit does.
 */
export function lettableUnits(mode?: LongTermMode): RentalUnit[] {
  return rentalUnits.filter(
    (u) =>
      u.status === 'available' &&
      (mode ? supportsMode(u, mode) : supportsLongTerm(u))
  );
}

/** Long-term units that exist but are not yet being offered. */
export function upcomingLettableUnits(): RentalUnit[] {
  return rentalUnits.filter((u) => u.status === 'in-preparation' && supportsLongTerm(u));
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
