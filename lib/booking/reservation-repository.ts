import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATA ACCESS for canonical reservations.
 *
 * `bolagio_reservations` is the local record of what is ACTUALLY BOOKED at
 * the channel manager, across every channel. This file is the only place its
 * columns are named, in the same shape as `repository.ts` does for the
 * booking core.
 *
 * ── The one invariant this file exists to hold ───────────────────────────
 * One provider booking is one row, for ever. Identity is
 * `(provider, external_booking_id)`, backed by a unique index; every import
 * is an upsert on that key, so the tenth sync of the same Booking.com
 * reservation updates one row rather than inserting a tenth.
 *
 * ── What it never does ───────────────────────────────────────────────────
 * Delete. A cancelled reservation keeps its row with its cancelled status —
 * it is operational and accounting history, and a stay that vanishes from
 * the interface the day a guest cancels is how a dispute becomes unanswerable.
 * A reservation that simply stops appearing in a bounded date query has left
 * the window, which is evidence of nothing at all.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { ProviderReservation, ReservationClass, ReservationSource } from '@/lib/integrations/beds24/reservations';

export interface ReservationRecord {
  id: string;
  unitId: string;
  provider: string;
  externalBookingId: string;
  source: ReservationSource;
  providerStatus: string;
  statusClass: ReservationClass;
  checkIn: string;
  checkOut: string;
}

export interface UpsertReservationInput {
  unitId: string;
  reservation: ProviderReservation;
  /** Set when the reservation is provably one of BoLaGio's own direct bookings. */
  directIntentId?: string | null;
  /**
   * Whether the database has the 20261012 columns (`external_offer_id`,
   * `bedroom_package`). Decided once per sync run by
   * `reservationOfferColumnsAvailable()`; when false or absent they are simply
   * not written, so the hourly import keeps working on a database the
   * migration has not reached yet.
   */
  writeOfferColumns?: boolean;
}

let offerColumnsConfirmed = false;

/**
 * Does `bolagio_reservations` have the 20261012 offer columns?
 *
 * One cheap read (no rows needed), and only until it has once said yes:
 * columns are never dropped in normal operation, and a "no" is re-asked on the
 * next run so applying the migration takes effect without a redeploy.
 */
export async function reservationOfferColumnsAvailable(): Promise<boolean> {
  if (offerColumnsConfirmed) return true;
  const { error } = await supabaseAdmin().from('bolagio_reservations').select('external_offer_id').limit(1);
  if (error) return false;
  offerColumnsConfirmed = true;
  return true;
}

export type UpsertOutcome = 'inserted' | 'updated';

/**
 * Write one reservation, idempotently.
 *
 * ── Why this is not a blind upsert ───────────────────────────────────────
 * PostgREST's `upsert` replaces the row. That would let a provider answer
 * that happens to omit the guest email — a shorter payload on a list read
 * than on a single-booking read, say — erase an address an operator needs to
 * reach the guest. So the existing row is read first, and a provider value
 * that is absent LEAVES THE STORED VALUE ALONE. Nulling a column is only ever
 * the result of the provider being asked and answering nothing, which is not
 * something a read can distinguish from "not included in this response".
 *
 * The exceptions are the facts the provider is definitionally authoritative
 * about and always sends: status, dates and the snapshot. Those are written
 * on every sync, because a stale status is the failure this whole import
 * exists to prevent.
 */
export async function upsertReservation(input: UpsertReservationInput): Promise<UpsertOutcome> {
  const db = supabaseAdmin();
  const r = input.reservation;
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await db
    .from('bolagio_reservations')
    .select('id')
    .eq('provider', 'beds24')
    .eq('external_booking_id', r.externalBookingId)
    .maybeSingle();
  if (readError) throw readError;

  const { authoritative, optional } = reservationColumns(input, now);

  if (existing?.id) {
    const { error } = await db
      .from('bolagio_reservations')
      .update({ ...authoritative, ...optional })
      .eq('id', existing.id as string);
    if (error) throw error;
    return 'updated';
  }

  const { error } = await db.from('bolagio_reservations').insert({
    provider: 'beds24',
    external_booking_id: r.externalBookingId,
    imported_at: now,
    ...authoritative,
    ...optional,
  });

  if (error) {
    // Two overlapping sync passes can both find no row and both insert. The
    // unique index is what makes that harmless: the loser re-reads and
    // updates, so the outcome is one row either way.
    if (isUniqueViolation(error)) {
      const { error: retryError } = await db
        .from('bolagio_reservations')
        .update({ ...authoritative, ...optional })
        .eq('provider', 'beds24')
        .eq('external_booking_id', r.externalBookingId);
      if (retryError) throw retryError;
      return 'updated';
    }
    throw error;
  }
  return 'inserted';
}

/** The columns one reservation writes: always-rewritten facts, and facts written only when supplied. */
function reservationColumns(input: UpsertReservationInput, now: string) {
  const r = input.reservation;
  /** Columns the provider is authoritative about on every read. */
  const authoritative = {
    unit_id: input.unitId,
    provider_status: r.providerStatus,
    status_class: r.statusClass,
    check_in: r.checkIn,
    check_out: r.checkOut,
    source: r.source,
    raw_provider_snapshot: r.raw as unknown as Record<string, unknown>,
    last_synced_at: now,
    last_seen_at: now,
  };

  /** Columns written only when the provider supplied a value. */
  const optional = defined({
    external_property_id: r.externalPropertyId,
    external_room_id: r.externalRoomId,
    source_raw: r.sourceRaw,
    external_source_id: r.sourceApiId,
    channel_reference: r.channelReference,
    adults: r.adults,
    children: r.children,
    number_of_guests: r.numberOfGuests,
    guest_first_name: r.guestFirstName,
    guest_last_name: r.guestLastName,
    guest_email: r.guestEmail,
    guest_phone: r.guestPhone,
    guest_country: r.guestCountry,
    currency: r.currency,
    total_amount_cents: r.totalAmountCents,
    booked_at: r.bookedAt,
    provider_created_at: r.bookedAt,
    provider_modified_at: r.providerModifiedAt,
    provider_cancelled_at: r.providerCancelledAt,
    direct_intent_id: input.directIntentId ?? undefined,
    ...(input.writeOfferColumns
      ? { external_offer_id: r.externalOfferId, bedroom_package: r.bedroomPackage }
      : {}),
  });
  return { authoritative, optional };
}

