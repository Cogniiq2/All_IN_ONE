/**
 * ══════════════════════════════════════════════════════════════════════════
 * PAYPAL WEBHOOK INGRESS — Supabase Edge Function.
 *
 * Deployed with:
 *   supabase functions deploy paypal-webhook --no-verify-jwt
 *
 * `--no-verify-jwt` is REQUIRED and is not a weakening: PayPal does not send a
 * Supabase JWT. Authenticity comes from PayPal's own signature, verified
 * against PayPal, below. An unverified event is stored and never processed.
 *
 * ── Why this is an Edge Function and not a Next.js route ─────────────────
 * It must not depend on the website deployment being healthy. A Cloudflare
 * outage, a bad OpenNext build, a failed deploy — none of those may cause
 * PayPal to stop being able to tell us that a guest paid. This function has
 * one dependency (Postgres) and one job.
 *
 * A Next.js fallback exists at `app/api/webhooks/paypal/route.ts` for
 * environments where this is not deployed. Both write the same inbox row
 * through the same RPC, so there is exactly one processing path.
 *
 * ── What this function does NOT do ───────────────────────────────────────
 * Update a booking. Call Beds24. Send an email. Generate an invoice. Call
 * n8n. PayPal expects a 2xx within seconds and retries for up to three days
 * when it does not get one; a slow Beds24 call inside this handler would turn
 * one payment into a redelivery storm. Business processing runs from the
 * inbox, separately — see lib/booking/payments.ts.
 *
 * ── The order of operations, which is the whole design ───────────────────
 *   1. reject anything that is not a POST with a plausible body
 *   2. verify the signature AGAINST PAYPAL
 *   3. store the event durably, deduplicated on PayPal's own event id
 *   4. return 2xx
 * Nothing slow happens before (4).
 * ══════════════════════════════════════════════════════════════════════════
 */

// @ts-nocheck -- Deno runtime. This file is deployed to Supabase Edge
// Functions and is deliberately NOT part of the Next.js TypeScript project;
// `tsconfig.json` excludes `supabase/functions`. Its imports are Deno URL
// imports, which the Node toolchain cannot resolve.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BODY_BYTES = 256_000;

/** The five headers PayPal signs with. A delivery missing any is not verifiable. */
const SIGNATURE_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
];

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const mode = Deno.env.get('PAYPAL_MODE');
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Fail closed on configuration. A 500 makes PayPal retry, which is exactly
  // right: the event is real and we are not currently able to receive it.
  if ((mode !== 'sandbox' && mode !== 'live') || !clientId || !clientSecret || !webhookId) {
    console.error(JSON.stringify({ scope: 'paypal-webhook', event: 'config', level: 'error' }));
    return new Response(null, { status: 500 });
  }
  if (!supabaseUrl || !serviceKey) {
    console.error(JSON.stringify({ scope: 'paypal-webhook', event: 'config', level: 'error' }));
    return new Response(null, { status: 500 });
  }

  const baseUrl = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  const raw = await request.text();
  // A body this large is not a PayPal event. Accepted and dropped rather than
  // parsed: refusing loudly would just earn three days of retries.
  if (raw.length > MAX_BODY_BYTES) return accepted();

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return accepted();
  }

  const providerEventId = typeof event.id === 'string' ? event.id : '';
  const eventType = typeof event.event_type === 'string' ? event.event_type : '';
  if (!providerEventId || !eventType) return accepted();

  const signature: Record<string, string> = {};
  let signatureComplete = true;
  for (const name of SIGNATURE_HEADERS) {
    const value = request.headers.get(name);
    if (!value) signatureComplete = false;
    else signature[name] = value;
  }

  /* ── Verify ───────────────────────────────────────────────────────────── */

  let verification: 'verified' | 'failed' = 'failed';
  if (signatureComplete) {
    try {
      verification = (await verify(baseUrl, clientId, clientSecret, webhookId, signature, event))
        ? 'verified'
        : 'failed';
    } catch (cause) {
      // We could not establish authenticity. A 500 earns a retry, which is
      // better than storing an unverifiable event as if it were fine.
      console.error(
        JSON.stringify({ scope: 'paypal-webhook', event: 'verify', level: 'error', id: providerEventId })
      );
      return new Response(null, { status: 500 });
    }
  }

  /* ── Store ────────────────────────────────────────────────────────────── */

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resource = (event.resource ?? {}) as Record<string, any>;
  const amount = resource.amount ?? {};

  const { data, error } = await supabase.rpc('bolagio_record_payment_event', {
    p_provider: 'paypal',
    p_provider_event_id: providerEventId,
    p_event_type: eventType,
    p_verification: verification,
    // Sanitized, allow-listed. No payer name, email, address or payment
    // instrument ever reaches the database — see `sanitize()` below.
    p_payload: sanitize(event),
    p_event_time: typeof event.create_time === 'string' ? event.create_time : null,
    p_transmission_time: signature['paypal-transmission-time'] ?? null,
    p_transmission_id: signature['paypal-transmission-id'] ?? null,
    p_order_id: resource?.supplementary_data?.related_ids?.order_id ?? null,
    p_capture_id: typeof resource.id === 'string' ? resource.id : null,
    // PayPal echoes the BoLaGio reference here, which is how an event that
    // carries nothing else is still attributable to a booking.
    p_reference: typeof resource.custom_id === 'string' ? resource.custom_id : null,
    p_amount_cents: toCents(amount.value),
    p_currency: typeof amount.currency_code === 'string' ? amount.currency_code : null,
  });

  if (error) {
    // Could not store it. A 500 makes PayPal redeliver; losing a payment event
    // silently is the one outcome this function exists to prevent.
    console.error(
      JSON.stringify({ scope: 'paypal-webhook', event: 'store', level: 'error', id: providerEventId })
    );
    return new Response(null, { status: 500 });
  }

  if (verification === 'verified') {
    // Observability only; a failure here must not fail the ingest.
    await supabase
      .rpc('bolagio_observe_integration', { p_provider: 'paypal', p_signal: 'last_verified_webhook', p_detail: eventType })
      .then(() => undefined, () => undefined);
  }

  console.log(
    JSON.stringify({
      scope: 'paypal-webhook',
      event: 'received',
      level: 'info',
      id: providerEventId,
      eventType,
      verification,
      duplicate: data?.duplicate === true,
    })
  );

  return accepted();
});

