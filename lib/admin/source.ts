import 'server-only';

/**
 * Which row source answers.
 *
 * `fixture` is reachable only under `next dev` with `ADMIN_DEV_FIXTURES=true`
 * (see `devFixturesEnabled`). `preview` is reachable only on a deployment
 * that declares `APP_ENV=preview` and switches on `ADMIN_PREVIEW_DEMO=true`
 * (see `lib/admin/preview.ts`). Otherwise the interface reads Supabase or
 * reports itself unconfigured.
 */

import { adminMode } from '@/lib/admin/config';
import type { RowSource } from '@/lib/admin/rows';
import { supabaseRowSource } from '@/lib/admin/source-supabase';

export class AdminUnconfiguredError extends Error {
  constructor() {
    super('The operations backend is not configured');
    this.name = 'AdminUnconfiguredError';
  }
}

export async function rowSource(): Promise<RowSource> {
  const mode = adminMode();
  // Development fixtures and the preview demo read the same synthetic rows.
  // Neither constructs a Supabase client, so neither needs the service role
  // key or the `bolagio_*` tables to exist.
  if (mode === 'fixture' || mode === 'preview') {
    const { fixtureRowSource } = await import('@/lib/admin/dev/fixtures');
    return fixtureRowSource();
  }
  if (mode === 'unconfigured') throw new AdminUnconfiguredError();
  return supabaseRowSource();
}
