/**
 * Staging talks to the real Beds24. With direct booking on, only a browser
 * holding an administrator-issued tester cookie may create a hold there;
 * every other visitor is refused before anything is written. Production and
 * the local simulator are not affected.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ permitted: true }));

vi.mock('@/lib/booking/config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/booking/config')>();
  return { ...real, directBookingPermitted: () => ({ permitted: gate.permitted, refusals: [] }) };
});

import { directBookingFor, mintTesterToken, requireDirectBookingFor, testerGateApplies, TESTER_COOKIE } from '@/lib/booking/tester';
import { createLogger } from '@/lib/booking/logger';

const SECRET = 'a-staging-admin-session-secret-of-enough-length';
const request = (cookie?: string) => ({ cookies: { get: (name: string) => (name === TESTER_COOKIE && cookie ? { value: cookie } : undefined) } });
const saved = { ...process.env };

beforeEach(() => {
  gate.permitted = true;
  Object.assign(process.env, { APP_ENV: 'staging', BEDS24_MODE: 'live', ADMIN_SESSION_SECRET: SECRET });
  delete process.env.BEDS24_API_BASE_URL;
});
afterEach(() => {
  process.env = { ...saved };
});

describe('staging tester gate', () => {
  it('applies on staging against the real Beds24, not on production or the simulator', () => {
    expect(testerGateApplies()).toBe(true);
    process.env.APP_ENV = 'production';
    expect(testerGateApplies()).toBe(false);
    process.env.APP_ENV = 'local';
    process.env.BEDS24_API_BASE_URL = 'http://127.0.0.1:9999';
    expect(testerGateApplies()).toBe(false);
  });

  it('a stranger is refused; an issued tester passes', async () => {
    expect(await directBookingFor(request())).toBe(false);
    expect(await directBookingFor(request('forged.token'))).toBe(false);
    await expect(requireDirectBookingFor(request(), createLogger())).rejects.toMatchObject({ code: 'booking_disabled' });
    const token = await mintTesterToken({ id: 'u1', email: 'owner@example.com' });
    expect(await directBookingFor(request(token))).toBe(true);
  });

  it('a tester cookie never opens a shut launch gate', async () => {
    const token = await mintTesterToken({ id: 'u1', email: 'owner@example.com' });
    gate.permitted = false;
    expect(await directBookingFor(request(token))).toBe(false);
  });

  it('an operator session token is not a tester token', async () => {
    const { signSession } = await import('@/lib/admin/session');
    const session = await signSession({ sub: 'u1', email: 'owner@example.com' }, SECRET);
    expect(await directBookingFor(request(session))).toBe(false);
  });

  it('production keeps the launch gate alone', async () => {
    process.env.APP_ENV = 'production';
    expect(await directBookingFor(request())).toBe(true);
  });
});

describe('a staging test booking never reaches the books', () => {
  it('is recognised by the TEST terms it was concluded under, except on local', async () => {
    const { isStagingTestBooking } = await import('@/lib/finance/ingestion-rules');
    const test = { versions: { cancellation: 'test-fixture', withdrawal: 'test-fixture', agb: 'test-fixture', privacy: 'test-fixture', price: 'test-fixture' } };
    const real = { versions: { cancellation: '2026-11-01', withdrawal: '2026-11-01', agb: '2026-11-01', privacy: '2026-11-01', price: '2026-11-01' } };
    expect(isStagingTestBooking(test, 'staging')).toBe(true);
    expect(isStagingTestBooking(test, 'production')).toBe(true);
    expect(isStagingTestBooking(real, 'staging')).toBe(false);
    expect(isStagingTestBooking(null, 'staging')).toBe(false);
    expect(isStagingTestBooking(test, 'local')).toBe(false);
  });
});
