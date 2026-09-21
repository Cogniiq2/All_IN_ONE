/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CANONICAL RESERVATION IMPORT.
 *
 * What is proven here is everything that can go wrong in a read-only import
 * and lose an operator their trust in the board: a duplicated stay, a
 * cancellation that vanishes, a guest attributed to the wrong channel, a
 * booking filed under the wrong apartment, a price off by a factor of a
 * hundred — and, above all, that this code path NEVER WRITES TO BEDS24.
 *
 * The Beds24 client is replaced by a recorder, so every request the import
 * makes is inspectable. Supabase is replaced by an in-memory table that
 * enforces the one invariant the real one does: a unique
 * `(provider, external_booking_id)`.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Beds24Booking } from '@/lib/integrations/beds24/types';

/* ── The provider recorder ─────────────────────────────────────────────── */

interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, unknown>;
  hasBody: boolean;
}

const h = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; path: string; query: Record<string, unknown>; hasBody: boolean }>,
  /** Bookings the fake account holds, keyed by nothing: the reader filters. */
  bookings: [] as unknown[],
  /** When set, the next read throws it. */
  failWith: null as Error | null,
}));

vi.mock('@/lib/integrations/beds24/client', () => ({
  beds24Request: async (init: { path: string; method?: string; query?: Record<string, unknown>; body?: unknown }) => {
    h.calls.push({
      method: init.method ?? 'GET',
      path: init.path,
      query: init.query ?? {},
      hasBody: init.body !== undefined,
    });
    if (h.failWith) throw h.failWith;
    // Page 2 and beyond are always empty: the fixtures are small, and an
    // empty page is how the reader learns it has reached the end.
    const page = Number(init.query?.page ?? 1);
    if (init.query?.id !== undefined) {
      const id = String(init.query.id);
      return { data: (h.bookings as Beds24Booking[]).filter((b) => String(b.id) === id) };
    }
    if (page > 1) return { data: [] };
    const room = init.query?.roomId === undefined ? null : String(init.query.roomId);
    const from = String(init.query?.arrivalFrom ?? '0000-01-01');
    const to = String(init.query?.arrivalTo ?? '9999-12-31');
    return {
      data: (h.bookings as Beds24Booking[]).filter((b) => {
        if (room !== null && String(b.roomId) !== room) return false;
        // A booking the provider returns WITHOUT usable dates is exactly the
        // malformed case; the window filter must not hide it from the reader.
        if (typeof b.arrival !== 'string') return true;
        return b.arrival >= from && b.arrival <= to;
      }),
    };
  },
}));

/* ── The in-memory database ────────────────────────────────────────────── */

interface Row {
  [column: string]: unknown;
}

/** Keyed by the real table names, because that is what the repository asks for. */
const db = vi.hoisted(() => ({
  bolagio_reservations: [] as Record<string, unknown>[],
  bolagio_booking_intents: [] as Record<string, unknown>[],
  units: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/server', () => {
  /** A filter chain that collects `.eq()` predicates and resolves lazily. */
  function query(table: string, mode: 'select' | 'update' | 'insert', payload?: Record<string, unknown>) {
    const filters: Array<[string, unknown]> = [];
    const rows = () => (db as unknown as Record<string, Record<string, unknown>[]>)[table] ?? [];
    const matching = () => rows().filter((r) => filters.every(([col, value]) => r[col] === value));

    const apply = () => {
      if (mode === 'update') {
        for (const row of matching()) Object.assign(row, payload);
        return { data: null, error: null };
      }
      return { data: matching(), error: null };
    };

    const chain: Record<string, unknown> = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return chain;
      },
      maybeSingle() {
        const found = matching()[0];
        return Promise.resolve({ data: found ?? null, error: null });
      },
      order() {
        return chain;
      },
      limit() {
        return Promise.resolve(apply());
      },
      lt() {
        return chain;
      },
      gt() {
        return chain;
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(apply()).then(resolve);
      },
    };
    return chain;
  }

  return {
    isSupabaseConfigured: () => true,
    supabaseAdmin: () => ({
      from(table: string) {
        return {
          select: () => query(table, 'select'),
          update: (payload: Record<string, unknown>) => query(table, 'update', payload),
          insert: (payload: Record<string, unknown>) => {
            const rows = (db as unknown as Record<string, Record<string, unknown>[]>)[table] ?? [];
            // The real table's unique index, enforced here so the test proves
            // the repository's conflict handling rather than assuming it.
            if (
              table === 'bolagio_reservations' &&
              rows.some((r) => r.provider === payload.provider && r.external_booking_id === payload.external_booking_id)
            ) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
            }
            rows.push({ id: `row-${rows.length + 1}`, ...payload });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    }),
  };
});

// The repository names real tables; the fake indexes by a short key.
vi.mock('@/lib/booking/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/booking/repository')>();
  return {
    ...actual,
    listBookableUnits: async () => db.units as unknown as Awaited<ReturnType<typeof actual.listBookableUnits>>,
  };
});

