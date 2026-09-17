/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PAYPAL ADAPTER, against a fake transport.
 *
 * `fetch` is replaced, so these tests are fast, deterministic and never touch
 * PayPal. What they establish is everything about the adapter that does NOT
 * require a live account:
 *
 *   • the mode selector fails closed
 *   • every mutating call carries a DETERMINISTIC PayPal-Request-Id
 *   • an answered 4xx and an unanswered timeout are classified differently,
 *     which is the distinction the whole recovery model rests on
 *   • a webhook is verified against PayPal, with OUR webhook id
 *
 * ── What they cannot establish ───────────────────────────────────────────
 * That PayPal behaves as modelled. These shapes come from documentation and
 * have never been exercised against a sandbox. `docs/payment-paypal.md` lists
 * what a sandbox run has to confirm.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paypalAdapter } from '@/lib/payments/paypal/provider';
import { resetPayPalTokenCache } from '@/lib/payments/paypal/client';
import { PaymentProviderError } from '@/lib/payments/provider';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[] = [];
let responder: (call: Call) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TOKEN = { access_token: 'test-token', expires_in: 3600 };

beforeEach(() => {
  calls = [];
  resetPayPalTokenCache();
  process.env.PAYPAL_MODE = 'sandbox';
  process.env.PAYPAL_CLIENT_ID = 'client-id';
  process.env.PAYPAL_CLIENT_SECRET = 'client-secret';
  process.env.PAYPAL_WEBHOOK_ID = 'WH-CONFIG-1';

  responder = () => json({});
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    if (call.url.includes('/v1/oauth2/token')) return json(TOKEN);
    return responder(call);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PAYPAL_MODE;
});

const ORDER = (overrides: Record<string, unknown> = {}) => ({
  id: 'ORDER-1',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1' }],
  purchase_units: [{ custom_id: 'BLG-AAAAAA' }],
  ...overrides,
});

