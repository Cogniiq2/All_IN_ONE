/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PRIVILEGES BOUNDARY — a public, unauthenticated endpoint.
 *
 * The property that matters most here is NEGATIVE: the signup endpoint must
 * not let a stranger learn whether an address belongs to a BoLaGio guest.
 * That is asserted by comparing whole responses across every case, rather
 * than field by field — a status code or a message added one day would fail
 * this test rather than quietly become an oracle.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  /** Identities the fake database holds, by normalised email. */
  identities: new Map<string, { id: string; verifiedAt: string | null; attempts: number }>(),
  /** Outbox rows written. The verification email hand-off. */
  outbox: [] as Array<Record<string, unknown>>,
  /** Grants created at verification. */
  grants: [] as Array<{ identityId: string; campaignId: string }>,
  /** The token minted for the last signup, so the test can follow the link. */
  lastToken: null as string | null,
  campaigns: [] as Array<Record<string, unknown>>,
  /** Every call into the repository, so consent handling can be asserted. */
  signups: [] as Array<{ marketingConsent: boolean; consentVersion: string; consentSource: string }>,
  throwOn: null as string | null,
  logs: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  supabaseAdmin: () => {
    throw new Error('the routes must go through the privileges repository');
  },
}));

vi.mock('@/lib/privileges/repository', () => ({
  upsertIdentityForSignup: async (input: { emailNormalized: string; marketingConsent: boolean; consentVersion: string; consentSource: string }) => {
    h.signups.push({ marketingConsent: input.marketingConsent, consentVersion: input.consentVersion, consentSource: input.consentSource });
    if (h.throwOn === 'signup') throw new Error('database down');
    const existing = h.identities.get(input.emailNormalized);
    if (existing) {
      // Verified, or out of sends → no token, same answer to the caller.
      if (existing.verifiedAt || existing.attempts >= 5) {
        return { identity: { id: existing.id, emailNormalized: input.emailNormalized, verifiedAt: existing.verifiedAt, verificationSentAt: null, verificationAttempts: existing.attempts }, token: null, created: false };
      }
      existing.attempts += 1;
      h.lastToken = `t${'x'.repeat(42)}`;
      return { identity: { id: existing.id, emailNormalized: input.emailNormalized, verifiedAt: null, verificationSentAt: null, verificationAttempts: existing.attempts }, token: h.lastToken, created: false };
    }
    const id = `id-${h.identities.size + 1}`;
    h.identities.set(input.emailNormalized, { id, verifiedAt: null, attempts: 1 });
    h.lastToken = `t${'x'.repeat(42)}`;
    return { identity: { id, emailNormalized: input.emailNormalized, verifiedAt: null, verificationSentAt: null, verificationAttempts: 1 }, token: h.lastToken, created: true };
  },
  verifyIdentity: async (token: string) => {
    if (token === h.lastToken && h.lastToken !== null) {
      h.grants.push({ identityId: 'id-1', campaignId: 'c1' });
      h.lastToken = null; // single use
      return { ok: true, identityId: 'id-1', grantedCampaigns: ['residence-privileges'] };
    }
    return { ok: false };
  },
  campaignsForSignup: async () => h.campaigns,
  listCampaigns: async () => h.campaigns,
  loadGrantsForEmail: async () => ({ identity: null, grants: [] }),
}));

vi.mock('@/lib/privileges/signup', () => ({
  MARKETING_CONSENT_VERSION: '2026-09-24.1',
  resolveSignupContext: async (body: Record<string, unknown>) => ({
    campaignCode: typeof body.campaign === 'string' ? body.campaign : undefined,
    unitId: typeof body.unit === 'string' ? 'unit-1' : null,
    locale: body.locale === 'en' ? 'en' : 'de',
  }),
  emitPrivilegeVerification: async (input: Record<string, unknown>) => {
    h.outbox.push(input);
  },
}));

import { POST as signup } from '@/app/api/guest/privileges/signup/route';
import { GET as verify } from '@/app/api/guest/privileges/verify/route';

let clientSeq = 0;

