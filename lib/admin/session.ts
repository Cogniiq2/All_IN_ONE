/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE OPERATOR SESSION TOKEN.
 *
 * A compact, HMAC-signed statement: "Supabase user X, with email Y, signed in
 * at T and this is valid until E." Nothing else. It is set as an HttpOnly,
 * Secure, SameSite=Lax cookie and verified on every request to `/admin` —
 * first by the middleware (signature and expiry, no I/O) and then by the
 * protected layout, which additionally re-reads the allowlist.
 *
 * ── Why not carry the role in the token ──────────────────────────────────
 * Because a role changes. A token that says "admin" would keep saying it for
 * twelve hours after the row said otherwise. The token identifies; the
 * database authorises, every time.
 *
 * ── Runtime ──────────────────────────────────────────────────────────────
 * Web Crypto only — no Node `crypto` import — so the same module runs in the
 * edge middleware, in a route handler and in a server action unchanged. It
 * has no `server-only` marker for that reason; it also has no secret in it.
 * The secret is passed in by the caller, which is always server code.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const SESSION_COOKIE = 'bolagio_control_session';

/** Twelve hours. An operator re-authenticates at the start of a working day. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** The secret must be long enough that guessing it is not a strategy. */
export const MIN_SECRET_LENGTH = 32;

export interface SessionClaims {
  /** Token format version, so a future change can refuse old tokens cleanly. */
  v: 1;
  /** The Supabase Auth user id, or the fixture id in development. */
  sub: string;
  email: string;
  /** Issued at, seconds. Compared against `sessions_invalidated_before`. */
  iat: number;
  /** Expires at, seconds. */
  exp: number;
  /**
   * What this token is for. Absent on an operator session — which keeps
   * every existing token byte-identical — and set on a preview-demo one, so
   * the two can never be verified as each other even before their different
   * cookies and different keys are considered.
   */
  aud?: string;
}

export type SessionVerdict =
  | { ok: true; claims: SessionClaims }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'unconfigured' };

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export function isUsableSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.trim().length >= MIN_SECRET_LENGTH;
}

/**
 * Mint a token. `now` is injectable for tests.
 *
 * `audience` is omitted for an operator session, so the signed payload is
 * exactly what it has always been; a preview-demo session passes one and its
 * token is structurally distinct.
 */
export async function signSession(
  input: { sub: string; email: string; audience?: string },
  secret: string,
  now: Date = new Date()
): Promise<string> {
  if (!isUsableSecret(secret)) throw new Error('Session secret is not configured');
  const iat = Math.floor(now.getTime() / 1000);
  const claims: SessionClaims = {
    v: 1,
    sub: input.sub,
    email: input.email.trim().toLowerCase(),
    iat,
    exp: iat + SESSION_TTL_SECONDS,
    ...(input.audience ? { aud: input.audience } : {}),
  };
  const body = base64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

/**
 * Verify a token. Fails closed on every malformed input and never throws —
 * the middleware has no business raising on a cookie somebody typed by hand.
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string | undefined,
  now: Date = new Date(),
  audience?: string
): Promise<SessionVerdict> {
  if (!isUsableSecret(secret)) return { ok: false, reason: 'unconfigured' };
  if (!token) return { ok: false, reason: 'missing' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, signature] = parts;
  const signatureBytes = fromBase64url(signature);
  const bodyBytes = fromBase64url(body);
  if (!signatureBytes || !bodyBytes) return { ok: false, reason: 'malformed' };

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(body)
  );
  if (!valid) return { ok: false, reason: 'bad_signature' };

  let claims: SessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(bodyBytes)) as SessionClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    claims?.v !== 1 ||
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  // An operator verifier passes no audience and refuses any token that
  // carries one; a preview verifier requires its own. Neither can ever
  // accept the other's token, whatever happens to the keys.
  if ((claims.aud ?? undefined) !== audience) return { ok: false, reason: 'malformed' };
  if (claims.exp * 1000 <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

/** Cookie attributes, in one place. `secure` is relaxed only for plain-HTTP local development. */
export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/admin',
    maxAge: SESSION_TTL_SECONDS,
  };
}
