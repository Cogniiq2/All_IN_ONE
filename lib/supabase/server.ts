import 'server-only';

/**
 * The Supabase service-role client.
 *
 * ── Why the service role, and why only here ──────────────────────────────
 * Every booking table has RLS enabled with NO permissive policy, so anon and
 * authenticated keys read nothing at all — deliberately, because those tables
 * hold guest names, email addresses, phone numbers and reservation references.
 * The service role bypasses RLS, which makes this module the single door, and
 * `server-only` makes importing it from a client component a build error
 * rather than a code review question.
 *
 * Session persistence and auto-refresh are off: there is no user session here,
 * only a machine key, and a worker isolate must not accumulate auth state
 * between requests.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/booking/config';

let cached: SupabaseClient | null = null;

/** Throws when Supabase is not configured. Never returns a half-working stub. */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const { url, serviceRoleKey } = supabaseConfig();
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase is not configured');
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'bolagio-booking' } },
  });
  return cached;
}

/** True when the booking backend has somewhere to write. Checked before use. */
export function isSupabaseConfigured(): boolean {
  const { url, serviceRoleKey } = supabaseConfig();
  return Boolean(url && serviceRoleKey);
}
