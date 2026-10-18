/**
 * The figures above the reservation list, and on the PDF's first page.
 *
 * Pure: the same function serves the screen and the export, so the two can
 * never disagree. Money and nights count BOOKED stays only — a cancelled
 * booking is listed and counted as cancelled, never as value.
 */

import type { ReservationDto } from '@/lib/admin/dto';

export interface ReservationSummary {
  /** Everything listed, cancelled included. */
  listed: number;
  /** Stays that occupy an apartment. */
  booked: number;
  cancelled: number;
  nights: number;
  guests: number;
  /** Gross booking value of the booked stays, in cents, per currency (normally one: EUR). */
  valueCents: number;
  /** Booked stays whose provider stated no amount; their value is not in `valueCents`. */
  withoutAmount: number;
  /** Booked stays, nights and value per apartment, in display order. */
  byUnit: Array<{ slug: string; name: string; stays: number; nights: number; valueCents: number }>;
  /** Booked stays per channel. */
  bySource: Array<{ source: string; stays: number }>;
}

export function summariseReservations(items: ReservationDto[]): ReservationSummary {
  const booked = items.filter((r) => r.occupies);
  const units = new Map<string, { slug: string; name: string; stays: number; nights: number; valueCents: number }>();
  const sources = new Map<string, number>();
  let nights = 0;
  let guests = 0;
  let valueCents = 0;
  let withoutAmount = 0;
  for (const r of booked) {
    nights += r.nights;
    guests += r.guests ?? 0;
    if (r.totalCents === null) withoutAmount += 1;
    else valueCents += r.totalCents;
    const u = units.get(r.unitSlug) ?? { slug: r.unitSlug, name: r.unitName, stays: 0, nights: 0, valueCents: 0 };
    u.stays += 1;
    u.nights += r.nights;
    u.valueCents += r.totalCents ?? 0;
    units.set(r.unitSlug, u);
    sources.set(r.source, (sources.get(r.source) ?? 0) + 1);
  }
  return {
    listed: items.length,
    booked: booked.length,
    cancelled: items.filter((r) => r.statusClass === 'cancelled').length,
    nights,
    guests,
    valueCents,
    withoutAmount,
    byUnit: Array.from(units.values()).sort((a, b) => a.slug.localeCompare(b.slug)),
    bySource: Array.from(sources.entries())
      .map(([source, stays]) => ({ source, stays }))
      .sort((a, b) => b.stays - a.stays),
  };
}

/* ── The list, as people read it ───────────────────────────────────────── */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface ReservationMonthGroup {
  /** `2026-11` */
  key: string;
  /** `November 2026` */
  label: string;
  items: ReservationDto[];
  /** Booked stays in the group and their nights; cancellations are not counted. */
  stays: number;
  nights: number;
}

/** The property-local (Europe/Berlin) calendar day of an instant. */
function berlinDay(instant: string): string | null {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Consecutive rows that share a month, in the order the list already has —
 * by arrival month, or by booking month when sorted by booking date. The
 * order of the rows is never changed, only cut into chapters.
 */
export function groupReservationsByMonth(items: ReservationDto[], by: 'arrival' | 'booked'): ReservationMonthGroup[] {
  const groups: ReservationMonthGroup[] = [];
  for (const r of items) {
    const day = by === 'booked' ? (r.bookedAt ? berlinDay(r.bookedAt) : null) : r.checkIn;
    const key = day ? day.slice(0, 7) : 'unknown';
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label = day ? `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : 'Booking date not stated';
      group = { key, label, items: [], stays: 0, nights: 0 };
      groups.push(group);
    }
    group.items.push(r);
    if (r.occupies) {
      group.stays += 1;
      group.nights += r.nights;
    }
  }
  return groups;
}

export type StayMoment = 'in_house' | 'arrives_today' | 'arrives_tomorrow' | 'leaves_today' | null;

/** Where a booked stay is relative to today, for the one-word marker on its row. */
export function stayMoment(r: Pick<ReservationDto, 'checkIn' | 'checkOut' | 'occupies'>, today: string, tomorrow: string): StayMoment {
  if (!r.occupies) return null;
  if (r.checkOut === today) return 'leaves_today';
  if (r.checkIn === today) return 'arrives_today';
  if (r.checkIn < today && r.checkOut > today) return 'in_house';
  if (r.checkIn === tomorrow) return 'arrives_tomorrow';
  return null;
}