/**
 * A delivery from a FRESH client unless one is named.
 *
 * The rate limiter is a module-level map in the route's isolate and it
 * therefore survives between tests — two tests sharing an IP would make the
 * second one fail for a reason that has nothing to do with what it asserts.
 */
function post(body: unknown, ip = `198.18.${Math.floor(clientSeq / 250) % 250}.${(clientSeq++ % 250) + 1}`): NextRequest {
  return new NextRequest('https://bolagio.de/api/guest/privileges/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

/** The full response, as the only thing an attacker can observe. */
async function observable(response: Response) {
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  h.identities.clear();
  h.outbox.length = 0;
  h.signups.length = 0;
  h.grants.length = 0;
  h.logs.length = 0;
  h.lastToken = null;
  h.throwOn = null;
  h.campaigns = [{ id: 'c1', code: 'residence-privileges' }];
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  vi.stubEnv('APP_ENV', 'production');
  const capture = (...args: unknown[]) => { h.logs.push(args.map(String).join(' ')); };
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('signup does not reveal whether an address is known', () => {
  it('answers identically for a new address, a repeat, a verified one and a failure', async () => {
    const answers: Array<{ status: number; body: unknown }> = [];

    // 1. Brand new.
    answers.push(await observable(await signup(post({ email: 'new@example.com' }, '198.51.100.1'))));

    // 2. The same address again — already signed up, not yet verified.
    answers.push(await observable(await signup(post({ email: 'new@example.com' }, '198.51.100.2'))));

    // 3. An address that is already VERIFIED. Nothing is sent.
    h.identities.set('known@example.com', { id: 'id-known', verifiedAt: '2026-01-01T00:00:00Z', attempts: 1 });
    answers.push(await observable(await signup(post({ email: 'known@example.com' }, '198.51.100.3'))));

    // 4. An address that has exhausted its verification sends.
    h.identities.set('spammed@example.com', { id: 'id-spam', verifiedAt: null, attempts: 5 });
    answers.push(await observable(await signup(post({ email: 'spammed@example.com' }, '198.51.100.4'))));

    // 5. The database falls over.
    h.throwOn = 'signup';
    answers.push(await observable(await signup(post({ email: 'boom@example.com' }, '198.51.100.5'))));

    // Every observable answer is byte-identical.
    for (const answer of answers) {
      expect(answer).toEqual({ status: 200, body: { status: 'check_your_email' } });
    }
  });

  it('sends an email only where one is due, which only the mailbox owner sees', async () => {
    await signup(post({ email: 'new@example.com' }));
    expect(h.outbox).toHaveLength(1);

    h.identities.set('verified@example.com', { id: 'v', verifiedAt: '2026-01-01T00:00:00Z', attempts: 1 });
    await signup(post({ email: 'verified@example.com' }, '198.51.100.9'));
    expect(h.outbox).toHaveLength(1);
  });

  it('refuses a malformed address, because that tells the sender only about themselves', async () => {
    const response = await signup(post({ email: 'not-an-email' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 'invalid_email' });
    expect(h.outbox).toHaveLength(0);
  });

  it('treats a missing or non-string email as malformed rather than throwing', async () => {
    for (const email of [undefined, null, 42, {}, [], '']) {
      const response = await signup(post({ email }, `198.51.100.${Math.floor(Math.random() * 200) + 20}`));
      expect(response.status).toBe(400);
    }
  });
});

describe('signup hygiene', () => {
  it('rate limits one client without affecting another', async () => {
    let limited = 0;
    for (let i = 0; i < 12; i += 1) {
      const response = await signup(post({ email: `a${i}@example.com` }, '192.0.2.50'));
      if (response.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
    // A different client is unaffected.
    expect((await signup(post({ email: 'other@example.com' }, '192.0.2.99'))).status).toBe(200);
  });

  it('never treats anything but a literal true as marketing consent', async () => {
    /*
     * Consent must be an explicit, unticked-by-default act. The route passes
     * `body.marketingConsent === true`, so a truthy-looking value — the
     * string 'true', a 1, a 'yes' — is NOT consent. A client that sent one of
     * those and had it recorded as agreement would make the consent record
     * evidence of nothing.
     */
    for (const value of [undefined, 'true', 1, 'yes', null, 'on', {}]) {
      h.identities.clear();
      await signup(post({ email: 'c@example.com', marketingConsent: value }));
    }
    expect(h.signups.every((s) => s.marketingConsent === false)).toBe(true);

    h.identities.clear();
    await signup(post({ email: 'c@example.com', marketingConsent: true }));
    expect(h.signups[h.signups.length - 1]).toEqual({
      marketingConsent: true,
      consentVersion: '2026-09-24.1',
      consentSource: 'qr_privileges',
    });
  });

  it('records the consent WORDING VERSION, so the evidence is specific', async () => {
    await signup(post({ email: 'v@example.com', marketingConsent: true }));
    // Not merely "they agreed" — which sentence they agreed to.
    expect(h.signups[0].consentVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('never writes an email address into a log line', async () => {
    await signup(post({ email: 'erika.mustermann@example.com' }));
    const logs = h.logs.join(' ');
    expect(logs).not.toContain('erika.mustermann@example.com');
    expect(logs).not.toContain('erika');
    expect(logs.toLowerCase()).not.toContain('email');
  });

  it('is never cached', async () => {
    const response = await signup(post({ email: 'x@example.com' }));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('carries no token or address in the response', async () => {
    const response = await signup(post({ email: 'x@example.com' }));
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain('x@example.com');
    expect(text).not.toContain('token');
  });
});

describe('verification', () => {
  function link(token: string | null, ip = '203.0.113.7'): NextRequest {
    const url = new URL('https://bolagio.de/api/guest/privileges/verify');
    if (token !== null) url.searchParams.set('token', token);
    return new NextRequest(url, { method: 'GET', headers: { 'cf-connecting-ip': ip } });
  }

  it('verifies a good token and grants the benefit', async () => {
    await signup(post({ email: 'new@example.com' }));
    const token = h.lastToken as string;
    const response = await verify(link(token));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('state=verified');
    expect(h.grants).toHaveLength(1);
  });

  it('consumes the token, so a replay does not verify again', async () => {
    await signup(post({ email: 'new@example.com' }));
    const token = h.lastToken as string;
    await verify(link(token));
    const replay = await verify(link(token, '203.0.113.8'));
    expect(replay.headers.get('location')).toContain('state=link-invalid');
    expect(h.grants).toHaveLength(1);
  });

  it('answers the same for a forged, malformed, missing or expired token', async () => {
    const destinations = new Set<string>();
    const tokens = [null, '', 'short', 'x'.repeat(43), '../../etc/passwd', 'a'.repeat(200)];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const response = await verify(link(token, `203.0.113.${100 + i}`));
      expect(response.status).toBe(303);
      destinations.add(response.headers.get('location') ?? '');
    }
    expect(destinations.size).toBe(1);
    expect(Array.from(destinations)[0]).toContain('state=link-invalid');
    expect(h.grants).toHaveLength(0);
  });

  it('redirects only to its own origin, never to a parameter', async () => {
    const url = new URL('https://bolagio.de/api/guest/privileges/verify');
    url.searchParams.set('token', 'x'.repeat(43));
    url.searchParams.set('next', 'https://attacker.example/steal');
    url.searchParams.set('redirect', 'https://attacker.example/steal');
    const response = await verify(new NextRequest(url, { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.200' } }));
    const location = response.headers.get('location') ?? '';
    expect(location.startsWith('https://bolagio.de/guest/privileges')).toBe(true);
    expect(location).not.toContain('attacker.example');
  });

  it('never puts a token in a log line', async () => {
    await signup(post({ email: 'new@example.com' }));
    const token = h.lastToken as string;
    await verify(link(token));
    expect(h.logs.join(' ')).not.toContain(token);
  });
});

describe('the outbox hand-off', () => {
  it('carries the identity id and the token, and never the address', async () => {
    await signup(post({ email: 'erika@example.com', locale: 'en' }));
    expect(h.outbox).toHaveLength(1);
    const event = h.outbox[0];
    expect(event).toMatchObject({ identityId: 'id-1', locale: 'en' });
    expect(JSON.stringify(event)).not.toContain('erika@example.com');
  });
});
