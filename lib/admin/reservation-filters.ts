/**
 * The reservation explorer's filters, as URL state.
 *
 * Every value is validated against a closed list or a date shape before it
 * reaches a query: the URL is user input. A filtered view is therefore a
 * link, and the PDF export reads the very same parameters, so what is saved
 * is exactly what is on screen.
 *
 * Three independent questions, each answered by one control:
 *   when is the stay?      `when` (presets) or `from`/`to` (custom)
 *   when was it booked?    `booked` (presets) or `bookedFrom`/`bookedTo`
 *   which apartment?       `unit`
 * plus what to show (`status`), the channel, a search, and the order.
 */

import { isIsoDate } from '@/lib/booking/stay-rules';
import type { ReservationQuery } from '@/lib/admin/rows';

export const RESERVATION_SOURCES = ['booking_com', 'airbnb', 'direct', 'manual', 'unknown'] as const;
export const RESERVATION_STATUS_CLASSES = ['active', 'cancelled', 'provisional', 'blocked', 'unknown'] as const;
/** Stay periods. `cancelled` is kept for links made before the explorer; the UI expresses it through `status`. */
export const RESERVATION_WHEN = ['upcoming', 'current', 'this_month', 'next_month', 'next_30', 'this_year', 'past', 'all', 'cancelled'] as const;
/** Booking-date periods: when the guest made the booking. */
export const RESERVATION_BOOKED = ['any', 'today', 'last_7', 'last_30', 'this_month', 'custom'] as const;
export const RESERVATION_ORDER = ['arrival', 'booked'] as const;
/** What to show, in plain words: booked stays, cancellations, or both. Absent = implied by the stay period. */
export const RESERVATION_SHOW = ['booked', 'cancelled', 'all'] as const;

export type ReservationWhen = (typeof RESERVATION_WHEN)[number];
export type ReservationBooked = (typeof RESERVATION_BOOKED)[number];
export type ReservationOrder = (typeof RESERVATION_ORDER)[number];
export type ReservationShow = (typeof RESERVATION_SHOW)[number];

export interface ReservationFilter {
  /** Guest name, OTA reference or Beds24 booking id. */
  q: string;
  unit: string | null;
  source: (typeof RESERVATION_SOURCES)[number] | null;
  status: (typeof RESERVATION_STATUS_CLASSES)[number] | null;
  /** Booked / cancelled / everything. Null keeps what the stay period implies; an explicit `status` wins over both. */
  show: ReservationShow | null;
  /** Stays touching [from, to) — a custom stay period; replaces `when`. */
  from: string | null;
  to: string | null;
  when: ReservationWhen;
  /** When the booking was made. `custom` reads `bookedFrom`/`bookedTo` (inclusive days, Berlin time). */
  booked: ReservationBooked;
  bookedFrom: string | null;
  bookedTo: string | null;
  /** By arrival (soonest first) or by booking date (newest first). */
  order: ReservationOrder;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const oneOf = <T extends readonly string[]>(list: T, v: string): T[number] | null => (list as readonly string[]).includes(v) ? (v as T[number]) : null;

export function parseReservationFilter(params: Params): ReservationFilter {
  const from = one(params.from);
  const to = one(params.to);
  const bookedFrom = one(params.bookedFrom);
  const bookedTo = one(params.bookedTo);
  const customBooked = isIsoDate(bookedFrom) || isIsoDate(bookedTo);
  return {
    q: one(params.q).slice(0, 80),
    unit: /^[a-z0-9-]{2,64}$/.test(one(params.unit)) ? one(params.unit) : null,
    source: oneOf(RESERVATION_SOURCES, one(params.source)),
    status: oneOf(RESERVATION_STATUS_CLASSES, one(params.status)),
    show: oneOf(RESERVATION_SHOW, one(params.show)),
    from: isIsoDate(from) ? from : null,
    to: isIsoDate(to) ? to : null,
    when: oneOf(RESERVATION_WHEN, one(params.when)) ?? 'upcoming',
    // Custom dates win over a preset: they are the more specific statement.
    booked: customBooked ? 'custom' : oneOf(RESERVATION_BOOKED, one(params.booked)) ?? 'any',
    bookedFrom: isIsoDate(bookedFrom) ? bookedFrom : null,
    bookedTo: isIsoDate(bookedTo) ? bookedTo : null,
    order: oneOf(RESERVATION_ORDER, one(params.order)) ?? 'arrival',
  };
}

export function reservationFilterToParams(filter: ReservationFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.q) p.set('q', filter.q);
  if (filter.unit) p.set('unit', filter.unit);
  if (filter.source) p.set('source', filter.source);
  if (filter.status) p.set('status', filter.status);
  if (filter.show) p.set('show', filter.show);
  if (filter.from) p.set('from', filter.from);
  if (filter.to) p.set('to', filter.to);
  if (filter.when !== 'upcoming') p.set('when', filter.when);
  if (filter.booked === 'custom') {
    if (filter.bookedFrom) p.set('bookedFrom', filter.bookedFrom);
    if (filter.bookedTo) p.set('bookedTo', filter.bookedTo);
  } else if (filter.booked !== 'any') {
    p.set('booked', filter.booked);
  }
  if (filter.order !== 'arrival') p.set('order', filter.order);
  return p;
}

