/**
 * ══════════════════════════════════════════════════════════════════════════
 * PREVIEW DEMO MODE — the guard, and what it is guarding.
 *
 * A Cloudflare preview is a production build, so `NODE_ENV` proves nothing
 * and is not consulted. These tests hold the real gate to its contract: all
 * four conditions or nothing, production fails closed, the demo reads only
 * fixtures, every write is refused, and the operator path is untouched.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PREVIEW_PASSWORD_LENGTH,
  PREVIEW_AUDIENCE,
  PREVIEW_ROLE,
  PREVIEW_SESSION_COOKIE,
  appEnv,
  isPreviewDemoEnabled,
  previewAllows,
  previewCredentials,
  previewCredentialsMatch,
  previewDemoBlockedBecause,
  previewSessionSecret,
} from '@/lib/admin/preview';
import { adminMode, adminPosture } from '@/lib/admin/config';
import { rowSource } from '@/lib/admin/source';
import { SESSION_COOKIE, isUsableSecret, signSession, verifySession } from '@/lib/admin/session';
import { can } from '@/lib/admin/permissions';
import { isSupabaseConfigured } from '@/lib/supabase/server';

const EMAIL = 'preview@example.com';
const PASSWORD = 'preview-only-not-a-real-credential';
const OPERATOR_SECRET = 'o'.repeat(48);

/** The complete, valid preview environment. Individual tests remove one part. */
function previewEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    APP_ENV: 'preview',
    ADMIN_PREVIEW_DEMO: 'true',
    ADMIN_PREVIEW_EMAIL: EMAIL,
    ADMIN_PREVIEW_PASSWORD: PASSWORD,
    // Deliberately absent everywhere below: SUPABASE_URL,
    // SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ADMIN_SESSION_SECRET.
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_ANON_KEY: undefined,
    ADMIN_SESSION_SECRET: undefined,
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) vi.stubEnv(key, value as string);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ══ 1. The demo works only with APP_ENV=preview ═══════════════════════ */

