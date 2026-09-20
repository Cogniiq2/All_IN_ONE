import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PAYMENT PROVIDER SEAM.
 *
 * PayPal is the implementation; it is not the interface. Stripe is the
 * expected second one and fits this shape without changing it.
 *
 * ── Deliberately small ───────────────────────────────────────────────────
 * Six operations. No customer objects, no saved payment methods, no
 * subscriptions, no provider-specific options bag. A seam that mirrors one
 * provider's full API is not a seam, it is a rename — and the cost of that
 * shows up the day a second provider does not fit.
 *
 * ── The one rule every implementation obeys ──────────────────────────────
 * An AMOUNT IS NEVER A PARAMETER FROM OUTSIDE. Callers pass a booking
 * reference and the server reads the authoritative total from the row it
 * wrote from a live Beds24 offer. There is no code path in this repository
 * where a client-supplied amount reaches a payment provider.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { PaymentState } from '@/lib/booking/states';

export interface PaymentMoney {
  /** Integer minor units. The provider adapter converts; nothing above it does. */
  amountCents: number;
  /** ISO-4217. */
  currency: string;
}

export interface CreateOrderRequest extends PaymentMoney {
  /** The BoLaGio reference, carried into provider metadata for reconciliation. */
  reference: string;
  /**
   * Deterministic, so a retried create cannot produce a second order at the
   * provider even if our own record of the first was lost.
   */
  requestId: string;
  /** Shown to the guest on the provider's page. No guest PII. */
  description: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface ProviderOrder {
  orderId: string;
  /** Mapped from the provider's own vocabulary into ours. */
  state: PaymentState;
  /** Where the guest goes, when the provider uses a redirect rather than an SDK. */
  approveUrl?: string;
  /** Present once the order has been captured. */
  captureId?: string;
  captured?: PaymentMoney;
  /** The reference the provider echoes back, for cross-checking. */
  reference?: string;
  /**
   * Refunds the provider lists against this order's capture. Read by the
   * reconciliation of a refund whose outcome was lost: the order is the
   * authoritative record of what money moved back.
   */
  refunds?: ProviderRefundSummary[];
}

export interface ProviderRefundSummary {
  refundId: string;
  state: 'refunded' | 'capture_pending' | 'denied' | 'unknown';
  amountCents?: number;
  currency?: string;
}

export interface CaptureRequest {
  orderId: string;
  requestId: string;
}

export interface RefundRequest extends PaymentMoney {
  captureId: string;
  requestId: string;
  reason?: string;
}

export interface ProviderRefund {
  refundId: string;
  /** `refunded` only when the provider said COMPLETED; PENDING is `unknown`. */
  state: PaymentState;
  refunded: PaymentMoney;
}

/**
 * A verified provider event, reduced to what the processor needs.
 *
 * The raw provider payload never travels past the verifier. Everything
 * downstream works with this shape, so a change in PayPal's webhook body is a
 * change in one file.
 */
export interface VerifiedPaymentEvent {
  provider: 'paypal' | 'stripe';
  providerEventId: string;
  eventType: string;
  eventTime?: string;
  orderId?: string;
  captureId?: string;
  reference?: string;
  amountCents?: number;
  currency?: string;
  /** What this event says the payment state now is, in OUR vocabulary. */
  state: PaymentState;
  /** Sanitized. Safe to persist. See the sanitiser in the PayPal adapter. */
  payload: Record<string, unknown>;
}

/**
 * A payment call that the provider ANSWERED, unfavourably.
 *
 * Distinct from `UncertainOperationError`, which means it did not answer. The
 * two demand opposite responses: this one may be retried or compensated, the
 * other may not be touched until it is reconciled.
 */
export class PaymentProviderError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'      // our credentials are wrong
      | 'not_configured'    // mode, id or secret missing — fail closed
      | 'rejected'          // the provider refused this operation
      | 'not_found'         // the order or capture does not exist
      | 'already_captured'  // benign; the caller reads the order instead
      | 'unavailable',      // provider-side fault, answered
    message: string,
    /**
     * The provider's documented issue name (`INSTRUMENT_DECLINED`,
     * `ORDER_NOT_APPROVED`, …) when a 4xx carried one. A closed vocabulary
     * of upper-case identifiers — never free text, never a debug id.
     */
    readonly issue?: string
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export interface PaymentProviderAdapter {
  readonly name: 'paypal' | 'stripe';
  /** Never 'live' unless it was explicitly configured. Logged on every call. */
  readonly mode: 'sandbox' | 'live';

  createOrder(request: CreateOrderRequest): Promise<ProviderOrder>;
  /** The authoritative read. Used by reconciliation before any retry. */
  getOrder(orderId: string): Promise<ProviderOrder>;
  captureOrder(request: CaptureRequest): Promise<ProviderOrder>;
  refund(request: RefundRequest): Promise<ProviderRefund>;

  /**
   * Verify an inbound webhook AGAINST THE PROVIDER and reduce it to a
   * `VerifiedPaymentEvent`. Returns null when verification fails.
   *
   * Never a local-only check. The whole value of a webhook is that it is
   * attributable, and an unverified body is an anonymous POST.
   */
  verifyWebhook(input: {
    rawBody: string;
    headers: Headers;
  }): Promise<VerifiedPaymentEvent | null>;
}