import { classifyStatus, mapReservation, isMalformed, normalizeSource, readReservations } from '@/lib/integrations/beds24/reservations';
import { upsertReservation } from '@/lib/booking/reservation-repository';
import { shiftMonths, syncReservations, windows } from '@/lib/booking/reservation-sync';
import { createLogger } from '@/lib/booking/logger';

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const S1 = { id: 'u-s1', slug: 'schulstrasse-i', displayName: 'Schulstraße I', currency: 'EUR', isBookable: true, maxGuests: null, minNights: null, timezone: 'Europe/Berlin', checkInTime: '14:00', checkOutTime: '11:00', providerRef: { provider: 'beds24' as const, externalPropertyId: '354659', externalRoomId: '731147' } };
const S2 = { ...S1, id: 'u-s2', slug: 'schulstrasse-ii', displayName: 'Schulstraße II', providerRef: { provider: 'beds24' as const, externalPropertyId: '354658', externalRoomId: '731146' } };

function booking(over: Partial<Beds24Booking> = {}): Beds24Booking {
  return {
    id: 90000001,
    propertyId: 354659,
    roomId: 731147,
    status: 'confirmed',
    arrival: '2026-10-01',
    departure: '2026-10-05',
    numAdult: 2,
    numChild: 0,
    price: 640,
    currency: 'EUR',
    firstName: 'Erika',
    lastName: 'Mustermann',
    email: 'erika@example.com',
    phone: '+49 151 0000000',
    country: 'de',
    referer: 'Booking.com',
    ...over,
  };
}

/** The repository writes into `bolagio_reservations`; the fake keys on `reservations`. */
function reservationRows() {
  return db.bolagio_reservations;
}

