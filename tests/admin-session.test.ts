/**
 * The operator session token: signs, verifies, and fails closed on every
 * malformed or tampered input. Web Crypto only, so it runs where the
 * middleware runs.
 */

import { describe, expect, it } from 'vitest';
import { MIN_SECRET_LENGTH, SESSION_TTL_SECONDS, isUsableSecret, signSession, verifySession } from '@/lib/admin/session';

const SECRET = 'x'.repeat(48);
const NOW = new Date('2026-09-19T08:00:00Z');

describe('operator session', () => {
  it('round-trips claims through sign and verify', async () => {
    const token = await signSession({ sub: 'user-1', email: 'Ops@Example.com' }, SECRET, NOW);
    const verdict = await verifySession(token, SECRET, NOW);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.claims.sub).toBe('user-1');
    expect(verdict.claims.email).toBe('ops@example.com');
    expect(verdict.claims.exp - verdict.claims.iat).toBe(SESSION_TTL_SECONDS);
  });

  it('refuses when the secret is missing or too short', async () => {
    const token = await signSession({ sub: 'u', email: 'a@b.c' }, SECRET, NOW);
    expect((await verifySession(token, undefined, NOW)).ok).toBe(false);
    expect((await verifySession(token, 'short', NOW))).toEqual({ ok: false, reason: 'unconfigured' });
    expect(isUsableSecret('a'.repeat(MIN_SECRET_LENGTH - 1))).toBe(false);
    expect(isUsableSecret('a'.repeat(MIN_SECRET_LENGTH))).toBe(true);
    await expect(signSession({ sub: 'u', email: 'a@b.c' }, 'short', NOW)).rejects.toThrow();
  });

  it('refuses a token signed with a different secret', async () => {
    const token = await signSession({ sub: 'u', email: 'a@b.c' }, SECRET, NOW);
    expect(await verifySession(token, 'y'.repeat(48), NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a tampered body', async () => {
    const token = await signSession({ sub: 'u', email: 'a@b.c' }, SECRET, NOW);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, sub: 'admin', email: 'a@b.c', iat: 0, exp: 9e9 })).toString('base64url');
    expect((await verifySession(`${forged}.${sig}`, SECRET, NOW)).ok).toBe(false);
    expect((await verifySession(`${body}.${sig}x`, SECRET, NOW)).ok).toBe(false);
  });

  it('expires', async () => {
    const token = await signSession({ sub: 'u', email: 'a@b.c' }, SECRET, NOW);
    const later = new Date(NOW.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    expect(await verifySession(token, SECRET, later)).toEqual({ ok: false, reason: 'expired' });
  });

  it('never throws on garbage', async () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c', '..', '%%%.%%%', 'eyJ.eyJ']) {
      const verdict = await verifySession(bad, SECRET, NOW);
      expect(verdict.ok).toBe(false);
    }
    expect(await verifySession(undefined, SECRET, NOW)).toEqual({ ok: false, reason: 'missing' });
  });
});
