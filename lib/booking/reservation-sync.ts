import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE RESERVATION IMPORT.
 *
 * Reads what is booked at Beds24 and writes it into `bolagio_reservations`.
 * It is the second scheduled job against the channel manager, beside the
 * inventory sync, and it answers a different question:
 *
 *   bolagio_unit_inventory_days   IS A NIGHT FREE      (availability)
 *   bolagio_reservations          WHO IS STAYING       (the reservation)
 *
 * Neither replaces the other. The inventory cache stays the availability
 * authority and its sync is untouched by this file.
 *
 * ── Read-only, and structurally so ───────────────────────────────────────
 * Every provider call this module makes goes through
 * `lib/integrations/beds24/reservations.ts`, which issues GETs and nothing
 * else. No status is written back, no reservation is acknowledged, nothing is
 * cancelled, nothing is confirmed. A reservation BoLaGio did not create is
 * never touched at the provider — import means import.
 *
 * ── Which bookings are imported ──────────────────────────────────────────
 * Only those on a room that `bolagio_unit_integrations` maps to a BoLaGio
 * unit with the mapping ENABLED. Today that is the two Schulstraße rooms. A
 * booking on any other room is skipped and counted; it is not an error and it
 * is not stored. The Opernstraße units have no mapping and stay out of this
 * entirely.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { createLogger, type BookingLogger } from '@/lib/booking/logger';
import { inventoryMonths, reservationBackfillMonths, reservationStatusFilter, reservationWindowDays } from '@/lib/booking/config';
import { listBookableUnits, type BookableUnit } from '@/lib/booking/repository';
import { findIntentIdForProviderBooking, upsertReservation } from '@/lib/booking/reservation-repository';
import { readReservationById, readReservations, type ProviderReservation } from '@/lib/integrations/beds24/reservations';
import { propertyToday } from '@/lib/booking/stay-rules';

/**
 * What one import pass did. Counts only — there is no guest data in this
 * object and the sync endpoint returns it verbatim, so there cannot be.
 */
export interface ReservationSyncReport {
  /** Reservations the provider returned, after de-duplication. */
  fetched: number;
  inserted: number;
  updated: number;
  /** Returned by the provider on a room no enabled mapping covers. */
  skipped: number;
  /** Provider rows without an id, without dates, or with a reversed range. */
  malformed: number;
  /** Reservations that could not be written. The pass continues past each one. */
  failed: number;
  /** Mapped, enabled units the pass covered. */
  units: number;
  /** Provider requests issued. */
  requests: number;
  windowFrom: string;
  windowTo: string;
  /** True when a provider window hit the reader's page cap. Widen nothing; investigate. */
  truncated: boolean;
}

export interface ReservationSyncOptions {
  /** Restrict to one unit. Omit for every mapped, enabled unit. */
  unitSlug?: string;
  /** Override the backfill start. Used by an operator re-importing a season. */
  from?: string;
  /** Override the forward edge. */
  to?: string;
}

/**
 * Import every reservation in the horizon.
 *
 * Default horizon: twelve months back through the inventory horizon ahead
 * (eighteen months), split into ninety-day windows. Windows overlap nothing
 * and need not: the upsert is idempotent on the provider's booking id, so a
 * reservation appearing in two windows is written twice into one row.
 *
 * One unit failing does not stop the pass. A pass that cannot reach the
 * provider at all throws, and the route records the failure against the
 * scheduler heartbeat.
 */
export async function syncReservations(
  logger: BookingLogger = createLogger(),
  options: ReservationSyncOptions = {}
): Promise<ReservationSyncReport> {
  const today = propertyToday();
  const from = options.from ?? shiftMonths(today, -reservationBackfillMonths());
  const to = options.to ?? shiftMonths(today, inventoryMonths());
  const statuses = reservationStatusFilter();

  const all = await listBookableUnits();
  const units = (options.unitSlug ? all.filter((u) => u.slug === options.unitSlug) : all).filter((u) => u.providerRef);

  const report: ReservationSyncReport = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    malformed: 0,
    failed: 0,
    units: units.length,
    requests: 0,
    windowFrom: from,
    windowTo: to,
    truncated: false,
  };

  for (const unit of units) {
    const started = Date.now();
    let unitFetched = 0;
    try {
      for (const window of windows(from, to, reservationWindowDays())) {
        const result = await readReservations({
          externalPropertyId: String(unit.providerRef!.externalPropertyId),
          externalRoomId: String(unit.providerRef!.externalRoomId),
          arrivalFrom: window.from,
          arrivalTo: window.to,
          statuses,
        });
        report.requests += result.requests;
        report.malformed += result.malformed.length;
        if (result.truncated) report.truncated = true;

        for (const reservation of result.reservations) {
          unitFetched += 1;
          report.fetched += 1;
          const outcome = await store(reservation, unit, logger);
          if (outcome === 'inserted') report.inserted += 1;
          else if (outcome === 'updated') report.updated += 1;
          else if (outcome === 'skipped') report.skipped += 1;
          else report.failed += 1;
        }
      }
      logger.info('reservation.sync', {
        unitSlug: unit.slug,
        from,
        to,
        count: unitFetched,
        durationMs: Date.now() - started,
      });
    } catch (cause) {
      report.failed += 1;
      logger.error('reservation.sync', cause, { unitSlug: unit.slug, from, to });
    }
  }

  return report;
}

