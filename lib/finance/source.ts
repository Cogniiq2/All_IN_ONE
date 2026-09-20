import 'server-only';

/**
 * Which finance row source answers — the same three-way switch as the
 * operations interface (`lib/admin/source.ts`): fixtures under `next dev`
 * with the flag, the same fixtures on a declared preview-demo deployment,
 * otherwise Supabase or "unconfigured". No finance page ever constructs a
 * Supabase client in the browser.
 */

import { adminMode } from '@/lib/admin/config';
import { AdminUnconfiguredError } from '@/lib/admin/source';
import type { FinanceRowSource } from '@/lib/finance/rows';

export async function financeRowSource(): Promise<FinanceRowSource> {
  const mode = adminMode();
  if (mode === 'fixture' || mode === 'preview') {
    const { fixtureFinanceSource } = await import('@/lib/finance/fixtures');
    return fixtureFinanceSource();
  }
  if (mode === 'unconfigured') throw new AdminUnconfiguredError();
  const { supabaseFinanceSource } = await import('@/lib/finance/source-supabase');
  return supabaseFinanceSource();
}

export { AdminUnconfiguredError };
