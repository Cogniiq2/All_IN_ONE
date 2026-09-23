/**
 * ══════════════════════════════════════════════════════════════════════════
 * MARKETING CONSENT: confirmed only, withdrawable in one click, and no
 * audience at all until the withdrawal mechanism exists.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  withdrawals: [] as Array<{ id: string; source: string }>,
  throwOnWithdraw: false,
}));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  supabaseAdmin: () => { throw new Error('the route must go through the repository'); },
}));
vi.mock('@/lib/privileges/repository', () => ({
  withdrawMarketingConsent: async (id: string, source: string) => {
    if (h.throwOnWithdraw) throw new Error('database down');
    h.withdrawals.push({ id, source });
    return { changed: true };
  },
}));

import {
  consentPendingConfirmation,
  isMarketable,
  marketingSendingBlockers,
  signUnsubscribe,
  unsubscribeLinks,
  verifyUnsubscribe,
} from '@/lib/privileges/marketing';
import { GET as unsubscribeGet, POST as unsubscribePost } from '@/app/api/guest/privileges/unsubscribe/route';

const SECRET = 's'.repeat(40);
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

let seq = 0;
const ip = () => `198.19.${Math.floor(seq / 250) % 250}.${(seq++ % 250) + 1}`;

beforeEach(() => {
  h.withdrawals.length = 0;
  h.throwOnWithdraw = false;
  vi.stubEnv('PRIVILEGES_UNSUBSCRIBE_SECRET', SECRET);
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('who is marketable', () => {
  const base = { verifiedAt: '2026-01-01T00:00:00Z', marketingConsentAt: '2026-01-01T00:00:00Z', marketingConsentConfirmedAt: '2026-01-01T00:05:00Z', marketingWithdrawnAt: null };

  it('only a verified address whose consent was CONFIRMED and not withdrawn', () => {
    expect(isMarketable(base)).toBe(true);
    expect(isMarketable({ ...base, marketingConsentConfirmedAt: null })).toBe(false); // ticked, never confirmed
    expect(isMarketable({ ...base, marketingConsentAt: null, marketingConsentConfirmedAt: null })).toBe(false); // never ticked
    expect(isMarketable({ ...base, verifiedAt: null })).toBe(false);
    expect(isMarketable({ ...base, marketingWithdrawnAt: '2026-02-01T00:00:00Z' })).toBe(false);
  });

  it('a newer tick needs a newer confirmation', () => {
    const reTicked = { ...base, marketingConsentAt: '2026-03-01T00:00:00Z' };
    expect(isMarketable(reTicked)).toBe(false);
    expect(consentPendingConfirmation(reTicked)).toBe(true);
  });

  it('a withdrawal is not erased by a later consent — but a later CONFIRMED consent counts again', () => {
    const again = { ...base, marketingWithdrawnAt: '2026-02-01T00:00:00Z', marketingConsentAt: '2026-03-01T00:00:00Z', marketingConsentConfirmedAt: '2026-03-01T00:02:00Z' };
    expect(isMarketable(again)).toBe(true);
    expect(isMarketable({ ...again, marketingConsentConfirmedAt: '2026-01-01T00:05:00Z' })).toBe(false);
  });

  it('garbage timestamps fail closed', () => {
    expect(isMarketable({ ...base, marketingConsentConfirmedAt: 'not a date' })).toBe(false);
  });
});

describe('signed unsubscribe links', () => {
  it('verify for the id they were issued for, and nothing else', async () => {
    const sig = await signUnsubscribe(ID);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyUnsubscribe(ID, sig)).toBe(true);
    expect(await verifyUnsubscribe(OTHER, sig)).toBe(false);
    expect(await verifyUnsubscribe(ID, sig.replace(/.$/, sig.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(await verifyUnsubscribe(ID, 'x')).toBe(false);
    expect(await verifyUnsubscribe('not-a-uuid', sig)).toBe(false);
  });

  it('do not verify without a (long enough) secret', async () => {
    const sig = await signUnsubscribe(ID);
    vi.stubEnv('PRIVILEGES_UNSUBSCRIBE_SECRET', 'short');
    expect(await verifyUnsubscribe(ID, sig)).toBe(false);
    await expect(signUnsubscribe(ID)).rejects.toThrow(/not configured/);
  });

  it('carry no email address, and come with RFC 8058 one-click headers', async () => {
    const links = await unsubscribeLinks(ID, 'https://bolagio.de');
    expect(links.url).toMatch(/^https:\/\/bolagio\.de\/api\/guest\/privileges\/unsubscribe\?id=/);
    expect(links.url).not.toContain('@');
    expect(links.headers['List-Unsubscribe']).toBe(`<${links.url}>`);
    expect(links.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('no marketing before the unsubscribe mechanism exists', () => {
  it('is blocked without the signing secret AND without approved consent wording', () => {
    vi.stubEnv('PRIVILEGES_UNSUBSCRIBE_SECRET', '');
    const blockers = marketingSendingBlockers();
    expect(blockers.some((b) => /UNSUBSCRIBE_SECRET/.test(b))).toBe(true);
    expect(blockers.some((b) => /consent wording/.test(b))).toBe(true);
  });

  it('is still blocked with the secret while the wording is unapproved', () => {
    expect(marketingSendingBlockers()).toEqual(['the marketing consent wording is not approved (lib/legal/messaging.ts)']);
  });
});

describe('the unsubscribe endpoint', () => {
  function url(params: Record<string, string>) {
    const u = new URL('https://bolagio.de/api/guest/privileges/unsubscribe');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u;
  }

  it('GET never unsubscribes — mail scanners follow links — it redirects to the confirmation page', async () => {
    const sig = await signUnsubscribe(ID);
    const response = await unsubscribeGet(new NextRequest(url({ id: ID, sig }), { headers: { 'cf-connecting-ip': ip() } }));
    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(location.startsWith('https://bolagio.de/guest/privileges/unsubscribe?')).toBe(true);
    expect(location).toContain(`id=${ID}`);
    expect(h.withdrawals).toHaveLength(0);
  });

  it('POST from the page withdraws the consent', async () => {
    const sig = await signUnsubscribe(ID);
    const response = await unsubscribePost(new NextRequest(url({}), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
      body: JSON.stringify({ id: ID, sig }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'unsubscribed' });
    expect(h.withdrawals).toEqual([{ id: ID, source: 'unsubscribe_link' }]);
  });

  it('honours an RFC 8058 one-click POST from a mail client', async () => {
    const sig = await signUnsubscribe(ID);
    const response = await unsubscribePost(new NextRequest(url({ id: ID, sig }), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip() },
      body: 'List-Unsubscribe=One-Click',
    }));
    expect(response.status).toBe(200);
    expect(h.withdrawals).toEqual([{ id: ID, source: 'one_click' }]);
  });

  it('answers a forged link, a missing one and a database failure exactly like a valid one', async () => {
    const sig = await signUnsubscribe(ID);
    const answers: unknown[] = [];
    const send = async (body: unknown) => {
      const r = await unsubscribePost(new NextRequest(url({}), {
        method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() }, body: JSON.stringify(body),
      }));
      answers.push({ status: r.status, body: await r.json() });
    };
    await send({ id: OTHER, sig });          // signature for another id
    await send({ id: ID, sig: 'f'.repeat(64) }); // forged
    await send({});                          // nothing
    h.throwOnWithdraw = true;
    await send({ id: ID, sig });             // valid, database down
    for (const answer of answers) expect(answer).toEqual({ status: 200, body: { status: 'unsubscribed' } });
    expect(h.withdrawals).toHaveLength(0);
  });

  it('is never cached', async () => {
    const r = await unsubscribePost(new NextRequest(url({}), { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() }, body: '{}' }));
    expect(r.headers.get('cache-control')).toContain('no-store');
  });
});
