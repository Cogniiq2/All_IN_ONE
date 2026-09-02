/**
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT EACH APARTMENT ACTUALLY OFFERS
 *
 * One canonical description per unit, resolved by slug and rendered by
 * `components/property/property-facts.tsx`. The same record serves every
 * surface the flat appears on — the detail view opened from the homepage,
 * from /apartments, and from /mieten — so a fact cannot be right in one place
 * and stale in another, and nothing branches on a slug to decide what to show.
 *
 * ── Where this came from ─────────────────────────────────────────────────
 * The owners supplied the amenity lists their Booking.com and Airbnb listings
 * carried. Those lists are long, overlapping and, in places, contradictory —
 * the two platforms describe the same flat's parking and its exterior cameras
 * differently. Three rules were applied to all of it:
 *
 *   1. DE-DUPLICATE. A feature appears in exactly one group. A dishwasher is
 *      kitchen, not "kitchen" and "appliances"; towels are bathroom, not also
 *      bedroom. Where both platforms listed the same thing in different words,
 *      it is written once, in ours.
 *
 *   2. WHERE THE SOURCES DISAGREE, PUBLISH NOTHING. Parking and exterior
 *      cameras are contradicted between the two platforms, so neither is
 *      described here at all. A guest reading a promise we cannot keep is a
 *      worse outcome than a guest asking us a question.
 *
 *   3. NO GUARANTEE FROM A CHECKBOX. The listings carried an elevator's
 *      internal dimensions and a wheelchair-accessible flag. Those are
 *      accessibility commitments people plan a journey around, and they are
 *      not verified in this repository, so the public text says only that
 *      there is a lift. The measurements are recorded as outstanding.
 *
 * Everything the platforms sold as an optional extra — wine on arrival,
 * grocery delivery, room service, a minibar, bicycle hire, shuttles, transport
 * tickets, a tour desk, guided activities — is deliberately absent. BoLaGio
 * has not confirmed it provides or arranges any of it, and a marketplace's
 * upsell catalogue is not this family's service list.
 *
 * Search this file and the report for NEEDS CONFIRMATION.
 *
 * ── Short stay versus tenancy ────────────────────────────────────────────
 * A group may declare `scope: 'short-term'`. Those are the things that only
 * mean something to a guest staying nights — self check-in, luggage storage, a
 * mid-stay clean. On /mieten, where the same flat is being discussed as a
 * tenancy, they are left out. Every other group is the flat itself and is
 * shown in both journeys.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Localized } from '@/lib/content/apartments';

/** Which journeys a group belongs in. */
export type FactScope = 'any' | 'short-term';

/**
 * The icon a group is drawn with. A name rather than a component, so this file
 * stays data and the component owns the drawing.
 */
export type FactIcon =
  | 'living'
  | 'kitchen'
  | 'bed'
  | 'bath'
  | 'work'
  | 'family'
  | 'outdoor'
  | 'access'
  | 'safety'
  | 'service'
  | 'location';

export interface FactGroup {
  id: string;
  label: Localized;
  icon: FactIcon;
  items: Localized[];
  scope?: FactScope;
}

export interface PropertyFacts {
  /** The short answer, as chips. Nothing here is repeated in a group below. */
  highlights: Localized[];
  groups: FactGroup[];
}

/* ── Shared wording ─────────────────────────────────────────────────────── */

const de = (d: string, e: string): Localized => ({ de: d, en: e });

/**
 * Location.
 *
 * Both flats are in the same building, so they share one entry. Only fixed
 * landmarks are listed — a town hall and a railway station are still where
 * they were, whereas the restaurants the platforms listed are businesses whose
 * current names and opening we have not checked, and a closed restaurant on a
 * property page is worse than no restaurant at all.
 *
 * Distances are written with "ca." and no walking times are claimed: the
 * figures come from the platform listings, not from a survey, and how long a
 * walk takes depends on who is walking.
 *
 * NEEDS CONFIRMATION — the distances themselves, and whether the restaurants
 * the listings named are still trading.
 */
