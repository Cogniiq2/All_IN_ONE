/**
 * ══════════════════════════════════════════════════════════════════════════
 * POST /api/booking/reservations/financial-debug — the boundary.
 *
 * A temporary diagnostic that reads a REAL guest's reservation is exactly the
 * kind of endpoint that leaks, so the things proven here are the things that
 * would hurt:
 *
 *  1. AUTHENTICATION first, before the body and before the environment.
 *  2. STAGING ONLY. Production, preview, local and an unset APP_ENV all get
 *     404 — and an unset APP_ENV is read as production, so the default is
 *     closed.
 *  3. GET ONLY. No POST, PUT, PATCH or DELETE reaches Beds24, and no body.
 *  4. NO PERSONAL DATA leaves the route, asserted on the whole serialised
 *     response against a fixture whose every field is personal data.
 *  5. NOTHING IS WRITTEN — not to Beds24, not to the finance tables, not to
 *     the reservations table, not to a booking intent.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'a-long-random-sync-secret-value';

/** Personal data the provider sent. None of it may appear in a response. */
const PII = {
  firstName: 'Erika',
  lastName: 'Mustermann',
  email: 'erika.mustermann@example.com',
  phone: '+491510000000',
  address: 'Maximilianstrasse 14',
  postcode: '95444',
  comments: 'Late arrival, call the guest',
  apiReference: '4123456789',
  cardNumber: '4111111111111111',
  cardHolder: 'ERIKA MUSTERMANN',
};

const h = vi.hoisted(() => ({
  /** Every provider call, so a write would be visible rather than assumed. */
  calls: [] as Array<{ method: string; path: string; query: Record<string, unknown>; hasBody: boolean }>,
  /** Every database table touched, and how. */
  db: [] as Array<{ table: string; op: string }>,
  /** The reservation the local table holds, if any. */
  reservation: null as Record<string, string> | null,
  /** The booking the fake Beds24 account answers with, if any. */
  booking: null as Record<string, unknown> | null,
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
    return { data: h.booking ? [h.booking] : [] };
  },
}));

/** A Supabase double that records the table and refuses anything but a read. */
vi.mock('@/lib/supabase/server', () => {
  const chain = (table: string) => {
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      order: () => self,
      limit: () => Promise.resolve({ data: h.reservation ? [h.reservation] : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: h.reservation ?? null, error: null }),
    };
    for (const op of ['insert', 'update', 'upsert', 'delete', 'rpc']) {
      self[op] = () => {
        h.db.push({ table, op });
        throw new Error(`the financial probe must not ${op} ${table}`);
      };
    }
    return self;
  };
  return {
    isSupabaseConfigured: () => true,
    supabaseAdmin: () => ({
      from: (table: string) => {
        h.db.push({ table, op: 'from' });
        return chain(table);
      },
    }),
  };
});

import { POST } from '@/app/api/booking/reservations/financial-debug/route';

