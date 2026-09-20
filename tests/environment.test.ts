/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE ENVIRONMENT MODEL — every contradiction it must refuse.
 *
 * Pure: the rules take a source object, so nothing here touches process.env
 * and every case is a table entry rather than a mutation of global state.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { appEnvironment, refusals, validateEnvironment, type EnvironmentSource } from '@/lib/config/environment';

/** A production configuration with everything the launch gate needs. */
const COMPLETE_PRODUCTION: EnvironmentSource = {
  APP_ENV: 'production',
  DIRECT_BOOKING_ENABLED: 'true',
  PAYPAL_MODE: 'live',
  PAYPAL_CLIENT_ID: 'id',
  PAYPAL_CLIENT_SECRET: 'secret',
  PAYPAL_WEBHOOK_ID: 'WH-1',
  BEDS24_MODE: 'live',
  BEDS24_REFRESH_TOKEN: 'token',
  BEDS24_WEBHOOK_SECRET: 'whs',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srk',
  BOOKING_SYNC_SECRET: 'sync',
  ADMIN_SESSION_SECRET: 'a'.repeat(40),
  N8N_INTERNAL_SECRET: 'n8n',
};

const codes = (source: EnvironmentSource) => refusals(validateEnvironment(source)).map((f) => f.code).sort();

describe('the declaration', () => {
  it('reads exactly the four names, and everything else as production', () => {
    expect(appEnvironment({ APP_ENV: 'local' })).toBe('local');
    expect(appEnvironment({ APP_ENV: 'preview' })).toBe('preview');
    expect(appEnvironment({ APP_ENV: 'staging' })).toBe('staging');
    expect(appEnvironment({ APP_ENV: 'production' })).toBe('production');
    for (const bad of [undefined, '', 'Preview', 'PRODUCTION', 'prod', 'dev', 'test']) {
      expect(appEnvironment({ APP_ENV: bad }), `APP_ENV=${JSON.stringify(bad)}`).toBe('production');
    }
    expect(validateEnvironment({}).environmentAssumed).toBe(true);
    expect(validateEnvironment({ APP_ENV: 'staging' }).environmentAssumed).toBe(false);
  });
});

describe('a complete production configuration', () => {
  it('permits direct booking with no contradiction', () => {
    const report = validateEnvironment(COMPLETE_PRODUCTION);
    expect(refusals(report)).toEqual([]);
    expect(report.directBookingPermitted).toBe(true);
  });

  it('is not permitted merely because the flag is on', () => {
    expect(validateEnvironment({ APP_ENV: 'production', DIRECT_BOOKING_ENABLED: 'true' }).directBookingPermitted).toBe(false);
  });

  it('is off, with no refusal, when the flag is off', () => {
    const report = validateEnvironment({ ...COMPLETE_PRODUCTION, DIRECT_BOOKING_ENABLED: 'false' });
    expect(report.directBookingPermitted).toBe(false);
    expect(refusals(report)).toEqual([]);
  });
});

describe('contradictions the gate refuses', () => {
  it('production + preview demo switch', () => {
    expect(codes({ APP_ENV: 'production', ADMIN_PREVIEW_DEMO: 'true' })).toContain('DEMO_SWITCH_OUTSIDE_PREVIEW');
    expect(codes({ APP_ENV: 'staging', ADMIN_PREVIEW_DEMO: 'true' })).toContain('DEMO_SWITCH_OUTSIDE_PREVIEW');
    expect(codes({ APP_ENV: 'preview', ADMIN_PREVIEW_DEMO: 'true' })).not.toContain('DEMO_SWITCH_OUTSIDE_PREVIEW');
  });

  it('production + sandbox PayPal with direct booking on', () => {
    expect(codes({ ...COMPLETE_PRODUCTION, PAYPAL_MODE: 'sandbox' })).toContain('SANDBOX_PAYPAL_ON_PRODUCTION');
    // With the gate off it is a warning, not a refusal.
    const off = validateEnvironment({ ...COMPLETE_PRODUCTION, PAYPAL_MODE: 'sandbox', DIRECT_BOOKING_ENABLED: 'false' });
    expect(refusals(off)).toEqual([]);
    expect(off.findings.map((f) => f.code)).toContain('SANDBOX_PAYPAL_ON_PRODUCTION');
  });

  it('live PayPal anywhere but production', () => {
    expect(codes({ APP_ENV: 'preview', PAYPAL_MODE: 'live' })).toContain('LIVE_PAYPAL_OUTSIDE_PRODUCTION');
    expect(codes({ APP_ENV: 'local', PAYPAL_MODE: 'live' })).toContain('LIVE_PAYPAL_OUTSIDE_PRODUCTION');
    expect(codes({ APP_ENV: 'staging', PAYPAL_MODE: 'live' })).toContain('LIVE_PAYPAL_ON_STAGING');
    expect(codes({ APP_ENV: 'production', PAYPAL_MODE: 'live' })).toEqual([]);
  });

  it('direct booking on a preview', () => {
    expect(codes({ APP_ENV: 'preview', DIRECT_BOOKING_ENABLED: 'true' })).toContain('DIRECT_BOOKING_ON_PREVIEW');
  });

  it('fixture switch on a production-like deployment', () => {
    expect(codes({ APP_ENV: 'production', ADMIN_DEV_FIXTURES: 'true' })).toContain('FIXTURE_SWITCH_ON_PRODUCTION');
    expect(codes({ APP_ENV: 'local', ADMIN_DEV_FIXTURES: 'true' })).toEqual([]);
  });

  it('direct booking with any production prerequisite missing', () => {
    const cases: Array<[string, Partial<Record<string, string | undefined>>]> = [
      ['DIRECT_BOOKING_WITHOUT_PAYPAL_MODE', { PAYPAL_MODE: undefined }],
      ['DIRECT_BOOKING_WITHOUT_PAYPAL_CREDENTIALS', { PAYPAL_CLIENT_SECRET: undefined }],
      ['DIRECT_BOOKING_WITHOUT_WEBHOOK', { PAYPAL_WEBHOOK_ID: undefined }],
      ['DIRECT_BOOKING_WITHOUT_LIVE_BEDS24', { BEDS24_MODE: 'mock' }],
      ['DIRECT_BOOKING_WITHOUT_BEDS24_TOKEN', { BEDS24_REFRESH_TOKEN: undefined }],
      ['DIRECT_BOOKING_WITHOUT_DATABASE', { SUPABASE_SERVICE_ROLE_KEY: undefined }],
      ['DIRECT_BOOKING_WITHOUT_SCHEDULER_SECRET', { BOOKING_SYNC_SECRET: undefined }],
    ];
    for (const [code, override] of cases) {
      const report = validateEnvironment({ ...COMPLETE_PRODUCTION, ...override });
      expect(refusals(report).map((f) => f.code), code).toContain(code);
      expect(report.directBookingPermitted, code).toBe(false);
    }
  });

  it('staging may run the sandbox end to end', () => {
    const report = validateEnvironment({ ...COMPLETE_PRODUCTION, APP_ENV: 'staging', PAYPAL_MODE: 'sandbox' });
    expect(refusals(report)).toEqual([]);
    expect(report.directBookingPermitted).toBe(true);
  });
});

describe('findings never carry a value', () => {
  it('names variables only', () => {
    const report = validateEnvironment({ ...COMPLETE_PRODUCTION, PAYPAL_CLIENT_SECRET: 'THE-SECRET-VALUE', PAYPAL_MODE: 'sandbox' });
    const text = JSON.stringify(report);
    expect(text).not.toContain('THE-SECRET-VALUE');
    expect(text).not.toContain('srk');
  });
});
