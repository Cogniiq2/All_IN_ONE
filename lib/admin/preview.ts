/**
 * ══════════════════════════════════════════════════════════════════════════
 * PREVIEW DEMO MODE — for looking at BoLaGio Control, and nothing else.
 *
 * A Cloudflare preview deployment is a PRODUCTION BUILD. `NODE_ENV` is
 * `production` there, so it proves nothing and is deliberately not consulted.
 * What this module requires instead is that the deployment says what it is,
 * explicitly, and that someone has switched the demo on, explicitly:
 *
 *     APP_ENV=preview            the deployment declares itself non-production
 *     ADMIN_PREVIEW_DEMO=true    the demo is deliberately switched on
 *     ADMIN_PREVIEW_EMAIL        no default
 *     ADMIN_PREVIEW_PASSWORD     no default, minimum length enforced
 *
 * ALL FOUR. Any one missing and preview demo authentication does not exist —
 * there is no branch that runs, no cookie that verifies, no credential that
 * is accepted. `APP_ENV` unset is read as production, so a deployment that
 * forgets to declare itself gets the safe answer rather than the convenient
 * one, and `ADMIN_PREVIEW_DEMO=true` left on a production worker by accident
 * does nothing at all.
 *
 * ── What the demo is ─────────────────────────────────────────────────────
 * The synthetic fixtures in `lib/admin/dev/fixtures.ts`, behind a viewer
 * session, with every write refused. It does not read production booking
 * data, does not need the `bolagio_*` tables, does not need the Supabase
 * service role, does not call Beds24, PayPal or the reconciliation engine,
 * and shares no code path with operator authentication.
 *
 * ── Why the session secret is derived ────────────────────────────────────
 * So that a preview deployment needs NO production secret to work. The key
 * is a SHA-256 over a domain-separated string built from the demo
 * credentials, which are themselves preview-only. `ADMIN_SESSION_SECRET` is
 * never read here, and a preview token can never verify as an operator token
 * — different cookie, different key, and an explicit audience claim.
 *
 * ── Runtime ──────────────────────────────────────────────────────────────
 * Web Crypto only and no `server-only` marker, because the middleware needs
 * this module at the edge. It reads `process.env` and must never be imported
 * by a client component.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { timingSafeEqual } from '@/lib/booking/reference';
import { appEnvironment } from '@/lib/config/environment';
import type { Capability, OperatorRole } from '@/lib/admin/permissions';

/** The cookie the demo session lives in. Deliberately NOT the operator cookie. */
export const PREVIEW_SESSION_COOKIE = 'bolagio_control_preview';

/** The audience claim on a demo token. An operator verifier rejects it. */
export const PREVIEW_AUDIENCE = 'preview-demo';

/**
 * The demo password is also the material the session key is derived from, so
 * it carries the weight of a secret and is held to a secret's length.
 */
export const MIN_PREVIEW_PASSWORD_LENGTH = 16;

/** What a demo viewer may do. Read, and nothing else. */
export const PREVIEW_ROLE: OperatorRole = 'viewer';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The deployment's own declaration of what it is.
 *
 * Anything that is not exactly `preview` — including absent, empty, mixed
 * case or misspelled — is production. Being wrong in that direction costs a
 * demo; being wrong in the other direction is the whole risk this file
 * exists to remove.
 */
export function appEnv(): 'preview' | 'production' {
  // `local` and `staging` are not previews: the demo exists on a preview and
  // nowhere else. Both read as "not preview" here, which is the safe side.
  return appEnvironment() === 'preview' ? 'preview' : 'production';
}

export function isProductionEnv(): boolean {
  return appEnv() === 'production';
}

export interface PreviewCredentials {
  email: string;
  password: string;
}

/** Both values, or null. There is no default email and no default password. */
export function previewCredentials(): PreviewCredentials | null {
  const email = env('ADMIN_PREVIEW_EMAIL');
  const password = env('ADMIN_PREVIEW_PASSWORD');
  if (!email || !password) return null;
  if (password.length < MIN_PREVIEW_PASSWORD_LENGTH) return null;
  return { email: email.toLowerCase(), password };
}

/**
 * Why the demo is off, when it is off. For the login screen and the System
 * page — never for an error a visitor sees before signing in.
 */
export type PreviewBlockReason =
  | 'production_env'
  | 'flag_off'
  | 'missing_credentials'
  | 'weak_password';

export function previewDemoBlockedBecause(): PreviewBlockReason | null {
  if (appEnv() !== 'preview') return 'production_env';
  if (env('ADMIN_PREVIEW_DEMO') !== 'true') return 'flag_off';
  const email = env('ADMIN_PREVIEW_EMAIL');
  const password = env('ADMIN_PREVIEW_PASSWORD');
  if (!email || !password) return 'missing_credentials';
  if (password.length < MIN_PREVIEW_PASSWORD_LENGTH) return 'weak_password';
  return null;
}

/**
 * The single gate. Every preview-demo code path in the application asks this
 * one function, and it is false unless all four conditions hold.
 */
export function isPreviewDemoEnabled(): boolean {
  return previewDemoBlockedBecause() === null;
}

/**
 * The HMAC key for demo sessions, derived from the demo credentials.
 *
 * Domain-separated so the digest cannot collide with any other use of these
 * strings, and returned as 64 hex characters so it satisfies the session
 * module's minimum-length check without any production secret being read.
 */
export async function previewSessionSecret(): Promise<string | undefined> {
  if (!isPreviewDemoEnabled()) return undefined;
  const creds = previewCredentials();
  if (!creds) return undefined;
  const material = `bolagio-control/preview-demo/v1|${creds.email}|${creds.password}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.prototype.slice
    .call(new Uint8Array(digest))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check a submitted demo credential pair.
 *
 * Constant-time on both fields, and false whenever the gate is shut — so a
 * production deployment cannot be probed for the demo password even if one
 * were somehow present in its environment.
 */
export function previewCredentialsMatch(email: string, password: string): boolean {
  if (!isPreviewDemoEnabled()) return false;
  const creds = previewCredentials();
  if (!creds) return false;
  const emailOk = timingSafeEqual(email.trim().toLowerCase(), creds.email);
  const passwordOk = timingSafeEqual(password, creds.password);
  return emailOk && passwordOk;
}

/**
 * What a demo session is allowed to do, independent of any role table.
 *
 * `view` and nothing else, forever. This is the second of two locks: the
 * demo operator already carries the `viewer` role, and every write action
 * asks this as well, so adding a capability to `viewer` later could not
 * quietly open a write path in the demo.
 */
export function previewAllows(capability: Capability): boolean {
  return capability === 'view';
}
