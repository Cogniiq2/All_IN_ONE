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
