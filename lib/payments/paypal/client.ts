import 'server-only';

/**
 * The one place an HTTP request is made to PayPal.
 *
 * ── Fail closed, at the first line ───────────────────────────────────────
 * `paypalConfig()` returns `mode: null` when PAYPAL_MODE is absent or is not
 * exactly `sandbox` or `live`, and this module refuses to build a request in
 * that case. There is no default. A deployment that has lost its mode takes no
 * payments at all, which is the only safe direction — the alternative failure
 * is taking sandbox money for real inventory, or real money in a test.
 *
 * The base URL is DERIVED from the mode and is not configurable. A settable
 * base URL is one environment typo away from presenting sandbox credentials to
 * the live API.
 *
 * ── What is never logged ─────────────────────────────────────────────────
 * The client secret, the access token, the Authorization header, and any
 * response body. PayPal error bodies echo request fields; a payer's email has
 * appeared in them. Errors carry a status code and nothing else.
 */

import { paypalConfig, providerTimeoutMs } from '@/lib/booking/config';
import { observeIntegration } from '@/lib/booking/commands';
import { PaymentProviderError } from '@/lib/payments/provider';


interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Per-isolate token cache.
 *
 * Keyed by mode so a mode change inside one isolate's lifetime — which only
 * happens in tests, but happens there — cannot serve a sandbox token to the
 * live API.
 */
let cached: { mode: string; value: CachedToken } | null = null;

const SAFETY_MARGIN_MS = 60_000;

export function resetPayPalTokenCache(): void {
  cached = null;
}

async function accessToken(): Promise<string> {
  const { mode, baseUrl, clientId, clientSecret } = paypalConfig();
  if (!mode) {
    throw new PaymentProviderError(
      'not_configured',
      'PAYPAL_MODE must be exactly "sandbox" or "live"'
    );
  }
  if (!clientId || !clientSecret) {
    throw new PaymentProviderError('not_configured', 'PayPal credentials are not configured');
  }

  const now = Date.now();
  if (cached && cached.mode === mode && cached.value.expiresAt - SAFETY_MARGIN_MS > now) {
    return cached.value.token;
  }

  // Basic auth over the client credentials grant. `btoa` rather than Buffer:
  // this runs on a Cloudflare Worker as well as Node.
  const basic = btoa(`${clientId}:${clientSecret}`);

  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), providerTimeoutMs('paypal'));
  try {
    response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    throw new PaymentProviderError(
      'unavailable',
      controller.signal.aborted ? 'PayPal token request timed out' : 'PayPal token request failed'
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new PaymentProviderError('unauthorized', 'PayPal rejected the client credentials');
  }
  if (!response.ok) {
    throw new PaymentProviderError('unavailable', `PayPal token endpoint returned ${response.status}`);
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new PaymentProviderError('unavailable', 'PayPal token response carried no token');
  }

  // A missing expiry is treated as short-lived. Being wrong that way costs one
  // extra token fetch; the other way costs a run of 401s mid-checkout.
  const lifetimeMs = (body.expires_in && body.expires_in > 0 ? body.expires_in : 300) * 1000;
  cached = { mode, value: { token: body.access_token, expiresAt: now + lifetimeMs } };
  return body.access_token;
}

export interface PayPalRequestInit {
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  /**
   * PayPal's own idempotency mechanism.
   *
   * Set on EVERY mutating call, and always derived deterministically from the
   * operation — never a random uuid. A random one makes a retry create a second
   * order, which is the exact failure it is supposed to prevent.
   */
  requestId?: string;
  /** Extra headers, for webhook verification which posts a body of its own. */
  headers?: Record<string, string>;
}

export interface PayPalResponse<T> {
  status: number;
  body: T;
}

/**
 * Perform a PayPal REST call.
 *
 * ── Errors, and the distinction that matters ─────────────────────────────
 * A 4xx is a PaymentProviderError: PayPal answered, and the answer is stable.
 * A timeout, a network failure or a 5xx is rethrown as-is, so that
 * `trackedCall` classifies it as `outcome_unknown` — because in all three the
 * request may have been executed before the answer was lost. Never collapse
 * those two categories; the whole recovery model rests on telling them apart.
 */
export async function paypalRequest<T>(init: PayPalRequestInit): Promise<PayPalResponse<T>> {
  try {
    const result = await paypalRequestInner<T>(init);
    observeIntegration('paypal', 'last_success', `${init.method ?? 'GET'} ${init.path.replace(/[A-Z0-9]{10,}/g, '…')}`);
    return result;
  } catch (cause) {
    observeIntegration('paypal', 'last_failure', `${init.method ?? 'GET'} ${init.path.replace(/[A-Z0-9]{10,}/g, '…')}: ${cause instanceof Error ? cause.message.slice(0, 100) : 'error'}`);
    throw cause;
  }
}

async function paypalRequestInner<T>(init: PayPalRequestInit): Promise<PayPalResponse<T>> {
  const { baseUrl } = paypalConfig();
  const token = await accessToken();

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  };
  if (init.requestId) headers['PayPal-Request-Id'] = init.requestId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), providerTimeoutMs('paypal'));

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${init.path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (cause) {
    // Deliberately NOT a PaymentProviderError. This is the uncertain case.
    throw new Error(
      controller.signal.aborted ? 'paypal_request_timeout' : 'paypal_request_failed'
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new PaymentProviderError('unauthorized', `PayPal responded ${response.status}`);
  }
  if (response.status === 404) {
    throw new PaymentProviderError('not_found', 'PayPal resource not found');
  }
  if (response.status === 422) {
    // PayPal's "already captured" lives here. The issue name is read from the
    // body — the only field ever read out of a PayPal error — because the
    // caller's correct response to it is to read the order, not to fail.
    const issue = await issueName(response);
    if (issue === 'ORDER_ALREADY_CAPTURED') {
      throw new PaymentProviderError('already_captured', 'order already captured', issue);
    }
    throw new PaymentProviderError('rejected', `PayPal rejected the request (${issue ?? '422'})`, issue);
  }
  if (response.status >= 400 && response.status < 500) {
    const issue = await issueName(response);
    throw new PaymentProviderError('rejected', `PayPal responded ${response.status}`, issue);
  }
  if (response.status >= 500) {
    // Uncertain: a 5xx after a POST may still have taken effect.
    throw new Error(`paypal_server_error_${response.status}`);
  }

  if (response.status === 204) return { status: 204, body: undefined as T };

  try {
    return { status: response.status, body: (await response.json()) as T };
  } catch {
    throw new PaymentProviderError('unavailable', 'PayPal returned a body that is not JSON');
  }
}

/**
 * The PayPal error issue name, and nothing else from the body.
 *
 * Issue names are a documented, closed vocabulary (`ORDER_ALREADY_CAPTURED`,
 * `INSTRUMENT_DECLINED`, …). The surrounding `description` and `debug_id` are
 * free text that can echo request fields, so they are never read.
 */
async function issueName(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { details?: Array<{ issue?: string }>; name?: string };
    const issue = body.details?.[0]?.issue ?? body.name;
    return typeof issue === 'string' && /^[A-Z_]{3,60}$/.test(issue) ? issue : undefined;
  } catch {
    return undefined;
  }
}
