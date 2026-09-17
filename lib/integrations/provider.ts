import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BOOKING PROVIDER SEAM.
 *
 * Everything the booking flow needs from a channel manager, expressed in
 * BoLaGio's own vocabulary. Beds24 is today's implementation; it is not the
 * interface. Nothing above this line knows a Beds24 property id, a Beds24
 * status string or a Beds24 URL — the mapper does, and it is the only file
 * that does.
 *
 *     route handler → lib/booking/service → BookingProvider → Beds24 V2
 *
 * ── Why the seam is here and not lower ───────────────────────────────────
 * Beds24 is one channel manager among several, and the property portfolio is
 * about to triple. The expensive version of this decision is discovering, two
 * years in, that `beds24` appears in forty React components. The cheap version
 * is this file.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BookingQuote, GuestDetails, InventoryDay, IsoDate } from '@/lib/booking/types';

/**
 * What the provider says it has — one property and its rooms.
 *
 * This is an OPERATIONS shape, not a guest-flow one. It exists to establish
 * the `unit_integrations` mapping once, by asking the provider what actually
 * exists rather than trusting an id someone typed into a spreadsheet. It is
 * never read during a booking.
 */
export interface ProviderPropertySummary {
  externalPropertyId: string;
  name: string;
  currency?: string;
  rooms: ProviderRoomSummary[];
}

export interface ProviderRoomSummary {
  externalRoomId: string;
  name: string;
  /** The provider's occupancy, where it states one. */
  maxGuests?: number;
}

/** Where a unit lives at the provider. Resolved from the database, never hardcoded. */
export interface ProviderUnitRef {
  provider: 'beds24';
  externalPropertyId: string;
  externalRoomId: string;
}

export interface AvailabilityRequest {
  unit: ProviderUnitRef;
  from: IsoDate;
  /** Exclusive. */
  to: IsoDate;
}

export interface OfferRequest {
  unit: ProviderUnitRef;
  unitSlug: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  adults: number;
  children: number;
}

export interface HoldRequest extends OfferRequest {
  reference: string;
  guest: GuestDetails;
  totalCents: number;
  currency: string;
  /** Passed to the provider so a retry cannot create a second reservation. */
  idempotencyKey: string;
  holdExpiresAt: string;
}

export interface ProviderBooking {
  /** The provider's own id. Stored beside the BoLaGio reference, never shown. */
  externalBookingId: string;
  /** Exactly what the provider answered, for reconciliation. */
  snapshot: unknown;
}

/**
 * A provider call that did not produce a result.
 *
 * Thrown rather than returned so that no caller can accidentally treat a
 * failure as an empty-but-valid answer. `availability_conflict` in particular
 * must never be flattened into "no nights available" — the flow has a distinct,
 * premium screen for it.
 */
export class ProviderError extends Error {
  constructor(
    readonly code: 'availability_conflict' | 'stay_rules' | 'unavailable' | 'rejected',
    message: string,
    readonly meta?: Record<string, number | string | boolean>
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface BookingProvider {
  /** Which implementation this is. Logged; never sent to a browser. */
  readonly mode: 'mock' | 'live';

  /** Bulk day-by-day inventory for one unit. One call per unit per sync, not one per date. */
  fetchAvailability(request: AvailabilityRequest): Promise<InventoryDay[]>;

  /**
   * The authoritative answer for a specific stay: is it still free, and what
   * does it actually cost. Called immediately before a reservation, never
   * from the browser and never served from cache.
   */
  fetchOffer(request: OfferRequest): Promise<BookingQuote>;

  /**
   * Create the temporary, inventory-blocking reservation.
   *
   * This happens BEFORE payment, on purpose. Taking money first and reserving
   * afterwards is the race that sells the same night twice.
   */
  createHold(request: HoldRequest): Promise<ProviderBooking>;

  /** Turn a hold into a confirmed reservation, after payment is proven. */
  confirmBooking(externalBookingId: string): Promise<ProviderBooking>;

  /** Release a hold whose payment failed, was cancelled or timed out. */
  releaseHold(externalBookingId: string, reason: string): Promise<void>;
}