/**
 * Ask PayPal whether this transmission is genuine.
 *
 * `webhook_id` is OURS, from the environment: it is what binds a delivery to
 * the webhook we registered. Without it a valid PayPal signature from any
 * other merchant's webhook would verify.
 */
async function verify(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  webhookId: string,
  signature: Record<string, string>,
  event: unknown
): Promise<boolean> {
  const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenResponse.ok) throw new Error('paypal_token_failed');
  const { access_token: token } = await tokenResponse.json();
  if (!token) throw new Error('paypal_token_missing');

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      auth_algo: signature['paypal-auth-algo'],
      cert_url: signature['paypal-cert-url'],
      transmission_id: signature['paypal-transmission-id'],
      transmission_sig: signature['paypal-transmission-sig'],
      transmission_time: signature['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  if (!response.ok) throw new Error(`paypal_verify_${response.status}`);

  const body = await response.json();
  return body?.verification_status === 'SUCCESS';
}

/**
 * The allow list.
 *
 * Kept in step with `sanitize()` in lib/payments/paypal/mapper.ts — the two
 * ingresses must store identical shapes or the processor would behave
 * differently depending on which one received the event.
 *
 * Dropped deliberately: `payer` (name, email, payer id, address),
 * `payment_source` (card brand and last four), `shipping`, and `links`.
 */
function sanitize(event: Record<string, any>): Record<string, unknown> {
  const r = event.resource ?? {};
  return {
    id: event.id,
    event_type: event.event_type,
    create_time: event.create_time,
    resource_type: event.resource_type,
    resource: {
      id: r.id,
      status: r.status,
      custom_id: r.custom_id,
      invoice_id: r.invoice_id,
      final_capture: r.final_capture,
      create_time: r.create_time,
      amount: r.amount ? { currency_code: r.amount.currency_code, value: r.amount.value } : undefined,
      supplementary_data: r.supplementary_data?.related_ids?.order_id
        ? { related_ids: { order_id: r.supplementary_data.related_ids.order_id } }
        : undefined,
    },
  };
}

/**
 * A decimal money string to integer minor units, without floating point.
 *
 * `parseFloat('425.00') * 100` is not reliably 42500, and a booking system
 * that compares a paid amount to a quoted amount cannot afford that.
 */
function toCents(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return match[1] === '-' ? -cents : cents;
}

/** The only success response. Carries nothing. */
function accepted(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
