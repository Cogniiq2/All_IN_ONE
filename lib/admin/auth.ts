import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * OPERATOR AUTHENTICATION AND AUTHORISATION.
 *
 * Identity        Supabase Auth verifies the password, server-side, with the
 *                 anon key. The browser never talks to Supabase.
 * Authorisation   `bolagio_operators`, read with the service role on EVERY
 *                 request. An operator who is deactivated is out on their
 *                 next request, not when their cookie expires.
 * Session         an HMAC-signed cookie (`lib/admin/session.ts`). It names a
 *                 Supabase user; it never carries a role.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────
 * No session secret → nobody signs in. No Supabase → nobody signs in. No
 * allowlist row → a perfectly valid Supabase user is refused. There is no
 * configuration in which this module lets someone through by default.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/booking/config';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  adminMode,
  adminSessionSecret,
  devFixtureCredentials,
  isSecureCookieContext,
  supabaseAnonKey,
} from '@/lib/admin/config';
import { can, isOperatorRole, type Capability, type OperatorRole } from '@/lib/admin/permissions';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionClaims,
} from '@/lib/admin/session';
import {
  PREVIEW_AUDIENCE,
  PREVIEW_ROLE,
  PREVIEW_SESSION_COOKIE,
  isPreviewDemoEnabled,
  previewAllows,
  previewCredentials,
  previewCredentialsMatch,
  previewSessionSecret,
} from '@/lib/admin/preview';

export interface Operator {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  role: OperatorRole;
  /**
   * True only for a preview-demo session. Carried on the operator so that
   * every consumer — a page deciding whether to render a control, an action
   * deciding whether to run — can see it without asking the environment
   * again. An operator session is always `false`.
   */
  preview: boolean;
}

export type SignInResult =
  | { ok: true; operator: Operator }
  | { ok: false; reason: 'unconfigured' | 'invalid_credentials' | 'not_allowlisted' | 'inactive' | 'identity_mismatch' | 'unavailable' };

export class AdminAuthError extends Error {
  constructor(readonly reason: 'unauthenticated' | 'forbidden') {
    super(reason);
    this.name = 'AdminAuthError';
  }
}

/* ── Allowlist access ──────────────────────────────────────────────────── */

interface OperatorRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string;
  role: string;
  active: boolean;
  sessions_invalidated_before: string | null;
}

const OPERATOR_COLUMNS = 'id, auth_user_id, email, display_name, role, active, sessions_invalidated_before';

async function findOperatorByEmail(email: string): Promise<OperatorRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_operators')
    .select(OPERATOR_COLUMNS)
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data as OperatorRow | null) ?? null;
}

async function findOperatorByAuthUser(authUserId: string): Promise<OperatorRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_operators')
    .select(OPERATOR_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as OperatorRow | null) ?? null;
}

function toOperator(row: OperatorRow, authUserId: string): Operator | null {
  if (!isOperatorRole(row.role)) return null;
  return {
    id: row.id,
    authUserId,
    email: row.email,
    displayName: row.display_name || row.email,
    role: row.role,
    preview: false,
  };
}

/* ── Fixture identity (development only) ───────────────────────────────── */

const FIXTURE_AUTH_USER_ID = 'fixture-operator';

function fixtureOperator(): Operator | null {
  const creds = devFixtureCredentials();
  if (!creds) return null;
  return {
    id: 'fixture-operator-row',
    authUserId: FIXTURE_AUTH_USER_ID,
    email: creds.email,
    displayName: 'Fixture operator',
    role: 'operator',
    preview: false,
  };
}

/* ── Preview demo identity ─────────────────────────────────────────────── */

const PREVIEW_SUBJECT = 'preview-demo-viewer';

function previewOperator(): Operator | null {
  const creds = previewCredentials();
  if (!creds) return null;
  return {
    id: 'preview-demo',
    authUserId: PREVIEW_SUBJECT,
    email: creds.email,
    displayName: 'Preview viewer',
    // Hard-coded, never read from a table. `viewer` grants `view` and
    // nothing else, and `previewAllows` refuses everything else again.
    role: PREVIEW_ROLE,
    preview: true,
  };
}

/**
 * Verify the demo credential pair.
 *
 * Shares nothing with `authenticate()`: no Supabase client is constructed,
 * no allowlist is read, no service role is needed, and the gate is checked
 * again here so this function is inert on any deployment that is not a
 * declared preview with the demo switched on.
 */
