/**
 * POST /api/webhooks/paypal
 *
 * The FALLBACK PayPal ingress. The primary one is the Supabase Edge Function
 * at `supabase/functions/paypal-webhook`, and the reason it is primary is in
 * that file's header: payment notifications must not depend on the website
 * deployment being healthy.
 *
 * This route exists because a deployment may not have the Edge Function yet,
 * and a repository that only works with a manual deploy step already done is a
 * repository that breaks quietly. Register EXACTLY ONE of the two in the
 * PayPal dashboard — both would work, but two verified copies of the same
 * event is pointless traffic, and only one is the documented path.
 *
 * Both write the same inbox row through the same RPC, so downstream there is
 * exactly one processing path regardless of which received the delivery.
 *
 * ── The contract with PayPal ─────────────────────────────────────────────
 * A fast 2xx once the event is durably stored, and a 5xx when it is not.
 * PayPal retries for up to three days on a non-2xx, which is exactly what we
 * want when our database is unreachable and exactly what we do not want when
 * the event was simply one we do not act on.
 *
 * Nothing slow happens before the response: no Beds24 call, no email, no
 * invoice, no n8n. Business processing runs from the inbox.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { requireBackend } from '@/lib/booking/http';
import { recordPaymentEvent } from '@/lib/booking/commands';
import { paymentAdapter } from '@/lib/payments';
import { sanitize } from '@/lib/payments/paypal/mapper';
import type { PayPalWebhookEvent } from '@/lib/payments/paypal/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256_000;

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  try {
    requireBackend();

    const raw = await request.text();
    // Not a PayPal event. Accepted and dropped rather than parsed — refusing
    // would earn three days of retries for a body we will never act on.
    if (raw.length > MAX_BODY_BYTES) return accepted();

    let parsed: PayPalWebhookEvent;
    try {
      parsed = JSON.parse(raw) as PayPalWebhookEvent;
    } catch {
      return accepted();
    }
    const providerEventId = typeof parsed.id === 'string' ? parsed.id : '';
    const eventType = typeof parsed.event_type === 'string' ? parsed.event_type : '';
    if (!providerEventId || !eventType) return accepted();

    /* ── Verify against PayPal ────────────────────────────────────────── */

    const verified = await paymentAdapter('paypal').verifyWebhook({
      rawBody: raw,
      headers: request.headers,
    });

    if (!verified) {
      /*
       * Stored, with verification 'failed', and never queued for processing.
       *
       * Storing it rather than discarding it is deliberate: a stream of
       * failed-signature deliveries is something an operator should be able to
       * see, and it is the difference between "PayPal's webhook id is wrong"
       * and "someone is posting forged events at us".
       */
      await recordPaymentEvent({
        provider: 'paypal',
        providerEventId,
        eventType,
        verification: 'failed',
        payload: sanitize(parsed),
      }).catch(() => undefined);

      logger.warn('webhook.paypal', { eventId: providerEventId, eventType, verification: 'failed' });
      // 200, not 401. A forged event must not learn whether it was believed,
      // and a genuine event whose signature we mis-handled must not be
      // redelivered forever.
      return accepted();
    }

    const stored = await recordPaymentEvent({
      provider: 'paypal',
      providerEventId: verified.providerEventId,
      eventType: verified.eventType,
      verification: 'verified',
      payload: verified.payload,
      eventTime: verified.eventTime,
      transmissionTime: request.headers.get('paypal-transmission-time') ?? undefined,
      transmissionId: request.headers.get('paypal-transmission-id') ?? undefined,
      orderId: verified.orderId,
      captureId: verified.captureId,
      reference: verified.reference,
      amountCents: verified.amountCents,
      currency: verified.currency,
    });

    logger.info('webhook.paypal', {
      eventId: verified.providerEventId,
      eventType: verified.eventType,
      reference: verified.reference,
      duplicate: stored.duplicate,
      verification: 'verified',
    });

    return accepted();
  } catch (cause) {
    // A 500 makes PayPal redeliver. That is the correct answer when we could
    // not store an event: losing a payment notification silently is the one
    // outcome this endpoint exists to prevent.
    logger.error('webhook.paypal', cause);
    return new Response(null, { status: 500 });
  }
}

/** The only success response. Carries nothing. */
function accepted(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
