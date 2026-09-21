/**
 * ══════════════════════════════════════════════════════════════════════════
 * CANONICAL RESERVATIONS IN THE OPERATIONS INTERFACE.
 *
 * The derivations that decide what an operator sees, and the migration's own
 * security posture. Both are pure and cheap to prove, and both are the kind
 * of thing that silently rots: an occupancy figure that counts a cancelled
 * Booking.com stay looks perfectly plausible until the apartment is empty.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { reservationClassPresentation, reservationOccupies, sourcePresentation } from '@/lib/admin/presentation';
import { barKind } from '@/components/admin/calendar/calendar-grid';
import { buildCleaningBoard } from '@/lib/admin/cleaning';
import { nightsCovered, occupancyRatio, windowOf } from '@/lib/admin/calendar';
import type { CalendarReservationDto, ReservationDto } from '@/lib/admin/dto';

const MIGRATION = readFileSync(
  path.resolve(__dirname, '..', 'supabase', 'migrations', '20260923120000_reservation_import.sql'),
  'utf8'
);

function stay(over: Partial<CalendarReservationDto> = {}): CalendarReservationDto {
  return {
    reference: '90000001',
    kind: 'reservation',
    href: null,
    unitSlug: 'schulstrasse-i',
    checkIn: '2026-10-01',
    checkOut: '2026-10-05',
    nights: 4,
    status: 'active',
    paymentStatus: 'not_applicable',
    source: 'booking_com',
    guestLabel: 'E. Mustermann',
    adults: 2,
    children: 0,
    occupies: true,
    ...over,
  };
}

function reservation(over: Partial<ReservationDto> = {}): ReservationDto {
  return {
    id: 'r-1',
    externalBookingId: '90000001',
    provider: 'beds24',
    unitSlug: 'schulstrasse-i',
    unitName: 'Schulstraße I',
    source: 'booking_com',
    sourceRaw: 'Booking.com',
    channelReference: '4123456789',
    providerStatus: 'confirmed',
    statusClass: 'active',
    occupies: true,
    checkIn: '2026-10-01',
    checkOut: '2026-10-05',
    nights: 4,
    guestLabel: 'E. Mustermann',
    guestCountry: 'DE',
    adults: 2,
    children: 0,
    guests: 2,
    currency: 'EUR',
    totalCents: 64000,
    bookedAt: '2026-09-01T09:00:00.000Z',
    modifiedAt: null,
    cancelledAt: null,
    directReference: null,
    lastSyncedAt: '2026-09-21T06:00:00.000Z',
    ...over,
  };
}

/* ── Occupancy ─────────────────────────────────────────────────────────── */

describe('what occupies a unit', () => {
  it('counts only a real stay', () => {
    expect(reservationOccupies('active')).toBe(true);
    expect(reservationOccupies('provisional')).toBe(false);
    expect(reservationOccupies('cancelled')).toBe(false);
    expect(reservationOccupies('blocked')).toBe(false);
    expect(reservationOccupies('unknown')).toBe(false);
  });

  it('leaves a cancelled channel stay out of occupancy while keeping it visible', () => {
    const window = windowOf('2026-10-01', 7);
    const live = stay();
    const dead = stay({ reference: '90000003', status: 'cancelled', occupies: false });
    const drawn = [live, dead];
    // Both are drawn — an operator has to see the cancellation.
    expect(drawn).toHaveLength(2);
    // Only one is counted.
    const counted = drawn.filter((r) => r.occupies);
    expect(occupancyRatio(counted, window, 1)).toBeCloseTo(4 / 7, 5);
    // And counting the cancelled one would be visibly wrong — the same four
    // nights twice, which is the failure this filter exists to prevent.
    expect(occupancyRatio(drawn, window, 1)).toBeGreaterThan(4 / 7);
  });

  it('does not let a cancelled stay explain a night that is still closed at the channel', () => {
    const covered = nightsCovered([stay({ status: 'cancelled', occupies: false })].filter((r) => r.occupies));
    expect(covered.size).toBe(0);
  });
});

/* ── The two vocabularies ──────────────────────────────────────────────── */

describe('channel reservations are never dressed as direct bookings', () => {
  it('gets its own bar kind, whatever its status string', () => {
    expect(barKind(stay())).toBe('channel_stay');
    expect(barKind(stay({ status: 'cancelled', occupies: false }))).toBe('channel_cancelled');
    // Even a status word the booking state machine happens to share.
    expect(barKind(stay({ status: 'confirmed', occupies: true }))).toBe('channel_stay');
    // A direct booking keeps the booking-state vocabulary.
    expect(barKind({ kind: 'intent', status: 'confirmed', occupies: true })).toBe('confirmed');
    expect(barKind({ kind: 'intent', status: 'paid_unfinalized', occupies: true })).toBe('paid_unfinalized');
  });

  it('reads a provider status class without borrowing a booking state label', () => {
    expect(reservationClassPresentation('active').label).toBe('Booked');
    expect(reservationClassPresentation('cancelled').label).toBe('Cancelled');
    expect(reservationClassPresentation('blocked').label).toBe('Blocked');
    expect(reservationClassPresentation('provisional').label).toBe('Requested');
    // A class this interface has not met is never shown as healthy.
    expect(reservationClassPresentation('something_new').label).toBe('Unknown');
    expect(reservationClassPresentation('something_new').tone).toBe('neutral');
  });

  it('names an unidentified channel as unidentified, never as direct', () => {
    expect(sourcePresentation('unknown').label).toBe('Channel not identified');
    expect(sourcePresentation('booking_com').label).toBe('Booking.com');
    expect(sourcePresentation('direct').label).toBe('Direct');
  });
});

