/**
 * The booking index filter, parsed from and written back to the URL.
 *
 * Pure: a `URLSearchParams`-shaped record in, a validated filter out. Nothing
 * a visitor types reaches a query as-is — states are checked against the
 * canonical lists, dates against the ISO shape, the page against a bound.
 */

import { BOOKING_STATES, PAYMENT_STATES, type BookingState, type PaymentState } from '@/lib/booking/states';
import { isIsoDate } from '@/lib/booking/stay-rules';

export const BOOKING_SORTS = ['arrival', 'departure', 'updated', 'created', 'amount'] as const;
export type BookingSort = (typeof BOOKING_SORTS)[number];

export const BOOKING_SOURCES = ['direct', 'booking_com', 'airbnb', 'manual'] as const;

/**
 * Coarse, operator-facing groupings of the fine-grained booking states, for
 * the quick filter. Each group is defined in terms of the canonical states so
 * the domain vocabulary is never paraphrased.
 */
export const STATE_GROUPS = {
  active: ['hold_created', 'payment_session_created', 'awaiting_payment', 'payment_pending', 'paid', 'finalizing', 'confirmed', 'locking'],
  confirmed: ['confirmed'],
  in_payment: ['payment_session_created', 'awaiting_payment', 'payment_pending', 'payment_failed', 'payment_cancelled'],
  exceptions: ['paid_unfinalized', 'finalization_failed', 'release_failed', 'manual_review', 'expired'],
  closed: ['released', 'cancelled', 'quote_expired', 'unavailable', 'hold_failed', 'draft', 'quoted'],
} as const satisfies Record<string, readonly BookingState[]>;

export type StateGroup = keyof typeof STATE_GROUPS;

export const PAGE_SIZE = 40;

export interface BookingListFilter {
  q: string;
  unit: string | null;
  status: BookingState | null;
  group: StateGroup | null;
  payment: PaymentState | null;
  source: (typeof BOOKING_SOURCES)[number] | null;
  /** Arrival on or after. */
  from: string | null;
  /** Arrival before. */
  to: string | null;
  attention: boolean;
  sort: BookingSort;
  dir: 'asc' | 'desc';
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseBookingFilter(params: Params): BookingListFilter {
  const sort = oneOf(first(params, 'sort'), BOOKING_SORTS) ?? 'arrival';
  const dirRaw = first(params, 'dir');
  const pageRaw = Number.parseInt(first(params, 'page') ?? '1', 10);
  const from = first(params, 'from');
  const to = first(params, 'to');
  return {
    q: (first(params, 'q') ?? '').trim().slice(0, 80),
    unit: (first(params, 'unit') ?? '').trim().slice(0, 60) || null,
    status: oneOf(first(params, 'status'), BOOKING_STATES),
    group: oneOf(first(params, 'group'), Object.keys(STATE_GROUPS) as StateGroup[]),
    payment: oneOf(first(params, 'payment'), PAYMENT_STATES),
    source: oneOf(first(params, 'source'), BOOKING_SOURCES),
    from: isIsoDate(from) ? from : null,
    to: isIsoDate(to) ? to : null,
    attention: first(params, 'attention') === '1',
    sort,
    dir: dirRaw === 'asc' || dirRaw === 'desc' ? dirRaw : sort === 'arrival' || sort === 'departure' ? 'asc' : 'desc',
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 10_000) : 1,
  };
}

/** The states a filter resolves to, or null for "no state restriction". */
export function statesFor(filter: Pick<BookingListFilter, 'status' | 'group'>): readonly BookingState[] | null {
  if (filter.status) return [filter.status];
  if (filter.group) return STATE_GROUPS[filter.group];
  return null;
}

/** Only the non-default keys, so URLs stay short and shareable. */
export function filterToParams(filter: Partial<BookingListFilter>): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.q) p.set('q', filter.q);
  if (filter.unit) p.set('unit', filter.unit);
  if (filter.status) p.set('status', filter.status);
  if (filter.group) p.set('group', filter.group);
  if (filter.payment) p.set('payment', filter.payment);
  if (filter.source) p.set('source', filter.source);
  if (filter.from) p.set('from', filter.from);
  if (filter.to) p.set('to', filter.to);
  if (filter.attention) p.set('attention', '1');
  if (filter.sort && filter.sort !== 'arrival') p.set('sort', filter.sort);
  if (filter.dir) p.set('dir', filter.dir);
  if (filter.page && filter.page > 1) p.set('page', String(filter.page));
  return p;
}

export function hasActiveFilter(filter: BookingListFilter): boolean {
  return Boolean(
    filter.q || filter.unit || filter.status || filter.group || filter.payment || filter.source || filter.from || filter.to || filter.attention
  );
}
