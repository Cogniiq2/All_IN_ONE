/**
 * ══════════════════════════════════════════════════════════════════════════
 * BUILDING LOCATIONS — the two BoLaGio addresses, as data.
 *
 * One canonical entry per building. The Contact page renders whatever this
 * file holds; it contains no address, no arrival step and no map link of its
 * own, and adding a third building is an entry here and nothing else.
 *
 * ── What may appear here ─────────────────────────────────────────────────
 * Only facts the owners have supplied. Two consequences, both deliberate:
 *
 *   • no coordinates. Nothing in this file states a latitude or longitude,
 *     because none has been verified. The map links carry the postal address
 *     as a query and let the map provider resolve it, which is also what a
 *     visitor would type themselves;
 *
 *   • no postal code on Opernstraße. Bayreuth has several, and only the
 *     Schulstraße one (95444, in lib/content/brand.ts) is confirmed. The
 *     Opernstraße card shows street and city, which is unambiguous, rather
 *     than a postal code that might be wrong.
 *     NEEDS CONFIRMATION — Opernstraße postal code.
 *
 * ── Arrival guidance ─────────────────────────────────────────────────────
 * `arrival` is optional and only Schulstraße has one, because only Schulstraße
 * has a route the owners have described. Nothing is invented for a building
 * that has not been described, and no step here tells a visitor to disregard a
 * traffic sign — see the note on SCHULSTRASSE_ARRIVAL.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { brand, contact } from '@/lib/content/brand';

export interface Localized {
  de: string;
  en: string;
}

export interface ArrivalGuidance {
  title: Localized;
  steps: Localized[];
  /** Shown beneath the steps, always visible. */
  note: Localized;
}

export interface BuildingLocation {
  id: string;
  /** Card eyebrow — the building, in the owners' own shorthand. */
  name: Localized;
  /** Street and house number, exactly as it is addressed. */
  street: string;
  /** Omitted where it is not confirmed; the city alone is still unambiguous. */
  postalCode?: string;
  city: string;
  /** One line on what a visitor finds there. */
  summary: Localized;
  arrival?: ArrivalGuidance;
}

/**
 * The route to the Schulstraße garage, as the owners describe it.
 *
 * ── The one rule this content follows ────────────────────────────────────
 * It never invites anyone past a traffic sign. Whether a BoLaGio guest is
 * exempt from the restriction at the ZOH (Zentraler Omnibusbahnhof) is NOT
 * confirmed, so the guidance names the signposted approach and asks visitors
 * to follow the signs on site. If an exemption is later confirmed in writing,
 * the wording can state it — until then this is the only defensible version.
 *
 * SCHULSTRASSE ZOH ACCESS SIGNAGE — NEEDS CONFIRMATION.
 */
const SCHULSTRASSE_ARRIVAL: ArrivalGuidance = {
  title: {
    de: 'Anfahrt zur Garage',
    en: 'Getting to the garage',
  },
  steps: [
    {
      de: 'Navigation bis zum ZOH (Zentraler Omnibusbahnhof) Bayreuth.',
      en: 'Navigate to the ZOH (central bus station) in Bayreuth.',
    },
    {
      de: 'An der VR Bank vorbei in Richtung ZOH.',
      en: 'Continue past the VR Bank towards the ZOH.',
    },
    {
      de: 'Rechts abbiegen und an der Sparkasse vorbeifahren.',
      en: 'Turn right and pass the Sparkasse.',
    },
    {
      de: 'Am Straßenende rechts abbiegen.',
      en: 'Turn right at the end of the road.',
    },
    {
      de: 'Die Zufahrt erfolgt über die beschilderte Zufahrtsseite des ZOH. Bitte beachten Sie die Verkehrszeichen vor Ort.',
      en: 'Access is via the signposted approach to the ZOH. Please observe the traffic signs on site.',
    },
    {
      de: 'Am Kreisel links zur Garage Schulstraße 1.',
      en: 'At the roundabout, turn left to the garage at Schulstraße 1.',
    },
  ],
  note: {
    de: 'Bitte der Beschilderung vor Ort folgen.',
    en: 'Please follow the signage on site.',
  },
};

export const LOCATIONS: BuildingLocation[] = [
  {
    id: 'schulstrasse',
    name: { de: 'Schulstraße', en: 'Schulstraße' },
    street: 'Schulstraße 1',
    postalCode: contact.postalCode,
    city: brand.city,
    summary: {
      de: 'Apartments und Gewerbefläche, wenige Minuten vom Zentrum und vom ZOH.',
      en: 'Apartments and commercial space, minutes from the centre and the ZOH.',
    },
    arrival: SCHULSTRASSE_ARRIVAL,
  },
  {
    id: 'opernstrasse',
    name: { de: 'Opernstraße', en: 'Opernstraße' },
    street: 'Opernstraße 1',
    city: brand.city,
    summary: {
      de: 'Wohn- und Gewerbeeinheiten in der Bayreuther Innenstadt.',
      en: 'Residential and commercial units in Bayreuth city centre.',
    },
  },
];

/** The address on one line, as a visitor would write it on an envelope. */
export function addressLine(location: BuildingLocation): string {
  const town = location.postalCode ? `${location.postalCode} ${location.city}` : location.city;
  return `${location.street}, ${town}`;
}

/**
 * Map links.
 *
 * Both are plain outbound links the visitor chooses to follow — no script, no
 * SDK and no request to either provider before that click. The address is
 * passed as a search query rather than as coordinates, because coordinates for
 * these buildings have not been verified.
 */
export function googleMapsUrl(location: BuildingLocation): string {
  const query = encodeURIComponent(`${addressLine(location)}, ${brand.country}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function appleMapsUrl(location: BuildingLocation): string {
  const query = encodeURIComponent(`${addressLine(location)}, ${brand.country}`);
  return `https://maps.apple.com/?q=${query}`;
}

/**
 * The embedded map, mounted only after an explicit click. See
 * components/contact/location-cards.tsx for why it is never mounted before.
 */
export function googleMapsEmbedUrl(location: BuildingLocation): string {
  const query = encodeURIComponent(`${addressLine(location)}, ${brand.country}`);
  return `https://www.google.com/maps?q=${query}&output=embed`;
}
