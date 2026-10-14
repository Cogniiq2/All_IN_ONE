/**
 * ══════════════════════════════════════════════════════════════════════════
 * CLEANING — pure derivations for the turnover board.
 *
 * A turnover is a fact the booking core derives from a departure — a
 * confirmed direct booking (`bolagio_sync_turnovers`) or an active imported
 * reservation (`bolagio_sync_channel_turnovers`, migration 20261014); nothing
 * here invents one. This file only maps rows to DTOs, attaches what
 * housekeeping needs to know about the stay on either side, decides which of
 * four attention reasons is the most pressing, and sorts the board the way a
 * housekeeper reads it: what is late, what is today, what is next.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { ReservationDto, TurnoverAttention, TurnoverDto, TurnoverEventDto, TurnoverStayDto } from '@/lib/admin/dto';
import type { TurnoverEventRow, TurnoverRow } from '@/lib/admin/rows';
import { getRentalUnit } from '@/lib/content/apartments';

/** A required turnover without an assignee this close to departure needs a name on it. */
export const UNASSIGNED_HORIZON_DAYS = 3;

export const OPEN_TURNOVER_STATUSES = ['required', 'in_progress'] as const;

function isOpen(status: string): boolean {
  return (OPEN_TURNOVER_STATUSES as readonly string[]).includes(status);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * The single most pressing reason to look at a turnover, or null when it is
 * on track. Ordered by cost of ignoring it: a window that has already closed
 * outranks today's work, which outranks a same-day changeover, which outranks
 * a missing name.
 */
export function turnoverAttention(row: Pick<TurnoverRow, 'status' | 'window_end' | 'departure' | 'same_day' | 'assigned_to'>, today: string, now: Date): TurnoverAttention {
  if (!isOpen(row.status)) return null;
  if (Date.parse(row.window_end) < now.getTime()) return 'overdue';
  if (row.departure === today) return 'due_today';
  if (row.same_day) return 'same_day';
  if (row.status === 'required' && !row.assigned_to && daysBetween(today, row.departure) <= UNASSIGNED_HORIZON_DAYS) return 'unassigned';
  return null;
}

function stayOf(r: ReservationDto): TurnoverStayDto {
  return {
    reservationId: r.id,
    guestLabel: r.guestLabel,
    source: r.source,
    adults: r.adults,
    children: r.children,
    guests: r.guests,
    bedroomPackage: r.bedroomPackage,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: r.nights,
  };
}

/**
 * The stay that follows a departure in the same apartment: the earliest
 * occupying stay arriving on or after the departure day. Pure.
 */
export function nextStayAfter(unitSlug: string, departure: string, stays: ReservationDto[], excludeId: string | null = null): ReservationDto | null {
  return (
    stays
      .filter((s) => s.occupies && s.unitSlug === unitSlug && s.id !== excludeId && s.checkIn >= departure)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0] ?? null
  );
}

export function toTurnoverDto(row: TurnoverRow, today: string, now: Date, stays: ReservationDto[] = []): TurnoverDto {
  const departing = row.reservation_id ? stays.find((s) => s.id === row.reservation_id) ?? null : null;
  const arriving = row.next_arrival ? nextStayAfter(row.unit_slug, row.departure, stays, row.reservation_id) : null;
  return {
    id: row.id,
    reference: row.reference,
    origin: row.reservation_id ? 'channel' : 'direct',
    reservationId: row.reservation_id,
    departing: departing ? stayOf(departing) : null,
    arriving: arriving ? stayOf(arriving) : null,
    unitSlug: row.unit_slug,
    unitName: getRentalUnit(row.unit_slug)?.name.de ?? row.unit_slug,
    departure: row.departure,
    nextArrival: row.next_arrival,
    sameDay: row.same_day,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    status: row.status,
    assignedTo: row.assigned_to,
    note: row.note,
    startedAt: row.started_at,
    doneAt: row.done_at,
    doneBy: row.done_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attention: turnoverAttention(row, today, now),
  };
}

export function toTurnoverEventDto(row: TurnoverEventRow): TurnoverEventDto {
  return { id: row.id, fromStatus: row.from_status, toStatus: row.to_status, actor: row.actor, note: row.note, at: row.created_at };
}

