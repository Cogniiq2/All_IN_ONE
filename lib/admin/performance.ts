/**
 * ══════════════════════════════════════════════════════════════════════════
 * OPERATIONAL PERFORMANCE — what the rooms did, from reservations.
 *
 * This module answers the hotelier's questions: how full were we, what did a
 * sold night fetch, how long do people stay, how much is on the books for
 * next month. It reads `bolagio_reservations`, which is BoLaGio's cache of
 * what Beds24 says is booked, and it is **pure**: rows in, numbers out.
 *
 * ── The one thing it is not ──────────────────────────────────────────────
 * It is NOT the accounting layer. `lib/finance/*` owns that, and the two must
 * never be conflated:
 *
 *   THIS MODULE          gross booking value, as the channel manager reports
 *                        it. Operational. Useful the moment a booking lands.
 *   lib/finance          net revenue, VAT, commission, cash. Authoritative.
 *                        Fed by reconciled sources, not by a channel read.
 *
 * A Booking.com reservation carries a gross price. It does NOT carry the
 * commission Booking.com will deduct, the payout, the payout date or the
 * settlement. Beds24 reports `commission: 0` on these reservations and that
 * is NOT evidence that Booking.com charged nothing — it is evidence that
 * Beds24 was not told. So this module reports gross and says plainly that
 * net is unavailable. It never subtracts a commission it does not have, and
 * it never renders an unknown as a zero.
 *
 * ── Night allocation, and why ────────────────────────────────────────────
 * Money is allocated EVENLY ACROSS THE NIGHTS OF THE STAY, and only the
 * nights falling inside the window are counted. That is what makes a monthly
 * comparison mean anything: a fourteen-night stay spanning a month boundary
 * contributes to both months in proportion, rather than landing entirely in
 * whichever month its `booked_at`, `check_in` or `check_out` happens to fall.
 *
 * The other two conventions are still useful and are reported SEPARATELY and
 * by name — never mixed into the same figure:
 *
 *   bookedValue    by `booked_at`   — commercial pace: what was SOLD in the window
 *   arrivingValue  by `check_in`    — the pipeline: what ARRIVES in the window
 *   stayValue      by night          — the operating result. ADR/RevPAR use this.
 *
 * ── Missing amounts are counted, never averaged away ─────────────────────
 * A reservation with no amount (an owner block, a provider that did not
 * return a price) is excluded from every money figure AND reported as
 * `nightsWithoutAmount`. Letting it through as a zero would drag ADR down
 * and make a correct number look like a bad month.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { addDays, daysBetween, monthKey, type DateRange, type IsoDate } from '@/lib/finance/periods';
import { reservationOccupies } from '@/lib/admin/presentation';

/** The reservation facts this module needs. A subset of `ReservationRow`, and deliberately no guest field. */
export interface PerformanceReservation {
  unit_slug: string;
  source: string;
  status_class: string;
  check_in: string;
  check_out: string;
  total_amount_cents: number | null;
  currency: string | null;
  booked_at: string | null;
}

export interface PerformanceUnit {
  slug: string;
  display_name: string;
}

/** A figure that may legitimately have no value. Never rendered as zero. */
export interface Measure {
  /** Null means "not computable from what is verified", not "nought". */
  value: number | null;
  /** Why it is null, for the interface to say so honestly. */
  unavailable?: 'no_nights' | 'no_amounts' | 'no_stays';
}

const measure = (value: number | null, reason: Measure['unavailable']): Measure =>
  value === null || !Number.isFinite(value) ? { value: null, unavailable: reason } : { value };

export interface ChannelPerformance {
  source: string;
  stays: number;
  nights: number;
  grossCents: number;
  /** Of the gross in the window. Null while nothing has been earned. */
  share: number | null;
}

export interface UnitPerformance {
  slug: string;
  displayName: string;
  stays: number;
  nights: number;
  availableNights: number;
  grossCents: number;
  occupancy: Measure;
  adr: Measure;
  revpar: Measure;
}

export interface MonthPerformance {
  month: string;
  nights: number;
  grossCents: number;
  occupancy: Measure;
  adr: Measure;
}

export interface PerformanceReport {
  range: DateRange;
  /** Nights in the window, per unit, that a room could have been sold. */
  availableNights: number;
  units: number;

  /* ── The operating result: allocated by night ──────────────────────── */
  occupiedNights: number;
  /** Nights occupied by a stay that carried no amount. Excluded from money. */
  nightsWithoutAmount: number;
  /** Gross booking value earned by the nights inside this window. */
  stayGrossCents: number;
  occupancy: Measure;
  adr: Measure;
  revpar: Measure;
  alos: Measure;

  /* ── The other two conventions, named ──────────────────────────────── */
  /** Gross of stays BOOKED in the window, whenever they are taken. Commercial pace. */
  bookedGrossCents: number;
  bookedStays: number;
  /** Gross of stays ARRIVING in the window, whenever they were booked. The pipeline. */
  arrivingGrossCents: number;
  arrivingStays: number;

