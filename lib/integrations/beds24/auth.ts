import 'server-only';

/**
 * Beds24 API V2 authentication.
 *
 * V2 does not take an API key on each call. A long-lived REFRESH TOKEN is
 * exchanged for a short-lived access token, and the access token goes on
 * subsequent requests in a `token` header.
 *
 *     GET /authentication/token      header: refreshToken: <long-lived>
 *     → { token, expiresIn }         header: token: <short-lived>
 *
 * (V1's `authentication: { apiKey, propKey }` body is deprecated and is
 * deliberately not implemented anywhere in this repository.)
 *
 * ── Caching ──────────────────────────────────────────────────────────────
 * The access token is cached in module scope, which on Cloudflare Workers
 * means per isolate. That is the right lifetime: an isolate serves many
 * requests, and a token fetch per booking request would both be slow and push
 * against Beds24's rate limits. A one-minute safety margin is taken off the
 * expiry so a token cannot expire mid-flight between the check and the call.
 *
 * ── Where the refresh token may live ─────────────────────────────────────
 * The environment, read through `lib/booking/config.ts`, which is
 * `server-only`. It is never sent to the browser, never logged, and never put
 * in a `NEXT_PUBLIC_` variable.
 */

import { beds24Config } from '@/lib/booking/config';
import { ProviderError } from '@/lib/integrations/provider';

interface CachedToken {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

let cached: CachedToken | null = null;

/** Discarded early so a token cannot expire between the check and the call. */
const SAFETY_MARGIN_MS = 60_000;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > now) return cached.token;

  const { baseUrl, refreshToken } = beds24Config();
  if (!refreshToken) {
    // In live mode this is a configuration failure, not an availability
    // answer. It surfaces as "live availability is temporarily unavailable",
    // never as an empty calendar.
    throw new ProviderError('unavailable', 'Beds24 refresh token is not configured');
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/authentication/token`, {
      method: 'GET',
      headers: { accept: 'application/json', refreshToken },
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ProviderError('unavailable', `Beds24 token request failed: ${String(cause)}`);
  }

  if (!response.ok) {
    throw new ProviderError('unavailable', `Beds24 token request returned ${response.status}`);
  }

  const body = (await response.json()) as { token?: string; expiresIn?: number };
  if (!body.token) {
    throw new ProviderError('unavailable', 'Beds24 token response carried no token');
  }

  // Beds24 documents expiresIn in seconds. A missing value is treated as a
  // short life rather than a long one — being wrong in that direction costs
  // one extra token fetch, the other costs a run of 401s.
  const lifetimeMs = (body.expiresIn && body.expiresIn > 0 ? body.expiresIn : 600) * 1000;
  cached = { token: body.token, expiresAt: now + lifetimeMs };
  return body.token;
}

/**
 * Drop the cached token.
 *
 * Called by the client on a 401, so exactly one retry re-authenticates rather
 * than the whole isolate serving errors until its token would have expired.
 */
export function invalidateAccessToken(): void {
  cached = null;
}
