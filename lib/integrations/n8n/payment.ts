import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE n8n PAYMENT HANDOFF — the contract, not the implementation.
 *
 * Stripe and PayPal are executed by n8n workflows that live outside this
 * repository. This file is the interface to them, and building it now rather
 * than a half-integration means the workflows can be written independently
 * against a fixed contract.
 *
 * ── Request (BoLaGio → n8n) ──────────────────────────────────────────────
 *   POST  N8N_BOOKING_PAYMENT_WEBHOOK_URL
 *   x-bolagio-signature:  N8N_BOOKING_PAYMENT_WEBHOOK_SECRET
 *   x-correlation-id:     <correlation id>
 *   {
 *     reference:       "BLG-7K2M9Q",     // BoLaGio's, not Beds24's
 *     paymentProvider: "stripe" | "paypal",
 *     amountCents:     42500,            // read from the database
 *     currency:        "EUR",
 *     unitSlug, checkIn, checkOut, nights, adults, children,
 *     guest: { firstName, lastName, email, locale },
 *     returnUrl, cancelUrl
 *   }
 *
 * Every chargeable value in that body was written by this server from a live
 * Beds24 offer. The browser supplies a reference and a provider choice and
 * nothing else — see `beginPayment` in lib/booking/service.ts.
 *
 * ── Response (n8n → BoLaGio) ─────────────────────────────────────────────
 *   { paymentSessionId: string, redirectUrl: string, expiresAt?: string }
 *
 * The frontend redirects to `redirectUrl`. That redirect is a handoff and
 * NOTHING ELSE — a guest arriving back at the return URL proves only that a
 * browser navigated. Payment becomes true when n8n calls
 * `POST /api/booking/callback` with the shared secret.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { n8nPaymentConfig } from '@/lib/booking/config';
import { BookingError } from '@/lib/booking/service';
import type { BookingLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import type { PaymentProvider } from '@/lib/booking/types';

export interface PaymentSession {
  paymentSessionId: string;
  redirectUrl: string;
  expiresAt?: string;
}

const TIMEOUT_MS = 10_000;

export async function createPaymentSession(
  intent: IntentRecord,
  provider: PaymentProvider,
  urls: { returnUrl: string; cancelUrl: string },
  logger: BookingLogger
): Promise<PaymentSession> {
  const { webhookUrl, webhookSecret } = n8nPaymentConfig();
  if (!webhookUrl || !webhookSecret) {
    // Not configured is a handoff failure, reported to the guest as "we could
    // not open the secure payment page. No payment has been taken." — which is
    // exactly true.
    logger.warn('payment.handoff', { reference: intent.reference, outcome: 'not-configured' });
    throw new BookingError('payment_handoff_failed');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The secret authenticates BoLaGio to n8n. It never reaches a browser:
        // this module is `server-only` and is called from a route handler.
        'x-bolagio-signature': webhookSecret,
        'x-correlation-id': logger.correlationId,
      },
      signal: controller.signal,
      cache: 'no-store',
      body: JSON.stringify({
        reference: intent.reference,
        paymentProvider: provider,
        amountCents: intent.quotedTotalCents,
        currency: intent.currency,
        unitSlug: intent.unitSlug,
        checkIn: intent.checkIn,
        checkOut: intent.checkOut,
        adults: intent.adults,
        children: intent.children,
        // The minimum a payment provider needs to put a name on a receipt.
        // No phone number, no address, no booking notes.
        guest: intent.guest
          ? {
              firstName: intent.guest.firstName,
              lastName: intent.guest.lastName,
              email: intent.guest.email,
              locale: intent.guest.locale,
            }
          : null,
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
      }),
    });
  } catch (cause) {
    logger.error('payment.handoff', cause, {
      reference: intent.reference,
      paymentProvider: provider,
      durationMs: Date.now() - started,
    });
    throw new BookingError('payment_handoff_failed');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    logger.warn('payment.handoff', {
      reference: intent.reference,
      paymentProvider: provider,
      httpStatus: response.status,
    });
    throw new BookingError('payment_handoff_failed');
  }

  let body: Partial<PaymentSession>;
  try {
    body = (await response.json()) as Partial<PaymentSession>;
  } catch {
    throw new BookingError('payment_handoff_failed');
  }

  // The redirect target is validated before it is handed to a browser: an
  // unchecked URL from an upstream system is an open-redirect waiting to be
  // used for phishing, and this one is followed by a guest about to type card
  // details.
  if (!body.paymentSessionId || !isSafeRedirect(body.redirectUrl)) {
    logger.warn('payment.handoff', { reference: intent.reference, outcome: 'malformed-response' });
    throw new BookingError('payment_handoff_failed');
  }

  logger.info('payment.handoff', {
    reference: intent.reference,
    paymentProvider: provider,
    amountCents: intent.quotedTotalCents ?? undefined,
    currency: intent.currency,
    durationMs: Date.now() - started,
  });

  return {
    paymentSessionId: String(body.paymentSessionId).slice(0, 200),
    redirectUrl: body.redirectUrl!,
    expiresAt: body.expiresAt,
  };
}

/** https only, absolute, and no credentials embedded in the URL. */
function isSafeRedirect(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}