export function hasActiveReservationFilter(filter: ReservationFilter): boolean {
  return Boolean(
    filter.q || filter.unit || filter.source || filter.status || filter.show || filter.from || filter.to || filter.when !== 'upcoming' || filter.booked !== 'any' || filter.order !== 'arrival'
  );
}

/* ── Date arithmetic, on plain ISO dates ───────────────────────────────── */

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStart(date: string, offset = 0): string {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}

/** The half-open stay window a period preset stands for; null when it is not a window. */
export function stayWindow(when: ReservationWhen, today: string): { from: string; to: string } | null {
  switch (when) {
    case 'this_month':
      return { from: monthStart(today), to: monthStart(today, 1) };
    case 'next_month':
      return { from: monthStart(today, 1), to: monthStart(today, 2) };
    case 'next_30':
      return { from: today, to: addDaysIso(today, 30) };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${Number(today.slice(0, 4)) + 1}-01-01` };
    default:
      return null;
  }
}

/** The inclusive booking-day range a booked preset stands for, in property days; null for "any time". */
export function bookedWindow(filter: Pick<ReservationFilter, 'booked' | 'bookedFrom' | 'bookedTo'>, today: string): { from: string | null; to: string | null } | null {
  switch (filter.booked) {
    case 'today':
      return { from: today, to: today };
    case 'last_7':
      return { from: addDaysIso(today, -6), to: today };
    case 'last_30':
      return { from: addDaysIso(today, -29), to: today };
    case 'this_month':
      return { from: monthStart(today), to: today };
    case 'custom':
      return filter.bookedFrom || filter.bookedTo ? { from: filter.bookedFrom, to: filter.bookedTo } : null;
    default:
      return null;
  }
}

/**
 * The UTC instant at which a property-local (Europe/Berlin) day begins.
 * `booked_at` is an instant; "booked on 3 October" means the Berlin day.
 */
export function berlinDayStartUtc(date: string): string {
  const noon = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(noon);
  const berlinHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
  const offsetHours = berlinHour - 12; // +1 in winter, +2 in summer
  return new Date(Date.parse(`${date}T00:00:00Z`) - offsetHours * 3_600_000).toISOString();
}

const SHOW_CLASSES: Record<ReservationShow, string[] | null> = { booked: ['active'], cancelled: ['cancelled'], all: null };

/**
 * What the list shows when no explicit `status` is set: the `show` choice,
 * else what the stay period implies. "Upcoming", "staying now" and the
 * calendar periods mean booked stays — a cancelled reservation is neither
 * arriving nor occupying a month; "past" and "any time" keep every class so
 * a cancellation stays findable where it was.
 */
export function effectiveShow(filter: Pick<ReservationFilter, 'show' | 'when'>): ReservationShow {
  if (filter.show) return filter.show;
  if (filter.when === 'cancelled') return 'cancelled';
  return filter.when === 'past' || filter.when === 'all' ? 'all' : 'booked';
}

/** The row-source query for a filter. `unitId` is resolved from the slug by the caller. */
export function reservationQueryOf(filter: ReservationFilter, today: string, unitId: string | null): ReservationQuery {
  // An explicit status always wins over the shown set.
  const implied = SHOW_CLASSES[effectiveShow(filter)];
  const newestFirst = filter.order === 'booked' || filter.when === 'past' || filter.when === 'cancelled' || filter.show === 'cancelled';
  const query: ReservationQuery = {
    unitId,
    search: filter.q || null,
    sources: filter.source ? [filter.source] : null,
    statusClasses: filter.status ? [filter.status] : implied,
    sort: filter.order === 'booked' ? 'booked_at' : 'check_in',
    dir: newestFirst ? 'desc' : 'asc',
    limit: 400,
  };
  const window = stayWindow(filter.when, today);
  if (filter.from || filter.to) {
    query.overlaps = { from: filter.from ?? '1970-01-01', to: filter.to ?? '9999-12-31' };
  } else if (window) {
    query.overlaps = window;
  } else if (filter.when === 'upcoming') {
    query.checkOutFrom = today;
  } else if (filter.when === 'current') {
    // In house tonight: arrived on or before today, leaving after today.
    query.checkInTo = addDaysIso(today, 1);
    query.checkOutFrom = addDaysIso(today, 1);
  } else if (filter.when === 'past') {
    query.checkOutTo = today;
  }
  const booked = bookedWindow(filter, today);
  if (booked) {
    if (booked.from) query.bookedFrom = berlinDayStartUtc(booked.from);
    if (booked.to) query.bookedTo = berlinDayStartUtc(addDaysIso(booked.to, 1));
  }
  return query;
}

/* ── Words ─────────────────────────────────────────────────────────────── */

export const STAY_LABEL: Record<Exclude<ReservationWhen, 'cancelled'>, string> = {
  upcoming: 'Upcoming',
  current: 'Staying now',
  this_month: 'This month',
  next_month: 'Next month',
  next_30: 'Next 30 days',
  this_year: 'This year',
  past: 'Past',
  all: 'Any time',
};

export const BOOKED_LABEL: Record<ReservationBooked, string> = {
  any: 'Any time',
  today: 'Today',
  last_7: 'Last 7 days',
  last_30: 'Last 30 days',
  this_month: 'This month',
  custom: 'Choose dates',
};

function reservationStatusWord(status: string): string {
  return status === 'provisional' ? 'Requested' : `${status[0].toUpperCase()}${status.slice(1)}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function readableDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * The whole filter as one plain sentence, for the screen and the PDF:
 * "Booked stays in Apartment I, staying in November 2026, booked in the last 30 days."
 */
export function describeReservationFilter(filter: ReservationFilter, unitName: string | null, today: string): string {
  const show = effectiveShow(filter);
  const what = filter.status
    ? filter.status === 'active'
      ? 'Booked stays'
      : filter.status === 'cancelled'
        ? 'Cancelled bookings'
        : `${reservationStatusWord(filter.status)} bookings`
    : show === 'cancelled'
      ? 'Cancelled bookings'
      : show === 'booked'
        ? 'Booked stays'
        : 'All bookings, cancelled included';
  const parts = [what, unitName ? `in ${unitName}` : 'in every apartment'];
  if (filter.from || filter.to) {
    parts.push(filter.from && filter.to ? `staying between ${readableDate(filter.from)} and ${readableDate(addDaysIso(filter.to, -1))}` : filter.from ? `staying from ${readableDate(filter.from)}` : `staying before ${readableDate(filter.to as string)}`);
  } else {
    const window = stayWindow(filter.when, today);
    if (filter.when === 'this_month' || filter.when === 'next_month') parts.push(`staying in ${MONTHS[Number(window!.from.slice(5, 7)) - 1]} ${window!.from.slice(0, 4)}`);
    else if (filter.when === 'next_30') parts.push('staying in the next 30 days');
    else if (filter.when === 'this_year') parts.push(`staying in ${today.slice(0, 4)}`);
    else if (filter.when === 'upcoming') parts.push('from today on');
    else if (filter.when === 'current') parts.push('staying tonight');
    else if (filter.when === 'past') parts.push('that have already left');
  }
  const booked = bookedWindow(filter, today);
  if (filter.booked === 'today') parts.push('booked today');
  else if (filter.booked === 'last_7') parts.push('booked in the last 7 days');
  else if (filter.booked === 'last_30') parts.push('booked in the last 30 days');
  else if (filter.booked === 'this_month') parts.push('booked this month');
  else if (booked) parts.push(booked.from && booked.to ? `booked between ${readableDate(booked.from)} and ${readableDate(booked.to)}` : booked.from ? `booked since ${readableDate(booked.from)}` : `booked until ${readableDate(booked.to as string)}`);
  if (filter.source) parts.push(`via ${filter.source === 'booking_com' ? 'Booking.com' : filter.source === 'airbnb' ? 'Airbnb' : filter.source === 'direct' ? 'the website' : filter.source}`);
  if (filter.q) parts.push(`matching “${filter.q}”`);
  return `${parts.join(', ')}.`;
}
