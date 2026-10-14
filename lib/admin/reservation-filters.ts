/**
 * The channel-reservation list's filters, as URL state.
 *
 * Every value is validated against a closed list or a date shape before it
 * reaches a query: the URL is user input.
 */

import { isIsoDate } from '@/lib/booking/stay-rules';
import type { ReservationQuery } from '@/lib/admin/rows';

export const RESERVATION_SOURCES = ['booking_com', 'airbnb', 'direct', 'manual', 'unknown'] as const;
export const RESERVATION_STATUS_CLASSES = ['active', 'cancelled', 'provisional', 'blocked', 'unknown'] as const;
export const RESERVATION_WHEN = ['upcoming', 'current', 'past', 'cancelled', 'all'] as const;

export type ReservationWhen = (typeof RESERVATION_WHEN)[number];

export interface ReservationFilter {
  /** Guest name, OTA reference or Beds24 booking id. */
  q: string;
  unit: string | null;
  source: (typeof RESERVATION_SOURCES)[number] | null;
  status: (typeof RESERVATION_STATUS_CLASSES)[number] | null;
  /** Stays touching [from, to) — the dates an operator means by "in this period". */
  from: string | null;
  to: string | null;
  /**
   * upcoming: booked, not yet departed (default) · current: in house tonight · past: departed · cancelled: the
   * cancelled history · all. The date filters replace the time segment; a status filter replaces the implied class.
   */
  when: ReservationWhen;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const oneOf = <T extends readonly string[]>(list: T, v: string): T[number] | null => (list as readonly string[]).includes(v) ? (v as T[number]) : null;

export function parseReservationFilter(params: Params): ReservationFilter {
  const from = one(params.from);
  const to = one(params.to);
  return {
    q: one(params.q).slice(0, 80),
    unit: /^[a-z0-9-]{2,64}$/.test(one(params.unit)) ? one(params.unit) : null,
    source: oneOf(RESERVATION_SOURCES, one(params.source)),
    status: oneOf(RESERVATION_STATUS_CLASSES, one(params.status)),
    from: isIsoDate(from) ? from : null,
    to: isIsoDate(to) ? to : null,
    when: oneOf(RESERVATION_WHEN, one(params.when)) ?? 'upcoming',
  };
}

export function reservationFilterToParams(filter: ReservationFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.q) p.set('q', filter.q);
  if (filter.unit) p.set('unit', filter.unit);
  if (filter.source) p.set('source', filter.source);
  if (filter.status) p.set('status', filter.status);
  if (filter.from) p.set('from', filter.from);
  if (filter.to) p.set('to', filter.to);
  if (filter.when !== 'upcoming') p.set('when', filter.when);
  return p;
}

export function hasActiveReservationFilter(filter: ReservationFilter): boolean {
  return Boolean(filter.q || filter.unit || filter.source || filter.status || filter.from || filter.to || filter.when !== 'upcoming');
}

/** The row-source query for a filter. `unitId` is resolved from the slug by the caller. */
export function reservationQueryOf(filter: ReservationFilter, today: string, unitId: string | null): ReservationQuery {
  // "Upcoming" and "current" mean booked stays: a cancelled reservation is
  // neither arriving nor in house. "Cancelled" is the history; "past" and
  // "all" keep every class so a cancellation stays findable where it was.
  const implied = filter.when === 'cancelled' ? ['cancelled'] : filter.when === 'upcoming' || filter.when === 'current' ? ['active'] : null;
  const query: ReservationQuery = {
    unitId,
    search: filter.q || null,
    sources: filter.source ? [filter.source] : null,
    statusClasses: filter.status ? [filter.status] : implied,
    sort: 'check_in',
    dir: filter.when === 'past' || filter.when === 'cancelled' ? 'desc' : 'asc',
    limit: 400,
  };
  if (filter.from || filter.to) {
    query.overlaps = { from: filter.from ?? '1970-01-01', to: filter.to ?? '9999-12-31' };
  } else if (filter.when === 'upcoming') {
    query.checkOutFrom = today;
  } else if (filter.when === 'current') {
    // In house tonight: arrived on or before today, leaving after today.
    query.checkInTo = addDaysIso(today, 1);
    query.checkOutFrom = addDaysIso(today, 1);
  } else if (filter.when === 'past') {
    query.checkOutTo = today;
  }
  return query;
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
