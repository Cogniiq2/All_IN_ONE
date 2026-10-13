/**
 * The admin's view of Beds24 synchronisation and the reservation screens:
 * stale and failed-webhook alerts, the freshness section, the reservation
 * filters, channel turnovers, and how a block at the channel is drawn.
 */

import { describe, expect, it } from 'vitest';
import { deriveAlerts, type AlertInput } from '@/lib/ops/alerts';
import { reservationFreshnessSection } from '@/lib/admin/queries';
import { parseReservationFilter, reservationFilterToParams, reservationQueryOf } from '@/lib/admin/reservation-filters';
import { channelTurnoversOf } from '@/lib/admin/cleaning';
import { barKind } from '@/components/admin/calendar/calendar-grid';
import { bedroomPackageLabel } from '@/lib/admin/presentation';
import type { ReservationDto } from '@/lib/admin/dto';
import type { SchedulerStatusRow } from '@/lib/admin/rows';

const NOW = new Date('2026-10-13T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 60 * 60_000;

function input(over: Partial<AlertInput> = {}): AlertInput {
  return {
    now: NOW,
    queues: [],
    databaseReachable: true,
    schedulers: (['reconcile', 'operations', 'inventory_sync', 'reservation_sync'] as const).map((job) => ({
      job, started_at: ago(60_000), finished_at: ago(60_000), ok: true, report: null, error: null, worker: null,
    })),
    attention: [],
    configFindings: [],
    inventory: [{ unitSlug: 'schulstrasse-i', oldestSync: ago(60_000) }],
    ...over,
  };
}
const codes = (over: Partial<AlertInput>) => deriveAlerts(input(over)).alerts.map((a) => a.code);

describe('reservation freshness alerts', () => {
  it('stay silent while every upcoming reservation is fresh and no webhook refresh failed', () => {
    const c = codes({ reservationSync: { staleActive: 0, oldestSeen: ago(H), failedWebhooks: 0, lastWebhookAt: ago(H) } });
    expect(c).not.toContain('RESERVATIONS_STALE');
    expect(c).not.toContain('BEDS24_WEBHOOK_REFRESH_FAILED');
  });

  it('raise RESERVATIONS_STALE when an upcoming reservation has not been seen for a day', () => {
    const report = deriveAlerts(input({ reservationSync: { staleActive: 8, oldestSeen: ago(21 * 24 * H), failedWebhooks: 0, lastWebhookAt: null } }));
    const alert = report.alerts.find((a) => a.code === 'RESERVATIONS_STALE');
    expect(alert).toMatchObject({ level: 'MEDIUM', count: 8 });
    expect(alert!.detail).toContain('8 upcoming reservations have not been confirmed');
  });

  it('raise BEDS24_WEBHOOK_REFRESH_FAILED for an unrepaired delivery', () => {
    expect(codes({ reservationSync: { staleActive: 0, oldestSeen: null, failedWebhooks: 2, lastWebhookAt: ago(H) } })).toContain('BEDS24_WEBHOOK_REFRESH_FAILED');
  });

  it('report unreadable freshness as not instrumented, never as healthy', () => {
    expect(deriveAlerts(input({ reservationSync: null })).notInstrumented).toContain('reservation freshness (not readable)');
  });
});

describe('the freshness section', () => {
  const run = (finishedAgoMs: number, ok = true): SchedulerStatusRow => ({ job: 'reservation_sync', started_at: ago(finishedAgoMs), finished_at: ago(finishedAgoMs), ok, report: null, error: null, worker: null });

  it('is healthy when the import is on time and nothing is stale', () => {
    const s = reservationFreshnessSection({ staleActive: 0, oldestSeen: ago(H), failedWebhooks: 0, lastWebhookAt: ago(3 * H) }, run(20 * 60_000), NOW);
    expect(s.status).toBe('healthy');
    expect(s.facts.find((f) => f.label === 'Last webhook')?.value).toBe('3 h ago');
  });

  it('says exactly why the board may be stale — the live state of 2026-10-13', () => {
    // Last recorded import run a day and a half ago, eight upcoming Apartment II stays unseen for three weeks.
    const s = reservationFreshnessSection({ staleActive: 8, oldestSeen: ago(21 * 24 * H), failedWebhooks: 0, lastWebhookAt: ago(26 * H) }, run(33 * H, false), NOW);
    expect(s.status).toBe('attention');
    expect(s.summary).toContain('the scheduled import is overdue');
    expect(s.summary).toContain('8 upcoming reservations have not been refreshed');
  });

  it('is unavailable — not healthy — when freshness cannot be read', () => {
    expect(reservationFreshnessSection(null, null, NOW).status).toBe('unavailable');
  });
});

describe('reservation filters', () => {
  it('parse only known values, defaulting to upcoming', () => {
    const f = parseReservationFilter({ q: 'Müller', source: 'booking_com', status: 'nonsense', unit: 'schulstrasse-ii', from: '2026-11-01', to: 'x' });
    expect(f).toEqual({ q: 'Müller', unit: 'schulstrasse-ii', source: 'booking_com', status: null, from: '2026-11-01', to: null, when: 'upcoming' });
    expect(reservationFilterToParams(f).toString()).toBe('q=M%C3%BCller&unit=schulstrasse-ii&source=booking_com&from=2026-11-01');
  });

  it('turn into a query: upcoming by departure, past newest first, a date range as an overlap', () => {
    const base = parseReservationFilter({});
    expect(reservationQueryOf(base, '2026-10-13', null)).toMatchObject({ checkOutFrom: '2026-10-13', dir: 'asc' });
    expect(reservationQueryOf({ ...base, when: 'past' }, '2026-10-13', null)).toMatchObject({ checkOutTo: '2026-10-13', dir: 'desc' });
    expect(reservationQueryOf({ ...base, from: '2026-11-01', to: '2026-12-01' }, '2026-10-13', null).overlaps).toEqual({ from: '2026-11-01', to: '2026-12-01' });
  });
});

function stay(over: Partial<ReservationDto>): ReservationDto {
  return {
    id: 'r', externalBookingId: '1', provider: 'beds24', unitSlug: 'schulstrasse-i', unitName: 'Apartment I', source: 'booking_com',
    sourceRaw: null, sourceApiId: 19, channelReference: null, providerStatus: 'confirmed', statusClass: 'active', occupies: true,
    checkIn: '2026-10-10', checkOut: '2026-10-14', nights: 4, guestLabel: null, guestCountry: null, adults: 2, children: 0, guests: 2,
    currency: null, totalCents: null, bookedAt: null, modifiedAt: null, cancelledAt: null, directReference: null,
    lastSyncedAt: NOW.toISOString(), bedroomPackage: null, offerId: 0, ...over,
  };
}

describe('channel turnovers', () => {
  it('pair a departure with the next stay in the same apartment and flag a same-day changeover', () => {
    const out = stay({ id: 'a', checkIn: '2026-10-10', checkOut: '2026-10-14' });
    const sameDay = stay({ id: 'b', checkIn: '2026-10-14', checkOut: '2026-10-16', adults: 3, bedroomPackage: 'two_bedroom' });
    const otherUnit = stay({ id: 'c', unitSlug: 'schulstrasse-ii', checkIn: '2026-10-14', checkOut: '2026-10-15' });
    const cancelled = stay({ id: 'd', checkIn: '2026-10-14', checkOut: '2026-10-15', statusClass: 'cancelled', occupies: false });
    const [t] = channelTurnoversOf([out], [out, sameDay, otherUnit, cancelled]);
    expect(t.next?.id).toBe('b');
    expect(t.sameDay).toBe(true);
    expect(t.gapNights).toBe(0);
    expect(bedroomPackageLabel(t.next!.bedroomPackage)).toBe('2 Bedrooms');
  });

  it('count the free nights before the next arrival, and say when nothing follows', () => {
    const out = stay({ id: 'a', checkOut: '2026-10-14' });
    const later = stay({ id: 'b', checkIn: '2026-10-17', checkOut: '2026-10-19' });
    expect(channelTurnoversOf([out], [out, later])[0]).toMatchObject({ sameDay: false, gapNights: 3 });
    expect(channelTurnoversOf([out], [out])[0]).toMatchObject({ next: null, gapNights: null });
  });
});

describe('a block at the channel', () => {
  it('is drawn as a block, not as a cancelled stay', () => {
    expect(barKind({ kind: 'reservation', status: 'blocked', occupies: false })).toBe('channel_blocked');
    expect(barKind({ kind: 'reservation', status: 'cancelled', occupies: false })).toBe('channel_cancelled');
    expect(barKind({ kind: 'reservation', status: 'active', occupies: true })).toBe('channel_stay');
  });

  it('a channel booking without a stated setup reads unknown, never a guess', () => {
    expect(bedroomPackageLabel(null)).toBeNull();
    expect(bedroomPackageLabel('one_bedroom')).toBe('1 Bedroom');
  });
});
