import 'server-only';

/**
 * The PayPal adapter.
 *
 * Orders v2 for money, Webhooks v1 for verification. Nothing above this file
 * knows either exists.
 *
 * ── The amount ───────────────────────────────────────────────────────────
 * Arrives as integer minor units from a booking intent the SERVER wrote from a
 * live Beds24 offer. It is converted to PayPal's decimal string here, at the
 * boundary, by string arithmetic. No caller passes an amount it received from
 * a browser, because no caller has one.
 */

import { paypalConfig } from '@/lib/booking/config';
import {
  PaymentProviderError,
  type CaptureRequest,
  type CreateOrderRequest,
  type PaymentProviderAdapter,
  type ProviderOrder,
  type ProviderRefund,
  type RefundRequest,
  type VerifiedPaymentEvent,
} from '@/lib/payments/provider';
import { paypalRequest } from '@/lib/payments/paypal/client';
import { mapOrder, mapWebhookEvent, toDecimalString, toCents } from '@/lib/payments/paypal/mapper';
import type {
  PayPalOrder,
  PayPalRefund,
  PayPalVerificationResponse,
  PayPalWebhookEvent,
} from '@/lib/payments/paypal/types';

/**
 * The headers PayPal signs a webhook with. All five are required by the
 * verification endpoint; a delivery missing any of them cannot be verified and
 * is therefore not authentic as far as this system is concerned.
 */
const SIGNATURE_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
] as const;

export const paypalAdapter: PaymentProviderAdapter = {
  name: 'paypal',

  get mode() {
    // Never 'live' by accident: `paypalConfig().mode` is null unless the
    // environment says exactly 'sandbox' or 'live', and every call path
    // through `paypalRequest` refuses on null before reaching the network.
    return paypalConfig().mode ?? 'sandbox';
  },

  async createOrder(request: CreateOrderRequest): Promise<ProviderOrder> {
    const { body } = await paypalRequest<PayPalOrder>({
      path: '/v2/checkout/orders',
      method: 'POST',
      // Deterministic. A retry of the same logical create returns PayPal's
      // FIRST order rather than making a second one — which is the whole
      // reason a guest double-clicking Pay cannot be charged twice.
      requestId: request.requestId,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            // The BoLaGio reference, in two fields. `custom_id` is echoed on
            // the capture and on every webhook, which is how an event that
            // reaches us with nothing else is still attributable to a booking.
            custom_id: request.reference,
            invoice_id: request.reference,
            description: request.description.slice(0, 127),
            amount: {
              currency_code: request.currency,
              value: toDecimalString(request.amountCents),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              // The guest never leaves without coming back to us. Both URLs
              // are built server-side; a caller-supplied return URL would be
              // an open redirect with a payment page in front of it.
              return_url: request.returnUrl,
              cancel_url: request.cancelUrl,
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
            },
          },
        },
      },
    });

    const order = mapOrder(body);
    if (!order.orderId) {
      throw new PaymentProviderError('unavailable', 'PayPal create-order returned no id');
    }
    return order;
  },

  async getOrder(orderId: string): Promise<ProviderOrder> {
    const { body } = await paypalRequest<PayPalOrder>({ path: `/v2/checkout/orders/${encodeURIComponent(orderId)}` });
    return mapOrder(body);
  },

  async captureOrder(request: CaptureRequest): Promise<ProviderOrder> {
    try {
      const { body } = await paypalRequest<PayPalOrder>({
        path: `/v2/checkout/orders/${encodeURIComponent(request.orderId)}/capture`,
        method: 'POST',
        requestId: request.requestId,
        body: {},
      });
      return mapOrder(body);
    } catch (cause) {
      // "Already captured" is not a failure, it is a race we expected: the
      // webhook may have driven the capture before the browser's return did.
      // Read the order and report what is actually true.
      if (cause instanceof PaymentProviderError && cause.code === 'already_captured') {
        return this.getOrder(request.orderId);
      }
      throw cause;
    }
  },

  async refund(request: RefundRequest): Promise<ProviderRefund> {
    const { body } = await paypalRequest<PayPalRefund>({
      path: `/v2/payments/captures/${encodeURIComponent(request.captureId)}/refund`,
      method: 'POST',
      requestId: request.requestId,
      body: {
        amount: { currency_code: request.currency, value: toDecimalString(request.amountCents) },
        note_to_payer: request.reason?.slice(0, 255),
      },
    });

    const cents = toCents(body.amount?.value);
    return {
      refundId: String(body.id ?? ''),
      state: body.status === 'COMPLETED' ? 'refunded' : 'unknown',
      refunded: {
        amountCents: cents ?? request.amountCents,
        currency: body.amount?.currency_code ?? request.currency,
      },
    };
  },

  /**
   * Verify a webhook AGAINST PAYPAL.
   *
   * ── Why the round trip, rather than verifying the certificate locally ────
   * Local verification means fetching PayPal's cert from a URL the request
   * itself supplies, trusting that URL, checking the chain, and reimplementing
   * their canonicalisation. Every one of those is a place to be subtly wrong,
   * and being subtly wrong here means accepting forged "you have been paid"
   * events. PayPal's own endpoint is authoritative and costs one request on a
   * path that is not guest-facing.
   *
   * `webhook_id` is OURS, from the environment. It is what binds a delivery to
   * the webhook we registered: without it, a valid PayPal signature from any
   * other merchant's webhook would verify.
   */
  async verifyWebhook({ rawBody, headers }): Promise<VerifiedPaymentEvent | null> {
    const { webhookId } = paypalConfig();
    if (!webhookId) {
      // Fail closed. An unset webhook id means we cannot establish authenticity,
      // and an unauthenticated payment event is an anonymous POST.
      throw new PaymentProviderError('not_configured', 'PAYPAL_WEBHOOK_ID is not configured');
    }

    const signature: Record<string, string> = {};
    for (const name of SIGNATURE_HEADERS) {
      const value = headers.get(name);
      if (!value) return null;
      signature[name] = value;
    }

    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      return null;
    }

    const { body } = await paypalRequest<PayPalVerificationResponse>({
      path: '/v1/notifications/verify-webhook-signature',
      method: 'POST',
      body: {
        auth_algo: signature['paypal-auth-algo'],
        cert_url: signature['paypal-cert-url'],
        transmission_id: signature['paypal-transmission-id'],
        transmission_sig: signature['paypal-transmission-sig'],
        transmission_time: signature['paypal-transmission-time'],
        webhook_id: webhookId,
        // PayPal requires the event as a JSON VALUE, not as the raw string.
        // Re-serialising is safe here because the signature is checked by
        // PayPal against its own record of the transmission, not against our
        // bytes.
        webhook_event: event,
      },
    });

    if (body.verification_status !== 'SUCCESS') return null;
    return mapWebhookEvent(event);
  },
};
