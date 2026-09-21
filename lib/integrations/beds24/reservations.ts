import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * READING RESERVATIONS OUT OF BEDS24 — GET only, for ever.
 *
 * This module answers one question: "what is booked?". It exists so BoLaGio
 * has a local, queryable record of the stays that actually happen — the
 * Booking.com and Airbnb reservations the website never sees, the bookings
 * made by hand in Beds24, and the owner blocks — instead of inferring them
 * from closed nights in the availability cache.
 *
 * ── The hard rule of this file ───────────────────────────────────────────
 * Every request it makes is a GET. It never creates, modifies, cancels,
 * confirms or acknowledges anything at the provider. `beds24Request` is
 * called without a `method`, which defaults to GET, and without a body —
 * and `tests/reservations-import.test.ts` asserts that no POST, PUT, PATCH
 * or DELETE is ever issued from this path. The write logic elsewhere in the
 * adapter (holds, confirmation, release) is untouched and unreachable from
 * here.
 *
 * ── What it does not decide ──────────────────────────────────────────────
 * Which unit a booking belongs to (the database mapping decides), whether a
 * booking should be stored (the sync decides), or what a status means for
 * the business. It narrows the provider's answer into a shape the domain can
 * hold, and says honestly when it cannot.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beds24Request } from '@/lib/integrations/beds24/client';
import { toCents } from '@/lib/integrations/beds24/mapper';
import type { Beds24Booking, Beds24BookingsResponse } from '@/lib/integrations/beds24/types';

/* ── The normalised shape ──────────────────────────────────────────────── */

export type ReservationSource = 'booking_com' | 'airbnb' | 'direct' | 'manual' | 'unknown';
export type ReservationClass = 'active' | 'provisional' | 'cancelled' | 'blocked' | 'unknown';

/**
 * One reservation, narrowed. Provider-shaped facts only: nothing here has
 * been interpreted into a BoLaGio decision, and every field the provider did
 * not supply is `undefined` rather than a default.
 */
export interface ProviderReservation {
  externalBookingId: string;
  externalPropertyId?: string;
  externalRoomId?: string;
  providerStatus: string;
  statusClass: ReservationClass;
  source: ReservationSource;
  sourceRaw?: string;
  channelReference?: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  numberOfGuests?: number;
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCountry?: string;
  currency?: string;
  totalAmountCents?: number;
  bookedAt?: string;
  providerModifiedAt?: string;
  providerCancelledAt?: string;
  /** The BoLaGio reference, when the provider echoes one back. Evidence of a direct booking. */
  bolagioReference?: string;
  /** Exactly what arrived. Server-side only; never logged, never returned by an API. */
  raw: Beds24Booking;
}

/** Why a provider booking could not be turned into a reservation. */
export interface MalformedReservation {
  externalBookingId?: string;
  reason: 'no_id' | 'no_dates' | 'bad_range';
}

export interface ReservationReadResult {
  reservations: ProviderReservation[];
  malformed: MalformedReservation[];
  /** True when the reader stopped at its page cap rather than at the end of the data. */
  truncated: boolean;
  /** How many provider requests this read cost. */
  requests: number;
}

/* ── Status ────────────────────────────────────────────────────────────── */

/**
 * The provider's status, read — never renamed.
 *
 * The five values are Beds24's documented booking vocabulary (see
 * `Beds24BookingStatus`). The class exists for exactly one purpose: so a
 * cancelled stay can be kept in the database and left out of occupancy
 * without the interface having to learn Beds24's words. A status this
 * function has not met is `unknown`, which is never counted as a stay.
 */
export function classifyStatus(status: string | undefined): ReservationClass {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'new':
    case 'confirmed':
      return 'active';
    case 'request':
      // Requested, not accepted. Whether a request blocks inventory is a
      // per-property setting; it is never a stay that has happened.
      return 'provisional';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'black':
      // An owner block or maintenance window, not a guest.
      return 'blocked';
    default:
      return 'unknown';
  }
}

/* ── Source ────────────────────────────────────────────────────────────── */

/**
 * The BoLaGio marker written on every reservation this website creates.
 * Mirrors `DIRECT_REFERER` in `live.ts`; kept as its own constant so the
 * reader does not import the write path.
 */
const DIRECT_MARKER = 'bolagio direct';

/**
 * Normalise the channel, on evidence only.
 *
 * ── What is deliberately NOT used ────────────────────────────────────────
 * A guest name, an email domain, a comment, a price, a date, a length of
 * stay. Every one of those correlates with a channel and none of them proves
 * one; a Booking.com guest with a gmail address is not an Airbnb booking, and
 * attributing revenue on a guess is worse than admitting ignorance.
 *
 * Anything without a recognised marker is `unknown`, and `sourceRaw` keeps
 * whatever the provider actually said so the mapping can be revisited once
 * the live values are observed.
 */