export interface BatchUpsertResult {
  inserted: number;
  updated: number;
  /** External booking ids whose write failed. Each is reported; none is dropped silently. */
  failed: string[];
  /** Database requests this call issued — the caller's subrequest accounting. */
  requests: number;
}

/**
 * Write many reservations of ONE unit in a bounded number of requests.
 *
 * The same semantics as `upsertReservation`, in 1 + (distinct column shapes)
 * requests instead of two per reservation:
 *
 *   1. one read of which of these ids already exist (inserted vs updated,
 *      and `imported_at` only on a first sight);
 *   2. one `INSERT … ON CONFLICT (provider, external_booking_id) DO UPDATE`
 *      per GROUP of rows carrying exactly the same columns.
 *
 * Grouping by column shape is what keeps "an absent provider value never
 * erases a stored one": PostgREST's merge upsert sets exactly the columns in
 * the payload, and a payload that mixed shapes would have to fill the
 * missing keys with null. Within a group every row supplies every column, so
 * nothing absent is written. A Beds24 list read returns one shape for almost
 * every row, so this is normally two requests for a whole window.
 *
 * A group the database refuses (one malformed row fails its whole statement)
 * is retried row by row through `upsertReservation`, as far as `rowBudget`
 * allows, so one bad reservation never blocks the others. Rows it cannot
 * afford or cannot write are returned in `failed`.
 */
export async function upsertReservationBatch(
  items: UpsertReservationInput[],
  rowBudget: number = Number.POSITIVE_INFINITY
): Promise<BatchUpsertResult> {
  const result: BatchUpsertResult = { inserted: 0, updated: 0, failed: [], requests: 0 };
  if (items.length === 0) return result;
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const ids = Array.from(new Set(items.map((i) => i.reservation.externalBookingId)));

  const { data: existingRows, error: readError } = await db
    .from('bolagio_reservations')
    .select('external_booking_id')
    .eq('provider', 'beds24')
    .in('external_booking_id', ids);
  result.requests += 1;
  if (readError) throw readError;
  const existing = new Set(((existingRows ?? []) as Array<{ external_booking_id: string }>).map((r) => r.external_booking_id));

  const groups = new Map<string, { rows: Record<string, unknown>[]; items: UpsertReservationInput[] }>();
  for (const item of items) {
    const { authoritative, optional } = reservationColumns(item, now);
    const isNew = !existing.has(item.reservation.externalBookingId);
    const row: Record<string, unknown> = {
      provider: 'beds24',
      external_booking_id: item.reservation.externalBookingId,
      ...(isNew ? { imported_at: now } : {}),
      ...authoritative,
      ...optional,
    };
    const shape = Object.keys(row).sort().join(',');
    const group = groups.get(shape) ?? { rows: [], items: [] };
    group.rows.push(row);
    group.items.push(item);
    groups.set(shape, group);
  }

  let rowsLeft = rowBudget;
  for (const group of Array.from(groups.values())) {
    const { error } = await db.from('bolagio_reservations').upsert(group.rows, { onConflict: 'provider,external_booking_id' });
    result.requests += 1;
    if (!error) {
      for (const item of group.items) {
        if (existing.has(item.reservation.externalBookingId)) result.updated += 1;
        else result.inserted += 1;
      }
      continue;
    }
    // Row by row, so the one bad reservation is isolated. Up to three
    // requests each (read, write, and the re-write after a racing insert).
    for (const item of group.items) {
      if (rowsLeft < 3) {
        result.failed.push(item.reservation.externalBookingId);
        continue;
      }
      rowsLeft -= 3;
      result.requests += 3;
      try {
        const outcome = await upsertReservation(item);
        if (outcome === 'inserted') result.inserted += 1;
        else result.updated += 1;
      } catch {
        result.failed.push(item.reservation.externalBookingId);
      }
    }
  }
  return result;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

/** Drop every key whose value is `undefined`, so a missing fact never writes a null. */
function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * The direct-booking intent that a provider booking belongs to, if any.
 *
 * Used to set `direct_intent_id` and to attribute the source as `direct` on
 * evidence rather than on a channel string. It reads the booking core; it
 * never writes to it.
 */
export async function findIntentIdForProviderBooking(externalBookingId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select('id')
    .eq('beds24_booking_id', externalBookingId)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/** Every reservation overlapping a half-open window. Server-side reads only. */
export async function readReservationsInWindow(from: string, to: string): Promise<ReservationRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_reservations')
    .select('id, unit_id, provider, external_booking_id, source, provider_status, status_class, check_in, check_out')
    .lt('check_in', to)
    .gt('check_out', from)
    .order('check_in', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, string>>).map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    provider: row.provider,
    externalBookingId: row.external_booking_id,
    source: row.source as ReservationSource,
    providerStatus: row.provider_status,
    statusClass: row.status_class as ReservationClass,
    checkIn: row.check_in,
    checkOut: row.check_out,
  }));
}
