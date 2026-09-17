import 'server-only';

/**
 * PayPal's vocabulary → BoLaGio's.
 *
 * The only file that knows a PayPal status string. Everything above it works
 * with `PaymentState`, which is why adding Stripe later touches one directory.
 *
 * ── Money ────────────────────────────────────────────────────────────────
 * PayPal sends decimal STRINGS ("425.00"). Parsing one with `parseFloat` and
 * multiplying by 100 gives 42499.999999999993 for some values, and a booking
 * system that compares a paid amount to a quoted amount cannot afford that.
 * `toCents` is string arithmetic; there is no float in this file.
 */

import type { PaymentState } from '@/lib/booking/states';
import type { ProviderOrder, VerifiedPaymentEvent } from '@/lib/payments/provider';
import type {
  PayPalAmount,
  PayPalCapture,
  PayPalCaptureStatus,
  PayPalOrder,
  PayPalOrderStatus,
  PayPalWebhookEvent,
} from '@/lib/payments/paypal/types';

/**
 * A decimal money string to integer minor units, without floating point.
 *
 * Returns null rather than guessing on anything it does not recognise. A
 * null amount fails the capture comparison, which routes the booking to
 * manual review — the correct outcome for an amount we cannot read.
 */
export function toCents(value: string | undefined | null): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Optional sign, digits, optionally a fractional part of one or two digits.
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return sign === '-' ? -cents : cents;
}

/** Integer minor units to the decimal string PayPal requires. */
export function toDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * A capture status in our vocabulary.
 *
 * `PENDING` maps to `capture_pending`, never to `paid`. PayPal uses PENDING
 * for funds under review and for eCheck settlement, both of which can still
 * fail — and neither of which is a reason to confirm a reservation.
 */
export function stateFromCaptureStatus(status: PayPalCaptureStatus | undefined): PaymentState {
  switch (status) {
    case 'COMPLETED':
      return 'paid';
    case 'PENDING':
      return 'capture_pending';
    case 'DECLINED':
    case 'FAILED':
      return 'denied';
    case 'REFUNDED':
      return 'refunded';
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded';
    default:
      // An unrecognised status is 'unknown', which blocks a release and
      // schedules reconciliation. It is never optimistically read as paid.
      return 'unknown';
  }
}

export function stateFromOrderStatus(status: PayPalOrderStatus | undefined): PaymentState {
  switch (status) {
    case 'CREATED':
    case 'SAVED':
    case 'PAYER_ACTION_REQUIRED':
      return 'order_created';
    case 'APPROVED':
      return 'approved';
    case 'VOIDED':
      return 'cancelled';
    case 'COMPLETED':
      // The ORDER is complete. Whether the money settled is the CAPTURE's
      // business, and `mapOrder` prefers the capture wherever one exists.
      return 'paid';
    default:
      return 'unknown';
  }
}

function firstCapture(order: PayPalOrder): PayPalCapture | undefined {
  for (const unit of order.purchase_units ?? []) {
    const capture = unit.payments?.captures?.[0];
    if (capture) return capture;
  }
  return undefined;
}

function referenceOf(order: PayPalOrder): string | undefined {
  for (const unit of order.purchase_units ?? []) {
    if (typeof unit.custom_id === 'string' && unit.custom_id) return unit.custom_id;
  }
  return undefined;
}

function amountOf(amount: PayPalAmount | undefined): { amountCents: number; currency: string } | undefined {
  const cents = toCents(amount?.value);
  const currency = amount?.currency_code;
  if (cents === null || typeof currency !== 'string') return undefined;
  return { amountCents: cents, currency: currency.toUpperCase() };
}

export function mapOrder(order: PayPalOrder): ProviderOrder {
  const capture = firstCapture(order);
  const captured = amountOf(capture?.amount);

  return {
    orderId: String(order.id ?? ''),
    // The capture wins where there is one: it is the fact about money, the
    // order status is a fact about the checkout.
    state: capture ? stateFromCaptureStatus(capture.status) : stateFromOrderStatus(order.status),
    approveUrl: (order.links ?? []).find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href,
    captureId: capture?.id ? String(capture.id) : undefined,
    captured,
    reference: capture?.custom_id ?? referenceOf(order),
  };
}