/* ── Cleaning ──────────────────────────────────────────────────────────── */

describe('the cleaning board', () => {
  const today = '2026-10-01';
  const now = new Date('2026-10-01T09:00:00Z');

  it('lists channel departures from today onwards, soonest first', () => {
    const board = buildCleaningBoard([], today, now, [
      reservation({ id: 'a', checkOut: '2026-10-09' }),
      reservation({ id: 'b', checkOut: '2026-10-03' }),
      reservation({ id: 'c', checkOut: today }),
    ]);
    expect(board.channelDepartures.map((r) => r.checkOut)).toEqual(['2026-10-01', '2026-10-03', '2026-10-09']);
  });

  it('leaves out a departure that already happened, and one that was cancelled', () => {
    const board = buildCleaningBoard([], today, now, [
      reservation({ id: 'past', checkOut: '2026-09-28' }),
      reservation({ id: 'gone', checkOut: '2026-10-04', statusClass: 'cancelled', occupies: false }),
      reservation({ id: 'real', checkOut: '2026-10-05' }),
    ]);
    expect(board.channelDepartures.map((r) => r.id)).toEqual(['real']);
  });

  it('does not turn a channel departure into a turnover count', () => {
    const board = buildCleaningBoard([], today, now, [reservation({ checkOut: '2026-10-05' })]);
    // The turnover counts are about derived work orders, which channel
    // reservations deliberately do not create in this release.
    expect(board.counts).toEqual({ open: 0, overdue: 0, sameDay: 0, unassigned: 0 });
    expect(board.channelDepartures).toHaveLength(1);
  });
});

/* ── The migration's posture ───────────────────────────────────────────── */

describe('the reservation migration', () => {
  it('enables row level security and grants the browser roles nothing', () => {
    expect(MIGRATION).toMatch(/alter table bolagio_reservations enable row level security/i);
    expect(MIGRATION).toMatch(/revoke all on bolagio_reservations from anon, authenticated/i);
    // No permissive policy: RLS on with no policy is the deny-everything posture.
    expect(MIGRATION).not.toMatch(/create policy/i);
    expect(MIGRATION).not.toMatch(/grant\s+(select|all|insert|update|delete)[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i);
  });

  it('is additive: it drops no table, no column and no type', () => {
    expect(MIGRATION).not.toMatch(/drop\s+table/i);
    expect(MIGRATION).not.toMatch(/drop\s+column/i);
    expect(MIGRATION).not.toMatch(/drop\s+type/i);
    expect(MIGRATION).not.toMatch(/\btruncate\b/i);
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i);
  });

  it('only ever touches bolagio_ objects', () => {
    const created = Array.from(MIGRATION.matchAll(/create\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:table|type|index|trigger)\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)).map((m) => m[1]);
    expect(created.length).toBeGreaterThan(5);
    for (const name of created) expect(name.startsWith('bolagio_')).toBe(true);
  });

  it('widens the scheduler job check rather than narrowing it', () => {
    const check = /check \(job in \('reconcile', 'inventory_sync', 'operations', 'reservation_sync'\)\)/;
    expect(MIGRATION).toMatch(check);
    // Every name the constraint accepted before is still accepted.
    for (const job of ['reconcile', 'inventory_sync', 'operations']) {
      expect(MIGRATION).toContain(`'${job}'`);
    }
  });

  it('stores money as an integer and refuses a negative amount', () => {
    expect(MIGRATION).toMatch(/total_amount_cents\s+integer/);
    expect(MIGRATION).toMatch(/total_amount_cents\s+is\s+null\s+or\s+total_amount_cents\s+>=\s+0/);
    expect(MIGRATION).not.toMatch(/total_amount\s+(numeric|decimal|real|double)/i);
  });

  it('keeps hotel date semantics: a half-open stay, and a departure after the arrival', () => {
    expect(MIGRATION).toMatch(/daterange\(check_in, check_out, '\[\)'\)/);
    expect(MIGRATION).toMatch(/check \(check_out > check_in\)/);
  });

  it('identifies a reservation by provider and provider booking id, uniquely', () => {
    expect(MIGRATION).toMatch(/create unique index[^;]*bolagio_reservations \(provider, external_booking_id\)/i);
  });

  it('holds no identity-document field', () => {
    for (const forbidden of ['passport', 'id_number', 'identity_document', 'date_of_birth', 'nationality_document']) {
      expect(MIGRATION.toLowerCase()).not.toContain(forbidden);
    }
  });
});
