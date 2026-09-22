/**
 * ══════════════════════════════════════════════════════════════════════════
 * POST /api/webhooks/beds24 — the real-time reservation path.
 *
 *     Booking.com → Beds24 → this endpoint → fresh GET → Supabase
 *
 * What is proven here is everything that makes that safe rather than merely
 * fast:
 *
 *  1. AUTHENTICATION first, in both transports, before the body is read.
 *  2. The PAYLOAD IS A TRIGGER. The reservation written is the one the fresh
 *     GET returned, never the one the delivery claimed.
 *  3. NEW, MODIFIED and CANCELLED all reach the store — including under an
 *     action word this code has never seen, which is the case the old
 *     action gate got wrong.
 *  4. IDEMPOTENCE. A repeated delivery is acknowledged and dropped without
 *     touching the provider; a re-delivery that differs converges on one row.
 *  5. NO BEDS24 WRITES, ever.
 *  6. NO PII in the response or in a log line.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'a-long-random-beds24-webhook-secret';

/** What the FORGED payload claims. None of it may be believed or stored. */
const CLAIMED = {
  firstName: 'Mallory',
  lastName: 'Forgery',
  email: 'mallory@attacker.example',
  status: 'cancelled',
  price: '1.00',
};

/** What Beds24 actually says when asked. This is what must be stored. */
const TRUTH = {
  id: 76543210,
  propertyId: 354659,
  roomId: 731147,
  status: 'confirmed',
  arrival: '2026-04-02',
  departure: '2026-04-06',
  price: '480.00',
  currency: 'EUR',
  apiSourceId: 19,
  firstName: 'Erika',
  lastName: 'Mustermann',
  email: 'erika.mustermann@example.com',
  phone: '+491510000000',
};

const h = vi.hoisted(() => ({
  /** Every provider call, so a write is visible rather than assumed. */
  calls: [] as Array<{ method: string; path: string; query: Record<string, unknown>; hasBody: boolean }>,
  /** What the fake Beds24 account answers a single-booking read with. */
  booking: null as Record<string, unknown> | null,
  /** Payload hashes already stored, i.e. the duplicate index. */
  seen: new Set<string>(),
  events: [] as Array<{ eventType: string; externalId?: string }>,
  marks: [] as Array<{ status: string }>,
  /** Everything `upsertReservation` was asked to write. */
  stored: [] as Array<{ externalBookingId: string; providerStatus: string; totalAmountCents?: number }>,
  inventory: [] as string[],
  syncs: [] as string[],
  reconciliations: [] as string[],
  /** Log lines, so PII can be asserted absent from them too. */
  logs: [] as string[],
  /** Injects a mid-processing failure, to prove the route still acknowledges. */
  failInventory: false,
}));

vi.mock('@/lib/integrations/beds24/client', () => ({
  beds24Request: async (init: { path: string; method?: string; query?: Record<string, unknown>; body?: unknown }) => {
    h.calls.push({
      method: init.method ?? 'GET',
      path: init.path,
      query: init.query ?? {},
      hasBody: init.body !== undefined,
    });
    const id = String(init.query?.id ?? '');
    return { data: h.booking && String(h.booking.id) === id ? [h.booking] : [] };
  },
}));

vi.mock('@/lib/booking/repository', () => ({
  recordIntegrationEvent: async (input: { eventType: string; externalId?: string; payloadHash: string }) => {
    if (h.seen.has(input.payloadHash)) return { id: '', duplicate: true };
    h.seen.add(input.payloadHash);
    h.events.push({ eventType: input.eventType, externalId: input.externalId });
    return { id: `evt-${h.events.length}`, duplicate: false };
  },
  markIntegrationEvent: async (_id: string, status: string) => {
    h.marks.push({ status });
  },
  findUnitByProviderRoom: async (_p: string, room: string) => (room === '731147' ? 'unit-1' : null),
  invalidateInventory: async (unitId: string, from: string, to: string) => {
    if (h.failInventory) throw new Error('database down');
    h.inventory.push(`${unitId}:${from}:${to}`);
  },
  findIntentByProviderBookingId: async () => null,
  listBookableUnits: async () => [
    {
      id: 'unit-1',
      slug: 'schulstrasse-i',
      providerRef: { externalPropertyId: '354659', externalRoomId: '731147' },
    },
  ],
}));

