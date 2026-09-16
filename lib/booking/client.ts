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

export function startPayment(
  reference: string,
  paymentProvider: 'stripe' | 'paypal',
  signal?: AbortSignal
): Promise<{ redirectUrl: string; expiresAt?: string }> {
  return call('/api/booking/payment-session', {
    method: 'POST',
    body: JSON.stringify({ reference, paymentProvider }),
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
