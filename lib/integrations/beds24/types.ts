import 'server-only';

/**
 * Beds24 API V2 wire shapes — the only file allowed to name them.
 *
 * These are intentionally LOOSE. Beds24 returns numbers as strings in places,
 * omits fields it considers defaulted, and differs between property
 * configurations. Everything here is therefore optional and everything is
 * narrowed by `mapper.ts` before it reaches the domain; nothing downstream
 * ever indexes into one of these objects.
 *
 * ── Verification status ──────────────────────────────────────────────────
 * Written against the published Beds24 API V2 surface. The exact field casing
 * per endpoint cannot be confirmed from inside this repository because no
 * Beds24 credentials exist yet — `mapper.ts` reads defensively for that
 * reason, and `BEDS24_MODE=live` must be smoke-tested against a real account
 * before the first guest sees it. See the final report.
 */

/** `GET /inventory/rooms/calendar` — one entry per room per date range. */
export interface Beds24CalendarResponse {
  success?: boolean;
  data?: Beds24RoomCalendar[];
}

export interface Beds24RoomCalendar {
  roomId?: number | string;
  propertyId?: number | string;
  calendar?: Beds24CalendarEntry[];
}

/**
 * A run of identical days. Beds24 compresses the calendar into ranges rather
 * than emitting one object per date, which is why the mapper expands it.
 */
export interface Beds24CalendarEntry {
  from?: string;
  to?: string;
  numAvail?: number | string;
  minStay?: number | string;
  maxStay?: number | string;
  /** 0/1 or boolean depending on configuration. */
  closedArrival?: number | string | boolean;
  closedDeparture?: number | string | boolean;
  price1?: number | string;
}

/** `GET /inventory/rooms/offers` — bookable offers for a concrete stay. */
export interface Beds24OffersResponse {
  success?: boolean;
  data?: Beds24PropertyOffers[];
}

export interface Beds24PropertyOffers {
  propertyId?: number | string;
  roomTypes?: Beds24RoomOffers[];
}

export interface Beds24RoomOffers {
  roomId?: number | string;
  offers?: Beds24Offer[];
}

export interface Beds24Offer {
  offerId?: number | string;
  name?: string;
  price?: number | string;
  currency?: string;
  cancellationPolicy?: string;
  /** Present when the property configures fees separately from the rate. */
  fees?: Array<{ name?: string; amount?: number | string; type?: string }>;
}

/** `POST /bookings` — create or modify. Beds24 takes and returns an array. */
export type Beds24BookingWriteResponse = Array<{
  success?: boolean;
  new?: Beds24Booking;
  modified?: Beds24Booking;
  errors?: Array<{ field?: string; message?: string }>;
}>;

export interface Beds24Booking {
  id?: number | string;
  roomId?: number | string;
  propertyId?: number | string;
  status?: Beds24BookingStatus;
  arrival?: string;
  departure?: string;
  numAdult?: number | string;
  numChild?: number | string;
  price?: number | string;
  referer?: string;
}

/**
 * Beds24 booking statuses.
 *
 * Which of these BLOCK inventory is a per-property SETTING, not a universal
 * rule — see the note in `bookings.ts`. This repository uses `new` for a hold
 * and `confirmed` after payment, because `new` blocks inventory in every
 * documented configuration, and `cancelled` to release.
 */
export type Beds24BookingStatus = 'new' | 'request' | 'confirmed' | 'cancelled' | 'black';

/** The webhook body Beds24 posts on a booking change. */
export interface Beds24WebhookPayload {
  action?: string;
  booking?: Beds24Booking;
  bookingId?: number | string;
  propertyId?: number | string;
  roomId?: number | string;
  timeStamp?: string;
}
