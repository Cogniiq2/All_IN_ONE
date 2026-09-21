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
 * VERIFIED against a live Beds24 account on 2026-09-17 (GitHub Actions run
 * 35192013491), for the endpoints the booking flow actually depends on:
 *
 *   GET /authentication/token      → { token, expiresIn: 86400 }
 *   GET /properties?propertyId=…   → { data: [ { name, currency, … } ] }
 *   GET /inventory/rooms/calendar  → { data: [ { calendar: [ … ] } ] }
 *
 * The calendar run shape was confirmed exactly as modelled below: `from`/`to`
 * inclusive, `numAvail` a number, `minStay`/`maxStay` numbers, `price1` a
 * number. `closedArrival` and `closedDeparture` were NOT present in the
 * response at all, which the mapper already handles — an absent flag reads as
 * "not closed", which is the correct default.
 *
 * STILL UNVERIFIED: the offers endpoint, the bookings endpoint, and the exact
 * key under which rooms are nested in the properties response. Everything
 * stays optional and `mapper.ts` keeps reading defensively for that reason.
 *
 * ── One endpoint that does NOT exist ─────────────────────────────────────
 * `GET /properties/rooms` returned HTTP 500 with a non-JSON body. It is not a
 * V2 endpoint and nothing in this repository may call it. Rooms are nested
 * inside the properties response — see `Beds24PropertiesResponse`.
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

/**
 * `GET /properties` — the account's properties, and optionally their rooms.
 *
 * Rooms have no endpoint of their own. They arrive nested here when the
 * request carries `includeAllRooms=true`:
 *
 *     GET /properties?includeAllRooms=true
 *
 * This is the call that establishes which Beds24 property and room a BoLaGio
 * unit maps to. It is read-only and is used by `discovery.ts` to build the
 * `bolagio_unit_integrations` rows — never at request time in the guest flow.
 *
 * `name` and `currency` are confirmed present. The nesting key for rooms is
 * accepted under either `roomTypes` or `rooms`, because the two appear in
 * different places in the V2 surface and only the offers endpoint's use of
 * `roomTypes` has been seen first-hand. Whichever is present is read.
 */
export interface Beds24PropertiesResponse {
  success?: boolean;
  data?: Beds24Property[];
}

export interface Beds24Property {
  id?: number | string;
  /** Some responses echo the id under this name instead. */
  propertyId?: number | string;
  name?: string;
  currency?: string;
  /** Not returned by default — absent in the verified live response. */
  timezone?: string;
  city?: string;
  country?: string;
  roomTypes?: Beds24Room[];
  rooms?: Beds24Room[];
}

export interface Beds24Room {
  id?: number | string;
  /** As above: the id is echoed under either key depending on the endpoint. */
  roomId?: number | string;
  name?: string;
  /** Occupancy. `maxPeople` is the V2 name; `qty` is the unit count, not occupancy. */
  maxPeople?: number | string;
  qty?: number | string;
  minStay?: number | string;
  maxStay?: number | string;
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

/**
 * `GET /bookings` — the read-back and the reconciliation search.
 *
 * UNVERIFIED against this account. In particular it is NOT established that
 * Beds24 returns the `reference` field we write on a hold; if it does not, the
 * reconciliation of an uncertain create finds nothing, the operation stays
 * unresolved and escalates to a human — which is the safe failure, and is
 * what the code does. See docs/booking-core-audit.md §5.4.
 */
export interface Beds24BookingsResponse {
  success?: boolean;
  data?: Beds24Booking[];
  /**
   * Pagination, where V2 supplies it. UNVERIFIED, and deliberately not relied
   * on: the reader stops when a page comes back short or empty, and only uses
   * this to stop EARLIER. A missing `pages` object therefore costs one extra
   * request per window, never a missed booking.
   */
  count?: number;
  pages?: {
    nextPageExists?: boolean;
    nextPageLink?: string;
  };
}

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
  /** The BoLaGio reference we write on a hold. Echoed back where supported. */
  reference?: string;

  /*
   * ── Fields the RESERVATION IMPORT reads ─────────────────────────────────
   *
   * Every one of them is optional and every one is narrowed defensively in
   * `reservations.ts`: a booking missing all of them still imports, with the
   * missing facts left null rather than invented. None of them is read by the
   * direct-booking saga, so a wrong guess here cannot affect a hold, a
   * payment or a confirmation.
   *
   * UNVERIFIED against this account — the live read validation in
   * docs/beds24-contract.md §4 has not been run. What IS established is that
   * the V2 booking object carries `id`, `roomId`, `propertyId`, `status`,
   * `arrival` and `departure`, because the write response is read through the
   * same shape today.
   */
  /** The channel the booking came from, where V2 names it directly. */
  channel?: string;
  /** Older/alternate spellings of the same idea. Read in priority order. */
  apiSource?: string;
  apiSourceId?: number | string;
  bookingSource?: string;
  source?: string;
  /** The channel's own confirmation number (a Booking.com reference). */
  apiReference?: string;
  channelReference?: string;
  /** Guest contact. Written by the hold; expected back on a read. */
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  /** ISO-3166 alpha-2 in every form seen; anything else is dropped. */
  country?: string;
  /** Occupancy, in the two spellings V2 uses across endpoints. */
  numAdults?: number | string;
  numChildren?: number | string;
  numGuests?: number | string;
  /** Currency of `price`. */
  currency?: string;
  /** Timestamps. Formats vary; anything unparseable is dropped, not guessed. */
  bookingTime?: string;
  bookingDate?: string;
  modifiedTime?: string;
  modified?: string;
  cancelTime?: string;
  cancelledTime?: string;
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
