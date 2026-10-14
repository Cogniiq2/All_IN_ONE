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
import {
  listMappedUnits,
  listFailedReservationRefreshes,
  markIntegrationEvent,
  RESERVATION_REFRESH_FAILED,
  type BookableUnit,
} from '@/lib/booking/repository';
import {
  findIntentIdForProviderBooking,
  reservationOfferColumnsAvailable,
  upsertReservation,
  upsertReservationBatch,
} from '@/lib/booking/reservation-repository';
import { observeIntegration, readSchedulerStatus } from '@/lib/booking/commands';
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
  /** True when a provider window hit the reader's own page cap. Widen nothing; investigate. */
  truncated: boolean;
  /** (unit, window) tasks in the horizon this run planned against. */
  tasks: number;
  /** Tasks read and written completely in this run. */
  tasksDone: number;
  /** Tasks that failed at the provider or the database. Retried next cycle; never silent. */
  tasksFailed: number;
  /** Tasks of the current cycle this run did not reach. The next run continues with them. */
  tasksRemaining: number;
  /** The run reached the end of its cycle: every task has been attempted since the cycle began. */
  cycleComplete: boolean;
  /** Where the next scheduled run resumes (`''` = the start of a new cycle). */
  cursor: string;
  /**
   * An explicit re-import the budget cut short: call again with this as
   * `from` to continue. `''` when the range was covered.
   */
  resumeFrom: string;
  /**
   * The exact task an interrupted explicit run stopped at (`<window start>|<unit>`),
   * `''` when the range was covered. Pass it back as `resumeKey` with the
   * same `from`/`to`: unlike `resumeFrom`, it cannot redo a unit already
   * covered in the window where the budget ran out, so a long backfill always
   * advances.
   */
  resumeKey: string;
  /** Outbound requests this run spent (Beds24 and database), and the ceiling it kept under. */
  subrequests: number;
  budget: number;
  /** Units with a failed task in this run, comma-separated slugs ('' when none). */
  failedUnits: string;
}

export interface ReservationSyncOptions {
  /** Restrict to one unit. Omit for every mapped, enabled unit. */
  unitSlug?: string;
  /** Override the backfill start. Used by an operator re-importing a season. */
  from?: string;
  /** Override the forward edge. */
  to?: string;
  /**
   * The scheduled mode: resume the rotation where the previous scheduled run
   * left it (the cursor is read from that run's heartbeat) and refresh the
   * near-term windows first. Explicit ranges never move the cursor.
   */
  resume?: boolean;
  /** Outbound-request ceiling for this run. Default `reservationSyncBudget()`. */
  budget?: number;
  /** Explicit runs only: continue from this task key (a previous run's `resumeKey`). */
  resumeKey?: string;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE REQUEST BUDGET — why one run cannot import the whole horizon.
 *
 * The horizon is twelve months back to eighteen ahead: eleven 90-day windows
 * per unit, so twenty-two Beds24 reads for two units before a single row is
 * written. Written one reservation at a time, with a heartbeat per provider
 * call, one run needed ~80 outbound requests. A Cloudflare Worker on the Free
 * plan may make 50 per invocation; past that every fetch throws, so the last
 * windows failed and the heartbeat that should have said so was refused.
 *
 * So a run SPENDS from a budget (default 40, `RESERVATION_SYNC_SUBREQUEST_BUDGET`)
 * and stops before it could exceed it:
 *
 *   • writes are batched: one read + one upsert per window, not two per row
 *   • one heartbeat per run, not one per provider call
 *   • the horizon is a list of (unit, window) TASKS on windows aligned to a
 *     fixed epoch, so a task is the same task tomorrow; a scheduled run first
 *     refreshes the near-term windows, then continues a rotation over every
 *     task from a cursor kept in its own heartbeat, and the next run resumes
 *     there. Every task is reached every cycle (a few hourly runs).
 *   • a task the budget interrupts is not marked done: it is the next run's
 *     first task. A failed task is counted, named and retried next cycle,
 *     and never stops the other units.
 *
 * Nothing is skipped silently: `tasksRemaining`, `tasksFailed`, `failedUnits`
 * and `cycleComplete` are in the heartbeat the System page reads.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Held back for what the run may spend outside its tasks: a token fetch, one 401 re-auth (token + retry), the final heartbeats. */
const RESERVED_REQUESTS = 5;
/** Near-term windows refreshed on every scheduled run: arrivals from a week ago to this far ahead. */
const HOT_DAYS_AHEAD = 60;
/** The fixed origin every window is aligned to, so a task keeps its identity from day to day. */
const WINDOW_EPOCH = '2000-01-01';
/** The reader's own page cap (lib/integrations/beds24/reservations.ts MAX_PAGES). */
const READER_PAGE_CAP = 25;

export function reservationSyncBudget(): number {
  const n = Number.parseInt(process.env.RESERVATION_SYNC_SUBREQUEST_BUDGET ?? '', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 12), 1000) : 40;
}

