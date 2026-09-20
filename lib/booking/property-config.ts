/**
 * ══════════════════════════════════════════════════════════════════════════
 * PROPERTY OPERATIONS CONFIGURATION — non-secret, portfolio-wide facts.
 *
 * ── Where each fact lives, and why ───────────────────────────────────────
 *   editorial       name, copy, photography          lib/content/apartments.ts
 *   operational     bookable, occupancy, currency,   bolagio_units (database)
 *                   timezone, check-in / check-out   — changes without a deploy
 *   provider ids    Beds24 property + room           bolagio_unit_integrations
 *                                                    — the ONLY authority the
 *                                                    booking engine reads
 *   this file       house rules and the reference    — defaults the seed and
 *                   table of external identifiers    the docs are written from
 *
 * Nothing in this file is read on a guest-facing path to decide a Beds24 id.
 * The database mapping is authoritative; the table below is the human-
 * readable record of what was confirmed against the live account, kept next
 * to the code so a reviewer can check the seed and the runbooks against it.
 *
 * No secret belongs here and none may be added: this module has no
 * `server-only` marker on purpose, so a value placed in it is a value in the
 * browser bundle.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The property's calendar. Nights, "today" and message timing are computed in it. */
export const PROPERTY_TIMEZONE = 'Europe/Berlin';

/** House rules, as the database defaults are set. Per-unit overrides live on the row. */
export const HOUSE_RULES = {
  checkInTime: '14:00',
  checkOutTime: '11:00',
} as const;

/**
 * When the time-driven guest-operations events fire, relative to a CONFIRMED
 * stay, in the property's timezone. Deliberately small integers, not a
 * schedule DSL: the point is that a person can read the three numbers.
 */
export function guestOperationsTiming(): {
  prearrivalDays: number;
  reviewDelayDays: number;
  reviewWindowDays: number;
} {
  return {
    /** `guest.prearrival_ready` fires when check-in is this many days away or fewer. */
    prearrivalDays: 3,
    /** `review.requested` fires this many days after check-out… */
    reviewDelayDays: 1,
    /** …and only within this many further days. Older stays are never asked. */
    reviewWindowDays: 14,
  };
}

export type PortfolioUnitStatus = 'active' | 'in_preparation';

/**
 * The portfolio as confirmed by a person, for reference and review.
 *
 * `beds24` ids were established by enumerating the live account
 * (`GET /properties?includeAllRooms=true`) on 2026-09-17 — never assumed.
 * `bookingCom` ids are recorded for cross-reference only: this application
 * never talks to Booking.com; Beds24 owns that connection.
 *
 * The Opernstraße units carry NO provider ids and are `in_preparation`. They
 * must not be given ids here or in the seed until confirmed against the
 * account; an invented id sells the wrong apartment and looks healthy doing
 * it.
 */
export interface PortfolioUnitReference {
  slug: string;
  displayName: string;
  street: string;
  status: PortfolioUnitStatus;
  beds24?: { propertyId: string; roomId: string };
  bookingCom?: { propertyId: string };
}

export const PORTFOLIO: readonly PortfolioUnitReference[] = [
  {
    slug: 'schulstrasse-i',
    displayName: 'Schulstraße I',
    street: 'Schulstraße',
    status: 'active',
    beds24: { propertyId: '354659', roomId: '731147' },
    bookingCom: { propertyId: '14282341' },
  },
  {
    slug: 'schulstrasse-ii',
    displayName: 'Schulstraße II',
    street: 'Schulstraße',
    status: 'active',
    beds24: { propertyId: '354658', roomId: '731146' },
    bookingCom: { propertyId: '14401037' },
  },
  { slug: 'opernstrasse-i', displayName: 'Opernstraße I', street: 'Opernstraße', status: 'in_preparation' },
  { slug: 'opernstrasse-ii', displayName: 'Opernstraße II', street: 'Opernstraße', status: 'in_preparation' },
  { slug: 'opernstrasse-iii', displayName: 'Opernstraße III', street: 'Opernstraße', status: 'in_preparation' },
];

/** The Beds24 account the mapping above was confirmed on. Reference only. */
export const BEDS24_OWNER_ID = '177047';

export function portfolioUnit(slug: string): PortfolioUnitReference | undefined {
  return PORTFOLIO.find((u) => u.slug === slug);
}
