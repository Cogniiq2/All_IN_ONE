import 'server-only';

/**
 * Verification tokens for the double opt-in.
 *
 * ── The one rule ─────────────────────────────────────────────────────────
 * The raw token exists in exactly two places: the email, and the link the
 * guest clicks. Only its SHA-256 is stored. A database read — a backup, a
 * support query, a leaked dump — must not be enough to verify somebody
 * else's address, because verifying an address is what unlocks money off a
 * booking.
 *
 * 32 bytes from the platform CSPRNG, base64url so it survives a URL without
 * escaping. `crypto.getRandomValues` and `crypto.subtle` are both on the
 * Cloudflare Workers runtime; no Node crypto import, which would not build.
 */

/** A fresh token. Returned once, in the clear, and never again. */
export function mintVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The only form that is stored. */
export async function hashVerificationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.prototype.slice
    .call(new Uint8Array(digest))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Shape-check a token from a URL before it is hashed and looked up.
 *
 * Not security — the hash lookup is — but it keeps a malformed or oversized
 * query parameter from reaching the database at all.
 */
export function isVerificationTokenShaped(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** How long a verification link lives. Long enough to find the email, short enough to matter. */
export const VERIFICATION_TTL_HOURS = 72;

/** How many verification emails one identity may ever be sent. Bounds relay abuse. */
export const MAX_VERIFICATION_SENDS = 5;
