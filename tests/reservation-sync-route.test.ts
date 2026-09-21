/**
 * ══════════════════════════════════════════════════════════════════════════
 * POST /api/booking/reservations/sync — the boundary.
 *
 * Two guarantees, both of which are the kind that are easy to lose in a later
 * edit and expensive to lose in production:
 *
 *  1. AUTHENTICATION happens before anything else, and a missing configured
 *     secret is a refusal rather than an open door.
 *  2. NO GUEST PERSONAL DATA leaves this endpoint. The fixture behind it is
 *     deliberately full of names, emails and phone numbers; the response is
 *     asserted not to contain any of them, as a whole serialised string,
 *     rather than field by field — a "sample" field added one day would fail
 *     this test rather than quietly ship.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'a-long-random-sync-secret-value';

/** Personal data the import handled, none of which may appear in a response. */
const PII = {
  firstName: 'Erika',
  lastName: 'Mustermann',
  email: 'erika.mustermann@example.com',
  phone: '+491510000000',
  reference: '4123456789',
};

const h = vi.hoisted(() => ({ runs: 0, heartbeats: [] as Array<Record<string, unknown>>, fail: false }));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  supabaseAdmin: () => {
    throw new Error('the route must not touch the database directly');
  },
}));

vi.mock('@/lib/booking/commands', () => ({
  recordSchedulerRun: async (input: Record<string, unknown>) => {
    h.heartbeats.push(input);
  },
}));

vi.mock('@/lib/booking/reservation-sync', () => ({
  syncReservations: async () => {
    h.runs += 1;
    if (h.fail) throw new Error('provider unreachable');
    return {
      fetched: 42,
      inserted: 5,
      updated: 37,
      skipped: 0,
      malformed: 0,
      failed: 0,
      units: 2,
      requests: 18,
      windowFrom: '2025-09-21',
      windowTo: '2028-03-21',
      truncated: false,
    };
  },
}));

import { POST } from '@/app/api/booking/reservations/sync/route';

function request(headers: Record<string, string> = {}, body = '{}'): NextRequest {
  return new NextRequest('https://bolagio.example/api/booking/reservations/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

beforeEach(() => {
  h.runs = 0;
  h.heartbeats.length = 0;
  h.fail = false;
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
  it('refuses a request with no signature, and runs nothing', async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(h.runs).toBe(0);
  });

  it('refuses a wrong signature', async () => {
    const response = await POST(request({ 'x-bolagio-signature': 'not-the-secret' }));
    expect(response.status).toBe(401);
    expect(h.runs).toBe(0);
  });

  it('refuses a signature that is a prefix of the secret', async () => {
    const response = await POST(request({ 'x-bolagio-signature': SECRET.slice(0, 10) }));
    expect(response.status).toBe(401);
  });

  it('refuses everything when the secret is not configured at all', async () => {
    vi.stubEnv('BOOKING_SYNC_SECRET', '');
    expect((await POST(request({ 'x-bolagio-signature': '' }))).status).toBe(401);
    expect((await POST(request({ 'x-bolagio-signature': 'anything' }))).status).toBe(401);
    expect(h.runs).toBe(0);
  });

  it('accepts the correct signature and runs the import once', async () => {
    const response = await POST(request({ 'x-bolagio-signature': SECRET }));
    expect(response.status).toBe(200);
    expect(h.runs).toBe(1);
  });
});

describe('the response', () => {
  it('is counts and a window, and nothing else', async () => {
    const response = await POST(request({ 'x-bolagio-signature': SECRET }));
    const body = await response.json();
    expect(body).toEqual({
      fetched: 42,
      inserted: 5,
      updated: 37,
      skipped: 0,
      malformed: 0,
      failed: 0,
      units: 2,
      requests: 18,
      windowFrom: '2025-09-21',
      windowTo: '2028-03-21',
      truncated: false,
    });
  });

  it('carries no guest personal data of any kind', async () => {
    const response = await POST(request({ 'x-bolagio-signature': SECRET }));
    const text = JSON.stringify(await response.json());
    for (const value of Object.values(PII)) {
      expect(text).not.toContain(value);
    }
    // Nor any of the field NAMES a reservation payload would carry.
    for (const field of ['guest', 'email', 'phone', 'firstName', 'lastName', 'snapshot', 'raw', 'booking']) {
      expect(text.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });

  it('is never cached', async () => {
    const response = await POST(request({ 'x-bolagio-signature': SECRET }));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

describe('the heartbeat', () => {
  it('records a successful pass with counts only', async () => {
    await POST(request({ 'x-bolagio-signature': SECRET }));
    expect(h.heartbeats).toHaveLength(1);
    expect(h.heartbeats[0]).toMatchObject({ job: 'reservation_sync', ok: true });
    const report = JSON.stringify(h.heartbeats[0].report);
    for (const value of Object.values(PII)) expect(report).not.toContain(value);
  });

  it('records a failed pass and answers without detail', async () => {
    h.fail = true;
    const response = await POST(request({ 'x-bolagio-signature': SECRET }));
    expect(h.heartbeats[0]).toMatchObject({ job: 'reservation_sync', ok: false });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'unexpected' });
  });
});

describe('the request body', () => {
  it('accepts an empty body as "everything"', async () => {
    expect((await POST(request({ 'x-bolagio-signature': SECRET }, ''))).status).toBe(200);
    expect(h.runs).toBe(1);
  });

  it('accepts a unit slug and an explicit window', async () => {
    const body = JSON.stringify({ unitSlug: 'schulstrasse-i', from: '2026-01-01', to: '2026-06-30' });
    expect((await POST(request({ 'x-bolagio-signature': SECRET }, body))).status).toBe(200);
  });

  it('ignores a body that is not JSON rather than failing the scheduled run', async () => {
    expect((await POST(request({ 'x-bolagio-signature': SECRET }, 'not json'))).status).toBe(200);
    expect(h.runs).toBe(1);
  });
});

describe('the direct-booking gate', () => {
  it('is untouched by this endpoint', async () => {
    // The import is read-only and has nothing to do with selling nights. It
    // must work with direct booking disabled — which is the live posture —
    // and must not switch it on.
    const { directBookingEnabled } = await import('@/lib/booking/config');
    expect(directBookingEnabled()).toBe(false);
    expect((await POST(request({ 'x-bolagio-signature': SECRET }))).status).toBe(200);
    expect(directBookingEnabled()).toBe(false);
  });
});
