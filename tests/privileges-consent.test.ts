/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE DOUBLE OPT-IN CONFIRMS CONSENT, NOT JUST THE ADDRESS.
 *
 * Against the real repository with an in-memory table:
 *   • a tick is PENDING until the mailbox owner clicks;
 *   • a tick on an already-verified address sends a new confirmation instead
 *     of being recorded as consent (anyone could have typed the address);
 *   • the benefit never depends on the tick;
 *   • a withdrawal is recorded with its source and survives a re-consent;
 *   • no audience can be read while sending is blocked;
 *   • the consent box renders unticked.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ identities: [] as Row[], grants: [] as Row[], reads: 0 }));

/** A just-big-enough PostgREST builder over two in-memory tables. */
vi.mock('@/lib/supabase/server', () => {
  function table(name: string): Row[] {
    if (name === 'bolagio_guest_identities') return h.identities;
    if (name === 'bolagio_privilege_grants') return h.grants;
    return [];
  }
  function from(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    const rows = () => table(name).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      h.reads += 1;
      if (op === 'update') { for (const r of rows()) Object.assign(r, patch); return { data: null, error: null }; }
      if (op === 'insert') {
        const row = { id: `00000000-0000-4000-8000-${String(table(name).length + 1).padStart(12, '0')}`, verified_at: null,
          marketing_consent_at: null, marketing_consent_confirmed_at: null, marketing_withdrawn_at: null, ...patch };
        table(name).push(row);
        return { data: row, error: null };
      }
      return { data: rows(), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      not: (c: string) => { filters.push((r) => r[c] !== null && r[c] !== undefined); return b; },
      order: () => b,
      limit: () => b,
      update: (p: Row) => { op = 'update'; patch = p; return b; },
      insert: (p: Row) => { op = 'insert'; patch = p; return b; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }; },
      single: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: null }; },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return b;
  }
  return { supabaseAdmin: () => ({ from }), isSupabaseConfigured: () => true };
});

import { marketingRecipients, MarketingBlockedError, upsertIdentityForSignup, verifyIdentity, withdrawMarketingConsent } from '@/lib/privileges/repository';
import { isMarketable } from '@/lib/privileges/marketing';
import { I18nProvider } from '@/lib/i18n';
import PrivilegesClient from '@/app/(site)/guest/privileges/privileges-client';

const SIGNUP = { consentVersion: '2026-09-25.1', consentSource: 'qr_privileges' };
const state = (r: Row) => ({
  verifiedAt: r.verified_at as string | null,
  marketingConsentAt: r.marketing_consent_at as string | null,
  marketingConsentConfirmedAt: r.marketing_consent_confirmed_at as string | null,
  marketingWithdrawnAt: r.marketing_withdrawn_at as string | null,
});