interface SyncTask {
  unit: BookableUnit;
  /** Clipped to the horizon; inclusive. */
  from: string;
  to: string;
  /** `<aligned window start>|<unit slug>`: stable, and sorts in rotation order. */
  key: string;
}

/**
 * Import the reservations of the horizon, within the request budget.
 *
 * One unit failing does not stop the pass; a provider that cannot be reached
 * fails each task it is asked for, and the run reports every one.
 */
export async function syncReservations(
  logger: BookingLogger = createLogger(),
  options: ReservationSyncOptions = {}
): Promise<ReservationSyncReport> {
  const today = propertyToday();
  const from = options.from ?? shiftMonths(today, -reservationBackfillMonths());
  const to = options.to ?? shiftMonths(today, inventoryMonths());
  const statuses = reservationStatusFilter();
  const budget = options.budget ?? reservationSyncBudget();
  let spent = 0;
  const left = () => budget - RESERVED_REQUESTS - spent;

  const all = await listMappedUnits();
  spent += 1;
  const units = (options.unitSlug ? all.filter((u) => u.slug === options.unitSlug) : all).filter((u) => u.providerRef);

  // Read in both modes: the scheduled run resumes from it, an explicit run
  // must hand it on unchanged in its own heartbeat.
  const cursor = await readSyncCursor();
  spent += 1;

  // Whether the bedroom-package columns exist yet (migration 20261012). One
  // read per run until they do; never a reason to fail the import.
  const writeOfferColumns = await reservationOfferColumnsAvailable().catch(() => false);
  spent += 1;

  const tasks: SyncTask[] = [];
  for (const unit of units) {
    for (const w of alignedWindows(from, to, reservationWindowDays())) tasks.push({ unit, from: w.from, to: w.to, key: `${w.alignedFrom}|${unit.slug}` });
  }
  tasks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // The order this run works in: near-term first (scheduled runs only), then
  // the rotation from the cursor to the end of the cycle.
  const hot = options.resume ? tasks.filter((t) => t.to >= addDays(today, -7) && t.from <= addDays(today, HOT_DAYS_AHEAD)) : [];
  const explicitStart = !options.resume && options.resumeKey ? tasks.findIndex((t) => t.key >= (options.resumeKey as string)) : 0;
  const start = options.resume ? Math.max(0, tasks.findIndex((t) => t.key >= cursor)) : explicitStart === -1 ? tasks.length : explicitStart;
  const rotation = options.resume && tasks.findIndex((t) => t.key >= cursor) === -1 ? tasks : tasks.slice(start);

  const report: ReservationSyncReport = {
    fetched: 0, inserted: 0, updated: 0, skipped: 0, malformed: 0, failed: 0,
    units: units.length, requests: 0, windowFrom: from, windowTo: to, truncated: false,
    tasks: tasks.length, tasksDone: 0, tasksFailed: 0, tasksRemaining: 0, cycleComplete: false, cursor, resumeFrom: '', resumeKey: '', subrequests: 0, budget, failedUnits: '',
  };
  const failedUnits = new Set<string>();
  const done = new Set<string>();

  /** One task. 'done' | 'failed' (attempted, counted) | 'interrupted' (the budget ran out: redo next run). */
  const runTask = async (task: SyncTask): Promise<'done' | 'failed' | 'interrupted'> => {
    // One page and one batch write (read + upsert) is the least a task costs.
    if (left() < 3) return 'interrupted';
    let read;
    const maxPages = Math.min(READER_PAGE_CAP, left() - 2);
    try {
      read = await readReservations({
        externalPropertyId: String(task.unit.providerRef!.externalPropertyId),
        externalRoomId: String(task.unit.providerRef!.externalRoomId),
        arrivalFrom: task.from,
        arrivalTo: task.to,
        statuses,
        maxPages,
        quiet: true,
      });
    } catch (cause) {
      // A refused read may have been a 401, a token refresh and a retry:
      // charged as three, so a provider refusing every call cannot overspend.
      spent += 3;
      logger.error('reservation.sync', cause, { unitSlug: task.unit.slug, from: task.from, to: task.to });
      failedUnits.add(task.unit.slug);
      return 'failed';
    }
    spent += read.requests;
    report.requests += read.requests;
    report.malformed += read.malformed.length;
    // Stopped by OUR budget with more pages possible: not done, redone next run.
    const interruptedByBudget = read.truncated && maxPages < READER_PAGE_CAP;
    if (read.truncated && !interruptedByBudget) report.truncated = true;

    const items: Array<{ unitId: string; reservation: ProviderReservation; directIntentId: string | null; writeOfferColumns: boolean }> = [];
    for (const reservation of read.reservations) {
      report.fetched += 1;
      const roomId = reservation.externalRoomId;
      if (roomId && roomId !== String(task.unit.providerRef!.externalRoomId)) {
        // Another room's booking: its own unit's task picks it up. Never attributed here.
        report.skipped += 1;
        logger.warn('reservation.sync', { unitSlug: task.unit.slug, externalId: reservation.externalBookingId, outcome: 'skipped_unmapped_room' });
        continue;
      }
      let directIntentId: string | null = null;
      if (reservation.bolagioReference) {
        if (left() < 3) return 'interrupted';
        try {
          directIntentId = await findIntentIdForProviderBooking(reservation.externalBookingId);
        } finally {
          spent += 1;
        }
      }
      items.push({ unitId: task.unit.id, reservation, directIntentId, writeOfferColumns });
    }

    try {
      const written = await upsertReservationBatch(items, Math.max(0, left() - 2));
      spent += written.requests;
      report.inserted += written.inserted;
      report.updated += written.updated;
      if (written.failed.length > 0) {
        report.failed += written.failed.length;
        failedUnits.add(task.unit.slug);
        logger.error('reservation.sync', undefined, { unitSlug: task.unit.slug, from: task.from, to: task.to, count: written.failed.length, outcome: 'failed' });
        return 'failed';
      }
    } catch (cause) {
      spent += 1;
      report.failed += items.length;
      failedUnits.add(task.unit.slug);
      logger.error('reservation.sync', cause, { unitSlug: task.unit.slug, from: task.from, to: task.to });
      return 'failed';
    }
    logger.info('reservation.sync', { unitSlug: task.unit.slug, from: task.from, to: task.to, count: items.length });
    return interruptedByBudget ? 'interrupted' : 'done';
  };

  let stopped = false;
  for (const task of hot) {
    const outcome = await runTask(task);
    if (outcome === 'interrupted') { stopped = true; break; }
    done.add(task.key);
    if (outcome === 'done') report.tasksDone += 1; else report.tasksFailed += 1;
  }

  let next = rotation.length; // index in `rotation` of the first task not reached
  if (!stopped) {
    for (let i = 0; i < rotation.length; i += 1) {
      const task = rotation[i];
      if (done.has(task.key)) continue;
      const outcome = await runTask(task);
      if (outcome === 'interrupted') { next = i; break; }
      done.add(task.key);
      if (outcome === 'done') report.tasksDone += 1; else report.tasksFailed += 1;
    }
  } else {
    next = 0;
  }

  report.tasksRemaining = rotation.slice(next).filter((t) => !done.has(t.key)).length;
  report.cycleComplete = next >= rotation.length;
  // Explicit ranges never move the scheduled rotation.
  report.cursor = options.resume ? (report.cycleComplete ? '' : rotation[next].key) : cursor;
  if (!options.resume && !report.cycleComplete) {
    // Rotation order is by window start, so every window before this one is covered.
    report.resumeFrom = rotation[next].from;
    report.resumeKey = rotation[next].key;
  }
  report.failedUnits = Array.from(failedUnits).sort().join(',');

  // ONE heartbeat for the pass instead of one per provider call.
  const healthy = report.tasksFailed === 0 && report.failed === 0;
  observeIntegration('beds24', healthy ? 'last_success' : 'last_failure', healthy ? `reservation sync: ${report.tasksDone} windows` : `reservation sync: ${report.tasksFailed} window(s) failed (${report.failedUnits || 'rows'})`);
  spent += 1;
  report.subrequests = spent;
  return report;
}

