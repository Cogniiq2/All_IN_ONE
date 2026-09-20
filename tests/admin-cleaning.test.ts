/**
 * ══════════════════════════════════════════════════════════════════════════
 * CLEANING BOARD — attention derivation and ordering, pure.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { buildCleaningBoard, turnoverAttention } from '@/lib/admin/cleaning';
import type { TurnoverRow } from '@/lib/admin/rows';

const NOW = new Date('2026-09-20T10:00:00Z'); // 12:00 in Berlin
const TODAY = '2026-09-20';

function row(over: Partial<TurnoverRow>): TurnoverRow {
  const departure = over.departure ?? TODAY;
  return {
    id: over.id ?? 'tv',
    unit_id: 'u', intent_id: 'i', departure,
    window_start: `${departure}T09:00:00Z`, window_end: `${departure}T12:00:00Z`,
    next_arrival: null, same_day: false, status: 'required', assigned_to: null, note: null,
    started_at: null, done_at: null, done_by: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    reference: 'BLG-AAAAAA', unit_slug: 'schulstrasse-i',
    ...over,
  };
}

describe('turnoverAttention', () => {
  it('a closed turnover never needs attention', () => {
    expect(turnoverAttention(row({ status: 'done', window_end: '2026-09-19T12:00:00Z' }), TODAY, NOW)).toBeNull();
    expect(turnoverAttention(row({ status: 'void', window_end: '2026-09-19T12:00:00Z' }), TODAY, NOW)).toBeNull();
  });
  it('a window that has closed is overdue, whatever else is true', () => {
    expect(turnoverAttention(row({ window_end: '2026-09-20T09:59:00Z', same_day: true, assigned_to: 'M' }), TODAY, NOW)).toBe('overdue');
  });
  it('today outranks same-day; same-day outranks unassigned', () => {
    expect(turnoverAttention(row({ window_end: '2026-09-20T14:00:00Z', same_day: true }), TODAY, NOW)).toBe('due_today');
    expect(turnoverAttention(row({ departure: '2026-09-22', same_day: true }), TODAY, NOW)).toBe('same_day');
    expect(turnoverAttention(row({ departure: '2026-09-22' }), TODAY, NOW)).toBe('unassigned');
  });
  it('unassigned only inside the horizon, and only while still required', () => {
    expect(turnoverAttention(row({ departure: '2026-09-23' }), TODAY, NOW)).toBe('unassigned');
    expect(turnoverAttention(row({ departure: '2026-09-24' }), TODAY, NOW)).toBeNull();
    expect(turnoverAttention(row({ departure: '2026-09-22', assigned_to: 'Maria' }), TODAY, NOW)).toBeNull();
    expect(turnoverAttention(row({ departure: '2026-09-22', status: 'in_progress' }), TODAY, NOW)).toBeNull();
  });
});

describe('buildCleaningBoard', () => {
  const rows = [
    row({ id: 'late', departure: '2026-09-19', status: 'in_progress' }),
    row({ id: 'today-plain', window_end: '2026-09-20T14:00:00Z' }),
    row({ id: 'today-same', window_end: '2026-09-20T14:00:00Z', same_day: true, window_start: '2026-09-20T09:30:00Z' }),
    row({ id: 'soon', departure: '2026-09-22' }),
    row({ id: 'later', departure: '2026-10-05', assigned_to: 'Maria' }),
    row({ id: 'done', departure: '2026-09-18', status: 'done', updated_at: '2026-09-18T12:00:00Z' }),
    row({ id: 'void', departure: '2026-09-25', status: 'void', updated_at: '2026-09-19T12:00:00Z' }),
  ];
  const board = buildCleaningBoard(rows, TODAY, NOW);

  it('files each turnover in exactly one group', () => {
    expect(board.overdue.map((t) => t.id)).toEqual(['late']);
    expect(board.dueToday.map((t) => t.id)).toEqual(['today-same', 'today-plain']);
    expect(board.upcoming.map((t) => t.id)).toEqual(['soon', 'later']);
    expect(board.recent.map((t) => t.id)).toEqual(['void', 'done']);
    const all = [...board.overdue, ...board.dueToday, ...board.upcoming, ...board.recent];
    expect(new Set(all.map((t) => t.id)).size).toBe(rows.length);
  });

  it('counts what the header shows', () => {
    expect(board.counts).toEqual({ open: 5, overdue: 1, sameDay: 1, unassigned: 3 });
  });

  it('names the unit from the content file, never from the slug alone', () => {
    expect(board.overdue[0].unitName).not.toBe('schulstrasse-i');
  });
});