beforeEach(() => {
  h.identities.length = 0;
  h.grants.length = 0;
  h.reads = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('consent is pending until the mailbox owner confirms it', () => {
  it('a first signup with the box ticked is not marketable until the link is clicked', async () => {
    const { token } = await upsertIdentityForSignup({ emailNormalized: 'a@example.com', marketingConsent: true, ...SIGNUP });
    const row = h.identities[0];
    expect(row.marketing_consent_at).toBeTruthy();
    expect(row.marketing_consent_confirmed_at ?? null).toBeNull();
    expect(isMarketable(state(row))).toBe(false);

    expect((await verifyIdentity(token!)).ok).toBe(true);
    expect(row.verified_at).toBeTruthy();
    expect(row.marketing_consent_confirmed_at).toBeTruthy();
    expect(isMarketable(state(row))).toBe(true);
  });

  it('the benefit does not depend on the box: an unticked signup verifies all the same, with no consent', async () => {
    const { token } = await upsertIdentityForSignup({ emailNormalized: 'b@example.com', marketingConsent: false, ...SIGNUP });
    expect(token).toBeTruthy();
    expect((await verifyIdentity(token!)).ok).toBe(true);
    const row = h.identities[0];
    expect(row.verified_at).toBeTruthy();
    expect(row.marketing_consent_at ?? null).toBeNull();
    expect(row.marketing_consent_confirmed_at ?? null).toBeNull();
  });

  it('a tick on an ALREADY verified address sends a confirmation instead of becoming consent', async () => {
    const first = await upsertIdentityForSignup({ emailNormalized: 'c@example.com', marketingConsent: false, ...SIGNUP });
    await verifyIdentity(first.token!);

    // Somebody — perhaps not the owner — types the address and ticks the box.
    const again = await upsertIdentityForSignup({ emailNormalized: 'c@example.com', marketingConsent: true, ...SIGNUP });
    const row = h.identities[0];
    expect(again.token).toBeTruthy(); // a confirmation goes to the mailbox
    expect(isMarketable(state(row))).toBe(false);

    await verifyIdentity(again.token!);
    expect(isMarketable(state(row))).toBe(true);
  });

  it('a verified address without a new tick is sent nothing', async () => {
    const first = await upsertIdentityForSignup({ emailNormalized: 'd@example.com', marketingConsent: false, ...SIGNUP });
    await verifyIdentity(first.token!);
    const again = await upsertIdentityForSignup({ emailNormalized: 'd@example.com', marketingConsent: false, ...SIGNUP });
    expect(again.token).toBeNull();
  });

  it('an expired confirmation link confirms nothing', async () => {
    const { token } = await upsertIdentityForSignup({ emailNormalized: 'e@example.com', marketingConsent: true, ...SIGNUP });
    h.identities[0].verification_expires_at = '2000-01-01T00:00:00Z';
    expect((await verifyIdentity(token!)).ok).toBe(false);
    expect(h.identities[0].marketing_consent_confirmed_at ?? null).toBeNull();
  });
});

describe('withdrawal', () => {
  it('ends marketability, records its source, and is idempotent', async () => {
    const { token } = await upsertIdentityForSignup({ emailNormalized: 'f@example.com', marketingConsent: true, ...SIGNUP });
    await verifyIdentity(token!);
    const row = h.identities[0];
    expect(await withdrawMarketingConsent(row.id as string, 'one_click')).toEqual({ changed: true });
    expect(row.marketing_withdrawal_source).toBe('one_click');
    expect(isMarketable(state(row))).toBe(false);
    expect(await withdrawMarketingConsent(row.id as string, 'one_click')).toEqual({ changed: false });
  });

  it('is kept as evidence when the guest later consents again', async () => {
    const { token } = await upsertIdentityForSignup({ emailNormalized: 'g@example.com', marketingConsent: true, ...SIGNUP });
    await verifyIdentity(token!);
    const row = h.identities[0];
    await withdrawMarketingConsent(row.id as string, 'unsubscribe_link');
    const withdrawnAt = row.marketing_withdrawn_at;
    await new Promise((r) => setTimeout(r, 5));
    const again = await upsertIdentityForSignup({ emailNormalized: 'g@example.com', marketingConsent: true, ...SIGNUP });
    expect(row.marketing_withdrawn_at).toBe(withdrawnAt); // not erased
    expect(isMarketable(state(row))).toBe(false);          // pending again
    await verifyIdentity(again.token!);
    expect(isMarketable(state(row))).toBe(true);
  });

  it('does nothing for an identity that never consented', async () => {
    await upsertIdentityForSignup({ emailNormalized: 'h@example.com', marketingConsent: false, ...SIGNUP });
    expect(await withdrawMarketingConsent(h.identities[0].id as string, 'unsubscribe_link')).toEqual({ changed: false });
  });
});

describe('the marketing audience', () => {
  it('cannot be read at all while sending is blocked — before any database read', async () => {
    vi.stubEnv('PRIVILEGES_UNSUBSCRIBE_SECRET', 's'.repeat(40));
    h.reads = 0;
    await expect(marketingRecipients()).rejects.toBeInstanceOf(MarketingBlockedError);
    expect(h.reads).toBe(0);
  });
});

describe('the privileges page', () => {
  function render(): string {
    return renderToStaticMarkup(createElement(I18nProvider, null, createElement(PrivilegesClient, {})));
  }

  it('renders the marketing box UNticked and not required', () => {
    const html = render();
    const box = html.match(/<input[^>]*id="privileges-consent"[^>]*>/)?.[0] ?? '';
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(/\schecked/);
    expect(box).not.toMatch(/\srequired/);
  });

  it('says the benefit does not depend on the box, and links the privacy notice', () => {
    const html = render();
    expect(html).toMatch(/auch ohne dieses Häkchen/);
    expect(html).toMatch(/href="\/datenschutz"/);
  });

  it('makes no unverifiable best-price claim', () => {
    expect(render()).not.toMatch(/bester Preis|best price/i);
  });
});
