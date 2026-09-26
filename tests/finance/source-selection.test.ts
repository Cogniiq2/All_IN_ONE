/**
 * ══════════════════════════════════════════════════════════════════════════
 * WHICH FINANCE SOURCE ANSWERS — and that a real deployment never answers
 * with synthetic figures.
 *
 * `financeRowSource()` is the only door the finance pages have to data. On
 * production and staging it must reach Supabase when configured, and REFUSE
 * (AdminUnconfiguredError) when not — never fall back to fixtures. Fixtures
 * exist only under `next dev` with a flag, or on a deployment that declares
 * itself a preview AND switches the demo on.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/finance/source-supabase', () => ({ supabaseFinanceSource: () => ({ kind: 'supabase' }) }));
vi.mock('@/lib/finance/fixtures', () => ({ fixtureFinanceSource: () => ({ kind: 'fixture' }) }));

const SUPABASE = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' };
const DEMO = { ADMIN_PREVIEW_DEMO: 'true', ADMIN_PREVIEW_EMAIL: 'demo@example.com', ADMIN_PREVIEW_PASSWORD: 'a-long-enough-demo-password' };

function env(values: Record<string, string>) {
  for (const k of ['APP_ENV', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PREVIEW_DEMO', 'ADMIN_PREVIEW_EMAIL', 'ADMIN_PREVIEW_PASSWORD', 'ADMIN_DEV_FIXTURES']) vi.stubEnv(k, '');
  for (const [k, v] of Object.entries(values)) vi.stubEnv(k, v);
}

async function source() {
  const { financeRowSource } = await import('@/lib/finance/source');
  return (await financeRowSource()) as unknown as { kind: string };
}

afterEach(() => vi.unstubAllEnvs());

describe('the finance row source', () => {
  it('production with Supabase configured reads Supabase', async () => {
    env({ APP_ENV: 'production', ...SUPABASE });
    expect((await source()).kind).toBe('supabase');
  });

  it('staging with Supabase configured reads Supabase', async () => {
    env({ APP_ENV: 'staging', ...SUPABASE });
    expect((await source()).kind).toBe('supabase');
  });

  it('production never serves the preview demo, even with every demo variable set', async () => {
    env({ APP_ENV: 'production', ...SUPABASE, ...DEMO });
    expect((await source()).kind).toBe('supabase');
    const { adminMode } = await import('@/lib/admin/config');
    expect(adminMode()).toBe('supabase');
  });

  it('an undeclared environment is production: Supabase, never fixtures', async () => {
    env({ ...SUPABASE, ...DEMO });
    expect((await source()).kind).toBe('supabase');
  });

  it('production WITHOUT the service role refuses — it does not fall back to fixture figures', async () => {
    env({ APP_ENV: 'production', SUPABASE_URL: 'https://project.supabase.co', ...DEMO });
    const { AdminUnconfiguredError } = await import('@/lib/finance/source');
    await expect(source()).rejects.toBeInstanceOf(AdminUnconfiguredError);
  });

  it('the fixture demo exists only on a declared preview with the demo switched on', async () => {
    env({ APP_ENV: 'preview', ...SUPABASE, ...DEMO });
    expect((await source()).kind).toBe('fixture');
    env({ APP_ENV: 'preview', ...SUPABASE });
    expect((await source()).kind).toBe('supabase');
  });
});
