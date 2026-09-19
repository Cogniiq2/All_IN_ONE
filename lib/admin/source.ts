import 'server-only';

/**
 * Which row source answers.
 *
 * `fixture` is reachable only under `next dev` with `ADMIN_DEV_FIXTURES=true`
 * (see `devFixturesEnabled`). In a production build that branch is dead code;
 * the interface reads Supabase or reports itself unconfigured.
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
  if (mode === 'fixture') {
    const { fixtureRowSource } = await import('@/lib/admin/dev/fixtures');
    return fixtureRowSource();
  }
  if (mode === 'unconfigured') throw new AdminUnconfiguredError();
  return supabaseRowSource();
}
