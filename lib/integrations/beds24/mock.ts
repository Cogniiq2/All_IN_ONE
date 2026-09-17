import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MOCK PROVIDER — for development before Beds24 credentials exist, and for
 * exercising the failure paths that are almost impossible to provoke against
 * a real channel manager.
 *
 * ── The one rule ─────────────────────────────────────────────────────────
 * This file is reachable ONLY when `BEDS24_MODE` is not 'live'. Production
 * never silently falls back to it: when live mode cannot reach Beds24 the
 * guest is told that live availability is temporarily unavailable, and no
 * fixture is substituted. A booking engine that invents a free night under
 * failure is worse than one that is briefly honest about being down.
 *
 * ── Deterministic, not random ────────────────────────────────────────────
 * Every fixture is derived from the calendar, so the same date always answers
 * the same way and a bug found on Tuesday reproduces on Wednesday. Relative to
 * the current month:
 *
 *   month + 0   today's month — partially occupied, with a stay mid-month
 *   month + 1   completely free
 *   month + 2   partially occupied
 *   month + 3   BACK-TO-BACK: 16→20 and 20→23. The 20th is one reservation's
 *               checkout and the next one's arrival, so it must render as a
 *               free night and a legal arrival. This is the case a naive
 *               implementation gets wrong.
 *   month + 4   minimum stay of 3 nights across the whole month
 *   month + 5…  free
 *
 * ── Failure fixtures, by arrival day-of-month ────────────────────────────
 *   13th   availability conflict — the dates were taken while you decided
 *   14th   provider unavailable — Beds24 is down
 *   15th   quote succeeds, HOLD fails with a conflict. This is the real race:
 *          a Booking.com reservation landing between the quote and the hold.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { quoteMinutes } from '@/lib/booking/config';
import {
  addDays,
  calendarFromReservations,
  nightsBetween,
  propertyToday,
} from '@/lib/booking/stay-rules';
import type { BookingQuote, InventoryDay, IsoDate } from '@/lib/booking/types';
import {
  ProviderError,
  type AvailabilityRequest,
  type BookingProvider,
  type HoldRequest,
  type OfferRequest,
  type ProviderBooking,
} from '@/lib/integrations/provider';

const NIGHTLY_CENTS = 14_000;
const CLEANING_CENTS = 4_500;

function firstOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonths(date: IsoDate, months: number): IsoDate {
  const [y, m] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + months, 1));
  return shifted.toISOString().slice(0, 10);
}

function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

/** The fixture reservations for a month, as [checkIn, checkOut) pairs. */
function reservationsForMonth(monthStart: IsoDate, offset: number) {
  const month = monthStart.slice(0, 7);
  switch (offset) {
    case 0:
    case 2:
      // Partially occupied: one stay across the 8th to the 12th.
      return [{ checkIn: `${month}-08`, checkOut: `${month}-12` }];
    case 3:
      // Back-to-back. The 20th is a checkout AND an arrival.
      return [
        { checkIn: `${month}-16`, checkOut: `${month}-20` },
        { checkIn: `${month}-20`, checkOut: `${month}-23` },
      ];
    default:
      return [];
  }
}

