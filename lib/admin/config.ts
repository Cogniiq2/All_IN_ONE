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
import { appEnv, isPreviewDemoEnabled } from '@/lib/admin/preview';
import { appEnvironment, validateEnvironment, type AppEnvironment, type EnvironmentFinding } from '@/lib/config/environment';
import { bookingLegalGaps } from '@/lib/legal/readiness';

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

export type AdminMode = 'supabase' | 'fixture' | 'preview' | 'unconfigured';

/**
 * Where the interface reads from.
 *
 * `preview` outranks `supabase` deliberately. A deployment that has declared
 * itself a preview AND switched the demo on serves fixtures to everyone, so
 * there is no request path on it that can reach production booking data —
 * not through a demo session, and not through an operator one either.
 */
export function adminMode(): AdminMode {
  if (devFixturesEnabled()) return 'fixture';
  if (isPreviewDemoEnabled()) return 'preview';
  const { url, serviceRoleKey } = supabaseConfig();
  return url && serviceRoleKey ? 'supabase' : 'unconfigured';
}

/** True when the screens are showing synthetic data of either kind. */
export function isFixtureData(mode: AdminMode = adminMode()): boolean {
  return mode === 'fixture' || mode === 'preview';
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
  /** What the deployment declares itself to be. Never inferred from NODE_ENV. */
  appEnv: 'preview' | 'production';
  /** The four-way declaration behind `appEnv`. */
  environment: AppEnvironment;
  /** True only when all four preview-demo conditions hold. */
  previewDemo: boolean;
  /** The flag as set. */
  directBookingEnabled: boolean;
  /** The flag AND a non-contradictory environment. What the routes obey. */
  directBookingPermitted: boolean;
  /** Configuration findings: codes and sentences naming variables, never values. */
  configFindings: EnvironmentFinding[];
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
  const report = validateEnvironment();
  // Legal gaps are refusals in the same vocabulary as the environment's, so
  // the System page shows "LEGAL_CANCELLATION_POLICY_UNAPPROVED" beside
  // "DIRECT_BOOKING_WITHOUT_WEBHOOK" and the operator sees one list.
  const legal: EnvironmentFinding[] = directBookingEnabled()
    ? bookingLegalGaps().map((g) => ({ code: g.code, severity: 'refuse' as const, message: g.message }))
    : [];
  return {
    mode: adminMode(),
    appEnv: appEnv(),
    environment: appEnvironment(),
    previewDemo: isPreviewDemoEnabled(),
    directBookingEnabled: directBookingEnabled(),
    directBookingPermitted: report.directBookingPermitted && legal.length === 0,
    configFindings: [...report.findings, ...legal],
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