function request(headers: Record<string, string> = {}, body = '{}'): NextRequest {
  return new NextRequest('https://bolagio.example/api/booking/reservations/financial-debug', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const signed = (body = '{}') => request({ 'x-bolagio-signature': SECRET }, body);

beforeEach(() => {
  h.calls.length = 0;
  h.db.length = 0;
  h.failWith = null;
  h.reservation = {
    external_booking_id: '76543210',
    source: 'booking_com',
    status_class: 'active',
    provider_status: 'confirmed',
  };
  h.booking = {
    id: 76543210,
    propertyId: 354659,
    roomId: 731147,
    status: 'confirmed',
    arrival: '2026-04-02',
    departure: '2026-04-06',
    price: '480.00',
    currency: 'EUR',
    commission: '72.00',
    taxAmount: 33.6,
    cityTax: '8.00',
    cleaningFee: '60.00',
    paymentStatus: 'partiallyPaid',
    payoutAmount: '408.00',
    apiSourceId: 19,
    apiSource: 'booking',
    ...PII,
    invoiceItems: [{ id: 1, type: 'charge', amount: '480.00', qty: 1, description: `Room for ${PII.lastName}` }],
  };
  vi.stubEnv('BOOKING_SYNC_SECRET', SECRET);
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  vi.stubEnv('APP_ENV', 'staging');
  vi.stubEnv('DIRECT_BOOKING_ENABLED', 'false');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('authentication', () => {
  it('refuses a request with no signature, and reads nothing', async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(h.calls).toHaveLength(0);
    expect(h.db).toHaveLength(0);
  });

  it('refuses a wrong signature, and a prefix of the right one', async () => {
    expect((await POST(request({ 'x-bolagio-signature': 'nope' }))).status).toBe(401);
    expect((await POST(request({ 'x-bolagio-signature': SECRET.slice(0, 10) }))).status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  it('refuses everything when the secret is not configured at all', async () => {
    vi.stubEnv('BOOKING_SYNC_SECRET', '');
    expect((await POST(request({ 'x-bolagio-signature': '' }))).status).toBe(401);
    expect((await POST(request({ 'x-bolagio-signature': 'anything' }))).status).toBe(401);
  });

  it('is checked BEFORE the environment, so the answer discloses neither', async () => {
    vi.stubEnv('APP_ENV', 'production');
    // Unauthenticated on production is 401, not 404: the environment is not
    // told to a caller who has not proven itself.
    expect((await POST(request())).status).toBe(401);
  });
});

describe('the staging gate', () => {
  it('accepts a signed request on staging', async () => {
    expect((await POST(signed())).status).toBe(200);
  });

  for (const environment of ['production', 'preview', 'local']) {
    it(`does not exist on ${environment}`, async () => {
      vi.stubEnv('APP_ENV', environment);
      const response = await POST(signed());
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(h.calls).toHaveLength(0);
      expect(h.db).toHaveLength(0);
    });
  }

  it('is closed by default when APP_ENV is unset or nonsense', async () => {
    // `appEnvironment()` reads anything unrecognised as production.
    vi.stubEnv('APP_ENV', '');
    expect((await POST(signed())).status).toBe(404);
    vi.stubEnv('APP_ENV', 'Staging');
    expect((await POST(signed())).status).toBe(404);
    expect(h.calls).toHaveLength(0);
  });
});

describe('the provider call', () => {
  it('is one GET for the selected booking, with invoice items enabled', async () => {
    await POST(signed());
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toEqual({
      method: 'GET',
      path: '/bookings',
      query: { id: '76543210', includeInvoiceItems: 'true' },
      hasBody: false,
    });
  });

  it('never issues a write, whatever the body asks for', async () => {
    await POST(signed(JSON.stringify({ source: 'airbnb', externalBookingId: '76543210' })));
    for (const call of h.calls) {
      expect(call.method).toBe('GET');
      expect(call.hasBody).toBe(false);
    }
  });

  it('answers without provider detail when Beds24 is unreachable', async () => {
    h.failWith = new Error('Beds24 responded 500: propertyId=354659');
    const response = await POST(signed());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'unexpected' });
  });
});

describe('the selected reservation', () => {
  it('comes from bolagio_reservations, never from a provider search', async () => {
    await POST(signed());
    expect(h.db.map((d) => d.table)).toEqual(['bolagio_reservations']);
    expect(h.db.every((d) => d.op === 'from')).toBe(true);
  });

  it('says so honestly when the channel has nothing imported yet', async () => {
    h.reservation = null;
    const response = await POST(signed());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      environment: 'staging',
      source: 'booking_com',
      found: false,
      reason: 'no_imported_reservation',
    });
    expect(h.calls).toHaveLength(0);
  });

  it('defaults to Booking.com and accepts airbnb, ignoring anything else', async () => {
    expect((await POST(signed(JSON.stringify({ source: 'airbnb' })))).status).toBe(200);
    const direct = await POST(signed(JSON.stringify({ source: 'direct' })));
    expect((await direct.json()).reservation.source).toBe('booking_com');
  });

  it('ignores an external booking id that is not a provider id', async () => {
    const response = await POST(signed(JSON.stringify({ externalBookingId: "1' OR 1=1--" })));
    expect((await response.json()).reservation.pinned).toBe(false);
  });

  it('records that a valid id was pinned', async () => {
    const response = await POST(signed(JSON.stringify({ externalBookingId: '76543210' })));
    expect((await response.json()).reservation.pinned).toBe(true);
  });

  it('tolerates a body that is not JSON rather than failing', async () => {
    expect((await POST(signed('not json'))).status).toBe(200);
  });
});

describe('the response', () => {
  it('carries no personal VALUE the provider sent', async () => {
    const text = JSON.stringify(await (await POST(signed())).json());
    for (const value of Object.values(PII)) {
      expect(text).not.toContain(value);
      expect(text.toLowerCase()).not.toContain(value.toLowerCase());
    }
  });

  it('carries no personal FIELD NAME, and no raw reservation', async () => {
    const body = await (await POST(signed())).json();
    const text = JSON.stringify(body).toLowerCase();
    for (const field of [
      'firstname', 'lastname', 'email', 'phone', 'address', 'postcode',
      'comment', 'cardnumber', 'cardholder', 'guest', 'raw', 'snapshot',
    ]) {
      expect(text).not.toContain(field);
    }
    expect(body).not.toHaveProperty('booking');
    expect(body.financial).not.toHaveProperty('raw');
  });

  it('does not disclose the provider booking id', async () => {
    const text = JSON.stringify(await (await POST(signed())).json());
    expect(text).not.toContain('76543210');
    // The query is echoed with the id replaced, so the answer still documents
    // exactly what was asked of Beds24.
    const body = JSON.parse(text);
    expect(body.providerQuery).toEqual({
      path: '/bookings',
      method: 'GET',
      id: '[selected]',
      includeInvoiceItems: 'true',
    });
  });

  it('answers the financial questions the subledger asked', async () => {
    const body = await (await POST(signed())).json();
    const byField = Object.fromEntries(
      (body.financial.financialFields as Array<{ field: string; category: string; value?: unknown }>).map((f) => [f.field, f])
    );
    expect(byField.price).toMatchObject({ category: 'price', value: '480.00' });
    expect(byField.commission).toMatchObject({ category: 'commission', value: '72.00' });
    expect(byField.taxAmount).toMatchObject({ category: 'tax' });
    expect(byField.cityTax).toMatchObject({ category: 'tax', value: '8.00' });
    expect(byField.cleaningFee).toMatchObject({ category: 'fee', value: '60.00' });
    expect(byField.paymentStatus).toMatchObject({ category: 'payment', value: 'partiallyPaid' });
    expect(byField.payoutAmount).toMatchObject({ category: 'payout', value: '408.00' });
    expect(body.financial.currency).toBe('EUR');
    expect(body.financial.invoiceItems).toMatchObject({ present: true, count: 1 });
    expect(body.financial.sourceIdentifiers).toMatchObject({ apiSourceId: 19, apiSource: 'booking' });
    expect(body.financial.fieldNames).toContain('commission');
  });

  it('reports a booking that has vanished from the provider rather than inventing one', async () => {
    h.booking = null;
    const body = await (await POST(signed())).json();
    expect(body.found).toBe(false);
    expect(body).not.toHaveProperty('financial');
  });

  it('is never cached', async () => {
    const response = await POST(signed());
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

describe('what it must not change', () => {
  it('leaves the direct-booking gate exactly where it was', async () => {
    const { directBookingEnabled } = await import('@/lib/booking/config');
    expect(directBookingEnabled()).toBe(false);
    expect((await POST(signed())).status).toBe(200);
    expect(directBookingEnabled()).toBe(false);
  });

  it('touches no finance table and no booking intent', async () => {
    await POST(signed());
    for (const touched of h.db) {
      expect(touched.table).toBe('bolagio_reservations');
      expect(touched.op).toBe('from');
    }
  });
});
