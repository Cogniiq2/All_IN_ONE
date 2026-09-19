import 'server-only';

/**
 * BoLaGio Control configuration — the only place its secrets are read.
 *
 * Same rules as `lib/booking/config.ts`: `server-only`, nothing read at module
 * scope, and nothing here is ever re-exported from a file a client component
 * imports. The one thing this module offers a screen is `adminPosture()`,
 * which returns booleans and enum strings — never a value.
 */

import {
  beds24Config,
  beds24Mode,
  beds24WebhookSecret,
  directBookingEnabled,
  inventorySyncSecret,
  n8nInternalSecret,
  paypalConfig,
  paypalMode,
  supabaseConfig,
} from '@/lib/booking/config';
import { isUsableSecret } from '@/lib/admin/session';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/** The HMAC key operator sessions are signed with. `openssl rand -hex 32`. */
export function adminSessionSecret(): string | undefined {
  return env('ADMIN_SESSION_SECRET');
}

/**
 * The Supabase anon key, used SERVER-SIDE to verify an operator's password
 * against Supabase Auth. Not `NEXT_PUBLIC_`: the browser never holds a
 * Supabase client in the operations interface.
 */
export function supabaseAnonKey(): string | undefined {
  return env('SUPABASE_ANON_KEY');
}

/**
 * Development fixtures.
 *
 * On only under `next dev` AND an explicit flag. `NODE_ENV` is inlined at build
 * time, so in a production build this function is a constant `false` and the
 * fixture branch is unreachable. Fixtures exist so the interface can be seen
 * and QA'd without a live project; they are never production truth.
 */
export function devFixturesEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && env('ADMIN_DEV_FIXTURES') === 'true';
}

/** The fixture operator's credentials. Both must be set; there is no default password anywhere. */
export function devFixtureCredentials(): { email: string; password: string } | null {
  const email = env('ADMIN_DEV_FIXTURE_EMAIL');
  const password = env('ADMIN_DEV_FIXTURE_PASSWORD');
  if (!email || !password) return null;
  return { email: email.toLowerCase(), password };
}

export type AdminMode = 'supabase' | 'fixture' | 'unconfigured';

/** Where the interface reads from. */
export function adminMode(): AdminMode {
  if (devFixturesEnabled()) return 'fixture';
  const { url, serviceRoleKey } = supabaseConfig();
  return url && serviceRoleKey ? 'supabase' : 'unconfigured';
}

export function isSecureCookieContext(): boolean {
  // Plain HTTP only ever happens in local development.
  return process.env.NODE_ENV === 'production';
}

/**
 * Safe environment posture for the System page and the overview banners.
 *
 * Every field is a boolean or a small enum. No secret value, no URL, no key
 * length — just whether a thing is configured and which mode it is in.
 */
export interface AdminPosture {
  mode: AdminMode;
  directBookingEnabled: boolean;
  paypalMode: 'sandbox' | 'live' | 'unconfigured';
  paypalCredentialsConfigured: boolean;
  paypalWebhookConfigured: boolean;
  beds24Mode: 'mock' | 'live';
  beds24TokenConfigured: boolean;
  beds24WebhookSecretConfigured: boolean;
  supabaseConfigured: boolean;
  supabaseAuthConfigured: boolean;
  sessionSecretConfigured: boolean;
  n8nSecretConfigured: boolean;
  schedulerSecretConfigured: boolean;
}

export function adminPosture(): AdminPosture {
  const paypal = paypalConfig();
  const beds24 = beds24Config();
  const supabase = supabaseConfig();
  return {
    mode: adminMode(),
    directBookingEnabled: directBookingEnabled(),
    paypalMode: paypalMode() ?? 'unconfigured',
    paypalCredentialsConfigured: Boolean(paypal.clientId && paypal.clientSecret),
    paypalWebhookConfigured: Boolean(paypal.webhookId),
    beds24Mode: beds24Mode(),
    beds24TokenConfigured: Boolean(beds24.refreshToken),
    beds24WebhookSecretConfigured: Boolean(beds24WebhookSecret()),
    supabaseConfigured: Boolean(supabase.url && supabase.serviceRoleKey),
    supabaseAuthConfigured: Boolean(supabase.url && supabaseAnonKey()),
    sessionSecretConfigured: isUsableSecret(adminSessionSecret()),
    n8nSecretConfigured: Boolean(n8nInternalSecret()),
    schedulerSecretConfigured: Boolean(inventorySyncSecret()),
  };
}
