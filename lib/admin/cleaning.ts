/**
 * ══════════════════════════════════════════════════════════════════════════
 * CLEANING — pure derivations for the turnover board.
 *
 * A turnover is a fact the booking core derives from confirmed departures
 * (`bolagio_sync_turnovers`); nothing here invents one. This file only maps
 * rows to DTOs, decides which of four attention reasons is the most pressing,
 * and sorts the board the way a housekeeper reads it: what is late, what is
 * today, what is next.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { TurnoverAttention, TurnoverDto, TurnoverEventDto } from '@/lib/admin/dto';
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

export function toTurnoverDto(row: TurnoverRow, today: string, now: Date): TurnoverDto {
  return {
    id: row.id,
    reference: row.reference,
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

export function buildCleaningBoard(rows: TurnoverRow[], today: string, now: Date): CleaningBoard {
  const all = rows.map((r) => toTurnoverDto(r, today, now));
  const open = all.filter((t) => isOpen(t.status));
  const overdue = open.filter((t) => t.attention === 'overdue').sort((a, b) => a.windowEnd.localeCompare(b.windowEnd));
  const dueToday = open.filter((t) => t.attention !== 'overdue' && t.departure === today).sort(byUrgency);
  const upcoming = open.filter((t) => t.attention !== 'overdue' && t.departure > today).sort((a, b) => a.departure.localeCompare(b.departure) || byUrgency(a, b));
  const recent = all
    .filter((t) => !isOpen(t.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  return {
    today,
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
