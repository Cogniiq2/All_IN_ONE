/**
 * The service-role client never lets Next's Data Cache answer a PostgREST
 * read. Found by the Playwright suite: a night held seconds earlier was still
 * painted free because the same calendar URL had been fetched once before.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { uncachedFetch } from '@/lib/supabase/server';

describe('the Supabase server client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks every request no-store, whatever the caller passed', async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { seen.push(init ?? {}); return new Response('[]', { status: 200 }); }));
    await uncachedFetch('https://x.supabase.co/rest/v1/bolagio_units?select=id', { method: 'GET', headers: { apikey: 'k' } });
    await uncachedFetch('https://x.supabase.co/rest/v1/bolagio_units', { method: 'POST', cache: 'force-cache' });
    expect(seen.map((i) => i.cache)).toEqual(['no-store', 'no-store']);
    expect((seen[0].headers as Record<string, string>).apikey).toBe('k');
  });
});