/**
 * A verified webhook event, reduced.
 *
 * Returns null when the event carries nothing actionable — no id, or no type.
 * The caller stores those anyway (a malformed delivery is worth seeing) but
 * never queues them for processing.
 */
export function mapWebhookEvent(event: PayPalWebhookEvent): VerifiedPaymentEvent | null {
  const providerEventId = typeof event.id === 'string' ? event.id : '';
  const eventType = typeof event.event_type === 'string' ? event.event_type : '';
  if (!providerEventId || !eventType) return null;

  const resource = event.resource ?? {};
  const money = amountOf(resource.amount);

  // The order id reaches us by one of three routes depending on the event.
  // All three are read, because which one is populated is not something to
  // assume from documentation we have not exercised.
  const orderId =
    resource.supplementary_data?.related_ids?.order_id ??
    (resource.id && event.resource_type === 'checkout-order' ? String(resource.id) : undefined) ??
    undefined;

  const captureId =
    event.resource_type === 'capture' || eventType.startsWith('PAYMENT.CAPTURE.')
      ? (resource.id ? String(resource.id) : undefined)
      : undefined;

  return {
    provider: 'paypal',
    providerEventId,
    eventType,
    eventTime: typeof event.create_time === 'string' ? event.create_time : undefined,
    orderId: orderId ? String(orderId) : undefined,
    captureId,
    reference: typeof resource.custom_id === 'string' ? resource.custom_id : referenceOf(resource),
    amountCents: money?.amountCents,
    currency: money?.currency,
    state: stateFromEventType(eventType, resource.status as PayPalCaptureStatus | undefined),
    payload: sanitize(event),
  };
}

function stateFromEventType(eventType: string, status: PayPalCaptureStatus | undefined): PaymentState {
  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      // Trust the resource's own status over the event name where they differ;
      // the event name is a routing label, the status is the fact.
      return status ? stateFromCaptureStatus(status) : 'paid';
    case 'PAYMENT.CAPTURE.DENIED':
      return 'denied';
    case 'PAYMENT.CAPTURE.PENDING':
      return 'capture_pending';
    case 'PAYMENT.CAPTURE.REFUNDED':
      return 'refunded';
    case 'PAYMENT.CAPTURE.REVERSED':
      return 'refunded';
    case 'CHECKOUT.ORDER.APPROVED':
      return 'approved';
    case 'CUSTOMER.DISPUTE.CREATED':
      return 'disputed';
    default:
      return 'unknown';
  }
}

/**
 * What of a PayPal event may be persisted.
 *
 * An ALLOW LIST, so a field PayPal adds later cannot leak by being forgotten
 * — the same rule the booking logger uses. What is deliberately dropped:
 * `payer` (name, email, payer id, address), `payment_source` (the last four
 * digits of a card and its brand), `shipping`, and `links` (which carry
 * absolute API URLs).
 *
 * What is kept is what reconciliation needs: ids, an amount, a status, a time.
 */
export function sanitize(event: PayPalWebhookEvent): Record<string, unknown> {
  const resource = event.resource ?? {};
  return {
    id: event.id,
    event_type: event.event_type,
    create_time: event.create_time,
    resource_type: event.resource_type,
    resource: {
      id: resource.id,
      status: resource.status,
      custom_id: resource.custom_id,
      invoice_id: resource.invoice_id,
      final_capture: resource.final_capture,
      create_time: resource.create_time,
      amount: resource.amount
        ? { currency_code: resource.amount.currency_code, value: resource.amount.value }
        : undefined,
      supplementary_data: resource.supplementary_data?.related_ids?.order_id
        ? { related_ids: { order_id: resource.supplementary_data.related_ids.order_id } }
        : undefined,
    },
  };
}