export function normalizeSource(raw: string | undefined): ReservationSource {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 'unknown';
  if (/booking\.?com/.test(value)) return 'booking_com';
  if (/airbnb/.test(value)) return 'airbnb';
  if (value === DIRECT_MARKER) return 'direct';
  // Only a literal manual marker. Beds24's actual wording for a booking typed
  // into its own interface is NOT established for this account, so anything
  // else stays `unknown` rather than being attributed to a channel that may
  // not be the truth. See docs/beds24-reservations.md §Source normalisation.
  if (value === 'manual') return 'manual';
  return 'unknown';
}

/** The provider's channel string, read from whichever key carries it. */
function readSourceRaw(booking: Beds24Booking): string | undefined {
  for (const candidate of [booking.channel, booking.apiSource, booking.bookingSource, booking.source, booking.referer]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim().slice(0, 200);
  }
  return undefined;
}

/* ── Narrowing helpers ─────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.slice(0, max);
}

function count(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 200) return undefined;
  return Math.trunc(n);
}

/** A date the provider gave, or nothing. A date is never derived from another. */
function isoDate(value: unknown): string | undefined {
  const t = text(value, 32);
  if (!t) return undefined;
  // Beds24 may carry a date-time; the date part is what a night is keyed on.
  const head = t.slice(0, 10);
  return ISO_DATE.test(head) ? head : undefined;
}

/** A timestamp, or nothing. An unparseable value is dropped, never guessed. */
function timestamp(value: unknown): string | undefined {
  const t = text(value, 64);
  if (!t) return undefined;
  // Beds24 writes `YYYY-MM-DD HH:MM:SS` in places; ISO-8601 elsewhere. Both
  // are read as UTC, which is what the provider documents its clock as.
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t) ? `${t.replace(' ', 'T')}Z` : t;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function currency(value: unknown): string | undefined {
  const t = text(value, 8);
  return t && /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : undefined;
}

function country(value: unknown): string | undefined {
  const t = text(value, 8);
  return t && /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : undefined;
}

/* ── The mapper ────────────────────────────────────────────────────────── */

/**
 * One Beds24 booking → one `ProviderReservation`, or a reason it cannot be.
 *
 * A booking without an id, without both dates, or with a departure that is
 * not after its arrival, is not a stay this system can hold: it is reported
 * as malformed and skipped. Nothing is invented to make it fit.
 */
export function mapReservation(booking: Beds24Booking): ProviderReservation | MalformedReservation {
  const id = text(booking.id, 64) ?? (typeof booking.id === 'number' && Number.isFinite(booking.id) ? String(booking.id) : undefined);
  if (!id) return { reason: 'no_id' };

  const checkIn = isoDate(booking.arrival);
  const checkOut = isoDate(booking.departure);
  if (!checkIn || !checkOut) return { externalBookingId: id, reason: 'no_dates' };
  // Half-open nights: [check_in, check_out). A same-day or reversed range is
  // not a night and the database would refuse it anyway.
  if (checkOut <= checkIn) return { externalBookingId: id, reason: 'bad_range' };

  const providerStatus = text(booking.status, 32) ?? 'unknown';
  const sourceRaw = readSourceRaw(booking);
  const reference = text(booking.reference, 64);

  return {
    externalBookingId: id,
    externalPropertyId: text(booking.propertyId, 64) ?? numberAsText(booking.propertyId),
    externalRoomId: text(booking.roomId, 64) ?? numberAsText(booking.roomId),
    providerStatus,
    statusClass: classifyStatus(providerStatus),
    // A reservation carrying OUR reference is one this website created, which
    // is direct evidence — stronger than any channel string.
    source: reference && /^BLG-[0-9A-Z]{6}$/.test(reference) ? 'direct' : normalizeSource(sourceRaw),
    sourceRaw,
    channelReference: text(booking.apiReference, 100) ?? text(booking.channelReference, 100),
    checkIn,
    checkOut,
    adults: count(booking.numAdult ?? booking.numAdults),
    children: count(booking.numChild ?? booking.numChildren),
    numberOfGuests: count(booking.numGuests),
    guestFirstName: text(booking.firstName, 120),
    guestLastName: text(booking.lastName, 120),
    guestEmail: text(booking.email, 254),
    guestPhone: text(booking.phone, 60),
    guestCountry: country(booking.country),
    currency: currency(booking.currency),
    // Beds24 prices in MAJOR units — the hold writes `price: cents / 100`, so
    // the read is the same conversion in reverse. A price that is not a plain
    // decimal is dropped rather than rounded into a wrong number.
    totalAmountCents: toCents(booking.price),
    bookedAt: timestamp(booking.bookingTime ?? booking.bookingDate),
    providerModifiedAt: timestamp(booking.modifiedTime ?? booking.modified),
    providerCancelledAt: timestamp(booking.cancelTime ?? booking.cancelledTime),
    bolagioReference: reference,
    raw: booking,
  };
}

