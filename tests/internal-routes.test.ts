/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE INTERNAL ROUTES n8n USES — authentication at the route boundary.
 *
 * `tests/n8n-signing.test.ts` proves the verifier. This proves the ROUTES
 * call it before anything else, answer 401 with no body, and that a replayed
 * or re-serialised request is refused where a fresh one is accepted.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ claims: 0, acks: [] as string[] }));

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: () => { throw new Error('no db'); }, isSupabaseConfigured: () => true }));
vi.mock('@/lib/n8n/internal-api', () => ({
  claimEvents: async () => { h.claims += 1; return []; },
  acknowledgeEvent: async (id: string) => { h.acks.push(id); return true; },
  failEvent: async () => true,
  bookingContext: async () => null,
}));
vi.mock('@/lib/admin/queries', () => ({
  loadAlerts: async () => ({ ok: true, data: { alerts: [], notInstrumented: [], counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0 } }, loadedAt: '' }),
  loadQueues: async () => ({ ok: true, data: [], loadedAt: '' }),
}));
vi.mock('@/lib/admin/source', () => ({ rowSource: async () => ({ schedulerStatus: async () => [] }) }));

import { POST as outbox } from '@/app/api/internal/outbox/route';
import { GET as booking } from '@/app/api/internal/booking/route';
import { GET as health } from '@/app/api/internal/health/route';
import { sign } from '@/lib/n8n/signing';

const SECRET = 'a-long-random-internal-secret-value';

async function signed(body: string, offsetSeconds = 0, secret = SECRET): Promise<Record<string, string>> {
  const ts = String(Math.floor(Date.now() / 1000) + offsetSeconds);
  return { 'x-bolagio-timestamp': ts, 'x-bolagio-signature': `v1=${await sign(secret, ts, body)}`, 'content-type': 'application/json' };
}

function post(body: string, headers: Record<string, string>): Request {
  return new Request('http://local/api/internal/outbox', { method: 'POST', body, headers });
}

beforeEach(() => {
  h.claims = 0;
  h.acks.length = 0;
  vi.stubEnv('N8N_INTERNAL_SECRET', SECRET);
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  vi.stubEnv('APP_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/internal/outbox', () => {
  it('accepts a correctly signed claim', async () => {
    const body = JSON.stringify({ action: 'claim', worker: 'n8n-main', limit: 5 });
    const response = await outbox(post(body, await signed(body)) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [] });
    expect(h.claims).toBe(1);
  });

  it('refuses an unsigned request with 401 and no body, before touching anything', async () => {
    const body = JSON.stringify({ action: 'claim' });
    const response = await outbox(post(body, { 'content-type': 'application/json' }) as never);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(h.claims).toBe(0);
  });

  it('refuses a replay outside the window', async () => {
    const body = JSON.stringify({ action: 'ack', worker: 'n8n-main', eventId: '8f3c1e2a-1111-4222-8333-444455556666' });
    expect((await outbox(post(body, await signed(body, -400)) as never)).status).toBe(401);
    expect((await outbox(post(body, await signed(body, 400)) as never)).status).toBe(401);
    expect(h.acks).toEqual([]);
    expect((await outbox(post(body, await signed(body)) as never)).status).toBe(200);
    expect(h.acks).toHaveLength(1);
  });

  it('refuses a body that was re-serialised after signing', async () => {
    const signedBody = JSON.stringify({ action: 'claim', limit: 5 });
    const sentBody = JSON.stringify({ limit: 5, action: 'claim' });
    const response = await outbox(post(sentBody, await signed(signedBody)) as never);
    expect(response.status).toBe(401);
  });

  it('refuses the wrong secret', async () => {
    const body = JSON.stringify({ action: 'claim' });
    expect((await outbox(post(body, await signed(body, 0, 'wrong')) as never)).status).toBe(401);
  });

  it('refuses everything when the secret is not configured', async () => {
    vi.stubEnv('N8N_INTERNAL_SECRET', '');
    const body = JSON.stringify({ action: 'claim' });
    expect((await outbox(post(body, await signed(body)) as never)).status).toBe(401);
  });

  it('rejects an unknown action after authentication, with a code and no detail', async () => {
    const body = JSON.stringify({ action: 'release_hold', reference: 'BLG-AAAAAA' });
    const response = await outbox(post(body, await signed(body)) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_input' });
  });
});

describe('GET /api/internal/booking and /api/internal/health', () => {
  it('sign the empty string', async () => {
    const headers = await signed('');
    const b = await booking(new NextRequest('http://local/api/internal/booking?ref=BLG-AAAAAA', { headers }));
    // Authenticated; the reference does not exist in the fake, which is the same shape as an invalid one.
    expect(b.status).toBe(400);
    const hh = await health(new Request('http://local/api/internal/health', { headers }) as never);
    expect(hh.status).toBe(200);
    const json = await hh.json();
    expect(json.counts).toEqual({ CRITICAL: 0, HIGH: 0, MEDIUM: 0 });
    expect(json.environment).toBe('production');
  });

  it('refuse without a signature', async () => {
    expect((await booking(new NextRequest('http://local/api/internal/booking?ref=BLG-AAAAAA'))).status).toBe(401);
    expect((await health(new Request('http://local/api/internal/health') as never)).status).toBe(401);
  });

  it('the health body never carries a secret value', async () => {
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'THE-SECRET');
    vi.stubEnv('ADMIN_SESSION_SECRET', 'THE-SESSION-SECRET-VALUE-LONG-ENOUGH');
    const hh = await health(new Request('http://local/api/internal/health', { headers: await signed('') }) as never);
    const text = await hh.text();
    expect(text).not.toContain('THE-SECRET');
    expect(text).not.toContain('THE-SESSION-SECRET');
  });
});