export interface CleaningBoard {
  today: string;
  /**
   * Departures of imported stays inside the horizon that have NO turnover
   * record yet, soonest first. Empty once the channel derivation (migration
   * 20261014) has run; before that it is the planning list the board showed
   * for every channel departure, so nothing disappears from the owner's view
   * between the deploy and the migration.
   */
  channelDepartures: ReservationDto[];
  /** Each entry of `channelDepartures` paired with the stay that follows it. Planning only. */
  channelTurnovers: ChannelTurnover[];
  /** Open turnovers whose window has closed, oldest first. */
  overdue: TurnoverDto[];
  /** Open turnovers departing today, same-day changeovers first. */
  dueToday: TurnoverDto[];
  /** Open turnovers after today, soonest first. */
  upcoming: TurnoverDto[];
  /** Turnovers finished or voided recently, most recent first. */
  recent: TurnoverDto[];
  counts: { open: number; overdue: number; sameDay: number; unassigned: number };
}

const ATTENTION_RANK: Record<Exclude<TurnoverAttention, null>, number> = { overdue: 0, due_today: 1, same_day: 2, unassigned: 3 };

function byUrgency(a: TurnoverDto, b: TurnoverDto): number {
  const ra = a.attention ? ATTENTION_RANK[a.attention] : 9;
  const rb = b.attention ? ATTENTION_RANK[b.attention] : 9;
  // Equal urgency: a same-day changeover has a guest waiting on it, so it comes first; then by window.
  return ra - rb || Number(b.sameDay) - Number(a.sameDay) || a.windowStart.localeCompare(b.windowStart) || a.unitName.localeCompare(b.unitName);
}

export interface ChannelTurnover {
  departure: ReservationDto;
  /** The next occupying stay in the same apartment, from any channel; null when none is booked yet. */
  next: ReservationDto | null;
  /** The next guests arrive the day these leave. */
  sameDay: boolean;
  /** Free nights between departure and the next arrival; null when nothing follows. */
  gapNights: number | null;
}

/**
 * Pair every departure with the stay that follows it. Pure: only stays that
 * occupy the unit count, on either side. What the arriving guests need —
 * party size and, when Beds24 knows it, the bedroom setup — travels with
 * `next`; a channel booking's setup is unknown and stays unknown.
 */
export function channelTurnoversOf(departures: ReservationDto[], stays: ReservationDto[]): ChannelTurnover[] {
  return departures.map((departure) => {
    const next = nextStayAfter(departure.unitSlug, departure.checkOut, stays, departure.id);
    const gapNights = next ? daysBetween(departure.checkOut, next.checkIn) : null;
    return { departure, next, sameDay: gapNights === 0, gapNights };
  });
}

export function buildCleaningBoard(
  rows: TurnoverRow[],
  today: string,
  now: Date,
  channelDepartures: ReservationDto[] = [],
  /** Every upcoming channel stay, departing in the horizon or later — the "next arrival" side. Defaults to the departures. */
  channelStays: ReservationDto[] = channelDepartures,
  /** Departures on or after this date are outside the planning horizon. */
  horizonEnd: string | null = null
): CleaningBoard {
  const all = rows.map((r) => toTurnoverDto(r, today, now, channelStays));
  const open = all.filter((t) => isOpen(t.status));
  const overdue = open.filter((t) => t.attention === 'overdue').sort((a, b) => a.windowEnd.localeCompare(b.windowEnd));
  const dueToday = open.filter((t) => t.attention !== 'overdue' && t.departure === today).sort(byUrgency);
  const upcoming = open.filter((t) => t.attention !== 'overdue' && t.departure > today).sort((a, b) => a.departure.localeCompare(b.departure) || byUrgency(a, b));
  const recent = all
    .filter((t) => !isOpen(t.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  // A departure with a turnover record (any status but void) is work on the
  // board above, not a plan; only the ones nothing has derived yet remain.
  const covered = new Set(rows.filter((r) => r.reservation_id && r.status !== 'void').map((r) => r.reservation_id as string));
  const planned = departuresIn(channelDepartures, today, horizonEnd).filter((r) => !covered.has(r.id));
  return {
    today,
    channelDepartures: planned,
    channelTurnovers: channelTurnoversOf(planned, channelStays),
    overdue,
    dueToday,
    upcoming,
    recent,
    counts: {
      open: open.length,
      overdue: overdue.length,
      sameDay: open.filter((t) => t.sameDay).length,
      unassigned: open.filter((t) => t.status === 'required' && !t.assignedTo).length,
    },
  };
}

function departuresIn(stays: ReservationDto[], today: string, horizonEnd: string | null): ReservationDto[] {
  return stays
    .filter((r) => r.occupies && r.checkOut >= today && (!horizonEnd || r.checkOut < horizonEnd))
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.unitName.localeCompare(b.unitName));
}