describe('configuration fails closed', () => {
  it('refuses when PAYPAL_MODE is unset', async () => {
    delete process.env.PAYPAL_MODE;
    await expect(paypalAdapter.getOrder('ORDER-1')).rejects.toMatchObject({
      name: 'PaymentProviderError',
      code: 'not_configured',
    });
    // Nothing was sent. Not even a token request.
    expect(calls).toHaveLength(0);
  });

  it('refuses an unrecognised mode rather than defaulting', async () => {
    // The dangerous default would be either direction: 'sandbox' takes play
    // money for real inventory, 'live' takes real money in a test.
    process.env.PAYPAL_MODE = 'production';
    await expect(paypalAdapter.getOrder('ORDER-1')).rejects.toMatchObject({ code: 'not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('refuses when credentials are missing', async () => {
    delete process.env.PAYPAL_CLIENT_SECRET;
    await expect(paypalAdapter.getOrder('ORDER-1')).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('derives the base URL from the mode rather than the environment', async () => {
    responder = () => json(ORDER());
    await paypalAdapter.getOrder('ORDER-1');
    expect(calls[0].url).toContain('api-m.sandbox.paypal.com');

    resetPayPalTokenCache();
    calls = [];
    process.env.PAYPAL_MODE = 'live';
    await paypalAdapter.getOrder('ORDER-1');
    expect(calls[0].url).toContain('api-m.paypal.com');
    expect(calls[0].url).not.toContain('sandbox');
  });
});

describe('createOrder', () => {
  it('sends the amount as a decimal string with our reference', async () => {
    responder = () => json(ORDER(), 201);
    await paypalAdapter.createOrder({
      reference: 'BLG-AAAAAA',
      requestId: 'BLG-AAAAAA:hash1',
      amountCents: 42500,
      currency: 'EUR',
      description: 'BoLaGio schulstrasse-i',
    });

    const create = calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    const unit = (create.body as any).purchase_units[0];
    expect(unit.amount).toEqual({ currency_code: 'EUR', value: '425.00' });
    // In BOTH fields: custom_id is echoed on the capture and on every webhook,
    // which is how an event carrying nothing else is still attributable.
    expect(unit.custom_id).toBe('BLG-AAAAAA');
    expect(unit.invoice_id).toBe('BLG-AAAAAA');
    expect((create.body as any).intent).toBe('CAPTURE');
  });

  it('carries a DETERMINISTIC request id', async () => {
    /*
     * The guest double-clicking Pay is the case. A random uuid here would make
     * the second click create a second order — the exact failure the header
     * exists to prevent.
     */
    responder = () => json(ORDER(), 201);
    const request = {
      reference: 'BLG-AAAAAA',
      requestId: 'BLG-AAAAAA:hash1',
      amountCents: 42500,
      currency: 'EUR',
      description: 'x',
    };
    await paypalAdapter.createOrder(request);
    await paypalAdapter.createOrder(request);

    const ids = calls
      .filter((c) => c.url.endsWith('/v2/checkout/orders'))
      .map((c) => c.headers['PayPal-Request-Id']);
    expect(ids).toEqual(['BLG-AAAAAA:hash1', 'BLG-AAAAAA:hash1']);
  });

  it('refuses a response with no order id', async () => {
    // A 201 without an id is a failure however friendly the status code was.
    responder = () => json({ status: 'CREATED' }, 201);
    await expect(
      paypalAdapter.createOrder({
        reference: 'BLG-AAAAAA',
        requestId: 'r',
        amountCents: 1,
        currency: 'EUR',
        description: 'x',
      })
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe('captureOrder', () => {
  it('reports settled money', async () => {
    responder = () =>
      json(
        ORDER({
          status: 'COMPLETED',
          purchase_units: [
            {
              custom_id: 'BLG-AAAAAA',
              payments: {
                captures: [
                  { id: 'CAP-1', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '425.00' } },
                ],
              },
            },
          ],
        })
      );

    const result = await paypalAdapter.captureOrder({ orderId: 'ORDER-1', requestId: 'capture:ORDER-1' });
    expect(result.state).toBe('paid');
    expect(result.captured).toEqual({ amountCents: 42500, currency: 'EUR' });
  });

  it('does not report PENDING as paid', async () => {
    responder = () =>
      json(
        ORDER({
          status: 'COMPLETED',
          purchase_units: [
            {
              payments: {
                captures: [
                  { id: 'CAP-2', status: 'PENDING', amount: { currency_code: 'EUR', value: '425.00' } },
                ],
              },
            },
          ],
        })
      );
    const result = await paypalAdapter.captureOrder({ orderId: 'ORDER-1', requestId: 'r' });
    expect(result.state).toBe('capture_pending');
  });

  it('reads the order when PayPal says it is already captured', async () => {
    /*
     * The webhook drove the capture before the browser's return did. That is a
     * race we expect, not a failure: read the order and report what is true.
     */
    responder = (call) => {
      if (call.method === 'POST' && call.url.includes('/capture')) {
        return json({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, 422);
      }
      return json(
        ORDER({
          purchase_units: [
            {
              payments: {
                captures: [
                  { id: 'CAP-3', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '425.00' } },
                ],
              },
            },
          ],
        })
      );
    };

    const result = await paypalAdapter.captureOrder({ orderId: 'ORDER-1', requestId: 'r' });
    expect(result.state).toBe('paid');
    expect(result.captureId).toBe('CAP-3');
  });
});

describe('answered failure vs unanswered call', () => {
  /*
   * THE distinction the recovery model rests on.
   *
   * A PaymentProviderError means PayPal answered, and the answer is stable —
   * the caller may compensate. A plain Error means we do not know, and
   * `trackedCall` turns it into `outcome_unknown`, which may not be retried
   * until a read of PayPal resolves it.
   */
  it('treats a 4xx as an answered refusal', async () => {
    responder = () => json({ name: 'INVALID_REQUEST' }, 400);
    await expect(paypalAdapter.getOrder('ORDER-1')).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it('treats a 404 as an answered not-found', async () => {
    responder = () => json({}, 404);
    await expect(paypalAdapter.getOrder('ORDER-1')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('treats a 5xx as UNCERTAIN, not as a failure', async () => {
    // A 500 after a POST may still have created the order.
    responder = () => json({}, 503);
    const error = await paypalAdapter.getOrder('ORDER-1').catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PaymentProviderError);
    expect(String(error.message)).toContain('paypal_server_error');
  });

  it('treats a transport failure as UNCERTAIN', async () => {
    responder = () => {
      throw new TypeError('network down');
    };
    const error = await paypalAdapter.getOrder('ORDER-1').catch((e) => e);
    expect(error).not.toBeInstanceOf(PaymentProviderError);
    expect(String(error.message)).toBe('paypal_request_failed');
  });

  it('treats a 401 as a configuration problem, not as uncertainty', async () => {
    // Retrying wrong credentials forever helps nobody.
    responder = () => json({}, 401);
    await expect(paypalAdapter.getOrder('ORDER-1')).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

describe('webhook verification', () => {
  const HEADERS = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': 'TX-1',
    'paypal-transmission-sig': 'signature-bytes',
    'paypal-transmission-time': '2026-09-17T10:00:00Z',
  };

  const EVENT = {
    id: 'WH-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource_type: 'capture',
    resource: {
      id: 'CAP-1',
      status: 'COMPLETED',
      custom_id: 'BLG-AAAAAA',
      amount: { currency_code: 'EUR', value: '425.00' },
    },
  };

  it('accepts an event PayPal verifies', async () => {
    responder = () => json({ verification_status: 'SUCCESS' });
    const result = await paypalAdapter.verifyWebhook({
      rawBody: JSON.stringify(EVENT),
      headers: new Headers(HEADERS),
    });
    expect(result?.providerEventId).toBe('WH-1');
    expect(result?.state).toBe('paid');
    expect(result?.reference).toBe('BLG-AAAAAA');
  });

  it('sends OUR webhook id, not one from the request', async () => {
    /*
     * Without this, a valid PayPal signature from ANY other merchant's webhook
     * would verify. The webhook id is what binds a delivery to the webhook we
     * registered.
     */
    responder = () => json({ verification_status: 'SUCCESS' });
    await paypalAdapter.verifyWebhook({ rawBody: JSON.stringify(EVENT), headers: new Headers(HEADERS) });

    const verify = calls.find((c) => c.url.includes('verify-webhook-signature'))!;
    expect((verify.body as any).webhook_id).toBe('WH-CONFIG-1');
    expect((verify.body as any).transmission_id).toBe('TX-1');
  });

  it('rejects an event PayPal does not verify', async () => {
    responder = () => json({ verification_status: 'FAILURE' });
    const result = await paypalAdapter.verifyWebhook({
      rawBody: JSON.stringify(EVENT),
      headers: new Headers(HEADERS),
    });
    expect(result).toBeNull();
  });

  it('rejects a delivery missing any signature header', async () => {
    responder = () => json({ verification_status: 'SUCCESS' });
    for (const omit of Object.keys(HEADERS)) {
      const headers = new Headers(HEADERS);
      headers.delete(omit);
      const result = await paypalAdapter.verifyWebhook({ rawBody: JSON.stringify(EVENT), headers });
      expect(result, `missing ${omit} was accepted`).toBeNull();
    }
    // And it never even asked PayPal — an incomplete signature is not
    // verifiable, so there is nothing to ask.
    expect(calls.filter((c) => c.url.includes('verify-webhook-signature'))).toHaveLength(0);
  });

  it('rejects a body that is not JSON without calling PayPal', async () => {
    const result = await paypalAdapter.verifyWebhook({
      rawBody: 'not json',
      headers: new Headers(HEADERS),
    });
    expect(result).toBeNull();
    expect(calls.filter((c) => c.url.includes('verify-webhook-signature'))).toHaveLength(0);
  });

  it('refuses when PAYPAL_WEBHOOK_ID is unset', async () => {
    // Fail closed: an unauthenticated payment event is an anonymous POST.
    delete process.env.PAYPAL_WEBHOOK_ID;
    await expect(
      paypalAdapter.verifyWebhook({ rawBody: JSON.stringify(EVENT), headers: new Headers(HEADERS) })
    ).rejects.toMatchObject({ code: 'not_configured' });
  });
});