  /* ── Counts ────────────────────────────────────────────────────────── */
  activeStays: number;
  cancelledStays: number;
  /** cancelled / (active + cancelled), by arrival in the window. Null when neither. */
  cancellationRate: Measure;

  byChannel: ChannelPerformance[];
  byUnit: UnitPerformance[];
  byMonth: MonthPerformance[];

  /** Currencies seen. More than one means the totals are not addable and the UI must say so. */
  currencies: string[];

  /**
   * What this report deliberately does not know. Rendered as such — never
   * as a zero, and never netted off the gross.
   */
  unavailable: {
    commission: 'provider_data_unavailable';
    netPayout: 'provider_data_unavailable';
    payoutStatus: 'provider_data_unavailable';
    tax: 'not_computed_here';
  };
}

/* ── Night arithmetic ──────────────────────────────────────────────────── */

/**
 * Nights of `[check_in, check_out)` that fall inside `[from, to)`.
 *
 * Half-open at both ends, which is the booking core's convention: the
 * departure day is not an occupied night, and a stay departing on the first
 * day of the window contributes nothing to it.
 */
export function nightsInWindow(checkIn: string, checkOut: string, from: string, to: string): number {
  const start = checkIn > from ? checkIn : from;
  const end = checkOut < to ? checkOut : to;
  return end <= start ? 0 : daysBetween(start, end);
}

/** Total nights of a stay. Zero for a reversed or same-day range, which the database refuses anyway. */
export function stayNights(checkIn: string, checkOut: string): number {
  const n = daysBetween(checkIn, checkOut);
  return n > 0 ? n : 0;
}

const inWindow = (date: string | null, r: DateRange): boolean =>
  date !== null && date.slice(0, 10) >= r.from && date.slice(0, 10) < r.to;

/* ── The report ────────────────────────────────────────────────────────── */