/** Where the previous SCHEDULED run left the rotation. '' when there is none. */
async function readSyncCursor(): Promise<string> {
  try {
    const rows = await readSchedulerStatus();
    const last = rows.find((r) => r.job === 'reservation_sync');
    const cursor = last?.report?.cursor;
    return typeof cursor === 'string' ? cursor : '';
  } catch {
    // No cursor is not an error: the rotation starts from the beginning.
    return '';
  }
}

/**
 * Windows of `days` aligned to a fixed epoch, clipped to [from, to).
 *
 * Aligned so that a window is the same window tomorrow: the rotation cursor
 * names a window by its aligned start, and a horizon that slides by a day
 * must not rename every task under it. Clipped windows are inclusive at both
 * ends, like `windows()`: no arrival falls between two, none is asked twice.
 */
export function alignedWindows(from: string, to: string, days: number): Array<ImportWindow & { alignedFrom: string }> {
  const out: Array<ImportWindow & { alignedFrom: string }> = [];
  if (to <= from) return out;
  const offset = Math.floor(daysBetween(WINDOW_EPOCH, from) / days) * days;
  let alignedFrom = addDays(WINDOW_EPOCH, offset);
  while (alignedFrom < to) {
    const alignedTo = addDays(alignedFrom, days);
    const start = alignedFrom < from ? from : alignedFrom;
    const end = alignedTo < to ? alignedTo : to;
    if (start < end) out.push({ from: start, to: addDays(end, -1), alignedFrom });
    alignedFrom = alignedTo;
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
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
      // The bedroom setup Beds24 recorded (offerId) reaches the local record
      // as soon as a webhook refreshes the booking — confirmed direct
      // bookings included.
      writeOfferColumns: await reservationOfferColumnsAvailable().catch(() => false),
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

  const units = await listMappedUnits();
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

/** How far back a failed webhook refresh is still retried; older ones are the sweep's. */
export const REFRESH_RETRY_WINDOW_MS = 48 * 60 * 60_000;

/**
 * Retry Beds24 webhook deliveries whose reservation refresh failed.
 *
 * Run by the reconcile pass (every few minutes), a few at a time so it stays
 * inside the invocation's subrequest budget. Safe to repeat by construction:
 * a retry is the same GET-then-upsert the webhook performs, keyed on the
 * Beds24 booking id, so it can update a reservation but never duplicate one.
 * A delivery that succeeds is marked `processed`; one that fails again stays
 * `failed` (and rotates to the back), and is counted by the admin alert until
 * it is repaired or the scheduled import covers it.
 */
export async function retryFailedReservationRefreshes(
  logger: BookingLogger = createLogger(),
  { limit = 2, now = new Date() }: { limit?: number; now?: Date } = {}
): Promise<{ retried: number; repaired: number }> {
  const events = await listFailedReservationRefreshes(new Date(now.getTime() - REFRESH_RETRY_WINDOW_MS).toISOString(), limit);
  let repaired = 0;
  for (const event of events) {
    try {
      const outcome = await refreshReservation(event.externalId, logger);
      await markIntegrationEvent(event.id, 'processed');
      repaired += 1;
      logger.info('reservation.sync', { externalId: event.externalId, outcome, retry: 'webhook_refresh' });
    } catch (cause) {
      logger.error('reservation.sync', cause, { externalId: event.externalId, outcome: 'refresh_retry_failed' });
      await markIntegrationEvent(event.id, 'failed', RESERVATION_REFRESH_FAILED).catch(() => {});
    }
  }
  return { retried: events.length, repaired };
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