const SCHULSTRASSE_LOCATION: FactGroup = {
  id: 'location',
  label: de('Lage & Umgebung', 'Location & surroundings'),
  icon: 'location',
  items: [
    de('Altes Rathaus — ca. 150 m', 'Old town hall — approx. 150 m'),
    de('Spielplatz Opernstraße — ca. 300 m', 'Opernstraße playground — approx. 300 m'),
    de('Hauptbahnhof Bayreuth — ca. 650 m', 'Bayreuth central station — approx. 650 m'),
    de('Neues Schloss — ca. 650 m', 'New Palace — approx. 650 m'),
    de('Röhrensee mit Tierpark — ca. 1,4 km', 'Röhrensee park and animal enclosure — approx. 1.4 km'),
    de('Flughafen Nürnberg — ca. 81 km', 'Nuremberg airport — approx. 81 km'),
  ],
};

/**
 * Services.
 *
 * Only what the owners run themselves. The mid-stay clean is written as
 * chargeable and on request because that is how it was listed; nothing here
 * promises a price.
 *
 * NEEDS CONFIRMATION — private/express check-in and check-out, and the safe
 * the listings offered against a fee. Both are omitted until confirmed.
 */
const SCHULSTRASSE_SERVICES: FactGroup = {
  id: 'services',
  label: de('Services', 'Services'),
  icon: 'service',
  scope: 'short-term',
  items: [
    de('Self Check-in mit Schlüsselsafe', 'Self check-in with a key safe'),
    de('Gepäckaufbewahrung bei früher Anreise oder später Abreise nach Absprache',
       'Luggage storage for an early arrival or a late departure, by arrangement'),
    de('Längere Aufenthalte möglich', 'Longer stays are possible'),
    de('Zwischenreinigung auf Wunsch gegen Aufpreis', 'A mid-stay clean on request, for a fee'),
    de('Rechnung auf Wunsch', 'An invoice on request'),
  ],
};

const SAFETY_ITEMS: Localized[] = [
  de('Rauchmelder', 'Smoke alarm'),
  de('Kohlenmonoxidmelder', 'Carbon monoxide detector'),
  de('Feuerlöscher', 'Fire extinguisher'),
  de('Erste-Hilfe-Set', 'First-aid kit'),
];

const FAMILY_ITEMS: Localized[] = [
  de('Für Familien geeignet', 'Suitable for families'),
  de('Baby- oder Reisebett auf Anfrage', 'Cot or travel cot on request'),
  de('Steckdosensicherungen', 'Socket safety covers'),
];

const WORK_ITEMS: Localized[] = [
  de('WLAN in der gesamten Wohnung', 'Wi-Fi throughout the apartment'),
  de('Eigener Arbeitsplatz mit Schreibtisch', 'A dedicated workspace with a desk'),
  de('LAN-Anschluss', 'Wired ethernet connection'),
];

/**
 * The streaming services and the connected-TV boxes were listed separately on
 * both platforms — six apps and four boxes, eleven lines for what a guest reads
 * as one fact. They are written as two.
 */
function mediaItems(inches: number): Localized[] {
  return [
    de('Sofa und Sitzbereich', 'Sofa and seating area'),
    de('Essbereich mit Esstisch', 'Dining area with a dining table'),
    de(`${inches}-Zoll-Fernseher`, `${inches}-inch television`),
    de('Apple TV, Fire TV und Chromecast', 'Apple TV, Fire TV and Chromecast'),
    de('Netflix, Prime Video und Disney+', 'Netflix, Prime Video and Disney+'),
    de('Kabelfernsehen', 'Cable television'),
  ];
}

const KITCHEN_ITEMS: Localized[] = [
  de('Vollausgestattete Küche', 'Fully equipped kitchen'),
  de('Backofen, Kochfeld und Geschirrspüler', 'Oven, hob and dishwasher'),
  de('Kühlschrank mit Gefrierfach', 'Fridge with a freezer'),
  de('Nespresso-Maschine, Wasserkocher und Toaster', 'Nespresso machine, kettle and toaster'),
  de('Kochgeschirr, Geschirr, Besteck, Weingläser, Backblech',
     'Cookware, crockery, cutlery, wine glasses and a baking tray'),
  de('Kaffee, Tee und Reinigungsmittel vorhanden', 'Coffee, tea and cleaning products provided'),
];

