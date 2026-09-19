import 'server-only';

/**
 * Per-request memoisation for reads that more than one server component in
 * the same render needs — the shell's attention count and the overview's
 * attention list are the same query. React's `cache` scopes the memo to one
 * request, so nothing is ever served stale across requests.
 */

import { cache } from 'react';
import { listUnits, loadAttention } from '@/lib/admin/queries';

export const cachedAttention = cache(() => loadAttention());
export const cachedUnits = cache(() => listUnits());
