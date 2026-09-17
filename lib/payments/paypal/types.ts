import 'server-only';

/**
 * PayPal REST wire shapes — the only file allowed to name them.
 *
 * ── Verification status ──────────────────────────────────────────────────
 * NOT verified against a live PayPal account. Every one of these shapes is
 * modelled from the published Orders v2 and Webhooks v1 references and has
 * never been exercised against a sandbox, let alone production. They are
 * therefore ALL optional and all narrowed by `mapper.ts` before anything
 * downstream sees them, exactly as the Beds24 types were before that account
 * was tested.
 *
 * `docs/payment-paypal.md` lists what a sandbox run has to confirm.
 */

/** `POST /v2/checkout/orders`, `GET /v2/checkout/orders/{id}` */
export interface PayPalOrder {
  id?: string;
  status?: PayPalOrderStatus;
  intent?: 'CAPTURE' | 'AUTHORIZE';
  links?: PayPalLink[];
  purchase_units?: PayPalPurchaseUnit[];
}

/**
 * PayPal's order statuses.
 *
 * `COMPLETED` on the ORDER is not the same fact as `COMPLETED` on the CAPTURE,
 * and conflating them is how a PENDING capture gets treated as settled money.
 * The mapper reads the capture where one exists and only falls back to the
 * order status when it does not.
 */
export type PayPalOrderStatus =
  | 'CREATED'
  | 'SAVED'
  | 'APPROVED'
  | 'VOIDED'
  | 'COMPLETED'
  | 'PAYER_ACTION_REQUIRED';

export interface PayPalLink {
  href?: string;
  rel?: string;
  method?: string;
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  /** Where the BoLaGio reference is carried. Echoed back on every read. */
  custom_id?: string;
  invoice_id?: string;
  description?: string;
  amount?: PayPalAmount;
  payments?: {
    captures?: PayPalCapture[];
    refunds?: PayPalRefund[];
  };
}

export interface PayPalAmount {
  /** ISO-4217. */
  currency_code?: string;
  /** Decimal STRING, e.g. "425.00". Never a number — see the mapper. */
  value?: string;
}

export interface PayPalCapture {
  id?: string;
  status?: PayPalCaptureStatus;
  amount?: PayPalAmount;
  custom_id?: string;
  invoice_id?: string;
  create_time?: string;
  final_capture?: boolean;
}

/**
 * `PENDING` is NOT paid. It is PayPal saying the money may yet arrive, may be
 * under review, or may be reversed. Treating it as settled is the single most
 * common way a payment integration confirms a booking it should not have.
 */
export type PayPalCaptureStatus =
  | 'COMPLETED'
  | 'DECLINED'
  | 'PARTIALLY_REFUNDED'
  | 'PENDING'
  | 'REFUNDED'
  | 'FAILED';

export interface PayPalRefund {
  id?: string;
  status?: 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED';
  amount?: PayPalAmount;
  custom_id?: string;
}

/** `POST /v1/notifications/verify-webhook-signature` */
export interface PayPalVerificationResponse {
  /** The only value that means the event is authentic. */
  verification_status?: 'SUCCESS' | 'FAILURE';
}

/**
 * The webhook envelope PayPal POSTs.
 *
 * ── Why `resource` is its own loose shape ────────────────────────────────
 * It was first modelled as `PayPalCapture & PayPalOrder & PayPalRefund`,
 * which is wrong in a way TypeScript catches immediately: intersecting three
 * types narrows `status` to the values all three share, so a perfectly
 * ordinary `DECLINED` capture stops being assignable. A webhook resource is
 * one of several kinds — which one is told by `resource_type` and the event
 * name — so `status` is a plain string here and the mapper narrows it.
 *
 * That is the same rule the Beds24 types follow: loose at the wire, narrowed
 * in exactly one place.
 */
export interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  create_time?: string;
  resource_type?: string;
  summary?: string;
  resource?: PayPalWebhookResource;
}

export interface PayPalWebhookResource {
  id?: number | string;
  /** A capture, order or refund status, depending on the event. */
  status?: string;
  custom_id?: string;
  invoice_id?: string;
  final_capture?: boolean;
  create_time?: string;
  amount?: PayPalAmount;
  purchase_units?: PayPalPurchaseUnit[];
  supplementary_data?: { related_ids?: { order_id?: string } };
}

/** Event types this system acts on. Anything else is stored and ignored. */
export const HANDLED_EVENT_TYPES = [
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
  'PAYMENT.CAPTURE.PENDING',
  'CHECKOUT.ORDER.APPROVED',
  // Recorded so a dispute is visible operationally. Nothing is automated off
  // it — dispute handling is a business process, not a webhook branch.
  'CUSTOMER.DISPUTE.CREATED',
] as const;