const LAUNDRY_ITEMS: Localized[] = [
  de('Bettwäsche und Handtücher inklusive', 'Bed linen and towels included'),
  de('Kleiderschrank, Stauraum und Kleiderbügel', 'Wardrobe, storage and hangers'),
  de('Zusätzliche Kissen und Decken', 'Extra pillows and blankets'),
  de('Verdunkelung', 'Blackout curtains'),
  de('Waschmaschine und Trockner', 'Washing machine and dryer'),
  de('Bügeleisen, Bügelbrett und Wäscheständer', 'Iron, ironing board and drying rack'),
];

/* ── The two Schulstraße flats ──────────────────────────────────────────── */

const SCHULSTRASSE_I: PropertyFacts = {
  highlights: [
    de('Bis 4 Personen', 'Up to 4 guests'),
    de('Aufzug', 'Lift'),
    de('Balkon', 'Balcony'),
    de('Klimaanlage', 'Air conditioning'),
    de('Waschmaschine & Trockner', 'Washer & dryer'),
    de('Self Check-in', 'Self check-in'),
  ],
  groups: [
    {
      id: 'living',
      label: de('Wohnen & Entertainment', 'Living & entertainment'),
      icon: 'living',
      items: mediaItems(85),
    },
    { id: 'kitchen', label: de('Küche & Genuss', 'Kitchen & dining'), icon: 'kitchen', items: KITCHEN_ITEMS },
    { id: 'sleeping', label: de('Schlafen & Wäsche', 'Sleeping & laundry'), icon: 'bed', items: LAUNDRY_ITEMS },
    {
      id: 'bath',
      label: de('Bad & Pflege', 'Bathroom'),
      icon: 'bath',
      items: [
        de('Eigenes Badezimmer', 'Private bathroom'),
        de('Badewanne und Dusche', 'Bathtub and shower'),
        de('Bidet', 'Bidet'),
        de('Bademantel und Handtücher', 'Bathrobe and towels'),
        de('Föhn', 'Hairdryer'),
        de('Shampoo, Duschgel und Seife', 'Shampoo, shower gel and soap'),
      ],
    },
    { id: 'work', label: de('Arbeiten & WLAN', 'Working & Wi-Fi'), icon: 'work', items: WORK_ITEMS },
    { id: 'family', label: de('Familie', 'Families'), icon: 'family', items: FAMILY_ITEMS },
    {
      id: 'outdoor',
      label: de('Außenbereich', 'Outdoor space'),
      icon: 'outdoor',
      items: [
        de('Eigener Balkon', 'Private balcony'),
        de('Außenmöbel', 'Outdoor furniture'),
        de('Essplatz im Freien', 'Outdoor dining area'),
      ],
    },
    {
      id: 'access',
      label: de('Zugang & Komfort', 'Access & comfort'),
      icon: 'access',
      items: [
        de('Eigener Eingang', 'Private entrance'),
        // "Aufzug vorhanden" and nothing more — see the note at the top.
        de('Aufzug vorhanden', 'Lift in the building'),
        de('Wohnung auf einer Ebene, keine Stufen innerhalb', 'All on one level, no steps inside'),
        de('Schallschutz', 'Soundproofing'),
        de('Heizung und Klimaanlage', 'Heating and air conditioning'),
        de('Nichtraucherunterkunft', 'Non-smoking'),
        de('Stadtblick', 'City view'),
      ],
    },
    { id: 'safety', label: de('Sicherheit', 'Safety'), icon: 'safety', items: SAFETY_ITEMS },
    SCHULSTRASSE_SERVICES,
    SCHULSTRASSE_LOCATION,
  ],
};

