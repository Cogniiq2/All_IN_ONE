import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BEDROOM PACKAGE → BEDS24 OFFER. The one place the mapping lives.
 *
 *   one_bedroom   →  Beds24 Offer 1  "1 Schlafzimmer"   1–2 guests
 *   two_bedroom   →  Beds24 Offer 2  "2 Schlafzimmer"   1–4 guests
 *
 * The same on both apartments: I (354659/731147) and II (354658/731146).
 * Established by the owners' Beds24 configuration and VERIFIED against the
 * live `/inventory/rooms/offers` responses on 2026-10-12 — see
 * `Beds24OffersResponse` in types.ts for the recorded shape.
 *
 * ── What Beds24 already does, and this file must never redo ──────────────
 * The owners' canonical pricing (2026-10-13), configured IN BEDS24:
 *   1 Schlafzimmer (1–2 guests)   the seasonal base price
 *   2 Schlafzimmer (1–4 guests)   base + €99 per night
 *   1-night stay +€60, 2-night stay +€40 (per stay); none from 3 nights
 *   Apartment II = Apartment I − €50 per night; its monthly rate −20 %
 * Every one of those is inside the offer's `price`. This file SELECTS an
 * offer; it never computes, adjusts or compares a price — so changing the
 * rule is a Beds24 change, and no code here moves with it.
 *
 * ── The selection rules ──────────────────────────────────────────────────
 *   1. receive every offer Beds24 returned for the room;
 *   2. keep only those whose `offerId` is the package's offer;
 *   3. if the offer carries a name, it must be the package's name — an
 *      account whose offers were renumbered fails loudly instead of selling
 *      "1 Schlafzimmer" as "2 Schlafzimmer";
 *   4. the party must fit the package;
 *   5. return exactly that one offer.
 * There is no fallback. Not the cheapest offer, not the only offer, not the
 * other package. A missing offer is an answer ("this setup is not offered for
 * this stay"), never a cue to substitute.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BedroomPackage } from '@/lib/booking/types';
import type { ProviderUnitRef } from '@/lib/integrations/provider';
import type { Beds24Offer, Beds24OffersResponse } from '@/lib/integrations/beds24/types';

export interface Beds24BedroomOffer {
  offerId: number;
  /** The offer's name in Beds24, exactly as the account returns it. */
  offerName: string;
  /** The largest party the offer is priced for. */
  maxGuests: number;
}

/** The mapping. Changing it is a commercial decision, made in Beds24 first. */
export const BEDS24_BEDROOM_OFFERS: Readonly<Record<BedroomPackage, Beds24BedroomOffer>> = {
  one_bedroom: { offerId: 1, offerName: '1 Schlafzimmer', maxGuests: 2 },
  two_bedroom: { offerId: 2, offerName: '2 Schlafzimmer', maxGuests: 4 },
};

/** The package a Beds24 offer id stands for, or undefined (e.g. `0` on channel bookings). */
export function bedroomPackageForOfferId(offerId: unknown): BedroomPackage | undefined {
  const id = typeof offerId === 'string' && offerId.trim() !== '' ? Number(offerId) : offerId;
  if (typeof id !== 'number' || !Number.isInteger(id)) return undefined;
  for (const [pkg, offer] of Object.entries(BEDS24_BEDROOM_OFFERS) as Array<[BedroomPackage, Beds24BedroomOffer]>) {
    if (offer.offerId === id) return pkg;
  }
  return undefined;
}

export interface Beds24BedroomPricingInput {
  unit: ProviderUnitRef;
  bedroomPackage: BedroomPackage;
  /** adults + children */
  guests: number;
  offers: Beds24OffersResponse;
}

export type Beds24BedroomPricingResolution =
  | { status: 'configured'; bedroomPackage: BedroomPackage; offerId: number; offer: Beds24Offer }
  | {
      status: 'unavailable';
      bedroomPackage: BedroomPackage;
      /**
       *  no_offers             Beds24 offered nothing for the room — the dates
       *                        are not bookable (an availability answer)
       *  offer_missing         other offers exist, this package's does not —
       *                        e.g. Offer 1 for three guests
       *  occupancy_exceeded    the party is larger than the package takes
       *  offer_name_mismatch   the offer id exists but is named differently:
       *                        the account changed; refuse rather than guess
       */
      reason: 'no_offers' | 'offer_missing' | 'occupancy_exceeded' | 'offer_name_mismatch';
    };

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function resolveBeds24BedroomPricing(input: Beds24BedroomPricingInput): Beds24BedroomPricingResolution {
  const { bedroomPackage } = input;
  const mapped = BEDS24_BEDROOM_OFFERS[bedroomPackage];
  const unavailable = (reason: Extract<Beds24BedroomPricingResolution, { status: 'unavailable' }>['reason']) =>
    ({ status: 'unavailable', bedroomPackage, reason }) as const;

  if (input.guests > mapped.maxGuests) return unavailable('occupancy_exceeded');

  // Only the mapped room's offers; a response may describe other rooms.
  const roomOffers: Beds24Offer[] = [];
  for (const room of input.offers.data ?? []) {
    if (String(room.roomId ?? '') !== String(input.unit.externalRoomId)) continue;
    if (room.propertyId !== undefined && String(room.propertyId) !== String(input.unit.externalPropertyId)) continue;
    roomOffers.push(...(room.offers ?? []));
  }
  if (roomOffers.length === 0) return unavailable('no_offers');

  const matches = roomOffers.filter((o) => Number(o.offerId) === mapped.offerId);
  // Exactly one. Two offers with the same id is a response this code does not
  // understand, and not understanding a price is not a reason to pick one.
  if (matches.length !== 1) return unavailable('offer_missing');

  const offer = matches[0];
  if (typeof offer.offerName === 'string' && offer.offerName.trim() !== '' && !sameName(offer.offerName, mapped.offerName)) {
    return unavailable('offer_name_mismatch');
  }

  return { status: 'configured', bedroomPackage, offerId: mapped.offerId, offer };
}
