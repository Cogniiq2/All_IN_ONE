/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BROWSER'S SIDE of the booking API.
 *
 * Every call the UI makes to the booking backend goes through here, so the
 * error handling, the abort behaviour and the money formatting are written
 * once rather than four times inside a dialog.
 *
 * ── What the browser is and is not ───────────────────────────────────────
 * It is a renderer of server answers. It does not compute a total, does not
 * decide whether dates are free, and does not decide whether a booking is
 * confirmed. Every one of those is read from a response. A price that appears
 * on screen was produced by a live Beds24 offer and written to the database
 * before it was sent here.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type {
  AvailabilityCalendar,
  BookingErrorCode,
  BookingIntentView,
  BookingQuote,
  GuestDetails,
  IsoDate,
} from '@/lib/booking/types';

/** A failed booking call, already reduced to a code the UI has copy for. */
export class BookingRequestError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    readonly meta?: Record<string, number | string | boolean>
  ) {
    super(code);
    this.name = 'BookingRequestError';
  }
}

async function call<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // A dropped connection is indistinguishable from a provider outage from
    // here, and both get the same honest sentence: try again shortly.
    throw new BookingRequestError('provider_unavailable');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const parsed = body as { error?: string; meta?: Record<string, number | string | boolean> } | undefined;
    throw new BookingRequestError(
      (parsed?.error as BookingErrorCode) ?? 'unexpected',
      parsed?.meta
    );
  }

  return body as T;
}

export function fetchAvailability(
  unitSlug: string,
  window: { from?: IsoDate; to?: IsoDate } = {},
  signal?: AbortSignal
): Promise<AvailabilityCalendar> {
  const params = new URLSearchParams({ unit: unitSlug });
  if (window.from) params.set('from', window.from);
  if (window.to) params.set('to', window.to);
  return call<AvailabilityCalendar>(`/api/booking/availability?${params.toString()}`, {
    method: 'GET',
    signal,
  });
}

export function fetchQuote(
  input: { unitSlug: string; checkIn: IsoDate; checkOut: IsoDate; adults: number; children: number },
  signal?: AbortSignal
): Promise<BookingQuote> {
  return call<BookingQuote>('/api/booking/quote', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });
}

/**
 * Create the intent and take the hold.
 *
 * `attemptId` is a stable id for one press of the button, generated once and
 * reused across retries. It is the client's contribution to idempotency; the
 * guarantee itself is the unique index on the server.
 *
 * Note what is NOT sent: no amount, no currency, no availability claim. The
 * server reads all three for itself.
 */
export function createBookingIntent(
  input: {
    unitSlug: string;
    checkIn: IsoDate;
    checkOut: IsoDate;
    adults: number;
    children: number;
    guest: GuestDetails;
    attemptId: string;
  },
  signal?: AbortSignal
): Promise<{ intent: BookingIntentView; quote: BookingQuote }> {
  return call('/api/booking/intent', { method: 'POST', body: JSON.stringify(input), signal });
}

/* ── Payment ───────────────────────────────────────────────────────────── */

export interface PaymentConfig {
  provider: 'paypal';
  clientId: string;
  currency: string;
  mode: 'sandbox' | 'live';
}

/**
 * What the PayPal SDK needs to load.
 *
 * Fetched rather than baked into the bundle as a NEXT_PUBLIC_ variable, so a
 * deployment with the launch gate off serves no client id at all and no
 * payment UI can appear — even on a stale page someone left open.
 */
export function fetchPaymentConfig(signal?: AbortSignal): Promise<PaymentConfig> {
  return call<PaymentConfig>('/api/booking/payment/config', { method: 'GET', signal });
}

/**
 * Create the provider order.
 *
 * Note what is NOT sent: no amount, no currency. The server reads both from
 * the booking intent it wrote from a live Beds24 offer. The amount that comes
 * BACK is for rendering only — it travels to PayPal inside the order the
 * server created, never through this browser.
 */
export function createPaymentOrder(
  reference: string,
  signal?: AbortSignal
): Promise<{ orderId: string; approveUrl?: string; amountCents: number; currency: string }> {
  return call('/api/booking/payment/order', {
    method: 'POST',
    body: JSON.stringify({ reference }),
    signal,
  });
}

/**
 * Ask the server to capture an approved order.
 *
 * The PayPal SDK telling this browser that the guest approved is a PROMPT, not
 * evidence. The server calls PayPal, PayPal decides, and the answer is
 * validated against the authoritative quote. A guest who closes the tab here
 * still gets their booking: the webhook is an independent path to the same
 * place.
 */
export function capturePayment(
  reference: string,
  signal?: AbortSignal
): Promise<{ status: string; paymentStatus: string }> {
  return call('/api/booking/payment/capture', {
    method: 'POST',
    body: JSON.stringify({ reference }),
    signal,
  });
}

export function fetchBookingStatus(reference: string, signal?: AbortSignal): Promise<BookingIntentView> {
  return call<BookingIntentView>(`/api/booking/status?ref=${encodeURIComponent(reference)}`, {
    method: 'GET',
    signal,
  });
}

/* ── Money ─────────────────────────────────────────────────────────────── */

/**
 * Integer cents to a printed amount.
 *
 * `Intl.NumberFormat` with the real locale, so German reads "1.234,00 €" and
 * English "€1,234.00". The division by 100 happens at the last possible moment
 * and only for display — nothing in this codebase does arithmetic on the
 * result.
 */
export function formatMoney(cents: number, currency: string, locale: 'de' | 'en'): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