const SCHULSTRASSE_II: PropertyFacts = {
  highlights: [
    de('Bis 4 Personen', 'Up to 4 guests'),
    de('Dachterrasse', 'Roof terrace'),
    de('Aufzug', 'Lift'),
    de('Klimaanlage', 'Air conditioning'),
    de('Waschmaschine & Trockner', 'Washer & dryer'),
    de('Self Check-in', 'Self check-in'),
  ],
  groups: [
    {
      id: 'living',
      label: de('Wohnen & Entertainment', 'Living & entertainment'),
      icon: 'living',
      items: mediaItems(70),
    },
    { id: 'kitchen', label: de('Küche & Genuss', 'Kitchen & dining'), icon: 'kitchen', items: KITCHEN_ITEMS },
    {
      id: 'sleeping',
      label: de('Schlafen & Wäsche', 'Sleeping & laundry'),
      icon: 'bed',
      items: [
        de('Bettwäsche aus Baumwolle und Handtücher inklusive',
           'Cotton bed linen and towels included'),
        ...LAUNDRY_ITEMS.slice(1),
      ],
    },
    {
      id: 'bath',
      label: de('Bad & Pflege', 'Bathroom'),
      icon: 'bath',
      items: [
        de('Eigenes Badezimmer', 'Private bathroom'),
        de('Dusche', 'Shower'),
        de('Bidet', 'Bidet'),
        de('Bademantel, Hausschuhe und Handtücher', 'Bathrobe, slippers and towels'),
        de('Föhn', 'Hairdryer'),
        de('Shampoo, Duschgel und Seife', 'Shampoo, shower gel and soap'),
      ],
    },
    { id: 'work', label: de('Arbeiten & WLAN', 'Working & Wi-Fi'), icon: 'work', items: WORK_ITEMS },
    { id: 'family', label: de('Familie', 'Families'), icon: 'family', items: FAMILY_ITEMS },
    {
      id: 'outdoor',
      label: de('Dachterrasse', 'Roof terrace'),
      icon: 'outdoor',
      items: [
        de('Eigene Dachterrasse', 'Private roof terrace'),
        de('Außenmöbel und Essplatz im Freien', 'Outdoor furniture and dining area'),
        de('Liegen und Sonnenschirme', 'Sun loungers and parasols'),
      ],
    },
    {
      id: 'access',
      label: de('Zugang & Komfort', 'Access & comfort'),
      icon: 'access',
      items: [
        de('Eigener Eingang', 'Private entrance'),
        de('Aufzug vorhanden', 'Lift in the building'),
        de('Schallschutz', 'Soundproofing'),
        de('Zentralheizung und Klimaanlage', 'Central heating and air conditioning'),
        de('Nichtraucherunterkunft', 'Non-smoking'),
        de('Stadtblick', 'City view'),
      ],
    },
    { id: 'safety', label: de('Sicherheit', 'Safety'), icon: 'safety', items: SAFETY_ITEMS },
    SCHULSTRASSE_SERVICES,
    SCHULSTRASSE_LOCATION,
  ],
};

const FACTS_BY_SLUG: Record<string, PropertyFacts> = {
  'schulstrasse-i': SCHULSTRASSE_I,
  'schulstrasse-ii': SCHULSTRASSE_II,
  // The Opernstraße flats are still being renovated. Nothing about their
  // fittings is settled, so they carry no fact sheet rather than a provisional
  // one, and the detail view simply omits the section.
};

/** The description of a unit, or undefined where none has been written. */
export function factsFor(slug: string): PropertyFacts | undefined {
  return FACTS_BY_SLUG[slug];
}

/**
 * The groups that belong in a given journey.
 *
 * A tenancy conversation has no use for self check-in or a mid-stay clean, so
 * those drop out on /mieten. Everything that is the flat itself stays.
 */
export function groupsForScope(facts: PropertyFacts, shortTerm: boolean): FactGroup[] {
  return facts.groups.filter((group) => shortTerm || (group.scope ?? 'any') === 'any');
}