export function isMalformed(value: ProviderReservation | MalformedReservation): value is MalformedReservation {
  return 'reason' in value;
}

function numberAsText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

/* ── The reads ─────────────────────────────────────────────────────────── */

/**
 * At most this many pages per window. A guard against a provider that never
 * reports the end of its data, not a business limit: the sync splits its
 * horizon into windows small enough that this is never reached in practice,
 * and reports `truncated` if it ever is.
 */
const MAX_PAGES = 25;

export interface ReservationWindow {
  externalPropertyId: string;
  externalRoomId: string;
  /** Inclusive arrival-date lower bound. */
  arrivalFrom: string;
  /** Inclusive arrival-date upper bound. */
  arrivalTo: string;
  /**
   * Provider status values to ask for, when the account is known to accept
   * the filter. Left undefined by default — see `reservationStatusFilter()`
   * in lib/booking/config.ts for why, and how to switch it on.
   */
  statuses?: readonly string[];
}

/**
 * Every reservation whose ARRIVAL falls in a window, for one mapped room.
 *
 * ── Why arrival and not overlap ──────────────────────────────────────────
 * `arrivalFrom` / `arrivalTo` are the two booking-search parameters this
 * repository already uses against this account (`findBookings` in live.ts).
 * A departure-side filter exists in the V2 surface but its parameter names
 * are not established here, and inventing one would mean a query that
 * silently returns nothing. Instead the sync starts its backfill twelve
 * months back, which covers any stay long enough to straddle the window edge.
 */
export async function readReservations(window: ReservationWindow): Promise<ReservationReadResult> {
  const reservations: ProviderReservation[] = [];
  const malformed: MalformedReservation[] = [];
  const seen = new Set<string>();
  let requests = 0;
  let truncated = true;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await beds24Request<Beds24BookingsResponse>({
      // GET. No `method`, no `body`, no idempotency key: there is nothing here
      // that could be mistaken for a write.
      path: '/bookings',
      query: {
        propertyId: window.externalPropertyId,
        roomId: window.externalRoomId,
        arrivalFrom: window.arrivalFrom,
        arrivalTo: window.arrivalTo,
        // Invoice items carry payment lines this import has no use for and
        // would only enlarge the snapshot. Never requested.
        includeInvoiceItems: 'false',
        page,
        ...(window.statuses && window.statuses.length > 0 ? { status: window.statuses.join(',') } : {}),
      },
    });
    requests += 1;

    const rows = Array.isArray(response?.data) ? response.data : [];
    for (const row of rows) {
      const mapped = mapReservation(row);
      if (isMalformed(mapped)) {
        malformed.push(mapped);
        continue;
      }
      // A provider that repeats a booking across pages must not produce two
      // rows; the database unique index is the second guard, not the first.
      if (seen.has(mapped.externalBookingId)) continue;
      seen.add(mapped.externalBookingId);
      reservations.push(mapped);
    }

    if (rows.length === 0) {
      truncated = false;
      break;
    }
    // Only ever used to stop EARLIER than the empty page would. An absent
    // `pages` object costs one extra request, never a missed booking.
    if (response?.pages?.nextPageExists === false) {
      truncated = false;
      break;
    }
  }

  return { reservations, malformed, truncated, requests };
}

/**
 * One reservation by its provider id.
 *
 * Used by the Beds24 webhook: the delivery is a SIGNAL that something
 * changed, and this is the fresh read that establishes what it changed to.
 * The payload itself is never trusted as state.
 */
export async function readReservationById(externalBookingId: string): Promise<ProviderReservation | null> {
  const response = await beds24Request<Beds24BookingsResponse>({
    path: '/bookings',
    query: { id: externalBookingId, includeInvoiceItems: 'false' },
  });
  const row = Array.isArray(response?.data) ? response.data[0] : undefined;
  if (!row) return null;
  const mapped = mapReservation(row);
  return isMalformed(mapped) ? null : mapped;
}