vi.mock('@/lib/booking/commands', () => ({
  queueReconciliation: async (intentId: string) => {
    h.reconciliations.push(intentId);
  },
  observeIntegration: () => {},
}));

vi.mock('@/lib/booking/service', () => ({
  syncInventory: async (_logger: unknown, slug: string) => {
    h.syncs.push(slug);
  },
}));

vi.mock('@/lib/booking/reservation-repository', () => ({
  upsertReservation: async (input: { reservation: Record<string, unknown> }) => {
    h.stored.push({
      externalBookingId: input.reservation.externalBookingId as string,
      providerStatus: input.reservation.providerStatus as string,
      totalAmountCents: input.reservation.totalAmountCents as number | undefined,
    });
    return 'updated';
  },
  findIntentIdForProviderBooking: async () => null,
}));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'schulstrasse-i' }, error: null }) }) }),
    }),
  }),
}));

import { POST } from '@/app/api/webhooks/beds24/route';

let nonce = 0;

/** A delivery. `fresh` makes the body unique, as a Beds24 retry with a new timestamp would be. */
function delivery(
  body: Record<string, unknown>,
  options: { header?: string | null; query?: string; fresh?: boolean } = {}
): NextRequest {
  const url = `https://bolagio.example/api/webhooks/beds24${options.query ?? ''}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const header = options.header === undefined ? SECRET : options.header;
  if (header !== null) headers['x-bolagio-signature'] = header;
  const payload = options.fresh ? { ...body, timeStamp: `2026-04-01T10:00:${String(nonce++).padStart(2, '0')}Z` } : body;
  return new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(payload) });
}

/** A Beds24 delivery for our booking: signal only, deliberately mendacious. */
const signalFor = (action: string, extra: Record<string, unknown> = {}) => ({
  action,
  bookingId: TRUTH.id,
  propertyId: TRUTH.propertyId,
  roomId: TRUTH.roomId,
  booking: { id: TRUTH.id, arrival: TRUTH.arrival, departure: TRUTH.departure, ...CLAIMED },
  ...extra,
});

beforeEach(() => {
  h.calls.length = 0;
  h.events.length = 0;
  h.marks.length = 0;
  h.stored.length = 0;
  h.inventory.length = 0;
  h.syncs.length = 0;
  h.reconciliations.length = 0;
  h.logs.length = 0;
  h.seen.clear();
  h.failInventory = false;
  h.booking = { ...TRUTH };
  vi.stubEnv('BEDS24_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('DIRECT_BOOKING_ENABLED', 'false');
  const capture = (...args: unknown[]) => { h.logs.push(args.map(String).join(' ')); };
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('authentication', () => {
  it('refuses a delivery with no secret at all, before reading the body', async () => {
    const response = await POST(delivery(signalFor('created'), { header: null }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(h.events).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });

  it('refuses a wrong secret, and a prefix of the right one', async () => {
    expect((await POST(delivery(signalFor('created'), { header: 'nope' }))).status).toBe(401);
    expect((await POST(delivery(signalFor('created'), { header: SECRET.slice(0, 12) }))).status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  it('refuses everything when BEDS24_WEBHOOK_SECRET is unset', async () => {
    vi.stubEnv('BEDS24_WEBHOOK_SECRET', '');
    expect((await POST(delivery(signalFor('created')))).status).toBe(401);
    expect((await POST(delivery(signalFor('created'), { header: null, query: '?token=' }))).status).toBe(401);
    expect(h.events).toHaveLength(0);
  });

  it('accepts the header transport', async () => {
    expect((await POST(delivery(signalFor('created')))).status).toBe(200);
    expect(h.stored).toHaveLength(1);
  });

  it('accepts the query-parameter transport, for a Beds24 that cannot send a header', async () => {
    const response = await POST(
      delivery(signalFor('created'), { header: null, query: `?token=${encodeURIComponent(SECRET)}` })
    );
    expect(response.status).toBe(200);
    expect(h.stored).toHaveLength(1);
  });

  it('refuses a wrong query token', async () => {
    const response = await POST(delivery(signalFor('created'), { header: null, query: '?token=not-the-secret' }));
    expect(response.status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });
});

describe('the payload is a trigger, never the truth', () => {
  it('stores what the fresh GET returned, not what the delivery claimed', async () => {
    await POST(delivery(signalFor('cancelled')));
    // The delivery said cancelled at 1.00. Beds24 says confirmed at 480.00.
    expect(h.stored).toEqual([
      { externalBookingId: String(TRUTH.id), providerStatus: 'confirmed', totalAmountCents: 48000 },
    ]);
  });

  it('reads the booking by id, with one GET and no body', async () => {
    await POST(delivery(signalFor('modified')));
    const reads = h.calls.filter((c) => c.path === '/bookings');
    expect(reads).toHaveLength(1);
    expect(reads[0]).toEqual({
      method: 'GET',
      path: '/bookings',
      query: { id: String(TRUTH.id), includeInvoiceItems: 'false' },
      hasBody: false,
    });
  });

  it('ignores a booking id that is not a provider id, and never sends it on', async () => {
    for (const bookingId of [{ evil: true }, ['x'], 'not-an-id', "1' OR 1=1--", -5, 0]) {
      h.calls.length = 0;
      await POST(delivery({ action: 'created', bookingId }, { fresh: true }));
      expect(h.calls.filter((c) => c.path === '/bookings')).toHaveLength(0);
    }
  });

  it('falls back to booking.id when the envelope carries none', async () => {
    await POST(delivery({ action: 'created', booking: { id: TRUTH.id } }));
    expect(h.calls.filter((c) => c.path === '/bookings')).toHaveLength(1);
  });
});

describe('new, modified and cancelled', () => {
  it('stores a new booking', async () => {
    await POST(delivery(signalFor('created')));
    expect(h.stored[0].providerStatus).toBe('confirmed');
  });

  it('stores a modification, taking the provider’s dates and amount', async () => {
    h.booking = { ...TRUTH, departure: '2026-04-09', price: '720.00' };
    await POST(delivery(signalFor('modified')));
    expect(h.stored[0]).toMatchObject({ providerStatus: 'confirmed', totalAmountCents: 72000 });
  });

  it('stores a cancellation as the provider reports it', async () => {
    h.booking = { ...TRUTH, status: 'cancelled' };
    await POST(delivery(signalFor('cancelled')));
    expect(h.stored[0].providerStatus).toBe('cancelled');
  });

  it('refreshes under an action word this code has never seen', async () => {
    // The regression the old RESERVATION_ACTIONS gate would have caused: a
    // cancellation announced as `BOOKING_CANCELLED` was silently not read.
    h.booking = { ...TRUTH, status: 'cancelled' };
    await POST(delivery(signalFor('BOOKING_CANCELLED')));
    expect(h.stored[0].providerStatus).toBe('cancelled');
  });

  it('refreshes even when the delivery carries no action at all', async () => {
    await POST(delivery({ bookingId: TRUTH.id }));
    expect(h.stored).toHaveLength(1);
  });

  it('never infers a cancellation from a booking the provider did not return', async () => {
    h.booking = null;
    const response = await POST(delivery(signalFor('cancelled')));
    expect(response.status).toBe(200);
    // Absence is evidence of nothing: nothing is written, and the scheduled
    // import stays the floor under this.
    expect(h.stored).toHaveLength(0);
  });

  it('skips a booking on a room no mapping covers', async () => {
    h.booking = { ...TRUTH, roomId: 999999 };
    await POST(delivery(signalFor('created')));
    expect(h.stored).toHaveLength(0);
  });
});

describe('idempotence', () => {
  it('drops an identical re-delivery without touching the provider', async () => {
    const body = signalFor('created');
    expect((await POST(delivery(body))).status).toBe(200);
    const after = h.calls.length;
    for (let i = 0; i < 4; i += 1) expect((await POST(delivery(body))).status).toBe(200);
    expect(h.calls).toHaveLength(after);
    expect(h.stored).toHaveLength(1);
    expect(h.events).toHaveLength(1);
  });

  it('converges on one reservation when a retry differs by a timestamp', async () => {
    // A retry whose body is not byte-identical is processed again — it must
    // be safe, not merely rare. Every pass writes the same provider truth to
    // the same key.
    for (let i = 0; i < 3; i += 1) await POST(delivery(signalFor('modified'), { fresh: true }));
    expect(h.stored).toHaveLength(3);
    expect(new Set(h.stored.map((s) => s.externalBookingId)).size).toBe(1);
    expect(new Set(h.stored.map((s) => s.providerStatus))).toEqual(new Set(['confirmed']));
  });

  it('records the delivery before processing it, so a crash cannot replay forever', async () => {
    await POST(delivery(signalFor('created')));
    expect(h.events).toHaveLength(1);
    expect(h.marks).toEqual([{ status: 'processed' }]);
  });
});

describe('no writes to Beds24', () => {
  it('issues GETs and nothing else, across every action', async () => {
    for (const action of ['created', 'modified', 'cancelled', 'unknown-word', 'black']) {
      await POST(delivery(signalFor(action), { fresh: true }));
    }
    expect(h.calls.length).toBeGreaterThan(0);
    for (const call of h.calls) {
      expect(call.method).toBe('GET');
      expect(call.hasBody).toBe(false);
    }
  });

  it('leaves the direct-booking gate exactly where it was', async () => {
    const { directBookingEnabled } = await import('@/lib/booking/config');
    expect(directBookingEnabled()).toBe(false);
    await POST(delivery(signalFor('created')));
    expect(directBookingEnabled()).toBe(false);
  });
});

describe('the response and the logs', () => {
  it('answers 200 with nothing but an acknowledgement', async () => {
    const response = await POST(delivery(signalFor('created')));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('still answers 200 when processing fails, so Beds24 does not retry forever', async () => {
    // The delivery is already durably stored by then; a 500 would make Beds24
    // redeliver something that was accepted. The failure is recorded against
    // the event instead, where an operator can see it.
    h.failInventory = true;
    const response = await POST(delivery(signalFor('created')));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(h.marks).toEqual([{ status: 'failed' }]);
    // And nothing of the database error reaches the caller.
    expect(h.logs.join(' ')).toContain('database down');
  });

  it('answers 200 on a body that is not JSON', async () => {
    const request = new NextRequest('https://bolagio.example/api/webhooks/beds24', {
      method: 'POST',
      headers: { 'x-bolagio-signature': SECRET, 'content-type': 'application/json' },
      body: 'not json',
    });
    expect((await POST(request)).status).toBe(200);
    expect(h.calls).toHaveLength(0);
  });

  it('puts no guest personal data in the response or in any log line', async () => {
    const response = await POST(delivery(signalFor('created')));
    const text = `${JSON.stringify(await response.json())} ${h.logs.join(' ')}`;
    for (const value of [
      TRUTH.firstName, TRUTH.lastName, TRUTH.email, TRUTH.phone,
      CLAIMED.firstName, CLAIMED.lastName, CLAIMED.email,
    ]) {
      expect(text).not.toContain(value);
    }
    for (const field of ['firstName', 'lastName', 'email', 'phone', 'guest']) {
      expect(text.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  it('never leaks the webhook secret into a log line', async () => {
    await POST(delivery(signalFor('created'), { header: null, query: `?token=${encodeURIComponent(SECRET)}` }));
    expect(h.logs.join(' ')).not.toContain(SECRET);
  });
});

describe('the inventory side, unchanged', () => {
  it('closes the affected nights and resyncs the unit', async () => {
    await POST(delivery(signalFor('created')));
    expect(h.inventory).toEqual([`unit-1:${TRUTH.arrival}:${TRUTH.departure}`]);
    expect(h.syncs).toEqual(['schulstrasse-i']);
  });

  it('does not close nights for an action that is not an inventory action', async () => {
    await POST(delivery(signalFor('some-other-action')));
    expect(h.inventory).toHaveLength(0);
    // …but the reservation is still refreshed.
    expect(h.stored).toHaveLength(1);
  });
});