export const beds24MockProvider: BookingProvider = {
  mode: 'mock',

  async fetchAvailability({ from, to }: AvailabilityRequest): Promise<InventoryDay[]> {
    const days: InventoryDay[] = [];
    // Anchored to the PROPERTY's current month, not to the requested window,
    // so "month + 3 is the back-to-back one" is a stable fact whatever range
    // is asked for. Anchoring to `from` would make the same date answer
    // differently depending on how it was queried.
    const base = firstOfMonth(propertyToday());

    // Built a month at a time so the min-stay and occupancy fixtures apply
    // cleanly, then trimmed to the requested window.
    for (let offset = 0; offset < 48; offset += 1) {
      const monthStart = shiftMonths(base, offset);
      if (monthStart >= to) break;
      const nextMonth = shiftMonths(base, offset + 1);
      if (nextMonth <= from) continue;

      const month = calendarFromReservations(
        monthStart,
        nextMonth,
        reservationsForMonth(monthStart, offset),
        {
          minStay: offset === 4 ? 3 : undefined,
          displayPriceCents: NIGHTLY_CENTS,
        }
      );
      days.push(...month);
    }

    return days.filter((d) => d.date >= from && d.date < to);
  },

  async fetchOffer(request: OfferRequest): Promise<BookingQuote> {
    assertFixtureOutcome(request.checkIn, 'quote');

    const nights = nightsBetween(request.checkIn, request.checkOut);

    // The min-stay fixture, enforced the way a provider would: the offer is
    // simply refused rather than priced.
    const days = await beds24MockProvider.fetchAvailability({
      unit: request.unit,
      from: request.checkIn,
      to: addDays(request.checkOut, 1),
    });
    const arrival = days.find((d) => d.date === request.checkIn);
    if (arrival?.minStay && nights < arrival.minStay) {
      throw new ProviderError('stay_rules', 'Minimum stay not met', { minNights: arrival.minStay });
    }
    // Every night in the range must actually be free, or this is the conflict
    // case rather than a priced offer.
    for (const day of days) {
      if (day.date >= request.checkOut) continue;
      if (!day.available) throw new ProviderError('availability_conflict', 'Night is taken');
    }

    const accommodation = NIGHTLY_CENTS * nights;

    return {
      unitSlug: request.unitSlug,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      nights,
      adults: request.adults,
      children: request.children,
      currency: 'EUR',
      totalCents: accommodation + CLEANING_CENTS,
      components: [
        {
          code: 'accommodation',
          label: {
            de: `Unterkunft · ${nights} ${nights === 1 ? 'Nacht' : 'Nächte'}`,
            en: `Accommodation · ${nights} ${nights === 1 ? 'night' : 'nights'}`,
          },
          amountCents: accommodation,
          taxCategory: 'accommodation',
          mandatory: true,
        },
        {
          code: 'fee:cleaning',
          label: { de: 'Endreinigung', en: 'Final cleaning' },
          amountCents: CLEANING_CENTS,
          taxCategory: 'service',
          mandatory: true,
        },
      ],
      expiresAt: new Date(Date.now() + quoteMinutes() * 60_000).toISOString(),
    };
  },

  async createHold(request: HoldRequest): Promise<ProviderBooking> {
    assertFixtureOutcome(request.checkIn, 'hold');
    // Derived from the idempotency key, so retrying the same attempt in mock
    // mode returns the same provider id — exactly as a real idempotent write
    // would, and what the duplicate-submit test asserts against.
    const id = `mock-${request.idempotencyKey.slice(0, 12)}`;
    const booking: ProviderBooking = {
      externalBookingId: id,
      snapshot: { mode: 'mock', status: 'new', reference: request.reference },
      status: 'new',
      externalPropertyId: String(request.unit.externalPropertyId),
      externalRoomId: String(request.unit.externalRoomId),
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      reference: request.reference,
    };
    // Held in module scope so `getBooking` and `findBookings` can answer, which
    // is what lets the verification and reconciliation paths be exercised
    // without a live channel manager.
    MOCK_BOOKINGS.set(id, booking);
    return booking;
  },

  async confirmBooking(externalBookingId: string): Promise<ProviderBooking> {
    const existing = MOCK_BOOKINGS.get(externalBookingId);
    const booking: ProviderBooking = {
      ...(existing ?? { externalBookingId, snapshot: {} }),
      externalBookingId,
      snapshot: { mode: 'mock', status: 'confirmed' },
      status: 'confirmed',
    };
    MOCK_BOOKINGS.set(externalBookingId, booking);
    return booking;
  },

  async releaseHold(externalBookingId: string): Promise<void> {
    // Releasing a hold that is already gone is a success, here and in live
    // mode: the desired end state is "this booking holds no inventory".
    const existing = MOCK_BOOKINGS.get(externalBookingId);
    if (existing) MOCK_BOOKINGS.set(externalBookingId, { ...existing, status: 'cancelled' });
  },

  async getBooking(externalBookingId: string): Promise<ProviderBooking | null> {
    return MOCK_BOOKINGS.get(externalBookingId) ?? null;
  },

  async findBookings({ unit, arrivalFrom, arrivalTo }): Promise<ProviderBooking[]> {
    return Array.from(MOCK_BOOKINGS.values()).filter(
      (b) =>
        b.externalRoomId === String(unit.externalRoomId) &&
        b.status !== 'cancelled' &&
        (b.checkIn ?? '') >= arrivalFrom &&
        (b.checkIn ?? '') <= arrivalTo
    );
  },
};

/**
 * The mock provider's booking store.
 *
 * Module scope, so it lives for one isolate or one test file and no longer.
 * It exists so the verification and reconciliation paths — read back after a
 * write, search for an uncertain create — are exercisable without a live
 * channel manager. `resetMockBookings()` is called between tests.
 */
const MOCK_BOOKINGS = new Map<string, ProviderBooking>();

export function resetMockBookings(): void {
  MOCK_BOOKINGS.clear();
}

/** The failure fixtures. See the table at the top of this file. */
function assertFixtureOutcome(checkIn: IsoDate, stage: 'quote' | 'hold'): void {
  const day = dayOfMonth(checkIn);
  if (day === 13) {
    throw new ProviderError('availability_conflict', 'Fixture: dates just taken');
  }
  if (day === 14) {
    throw new ProviderError('unavailable', 'Fixture: Beds24 unreachable');
  }
  if (day === 15 && stage === 'hold') {
    throw new ProviderError('availability_conflict', 'Fixture: taken between quote and hold');
  }
}
