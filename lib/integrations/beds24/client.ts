import 'server-only';

/**
 * The one place an HTTP request is made to Beds24.
 *
 * Everything above it — availability, offers, bookings — describes WHAT it
 * wants; this file owns authentication, timeouts, the single 401 retry and
 * the translation of a transport failure into a `ProviderError`.
 *
 * ── Timeouts ─────────────────────────────────────────────────────────────
 * A guest is waiting behind every one of these calls. A channel manager that
 * has stopped answering must fail in seconds with "live availability is
 * temporarily unavailable", not hang until the platform kills the request.
 *
 * ── What is never done here ──────────────────────────────────────────────
 * No response body is ever logged or attached to an error that reaches a
 * browser. Beds24 error text can echo request parameters, and a provider
 * message in a guest-facing dialog is both a leak and a break in the brand.
 */

import { beds24Config } from '@/lib/booking/config';
import { getAccessToken, invalidateAccessToken } from '@/lib/integrations/beds24/auth';
import { ProviderError } from '@/lib/integrations/provider';

const TIMEOUT_MS = 10_000;

export interface Beds24RequestInit {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Set on write calls so a retried request cannot create a second booking. */
  idempotencyKey?: string;
}

export async function beds24Request<T>(init: Beds24RequestInit): Promise<T> {
  return attempt<T>(init, false);
}

async function attempt<T>(init: Beds24RequestInit, isRetry: boolean): Promise<T> {
  const { baseUrl } = beds24Config();
  const token = await getAccessToken();

  const url = new URL(`${baseUrl}${init.path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    token,
  };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  // Beds24 honours this on writes; harmless where it does not. It is the
  // provider-side half of the idempotency guarantee, the database unique
  // index being the half we control.
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ProviderError(
      'unavailable',
      controller.signal.aborted ? 'Beds24 request timed out' : `Beds24 request failed: ${String(cause)}`
    );
  } finally {
    clearTimeout(timer);
  }

  // Exactly one re-authentication. A token can expire between the cache check
  // and the call; a loop on a genuinely invalid refresh token would hammer
  // Beds24 and get the account rate-limited.
  if (response.status === 401 && !isRetry) {
    invalidateAccessToken();
    return attempt<T>(init, true);
  }

  if (response.status === 429) {
    throw new ProviderError('unavailable', 'Beds24 rate limit reached');
  }

  if (!response.ok) {
    // Status only. The body is not read into the error — see the note above.
    throw new ProviderError('unavailable', `Beds24 responded ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderError('unavailable', 'Beds24 returned a body that is not JSON');
  }
}