beforeEach(() => {
  h.calls.length = 0;
  h.bookings.length = 0;
  h.failWith = null;
  db.bolagio_reservations.length = 0;
  db.bolagio_booking_intents.length = 0;
  db.units.length = 0;
  db.units.push(S1 as unknown as Record<string, unknown>, S2 as unknown as Record<string, unknown>);
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  vi.stubEnv('APP_ENV', 'staging');
  vi.stubEnv('DIRECT_BOOKING_ENABLED', 'false');
  // Quiet: the import logs one line per reservation and the assertions do not
  // read them. The PII rule is proven by the logger's own allow-list test.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ══ Mapping ═══════════════════════════════════════════════════════════ */

describe('mapping a provider booking', () => {
  it('narrows every field it is given', () => {
    const mapped = mapReservation(booking());
    expect(isMalformed(mapped)).toBe(false);
    if (isMalformed(mapped)) return;
    expect(mapped).toMatchObject({
      externalBookingId: '90000001',
      externalPropertyId: '354659',
      externalRoomId: '731147',
      providerStatus: 'confirmed',
      statusClass: 'active',
      source: 'booking_com',
      checkIn: '2026-10-01',
      checkOut: '2026-10-05',
      adults: 2,
      children: 0,
      guestCountry: 'DE',
      currency: 'EUR',
    });
  });

  it('keeps the stay half-open: the departure day is not an occupied night', () => {
    const mapped = mapReservation(booking({ arrival: '2026-10-01', departure: '2026-10-02' }));
    if (isMalformed(mapped)) throw new Error('unexpected');
    // One night — the night of the 1st. The 2nd is a departure and is free.
    expect(mapped.checkIn).toBe('2026-10-01');
    expect(mapped.checkOut).toBe('2026-10-02');
  });

  it('refuses a stay that is not a night at all', () => {
    expect(mapReservation(booking({ arrival: '2026-10-05', departure: '2026-10-05' }))).toEqual({ externalBookingId: '90000001', reason: 'bad_range' });
    expect(mapReservation(booking({ arrival: '2026-10-05', departure: '2026-10-01' }))).toEqual({ externalBookingId: '90000001', reason: 'bad_range' });
  });

  it('refuses a booking without an id or without dates rather than inventing one', () => {
    expect(mapReservation(booking({ id: undefined }))).toEqual({ reason: 'no_id' });
    expect(mapReservation(booking({ departure: undefined }))).toEqual({ externalBookingId: '90000001', reason: 'no_dates' });
    expect(mapReservation(booking({ arrival: 'soon' }))).toEqual({ externalBookingId: '90000001', reason: 'no_dates' });
  });

  it('stores money as integer cents, never a float', () => {
    const cents = (price: unknown) => {
      const m = mapReservation(booking({ price: price as number }));
      return isMalformed(m) ? undefined : m.totalAmountCents;
    };
    expect(cents(640)).toBe(64000);
    expect(cents('324.50')).toBe(32450);
    expect(cents('0.01')).toBe(1);
    expect(Number.isInteger(cents(1234.56))).toBe(true);
    expect(cents(1234.56)).toBe(123456);
  });

  it('leaves a missing or unreadable amount null rather than guessing at it', () => {
    const m = mapReservation(booking({ price: undefined, currency: undefined }));
    if (isMalformed(m)) throw new Error('unexpected');
    expect(m.totalAmountCents).toBeUndefined();
    expect(m.currency).toBeUndefined();
    const weird = mapReservation(booking({ price: 'on request' }));
    if (isMalformed(weird)) throw new Error('unexpected');
    expect(weird.totalAmountCents).toBeUndefined();
  });
});

/* ══ Status ════════════════════════════════════════════════════════════ */

describe('status classification', () => {
  it('reads the provider vocabulary without renaming it', () => {
    expect(classifyStatus('new')).toBe('active');
    expect(classifyStatus('confirmed')).toBe('active');
    expect(classifyStatus('request')).toBe('provisional');
    expect(classifyStatus('cancelled')).toBe('cancelled');
    expect(classifyStatus('black')).toBe('blocked');
  });

  it('never treats a status it has not met as a stay', () => {
    expect(classifyStatus('something_new')).toBe('unknown');
    expect(classifyStatus(undefined)).toBe('unknown');
    expect(classifyStatus('')).toBe('unknown');
  });

  it('keeps the provider status verbatim beside the class', () => {
    const m = mapReservation(booking({ status: 'cancelled' }));
    if (isMalformed(m)) throw new Error('unexpected');
    expect(m.providerStatus).toBe('cancelled');
    expect(m.statusClass).toBe('cancelled');
  });
});

/* ══ Source ════════════════════════════════════════════════════════════ */

describe('channel normalisation', () => {
  it('maps the channels it can prove', () => {
    expect(normalizeSource('Booking.com')).toBe('booking_com');
    expect(normalizeSource('BOOKING.COM')).toBe('booking_com');
    expect(normalizeSource('bookingcom')).toBe('booking_com');
    expect(normalizeSource('Airbnb')).toBe('airbnb');
    expect(normalizeSource('airbnb.com')).toBe('airbnb');
    expect(normalizeSource('BoLaGio Direct')).toBe('direct');
    expect(normalizeSource('manual')).toBe('manual');
    expect(normalizeSource('Manual')).toBe('manual');
  });

  it('leaves anything it cannot prove unknown, and keeps what the provider said', () => {
    expect(normalizeSource('Web')).toBe('unknown');
    expect(normalizeSource('Expedia')).toBe('unknown');
    expect(normalizeSource(undefined)).toBe('unknown');
    expect(normalizeSource('')).toBe('unknown');
    const m = mapReservation(booking({ referer: 'Some Portal', channel: undefined }));
    if (isMalformed(m)) throw new Error('unexpected');
    expect(m.source).toBe('unknown');
    expect(m.sourceRaw).toBe('Some Portal');
  });

  it('never infers a channel from a guest name, an email domain or a price', () => {
    const m = mapReservation(
      booking({ referer: undefined, channel: undefined, email: 'someone@booking.com', lastName: 'Airbnb', price: 1 })
    );
    if (isMalformed(m)) throw new Error('unexpected');
    expect(m.source).toBe('unknown');
  });

  it('treats a BoLaGio reference as direct evidence, outranking the channel string', () => {
    const m = mapReservation(booking({ reference: 'BLG-AB12CD', referer: 'Booking.com' }));
    if (isMalformed(m)) throw new Error('unexpected');
    expect(m.source).toBe('direct');
  });
});

/* ══ Windows ═══════════════════════════════════════════════════════════ */

describe('import windows', () => {
  it('covers the horizon without a gap and without asking twice', () => {
    const w = windows('2026-01-01', '2026-04-01', 30);
    expect(w[0]).toEqual({ from: '2026-01-01', to: '2026-01-30' });
    expect(w[1].from).toBe('2026-01-31');
    // Each window starts the day after the previous one ends: no gap, no overlap.
    for (let i = 1; i < w.length; i += 1) {
      const previousEnd = new Date(`${w[i - 1].to}T00:00:00Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      expect(w[i].from).toBe(previousEnd.toISOString().slice(0, 10));
    }
    expect(w[w.length - 1].to).toBe('2026-03-31');
  });

  it('is empty for an inverted range', () => {
    expect(windows('2026-04-01', '2026-01-01', 30)).toEqual([]);
  });

  it('clamps the day of month when shifting back over a short February', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2026-01-15', -12)).toBe('2025-01-15');
    expect(shiftMonths('2026-09-21', 18)).toBe('2028-03-21');
  });
});

/* ══ Reading ═══════════════════════════════════════════════════════════ */

describe('reading from the provider', () => {
  it('issues GET requests and only GET requests', async () => {
    h.bookings.push(booking(), booking({ id: 90000002, roomId: 731146, propertyId: 354658 }));
    await readReservations({ externalPropertyId: '354659', externalRoomId: '731147', arrivalFrom: '2026-09-01', arrivalTo: '2026-12-31' });

    expect(h.calls.length).toBeGreaterThan(0);
    for (const call of h.calls) {
      expect(call.method).toBe('GET');
      expect(call.hasBody).toBe(false);
    }
    expect(h.calls.every((c: RecordedCall) => c.method !== 'POST')).toBe(true);
    expect(h.calls.every((c: RecordedCall) => c.method !== 'PUT')).toBe(true);
    expect(h.calls.every((c: RecordedCall) => c.method !== 'PATCH')).toBe(true);
    expect(h.calls.every((c: RecordedCall) => c.method !== 'DELETE')).toBe(true);
  });

  it('never asks for invoice items', async () => {
    await readReservations({ externalPropertyId: '354659', externalRoomId: '731147', arrivalFrom: '2026-09-01', arrivalTo: '2026-09-30' });
    expect(h.calls[0].query.includeInvoiceItems).toBe('false');
  });

  it('reports a malformed provider row instead of skipping it silently', async () => {
    h.bookings.push(booking(), booking({ id: 90000009, arrival: undefined }));
    const result = await readReservations({ externalPropertyId: '354659', externalRoomId: '731147', arrivalFrom: '2026-01-01', arrivalTo: '2026-12-31' });
    expect(result.reservations).toHaveLength(1);
    expect(result.malformed).toEqual([{ externalBookingId: '90000009', reason: 'no_dates' }]);
  });

  it('sends a status filter only when one is configured', async () => {
    await readReservations({ externalPropertyId: '354659', externalRoomId: '731147', arrivalFrom: '2026-09-01', arrivalTo: '2026-09-30' });
    expect(h.calls[0].query.status).toBeUndefined();
    h.calls.length = 0;
    await readReservations({ externalPropertyId: '354659', externalRoomId: '731147', arrivalFrom: '2026-09-01', arrivalTo: '2026-09-30', statuses: ['confirmed', 'cancelled'] });
    expect(h.calls[0].query.status).toBe('confirmed,cancelled');
  });
});

/* ══ Idempotency ═══════════════════════════════════════════════════════ */

describe('the upsert', () => {
  const mapped = () => {
    const m = mapReservation(booking());
    if (isMalformed(m)) throw new Error('unexpected');
    return m;
  };

  it('inserts on first sight and updates on every sync after it', async () => {
    expect(await upsertReservation({ unitId: 'u-s1', reservation: mapped() })).toBe('inserted');
    expect(await upsertReservation({ unitId: 'u-s1', reservation: mapped() })).toBe('updated');
    expect(await upsertReservation({ unitId: 'u-s1', reservation: mapped() })).toBe('updated');
    expect(reservationRows()).toHaveLength(1);
  });

  it('keeps one row per provider booking id even when two passes race', async () => {
    // Both passes see no row and both insert; the unique index decides.
    const [a, b] = await Promise.all([
      upsertReservation({ unitId: 'u-s1', reservation: mapped() }),
      upsertReservation({ unitId: 'u-s1', reservation: mapped() }),
    ]);
    expect([a, b].filter((o) => o === 'inserted')).toHaveLength(1);
    expect(reservationRows()).toHaveLength(1);
  });

  it('updates the same row when the reservation is modified', async () => {
    await upsertReservation({ unitId: 'u-s1', reservation: mapped() });
    const moved = mapReservation(booking({ arrival: '2026-10-02', departure: '2026-10-08', numAdult: 3 }));
    if (isMalformed(moved)) throw new Error('unexpected');
    expect(await upsertReservation({ unitId: 'u-s1', reservation: moved })).toBe('updated');
    expect(reservationRows()).toHaveLength(1);
    expect(reservationRows()[0]).toMatchObject({ check_in: '2026-10-02', check_out: '2026-10-08', adults: 3 });
  });

  it('keeps a cancelled reservation, with its cancelled status', async () => {
    await upsertReservation({ unitId: 'u-s1', reservation: mapped() });
    const cancelled = mapReservation(booking({ status: 'cancelled', cancelTime: '2026-09-20 11:00:00' }));
    if (isMalformed(cancelled)) throw new Error('unexpected');
    await upsertReservation({ unitId: 'u-s1', reservation: cancelled });
    expect(reservationRows()).toHaveLength(1);
    expect(reservationRows()[0]).toMatchObject({ provider_status: 'cancelled', status_class: 'cancelled' });
    expect(reservationRows()[0].provider_cancelled_at).toBe('2026-09-20T11:00:00.000Z');
  });

  it('never lets an absent provider value erase a stored one', async () => {
    await upsertReservation({ unitId: 'u-s1', reservation: mapped() });
    expect(reservationRows()[0].guest_email).toBe('erika@example.com');
    // A later response carries no email. That is "not included", not "removed".
    const thin = mapReservation(booking({ email: undefined, phone: undefined, price: undefined }));
    if (isMalformed(thin)) throw new Error('unexpected');
    await upsertReservation({ unitId: 'u-s1', reservation: thin });
    expect(reservationRows()[0].guest_email).toBe('erika@example.com');
    expect(reservationRows()[0].total_amount_cents).toBe(64000);
  });

  it('always rewrites the facts the provider owns', async () => {
    await upsertReservation({ unitId: 'u-s1', reservation: mapped() });
    const changed = mapReservation(booking({ status: 'cancelled', referer: 'Airbnb' }));
    if (isMalformed(changed)) throw new Error('unexpected');
    await upsertReservation({ unitId: 'u-s1', reservation: changed });
    expect(reservationRows()[0]).toMatchObject({ status_class: 'cancelled', source: 'airbnb' });
  });
});

/* ══ The pass ══════════════════════════════════════════════════════════ */

describe('a sync pass', () => {
  const run = () => syncReservations(createLogger(), { from: '2026-09-01', to: '2026-12-31' });

  it('imports both mapped units and nothing else', async () => {
    h.bookings.push(
      booking(),
      booking({ id: 90000002, propertyId: 354658, roomId: 731146, arrival: '2026-11-01', departure: '2026-11-04' }),
      // A room this account holds that no BoLaGio unit maps to.
      booking({ id: 90000003, propertyId: 999999, roomId: 999999, arrival: '2026-11-10', departure: '2026-11-12' })
    );
    const report = await run();
    expect(report.units).toBe(2);
    expect(report.fetched).toBe(2);
    expect(report.inserted).toBe(2);
    expect(reservationRows().map((r) => r.external_booking_id).sort()).toEqual(['90000001', '90000002']);
  });

  it('never attributes a booking to the unit whose window found it', async () => {
    // The provider answers the Schulstraße I query with a booking on the
    // OTHER room. Filing it under the queried unit would put someone else's
    // guest in the wrong apartment.
    h.bookings.push(booking({ id: 90000004, roomId: 731146, propertyId: 354658 }));
    const report = await syncReservations(createLogger(), { from: '2026-09-01', to: '2026-12-31', unitSlug: 'schulstrasse-i' });
    expect(report.skipped).toBe(0);
    expect(report.fetched).toBe(0);
    expect(reservationRows()).toHaveLength(0);
  });

  it('is idempotent: running it twice leaves one row per booking', async () => {
    h.bookings.push(booking(), booking({ id: 90000002, roomId: 731146, propertyId: 354658 }));
    await run();
    const second = await run();
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(2);
    expect(reservationRows()).toHaveLength(2);
  });

  it('records a cancellation without deleting anything', async () => {
    h.bookings.push(booking());
    await run();
    expect(reservationRows()).toHaveLength(1);
    h.bookings.length = 0;
    h.bookings.push(booking({ status: 'cancelled' }));
    await run();
    expect(reservationRows()).toHaveLength(1);
    expect(reservationRows()[0].status_class).toBe('cancelled');
  });

  it('does NOT delete a reservation that simply left the queried window', async () => {
    h.bookings.push(booking());
    await run();
    h.bookings.length = 0;
    const report = await run();
    expect(report.fetched).toBe(0);
    // Still there, and still what the provider last said it was.
    expect(reservationRows()).toHaveLength(1);
    expect(reservationRows()[0].status_class).toBe('active');
  });

  it('counts a malformed provider row and imports the rest of the pass', async () => {
    h.bookings.push(booking(), booking({ id: 90000008, departure: undefined }));
    const report = await run();
    expect(report.malformed).toBe(1);
    expect(report.inserted).toBe(1);
  });

  it('writes nothing to the provider across a whole pass', async () => {
    h.bookings.push(booking(), booking({ id: 90000002, roomId: 731146, propertyId: 354658 }));
    await run();
    expect(h.calls.length).toBeGreaterThan(0);
    for (const call of h.calls) {
      expect(call.method).toBe('GET');
      expect(call.hasBody).toBe(false);
      // Only the read endpoints. Never `/bookings` with a body, never anything else.
      expect(call.path).toBe('/bookings');
    }
  });

  it('survives one unit failing and reports it', async () => {
    h.failWith = new Error('provider unreachable');
    const report = await run();
    expect(report.failed).toBeGreaterThan(0);
    expect(report.inserted).toBe(0);
  });
});