export async function authenticatePreview(email: string, password: string): Promise<SignInResult> {
  if (!isPreviewDemoEnabled()) return { ok: false, reason: 'unconfigured' };
  if (!email || !password) return { ok: false, reason: 'invalid_credentials' };
  if (!previewCredentialsMatch(email, password)) return { ok: false, reason: 'invalid_credentials' };
  const operator = previewOperator();
  if (!operator) return { ok: false, reason: 'unconfigured' };
  return { ok: true, operator };
}

export async function establishPreviewSession(operator: Operator): Promise<void> {
  const secret = await previewSessionSecret();
  if (!secret) throw new Error('Preview demo is not configured');
  const token = await signSession(
    { sub: operator.authUserId, email: operator.email, audience: PREVIEW_AUDIENCE },
    secret
  );
  cookies().set(PREVIEW_SESSION_COOKIE, token, sessionCookieOptions(isSecureCookieContext()));
}

/* ── Sign in / out ─────────────────────────────────────────────────────── */

/**
 * Verify a password and resolve the allowlist row. Pure decision; the cookie
 * is set by `establishSession` so the two steps can be audited separately.
 */
export async function authenticate(email: string, password: string): Promise<SignInResult> {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !password) return { ok: false, reason: 'invalid_credentials' };

  const mode = adminMode();
  if (mode === 'unconfigured') return { ok: false, reason: 'unconfigured' };

  // A preview-demo deployment has no operator authentication at all. The
  // demo has its own function, its own cookie and its own key; this one
  // stops here rather than reaching Supabase with demo credentials.
  if (mode === 'preview') return { ok: false, reason: 'unconfigured' };

  if (mode === 'fixture') {
    const creds = devFixtureCredentials();
    const operator = fixtureOperator();
    if (!creds || !operator) return { ok: false, reason: 'unconfigured' };
    if (creds.email !== normalised || creds.password !== password) return { ok: false, reason: 'invalid_credentials' };
    return { ok: true, operator };
  }

  const { url } = supabaseConfig();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return { ok: false, reason: 'unconfigured' };

  // A throwaway client per sign-in: no session persistence, no refresh, and
  // the access token it returns is discarded — our own cookie is the session.
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let userId: string;
  let userEmail: string;
  try {
    const { data, error } = await auth.auth.signInWithPassword({ email: normalised, password });
    if (error || !data.user) return { ok: false, reason: 'invalid_credentials' };
    userId = data.user.id;
    userEmail = (data.user.email ?? normalised).toLowerCase();
    // Nothing else is ever done with this token.
    await auth.auth.signOut({ scope: 'local' }).catch(() => undefined);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  let row: OperatorRow | null;
  try {
    row = await findOperatorByAuthUser(userId);
    if (!row) row = await findOperatorByEmail(userEmail);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!row) return { ok: false, reason: 'not_allowlisted' };
  if (!row.active) return { ok: false, reason: 'inactive' };
  if (row.auth_user_id && row.auth_user_id !== userId) return { ok: false, reason: 'identity_mismatch' };
  if (row.email !== userEmail) return { ok: false, reason: 'identity_mismatch' };

  // First sign-in binds the Supabase user to the allowlist row.
  if (!row.auth_user_id) {
    const { error } = await supabaseAdmin()
      .from('bolagio_operators')
      .update({ auth_user_id: userId, last_sign_in_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('auth_user_id', null);
    if (error) return { ok: false, reason: 'unavailable' };
  } else {
    await supabaseAdmin()
      .from('bolagio_operators')
      .update({ last_sign_in_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  const operator = toOperator(row, userId);
  if (!operator) return { ok: false, reason: 'not_allowlisted' };
  return { ok: true, operator };
}

export async function establishSession(operator: Operator): Promise<void> {
  const secret = adminSessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const token = await signSession({ sub: operator.authUserId, email: operator.email }, secret);
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions(isSecureCookieContext()));
}

/** Ends whichever kind of session is present. Both, always, unconditionally. */
export function clearSession(): void {
  const options = { ...sessionCookieOptions(isSecureCookieContext()), maxAge: 0 };
  cookies().set(SESSION_COOKIE, '', options);
  cookies().set(PREVIEW_SESSION_COOKIE, '', options);
}

/* ── Per-request resolution ────────────────────────────────────────────── */

async function readClaims(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const verdict = await verifySession(token, adminSessionSecret());
  return verdict.ok ? verdict.claims : null;
}

async function readPreviewClaims(): Promise<SessionClaims | null> {
  const token = cookies().get(PREVIEW_SESSION_COOKIE)?.value;
  const verdict = await verifySession(token, await previewSessionSecret(), new Date(), PREVIEW_AUDIENCE);
  return verdict.ok ? verdict.claims : null;
}

/**
 * The signed-in operator, or null.
 *
 * Memoised per request with React's `cache`, so a layout, a page and a
 * server action in the same request share one allowlist read.
 */
export const currentOperator = cache(async (): Promise<Operator | null> => {
  const mode = adminMode();
  if (mode === 'unconfigured') return null;

  // Preview demo: its own cookie, its own derived key, its own audience.
  // Nothing below this branch runs, so no Supabase client is constructed
  // and the `bolagio_operators` table is never consulted.
  if (mode === 'preview') {
    const previewClaims = await readPreviewClaims();
    if (!previewClaims) return null;
    const operator = previewOperator();
    return operator && previewClaims.sub === PREVIEW_SUBJECT && previewClaims.email === operator.email
      ? operator
      : null;
  }

  const claims = await readClaims();
  if (!claims) return null;

  if (mode === 'fixture') {
    const operator = fixtureOperator();
    return operator && claims.sub === FIXTURE_AUTH_USER_ID && claims.email === operator.email ? operator : null;
  }

  let row: OperatorRow | null;
  try {
    row = await findOperatorByAuthUser(claims.sub);
  } catch {
    // The allowlist could not be read. Fail closed.
    return null;
  }
  if (!row || !row.active) return null;
  if (row.email !== claims.email) return null;
  if (row.sessions_invalidated_before && Date.parse(row.sessions_invalidated_before) / 1000 > claims.iat) return null;
  return toOperator(row, claims.sub);
});

/**
 * The gate every protected layout, page and action calls first.
 *
 * Unauthenticated → the login page. Authenticated but lacking the capability
 * → `AdminAuthError('forbidden')`, which an action turns into a refusal and a
 * page into a 403 message. There is no third outcome.
 */
export async function requireOperator(capability: Capability = 'view', nextPath?: string): Promise<Operator> {
  const operator = await currentOperator();
  if (!operator) {
    const target = nextPath && nextPath.startsWith('/admin') ? `/admin/login?next=${encodeURIComponent(nextPath)}` : '/admin/login';
    redirect(target);
  }
  if (!grants(operator, capability)) throw new AdminAuthError('forbidden');
  return operator;
}

/**
 * Both locks on one capability.
 *
 * The role decides, as it always has. A preview-demo session is then held to
 * `previewAllows` as well, so a capability added to `viewer` in the future
 * cannot quietly become reachable from the demo.
 */
function grants(operator: Operator, capability: Capability): boolean {
  if (!can(operator.role, capability)) return false;
  if (operator.preview && !previewAllows(capability)) return false;
  return true;
}

/** For actions: the operator or a structured refusal, never a redirect mid-POST. */
export async function operatorFor(capability: Capability): Promise<
  { ok: true; operator: Operator } | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' }
> {
  const operator = await currentOperator();
  if (!operator) return { ok: false, reason: 'unauthenticated' };
  if (operator.preview && !previewAllows(capability)) return { ok: false, reason: 'preview' };
  if (!can(operator.role, capability)) return { ok: false, reason: 'forbidden' };
  return { ok: true, operator };
}

/* ── Audit ─────────────────────────────────────────────────────────────── */

export interface AuditEntry {
  operator: Pick<Operator, 'id' | 'email'> | null;
  action: string;
  targetType?: string;
  targetRef?: string;
  outcome?: string;
  /** Operational facts only. Never a password, a token or guest data. */
  detail?: Record<string, string | number | boolean | null>;
  correlationId?: string;
}

/**
 * Append an audit row. Never throws: an audit write failing must not undo
 * the action it describes, and must not turn a refused sign-in into a 500.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  if (adminMode() !== 'supabase') return;
  try {
    const { error } = await supabaseAdmin().from('bolagio_admin_audit_log').insert({
      operator_id: entry.operator?.id && !entry.operator.id.startsWith('fixture') ? entry.operator.id : null,
      operator_email: entry.operator?.email ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_ref: entry.targetRef ?? null,
      outcome: entry.outcome ?? 'ok',
      detail: entry.detail ?? null,
      correlation_id: entry.correlationId ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console -- the audit drain itself failed; nothing else can record it.
      console.error(JSON.stringify({ scope: 'admin', event: 'audit.write', level: 'error', cause: error.code }));
    }
  } catch (cause) {
    // eslint-disable-next-line no-console -- see above.
    console.error(JSON.stringify({ scope: 'admin', event: 'audit.write', level: 'error', cause: cause instanceof Error ? cause.name : 'unknown' }));
  }
}