describe('1 — preview demo requires APP_ENV=preview', () => {
  it('is on when all four conditions hold', () => {
    previewEnv();
    expect(appEnv()).toBe('preview');
    expect(isPreviewDemoEnabled()).toBe(true);
    expect(previewDemoBlockedBecause()).toBeNull();
    expect(adminMode()).toBe('preview');
  });

  it('is off when APP_ENV is anything other than exactly "preview"', () => {
    for (const value of ['production', 'Preview', 'PREVIEW', 'previews', 'staging', 'dev', '']) {
      previewEnv({ APP_ENV: value });
      expect(isPreviewDemoEnabled(), `APP_ENV=${JSON.stringify(value)}`).toBe(false);
      expect(adminMode()).not.toBe('preview');
      vi.unstubAllEnvs();
    }
    // ` preview ` is trimmed by the reader, so it is accepted — the guard
    // rejects a different word, not stray whitespace from a dashboard field.
    previewEnv({ APP_ENV: ' preview ' });
    expect(isPreviewDemoEnabled()).toBe(true);
  });

  it('is off when APP_ENV is absent entirely — unset reads as production', () => {
    previewEnv({ APP_ENV: undefined });
    expect(appEnv()).toBe('production');
    expect(isPreviewDemoEnabled()).toBe(false);
    expect(previewDemoBlockedBecause()).toBe('production_env');
  });

  it('is off without the explicit flag, whatever APP_ENV says', () => {
    for (const value of [undefined, 'false', '1', 'yes', 'TRUE', '']) {
      previewEnv({ ADMIN_PREVIEW_DEMO: value });
      expect(isPreviewDemoEnabled(), `flag=${JSON.stringify(value)}`).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  it('is off without credentials, and there is no default pair', () => {
    previewEnv({ ADMIN_PREVIEW_EMAIL: undefined });
    expect(previewDemoBlockedBecause()).toBe('missing_credentials');
    expect(previewCredentials()).toBeNull();
    vi.unstubAllEnvs();

    previewEnv({ ADMIN_PREVIEW_PASSWORD: undefined });
    expect(previewDemoBlockedBecause()).toBe('missing_credentials');
    vi.unstubAllEnvs();

    // Only the flags, no credentials at all: still nothing to sign in with.
    previewEnv({ ADMIN_PREVIEW_EMAIL: undefined, ADMIN_PREVIEW_PASSWORD: undefined });
    expect(isPreviewDemoEnabled()).toBe(false);
    expect(previewCredentialsMatch('', '')).toBe(false);
  });

  it('refuses a password too short to double as key material', () => {
    previewEnv({ ADMIN_PREVIEW_PASSWORD: 'a'.repeat(MIN_PREVIEW_PASSWORD_LENGTH - 1) });
    expect(previewDemoBlockedBecause()).toBe('weak_password');
    expect(isPreviewDemoEnabled()).toBe(false);
    vi.unstubAllEnvs();

    previewEnv({ ADMIN_PREVIEW_PASSWORD: 'a'.repeat(MIN_PREVIEW_PASSWORD_LENGTH) });
    expect(isPreviewDemoEnabled()).toBe(true);
  });
});

/* ══ 2. Production refuses, even misconfigured ═════════════════════════ */

describe('2 — production fails closed', () => {
  it('ignores ADMIN_PREVIEW_DEMO=true when APP_ENV=production', () => {
    previewEnv({ APP_ENV: 'production' });
    expect(isPreviewDemoEnabled()).toBe(false);
    expect(previewDemoBlockedBecause()).toBe('production_env');
    expect(previewCredentialsMatch(EMAIL, PASSWORD)).toBe(false);
    expect(adminMode()).not.toBe('preview');
  });

  it('mints no session secret on production, so no demo cookie can verify', async () => {
    previewEnv({ APP_ENV: 'production' });
    await expect(previewSessionSecret()).resolves.toBeUndefined();
    expect(await verifySession('anything.at.all', undefined, new Date(), PREVIEW_AUDIENCE)).toEqual({
      ok: false,
      reason: 'unconfigured',
    });
  });

  it('cannot be probed for the demo password on production', () => {
    previewEnv({ APP_ENV: 'production' });
    // Correct credentials, production environment: still refused, and the
    // refusal does not depend on the submitted values at all.
    expect(previewCredentialsMatch(EMAIL, PASSWORD)).toBe(false);
    expect(previewCredentialsMatch('anything', 'anything')).toBe(false);
  });

  it('serves Supabase, not fixtures, on a configured production deployment', () => {
    previewEnv({
      APP_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });
    expect(adminMode()).toBe('supabase');
    expect(adminPosture().previewDemo).toBe(false);
    expect(adminPosture().appEnv).toBe('production');
  });
});

/* ══ 3. Wrong credentials fail ════════════════════════════════════════ */

describe('3 — the demo credential check', () => {
  it('accepts only the exact pair', () => {
    previewEnv();
    expect(previewCredentialsMatch(EMAIL, PASSWORD)).toBe(true);
    // Case and surrounding space in the email are normalised, as at sign-in.
    expect(previewCredentialsMatch(` ${EMAIL.toUpperCase()} `, PASSWORD)).toBe(true);
  });

  it('refuses a wrong password', () => {
    previewEnv();
    expect(previewCredentialsMatch(EMAIL, 'wrong')).toBe(false);
    expect(previewCredentialsMatch(EMAIL, `${PASSWORD}x`)).toBe(false);
    expect(previewCredentialsMatch(EMAIL, PASSWORD.slice(0, -1))).toBe(false);
    expect(previewCredentialsMatch(EMAIL, PASSWORD.toUpperCase())).toBe(false);
    expect(previewCredentialsMatch(EMAIL, '')).toBe(false);
  });

  it('refuses a wrong email', () => {
    previewEnv();
    expect(previewCredentialsMatch('someone@example.com', PASSWORD)).toBe(false);
    expect(previewCredentialsMatch('', PASSWORD)).toBe(false);
  });

  it('derives a session key from the credentials, not from a production secret', async () => {
    previewEnv();
    const secret = await previewSessionSecret();
    expect(secret).toBeDefined();
    expect(isUsableSecret(secret)).toBe(true);
    // Nothing of the operator configuration went into it.
    expect(secret).not.toBe(OPERATOR_SECRET);
    expect(secret).not.toContain(PASSWORD);
    expect(secret).not.toContain(EMAIL);

    // Changing the password invalidates every existing demo session.
    vi.unstubAllEnvs();
    previewEnv({ ADMIN_PREVIEW_PASSWORD: `${PASSWORD}-rotated` });
    expect(await previewSessionSecret()).not.toBe(secret);
  });

  it('will not verify a demo token signed with a rotated password', async () => {
    previewEnv();
    const secret = (await previewSessionSecret())!;
    const token = await signSession({ sub: 'preview-demo-viewer', email: EMAIL, audience: PREVIEW_AUDIENCE }, secret);
    expect((await verifySession(token, secret, new Date(), PREVIEW_AUDIENCE)).ok).toBe(true);

    vi.unstubAllEnvs();
    previewEnv({ ADMIN_PREVIEW_PASSWORD: `${PASSWORD}-rotated` });
    const rotated = (await previewSessionSecret())!;
    expect(await verifySession(token, rotated, new Date(), PREVIEW_AUDIENCE)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

/* ══ 4. No Supabase or service-role dependency ════════════════════════ */

describe('4 — the demo needs no Supabase, no service role, no bolagio_ tables', () => {
  it('reports preview mode with the entire Supabase configuration absent', () => {
    previewEnv();
    expect(isSupabaseConfigured()).toBe(false);
    expect(adminMode()).toBe('preview');
    const posture = adminPosture();
    expect(posture.supabaseConfigured).toBe(false);
    expect(posture.supabaseAuthConfigured).toBe(false);
    expect(posture.sessionSecretConfigured).toBe(false);
    expect(posture.previewDemo).toBe(true);
    expect(posture.mode).toBe('preview');
  });

  it('serves the synthetic fixtures, which need no tables to exist', async () => {
    previewEnv();
    const source = await rowSource();
    const units = await source.units();
    const { rows, total } = await source.intents({});
    expect(units.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
    expect(rows[0].reference).toMatch(/^BLG-[0-9A-Z]{6}$/);
    // The fixture source answers every read the screens make.
    await expect(source.ping()).resolves.toBe(true);
    await expect(source.queues()).resolves.toBeInstanceOf(Array);
    await expect(source.audit(5)).resolves.toBeInstanceOf(Array);
  });

  it('exposes no secret through the posture the screens receive', () => {
    previewEnv({ SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role' });
    const serialised = JSON.stringify(adminPosture());
    expect(serialised).not.toContain('super-secret-service-role');
    expect(serialised).not.toContain(PASSWORD);
    expect(serialised).not.toContain(EMAIL);
    // Every value is a boolean or a small enum.
    for (const value of Object.values(adminPosture())) {
      expect(['boolean', 'string']).toContain(typeof value);
    }
  });
});

/* ══ 5. No write action is reachable ══════════════════════════════════ */

describe('5 — every write is refused in the demo', () => {
  it('allows reading and nothing else', () => {
    expect(previewAllows('view')).toBe(true);
    expect(previewAllows('reconcile_booking')).toBe(false);
    expect(previewAllows('run_reconciliation_pass')).toBe(false);
    expect(previewAllows('manage_operators')).toBe(false);
  });

  it('gives the demo viewer a role that grants no write either', () => {
    // Both locks, independently: the role table and the preview rule.
    expect(PREVIEW_ROLE).toBe('viewer');
    expect(can(PREVIEW_ROLE, 'view')).toBe(true);
    expect(can(PREVIEW_ROLE, 'reconcile_booking')).toBe(false);
    expect(can(PREVIEW_ROLE, 'run_reconciliation_pass')).toBe(false);
    expect(can(PREVIEW_ROLE, 'manage_operators')).toBe(false);
  });

  it('would still refuse a write if the viewer role were widened later', () => {
    // The second lock does not consult the role table at all, so a future
    // grant to `viewer` cannot open a write path in the demo.
    for (const capability of ['reconcile_booking', 'run_reconciliation_pass', 'manage_operators'] as const) {
      expect(previewAllows(capability)).toBe(false);
    }
  });
});

/* ══ 6. The operator path is untouched ════════════════════════════════ */

describe('6 — operator authentication behaves exactly as before', () => {
  it('signs an operator token with no audience claim, as it always has', async () => {
    const token = await signSession({ sub: 'user-1', email: 'ops@example.com' }, OPERATOR_SECRET);
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'iat', 'sub', 'v']);
    expect(payload.aud).toBeUndefined();
    expect((await verifySession(token, OPERATOR_SECRET)).ok).toBe(true);
  });

  it('never accepts a demo token as an operator session, or the reverse', async () => {
    previewEnv();
    const previewSecret = (await previewSessionSecret())!;
    const demoToken = await signSession({ sub: 'preview-demo-viewer', email: EMAIL, audience: PREVIEW_AUDIENCE }, previewSecret);
    const operatorToken = await signSession({ sub: 'user-1', email: 'ops@example.com' }, OPERATOR_SECRET);

    // Wrong key — the ordinary case.
    expect((await verifySession(demoToken, OPERATOR_SECRET)).ok).toBe(false);
    expect((await verifySession(operatorToken, previewSecret, new Date(), PREVIEW_AUDIENCE)).ok).toBe(false);

    // And even if the keys were somehow identical, the audience separates
    // them: an operator verifier refuses a token that carries one, and a
    // preview verifier refuses one that does not.
    const sameKeyDemo = await signSession({ sub: 'x', email: 'a@b.co', audience: PREVIEW_AUDIENCE }, OPERATOR_SECRET);
    expect(await verifySession(sameKeyDemo, OPERATOR_SECRET)).toEqual({ ok: false, reason: 'malformed' });
    const sameKeyOperator = await signSession({ sub: 'x', email: 'a@b.co' }, OPERATOR_SECRET);
    expect(await verifySession(sameKeyOperator, OPERATOR_SECRET, new Date(), PREVIEW_AUDIENCE)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('keeps the two sessions in separate cookies', () => {
    expect(PREVIEW_SESSION_COOKIE).not.toBe(SESSION_COOKIE);
  });

  it('resolves the ordinary modes exactly as before when the demo is off', () => {
    previewEnv({ APP_ENV: 'production', ADMIN_PREVIEW_DEMO: undefined });
    expect(adminMode()).toBe('unconfigured');
    vi.unstubAllEnvs();

    previewEnv({
      APP_ENV: 'production',
      ADMIN_PREVIEW_DEMO: undefined,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      SUPABASE_ANON_KEY: 'anon-key',
      ADMIN_SESSION_SECRET: OPERATOR_SECRET,
    });
    expect(adminMode()).toBe('supabase');
    const posture = adminPosture();
    expect(posture.supabaseConfigured).toBe(true);
    expect(posture.supabaseAuthConfigured).toBe(true);
    expect(posture.sessionSecretConfigured).toBe(true);
    expect(posture.previewDemo).toBe(false);
  });
});