export function buildPerformance(
  reservations: readonly PerformanceReservation[],
  units: readonly PerformanceUnit[],
  range: DateRange
): PerformanceReport {
  const windowNights = Math.max(0, daysBetween(range.from, range.to));
  const availableNights = windowNights * units.length;

  let occupiedNights = 0;
  let nightsWithoutAmount = 0;
  let stayGrossCents = 0;
  let bookedGrossCents = 0;
  let bookedStays = 0;
  let arrivingGrossCents = 0;
  let arrivingStays = 0;
  let activeStays = 0;
  let cancelledStays = 0;
  let alosNights = 0;
  let alosStays = 0;

  const currencies = new Set<string>();
  const channels = new Map<string, { stays: number; nights: number; grossCents: number }>();
  const perUnit = new Map<string, { stays: number; nights: number; grossCents: number }>();
  const perMonth = new Map<string, { nights: number; grossCents: number }>();

  for (const r of reservations) {
    const occupies = reservationOccupies(r.status_class);

    // Cancellations are counted by the arrival they WOULD have had, which is
    // the only date a cancelled stay still has a meaningful position on.
    if (inWindow(r.check_in, range)) {
      if (occupies) activeStays += 1;
      else if (r.status_class === 'cancelled') cancelledStays += 1;
    }

    if (!occupies) continue;

    const total = stayNights(r.check_in, r.check_out);
    const nights = nightsInWindow(r.check_in, r.check_out, range.from, range.to);
    if (nights <= 0 && !inWindow(r.booked_at, range)) continue;

    if (r.currency) currencies.add(r.currency);

    // Per-night rate, for allocating a stay that straddles the window edge.
    const perNight = r.total_amount_cents !== null && total > 0 ? r.total_amount_cents / total : null;

    if (nights > 0) {
      occupiedNights += nights;
      alosNights += total;
      alosStays += 1;

      if (perNight === null) {
        nightsWithoutAmount += nights;
      } else {
        const allocated = Math.round(perNight * nights);
        stayGrossCents += allocated;

        const channel = channels.get(r.source) ?? { stays: 0, nights: 0, grossCents: 0 };
        channel.grossCents += allocated;
        channels.set(r.source, channel);

        const unit = perUnit.get(r.unit_slug) ?? { stays: 0, nights: 0, grossCents: 0 };
        unit.grossCents += allocated;
        perUnit.set(r.unit_slug, unit);

        // Month allocation walks the nights rather than dividing, so the
        // months always add up to the window total to the cent.
        for (let cursor = r.check_in > range.from ? r.check_in : range.from; cursor < range.to && cursor < r.check_out; cursor = addDays(cursor, 1)) {
          const key = monthKey(cursor);
          const m = perMonth.get(key) ?? { nights: 0, grossCents: 0 };
          m.nights += 1;
          m.grossCents += Math.round(perNight);
          perMonth.set(key, m);
        }
      }

      const channelCount = channels.get(r.source) ?? { stays: 0, nights: 0, grossCents: 0 };
      channelCount.stays += 1;
      channelCount.nights += nights;
      channels.set(r.source, channelCount);

      const unitCount = perUnit.get(r.unit_slug) ?? { stays: 0, nights: 0, grossCents: 0 };
      unitCount.stays += 1;
      unitCount.nights += nights;
      perUnit.set(r.unit_slug, unitCount);

      if (perNight === null) {
        for (let cursor = r.check_in > range.from ? r.check_in : range.from; cursor < range.to && cursor < r.check_out; cursor = addDays(cursor, 1)) {
          const key = monthKey(cursor);
          const m = perMonth.get(key) ?? { nights: 0, grossCents: 0 };
          m.nights += 1;
          perMonth.set(key, m);
        }
      }
    }

    // The two other conventions, on the WHOLE stay, never apportioned.
    if (inWindow(r.booked_at, range)) {
      bookedStays += 1;
      if (r.total_amount_cents !== null) bookedGrossCents += r.total_amount_cents;
    }
    if (inWindow(r.check_in, range)) {
      arrivingStays += 1;
      if (r.total_amount_cents !== null) arrivingGrossCents += r.total_amount_cents;
    }
  }

  // Money metrics divide by the nights that actually CARRIED money. Dividing
  // by every occupied night would let an amount-less owner block depress ADR.
  const paidNights = occupiedNights - nightsWithoutAmount;

  const unitRows: UnitPerformance[] = units
    .map((u) => {
      const agg = perUnit.get(u.slug) ?? { stays: 0, nights: 0, grossCents: 0 };
      return {
        slug: u.slug,
        displayName: u.display_name,
        stays: agg.stays,
        nights: agg.nights,
        availableNights: windowNights,
        grossCents: agg.grossCents,
        occupancy: measure(windowNights > 0 ? agg.nights / windowNights : null, 'no_nights'),
        adr: measure(agg.nights > 0 && agg.grossCents > 0 ? agg.grossCents / agg.nights : null, 'no_amounts'),
        revpar: measure(windowNights > 0 && agg.grossCents > 0 ? agg.grossCents / windowNights : null, 'no_nights'),
      };
    })
    .sort((a, b) => b.grossCents - a.grossCents || a.slug.localeCompare(b.slug));

  return {
    range,
    availableNights,
    units: units.length,
    occupiedNights,
    nightsWithoutAmount,
    stayGrossCents,
    occupancy: measure(availableNights > 0 ? occupiedNights / availableNights : null, 'no_nights'),
    adr: measure(paidNights > 0 ? stayGrossCents / paidNights : null, 'no_amounts'),
    revpar: measure(availableNights > 0 && stayGrossCents > 0 ? stayGrossCents / availableNights : null, 'no_nights'),
    alos: measure(alosStays > 0 ? alosNights / alosStays : null, 'no_stays'),
    bookedGrossCents,
    bookedStays,
    arrivingGrossCents,
    arrivingStays,
    activeStays,
    cancelledStays,
    cancellationRate: measure(
      activeStays + cancelledStays > 0 ? cancelledStays / (activeStays + cancelledStays) : null,
      'no_stays'
    ),
    byChannel: Array.from(channels.entries())
      .map(([source, c]) => ({
        source,
        stays: c.stays,
        nights: c.nights,
        grossCents: c.grossCents,
        share: stayGrossCents > 0 ? c.grossCents / stayGrossCents : null,
      }))
      .sort((a, b) => b.grossCents - a.grossCents || a.source.localeCompare(b.source)),
    byUnit: unitRows,
    byMonth: Array.from(perMonth.entries())
      .map(([month, m]) => ({
        month,
        nights: m.nights,
        grossCents: m.grossCents,
        occupancy: measure(units.length > 0 ? m.nights / (units.length * daysInMonthWithin(month, range)) : null, 'no_nights'),
        adr: measure(m.nights > 0 && m.grossCents > 0 ? m.grossCents / m.nights : null, 'no_amounts'),
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    currencies: Array.from(currencies).sort(),
    unavailable: {
      commission: 'provider_data_unavailable',
      netPayout: 'provider_data_unavailable',
      payoutStatus: 'provider_data_unavailable',
      tax: 'not_computed_here',
    },
  };
}

/**
 * Days of a month that lie inside the window.
 *
 * A month at the edge of the range is only partly available, and dividing by
 * a whole month there would report an occupancy that looks like a bad month
 * when it is really a short window.
 */
function daysInMonthWithin(month: string, range: DateRange): number {
  const first = `${month}-01` as IsoDate;
  const next = addDays(`${month}-01`, 32).slice(0, 7) + '-01';
  const from = first > range.from ? first : range.from;
  const to = next < range.to ? next : range.to;
  return Math.max(1, daysBetween(from, to));
}