type StoreOutcome = 'inserted' | 'updated' | 'skipped' | 'failed';

/**
 * Write one reservation against the unit the provider room maps to.
 *
 * The room the PROVIDER reports is what decides the unit, not the unit whose
 * window the query used: a channel manager answering with a booking on a
 * different room is a mapping problem, and silently filing it under the
 * queried unit would put someone else's guest in a BoLaGio apartment.
 */
async function store(reservation: ProviderReservation, queried: BookableUnit, logger: BookingLogger): Promise<StoreOutcome> {
  const roomId = reservation.externalRoomId;
  if (roomId && roomId !== String(queried.providerRef!.externalRoomId)) {
    // Not this unit's booking. It may belong to another mapped unit, and the
    // pass over that unit will pick it up from its own query; it is never
    // attributed here.
    logger.warn('reservation.sync', {
      unitSlug: queried.slug,
      externalId: reservation.externalBookingId,
      outcome: 'skipped_unmapped_room',
    });
    return 'skipped';
  }

  try {
    // Evidence, not inference: a provider booking carrying a BoLaGio
    // reference and matching a local intent IS that direct booking.
    const directIntentId = reservation.bolagioReference
      ? await findIntentIdForProviderBooking(reservation.externalBookingId)
      : null;

    const outcome = await upsertReservation({
      unitId: queried.id,
      reservation,
      directIntentId,
    });

    logger.info('reservation.sync', {
      unitSlug: queried.slug,
      externalId: reservation.externalBookingId,
      status: reservation.providerStatus,
      outcome,
    });
    return outcome;
  } catch (cause) {
    logger.error('reservation.sync', cause, {
      unitSlug: queried.slug,
      externalId: reservation.externalBookingId,
      outcome: 'failed',
    });
    return 'failed';
  }
}

/**
 * Why a single-reservation refresh did nothing, when it did nothing.
 *
 * The two cases used to share a `null`, and the webhook logged both as
 * `skipped_unmapped_room`. They are not the same thing at all: one is a
 * booking on someone else's room, which is ordinary and expected, and the
 * other is the provider not returning a booking it was just told about,
 * which is worth seeing in the logs.
 */
export type RefreshOutcome = StoreOutcome | 'not_found_at_provider' | 'skipped_unmapped_room';

/**
 * Refresh ONE reservation from the provider, by id.
 *
 * The Beds24 webhook's follow-up. The delivery says a booking changed; this
 * establishes what it changed to by asking the provider, because a webhook
 * payload is a claim about the past that may arrive late, twice or forged.
 *
 * ── Cancellations ────────────────────────────────────────────────────────
 * A cancelled booking is imported like any other: Beds24 keeps it and returns
 * it with `status: cancelled`, the mapper classifies it, and the upsert
 * writes that status over the stored one. That is how a cancellation reaches
 * the board within seconds.
 *
 * What is NOT done is inferring a cancellation from a booking the provider
 * did not return. Absence is evidence of nothing — a filtered read, a
 * transient provider fault and a genuine deletion look identical from here —
 * and a stay that vanishes from the interface the moment a read hiccups is
 * worse than one that is a few minutes stale. The scheduled import is the
 * floor under this; `not_found_at_provider` makes the case visible meanwhile.
 */
export async function refreshReservation(
  externalBookingId: string,
  logger: BookingLogger = createLogger()
): Promise<RefreshOutcome> {
  const reservation = await readReservationById(externalBookingId);
  if (!reservation) {
    logger.warn('reservation.sync', { externalId: externalBookingId, outcome: 'not_found_at_provider' });
    return 'not_found_at_provider';
  }

  const units = await listBookableUnits();
  const unit = units.find(
    (u) =>
      u.providerRef &&
      String(u.providerRef.externalRoomId) === reservation.externalRoomId &&
      (!reservation.externalPropertyId || String(u.providerRef.externalPropertyId) === reservation.externalPropertyId)
  );
  if (!unit) {
    logger.warn('reservation.sync', { externalId: externalBookingId, outcome: 'skipped_unmapped_room' });
    return 'skipped_unmapped_room';
  }

  return store(reservation, unit, logger);
}

/* ── Windows ───────────────────────────────────────────────────────────── */

export interface ImportWindow {
  /** Inclusive. */
  from: string;
  /** Inclusive — the provider's arrival filter is inclusive at both ends. */
  to: string;
}

/**
 * Split `[from, to)` into inclusive provider windows of at most `days`.
 *
 * Inclusive on both ends because `arrivalFrom` / `arrivalTo` are, and
 * adjacent windows therefore stop one day short of the next one's start: a
 * reservation is never asked for twice, and — more importantly — never
 * falls between two windows.
 */
export function windows(from: string, to: string, days: number): ImportWindow[] {
  const out: ImportWindow[] = [];
  if (to <= from) return out;
  let cursor = from;
  while (cursor < to) {
    const next = addDays(cursor, days);
    const end = next < to ? next : to;
    out.push({ from: cursor, to: addDays(end, -1) });
    cursor = end;
  }
  return out;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Shift by whole months, clamping the day of month.
 *
 * 31 March minus one month is 28 (or 29) February, never 3 March: a backfill
 * boundary that skips forward past its own start would leave a gap.
 */
export function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
