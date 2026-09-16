import 'server-only';

/**
 * The live Beds24 V2 provider.
 *
 * Four responsibilities, and nothing else: availability, offers, holds and
 * confirmation. Everything it knows about BoLaGio arrives as arguments — it
 * never reads the database, never reads a content file and never hardcodes a
 * property id.
 */

import { quoteMinutes } from '@/lib/booking/config';
import type { BookingQuote, InventoryDay } from '@/lib/booking/types';
import {
  ProviderError,
  type AvailabilityRequest,
  type BookingProvider,
  type HoldRequest,
  type OfferRequest,
  type ProviderBooking,
} from '@/lib/integrations/provider';
import { beds24Request } from '@/lib/integrations/beds24/client';
import { mapCalendar, mapOffer } from '@/lib/integrations/beds24/mapper';
import type {
  Beds24BookingStatus,
  Beds24BookingWriteResponse,
  Beds24CalendarResponse,
  Beds24OffersResponse,
} from '@/lib/integrations/beds24/types';

/**
 * ── The hold status, and the Beds24 setting behind it ────────────────────
 *
 * Beds24 has five booking statuses. Which of them BLOCK inventory — and
 * therefore push a closed night out to Booking.com and Airbnb — is a
 * PER-PROPERTY SETTING, not a universal rule. In particular, `request` does
 * NOT block inventory unless the property is explicitly configured to let it.
 *
 * So a hold is created as `new`, which blocks inventory in every documented
 * configuration, and is promoted to `confirmed` once payment is proven. A
 * hold that is not paid for is `cancelled`, which releases the night.
 *
 * If BoLaGio later prefers `request` for holds — so unpaid attempts never
 * appear as real bookings in reports — the property setting
 * "Requests block inventory" must be turned on first in Beds24. Changing the
 * constant below without changing that setting would silently reintroduce
 * overbooking.
 */
const HOLD_STATUS: Beds24BookingStatus = 'new';
const CONFIRMED_STATUS: Beds24BookingStatus = 'confirmed';
const RELEASED_STATUS: Beds24BookingStatus = 'cancelled';

/** Marks every reservation this website creates, for channel attribution. */
const DIRECT_REFERER = 'BoLaGio Direct';

export const beds24LiveProvider: BookingProvider = {
  mode: 'live',

  async fetchAvailability({ unit, from, to }: AvailabilityRequest): Promise<InventoryDay[]> {
    // One call for the whole horizon. Never one call per date — a year of
    // inventory for five units would be 1,825 requests and an immediate rate
    // limit.
    const response = await beds24Request<Beds24CalendarResponse>({
      path: '/inventory/rooms/calendar',
      query: {
        roomId: unit.externalRoomId,
        propertyId: unit.externalPropertyId,
        startDate: from,
        // Beds24's calendar `endDate` is inclusive; our `to` is exclusive.
        endDate: previousDay(to),
        includeNumAvail: 'true',
        includeMinStay: 'true',
        includeMaxStay: 'true',
        includePrices: 'true',
      },
    });
    return mapCalendar(response, from, to);
  },

  async fetchOffer(request: OfferRequest): Promise<BookingQuote> {
    const response = await beds24Request<Beds24OffersResponse>({
      path: '/inventory/rooms/offers',
      query: {
        propertyId: request.unit.externalPropertyId,
        roomId: request.unit.externalRoomId,
        arrival: request.checkIn,
        departure: request.checkOut,
        numAdult: request.adults,
        numChild: request.children,
      },
    });

    const expiresAt = new Date(Date.now() + quoteMinutes() * 60_000).toISOString();
    return mapOffer(
      response,
      {
        unitSlug: request.unitSlug,
        externalRoomId: String(request.unit.externalRoomId),
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        adults: request.adults,
        children: request.children,
      },
      expiresAt
    );
  },

  async createHold(request: HoldRequest): Promise<ProviderBooking> {
    const response = await beds24Request<Beds24BookingWriteResponse>({
      path: '/bookings',
      method: 'POST',
      idempotencyKey: request.idempotencyKey,
      body: [
        {
          roomId: Number(request.unit.externalRoomId) || request.unit.externalRoomId,
          propertyId: Number(request.unit.externalPropertyId) || request.unit.externalPropertyId,
          status: HOLD_STATUS,
          arrival: request.checkIn,
          departure: request.checkOut,
          numAdult: request.adults,
          numChild: request.children,
          firstName: request.guest.firstName,
          lastName: request.guest.lastName,
          email: request.guest.email,
          phone: request.guest.phone,
          country: request.guest.country,
          // Beds24 prices in major units.
          price: request.totalCents / 100,
          // Channel attribution, and the BoLaGio reference so a person looking
          // at Beds24 can find the same reservation the guest is quoting.
          referer: DIRECT_REFERER,
          reference: request.reference,
          notes: `BoLaGio ${request.reference} · hold until ${request.holdExpiresAt}`,
        },
      ],
    });

    return readWriteResponse(response, 'hold');
  },

  async confirmBooking(externalBookingId: string): Promise<ProviderBooking> {
    const response = await beds24Request<Beds24BookingWriteResponse>({
      path: '/bookings',
      method: 'POST',
      // The booking id IS the idempotency domain here: confirming twice must
      // be the same as confirming once.
      idempotencyKey: `confirm:${externalBookingId}`,
      body: [{ id: Number(externalBookingId) || externalBookingId, status: CONFIRMED_STATUS }],
    });
    return readWriteResponse(response, 'confirm');
  },

  async releaseHold(externalBookingId: string, reason: string): Promise<void> {
    await beds24Request<Beds24BookingWriteResponse>({
      path: '/bookings',
      method: 'POST',
      idempotencyKey: `release:${externalBookingId}`,
      body: [
        {
          id: Number(externalBookingId) || externalBookingId,
          status: RELEASED_STATUS,
          // Kept short and factual; it is visible to whoever reads the booking
          // in Beds24 and carries no guest detail.
          notes: `BoLaGio released: ${reason}`,
        },
      ],
    });
  },
};

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Read a booking id out of Beds24's array response.
 *
 * Beds24 answers a write with per-item success. A response that does not
 * contain a booking id is a failure even when the HTTP status was 200 —
 * treating it as a success would mean recording a hold that does not exist and
 * selling the night twice.
 */
function readWriteResponse(
  response: Beds24BookingWriteResponse,
  operation: 'hold' | 'confirm'
): ProviderBooking {
  const first = Array.isArray(response) ? response[0] : undefined;
  const booking = first?.new ?? first?.modified;
  const id = booking?.id;

  if (first?.success === false || id === undefined || id === null || id === '') {
    // Beds24's own error text is deliberately not carried into the message: it
    // can echo request parameters, and nothing a provider writes may reach a
    // guest-facing screen.
    throw new ProviderError(
      operation === 'hold' ? 'availability_conflict' : 'rejected',
      `Beds24 rejected the ${operation}`
    );
  }

  return { externalBookingId: String(id), snapshot: booking };
}
