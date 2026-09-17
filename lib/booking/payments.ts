import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * PAYMENTS — order creation, capture, and the verified-event processor.
 *
 * ── The three ways a payment becomes true, and the one thing they share ──
 *
 *   1. the guest approves and the browser asks us to capture   (synchronous)
 *   2. PayPal's webhook tells us a capture completed           (asynchronous)
 *   3. reconciliation reads the order and finds it captured    (recovery)
 *
 * All three converge on `recordCapture`, which validates provider, order,
 * amount and currency against the authoritative quote inside ONE database
 * transaction. That is why they cannot produce three different answers, why
 * arriving twice is harmless, and why arriving out of order is harmless.
 *
 * ── What can never happen here ───────────────────────────────────────────
 * An amount from outside this server reaching a payment provider. There is no
 * parameter for one. `createOrder` takes a reference and reads the total from
 * the row the server itself wrote from a live Beds24 offer.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { recordCapture, transitionIntent, type CaptureOutcome } from '@/lib/booking/commands';
import { requireDirectBooking, BookingError, requireIntent } from '@/lib/booking/service';
import { finalizeBooking } from '@/lib/booking/finalization';
import type { BookingLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import { isQuoteExpired } from '@/lib/booking/state-machine';
import { reservesInventory } from '@/lib/booking/states';
import type { PaymentProvider } from '@/lib/booking/types';
import { paymentAdapter, PaymentProviderError } from '@/lib/payments';
import type { ProviderOrder, VerifiedPaymentEvent } from '@/lib/payments/provider';
import { operationKey, trackedCall, UncertainOperationError } from '@/lib/ops/external-operations';
import { queueReconciliation } from '@/lib/booking/commands';
import { SITE_URL } from '@/lib/content/brand';

/* ── Order creation ────────────────────────────────────────────────────── */

export interface OrderHandle {
  orderId: string;
  /** For the redirect flow. The SDK flow uses `orderId` alone. */
  approveUrl?: string;
  amountCents: number;
  currency: string;
  reference: string;
}

/**
 * Create (or reuse) the provider order for a booking.
 *
 * ── Every precondition, and why each one is here ─────────────────────────
 *   the launch gate is on          a curl request must hit a gate too
 *   the booking still holds        no order for nights we no longer have
 *   the quote has not expired      no charging a price we withdrew
 *   there is an authoritative total no charging an amount nobody computed
 *
 * ── Double-click ─────────────────────────────────────────────────────────
 * Two defences, and neither of them is a disabled button. If the row already
 * carries an order id, that order is READ from the provider and reused unless
 * it is in a state that cannot be paid. And the create call itself carries a
 * deterministic `PayPal-Request-Id` derived from the intent and the quote
 * hash, so even a genuinely concurrent pair of creates yields one order at
 * PayPal.
 */
export async function createPaymentOrder(
  reference: string,
  provider: PaymentProvider,
  logger: BookingLogger
): Promise<OrderHandle> {
  requireDirectBooking();
  const intent = await requireIntent(reference);

  if (!reservesInventory(intent.status) || intent.status === 'locking') {
    // Nothing is held, so there is nothing to sell.
    throw new BookingError('hold_expired');
  }
  if (isQuoteExpired(intent.quoteExpiresAt)) throw new BookingError('quote_expired');
  if (!intent.quotedTotalCents || intent.quotedTotalCents <= 0) {
    throw new BookingError('unexpected');
  }
  if (intent.paymentStatus === 'paid') {
    // Already paid. Handing back a payable order would invite a second charge.
    throw new BookingError('invalid_input');
  }

  const adapter = paymentAdapter(provider);

  /* ── Reuse before create ──────────────────────────────────────────────── */

  if (intent.paymentOrderId) {
    const reused = await reuseOrder(intent, adapter.name, logger);
    if (reused) return reused;
  }

  const quoteHash = intent.quoteHash ?? 'nohash';
  const key = operationKey.paypalOrder(intent.id, quoteHash);

  let order: ProviderOrder;
  try {
    order = await trackedCall<ProviderOrder>(
      {
        key,
        provider: 'paypal',
        type: 'create_order',
        intentId: intent.id,
        request: { reference, amountCents: intent.quotedTotalCents, currency: intent.currency },
        logger,
        // Only an answered provider refusal is definite. A timeout or a 5xx
        // may have created the order.
        isDefiniteFailure: (cause) =>
          cause instanceof PaymentProviderError &&
          (cause.code === 'rejected' || cause.code === 'not_configured' || cause.code === 'unauthorized'),
        resourceIdOf: (result) => result.orderId,
      },
      () =>
        adapter.createOrder({
          reference,
          // Deterministic, and tied to the quote: a re-quoted booking gets a
          // new order rather than reusing one priced at the old total.
          requestId: `${intent.reference}:${quoteHash}`.slice(0, 108),
          amountCents: intent.quotedTotalCents!,
          currency: intent.currency,
          // Shown on the provider's page. Unit and dates; no guest name.
          description: `BoLaGio ${intent.unitSlug} ${intent.checkIn} → ${intent.checkOut}`,
          returnUrl: `${SITE_URL}/booking/return?ref=${reference}`,
          cancelUrl: `${SITE_URL}/booking/return?ref=${reference}&cancelled=1`,
        })
    );
  } catch (cause) {
    if (cause instanceof UncertainOperationError) {
      /*
       * An order may exist at PayPal that we have no id for. Retrying the
       * create would be safe at PayPal — the deterministic request id makes it
       * idempotent there — but we cannot be sure PayPal honoured it, so the
       * booking is flagged and the guest is told to wait rather than press
       * Pay again.
       */
      await transitionIntent(
        intent.id,
        {
          expected: intent.status,
          to: intent.status,
          reason: 'order_outcome_unknown',
          patch: {
            paymentStatus: 'unknown',
            lastFailureCode: 'PAYMENT_PROVIDER_UNCERTAIN',
            lastFailureReason: 'the create-order call did not return an outcome',
            reconciliationState: 'pending',
          },
        },
        logger
      ).catch(() => undefined);
      await queueReconciliation(intent.id, 'PAYMENT_PROVIDER_UNCERTAIN', 1, { operationKey: key });
      throw new BookingError('pending_verification');
    }
    logger.warn('payment.order', { reference, outcome: 'create_failed' });
    throw new BookingError('payment_handoff_failed');
  }

  const next = await transitionIntent(
    intent.id,
    {
      expected: intent.status,
      to: 'payment_session_created',
      reason: 'order_created',
      patch: {
        paymentProvider: provider,
        paymentOrderId: order.orderId,
        paymentStatus: order.state === 'not_created' ? 'order_created' : order.state,
      },
      outbox: {
        type: 'payment.order_created',
        payload: { reference, amountCents: intent.quotedTotalCents, currency: intent.currency },
      },
    },
    logger
  );

  logger.info('payment.order', {
    reference,
    orderId: order.orderId,
    amountCents: intent.quotedTotalCents,
    currency: intent.currency,
    paymentProvider: provider,
    mode: adapter.mode,
    outcome: next ? 'created' : 'created_unrecorded',
  });

  if (!next) {
    // The order exists at PayPal and our row did not record it. Recoverable
    // through `bolagio_external_operations`, which holds the order id.
    await queueReconciliation(intent.id, 'PAYMENT_PROVIDER_UNCERTAIN', 1, { orderId: order.orderId });
    throw new BookingError('pending_verification');
  }

  return {
    orderId: order.orderId,
    approveUrl: order.approveUrl,
    amountCents: intent.quotedTotalCents,
    currency: intent.currency,
    reference,
  };
}

/**
 * Can the order this booking already has be handed back?
 *
 * Read from the PROVIDER, not from our column: the column says an order was
 * created, the provider says whether it is still payable. A read failure
 * returns null and a new order is created, which the deterministic request id
 * makes safe.
 */
async function reuseOrder(
  intent: IntentRecord,
  provider: PaymentProvider,
  logger: BookingLogger
): Promise<OrderHandle | null> {
  try {
    const existing = await paymentAdapter(provider).getOrder(intent.paymentOrderId!);
    if (existing.state === 'order_created' || existing.state === 'approved') {
      logger.info('payment.order', {
        reference: intent.reference,
        orderId: existing.orderId,
        outcome: 'reused',
      });
      return {
        orderId: existing.orderId,
        approveUrl: existing.approveUrl,
        amountCents: intent.quotedTotalCents!,
        currency: intent.currency,
        reference: intent.reference,
      };
    }
    if (existing.state === 'paid' && existing.captureId && existing.captured) {
      // The capture landed while the guest was pressing Pay again. Apply it,
      // rather than opening a second order for money already taken.
      await applyCapture(
        {
          reference: intent.reference,
          provider,
          orderId: existing.orderId,
          captureId: existing.captureId,
          amountCents: existing.captured.amountCents,
          currency: existing.captured.currency,
        },
        logger
      );
      throw new BookingError('invalid_input');
    }
  } catch (cause) {
    if (cause instanceof BookingError) throw cause;
    logger.warn('payment.order', { reference: intent.reference, outcome: 'reuse_read_failed' });
  }
  return null;
}

/* ── Capture ───────────────────────────────────────────────────────────── */

/**
 * Capture an approved order, server-side.
 *
 * The browser triggers this after PayPal's SDK reports approval — but the
 * browser's word is not what makes it true. This calls PayPal, PayPal decides,
 * and the result goes through the same `recordCapture` validation as a webhook.
 * A guest who never returns to the page still gets their booking confirmed,
 * because the webhook is an independent path to the same place.
 */
export async function capturePaymentOrder(
  reference: string,
  logger: BookingLogger
): Promise<{ status: string; paymentStatus: string }> {
  requireDirectBooking();
  const intent = await requireIntent(reference);

  if (!intent.paymentOrderId || !intent.paymentProvider) {
    throw new BookingError('invalid_input');
  }
  // Already settled. Idempotent by design: a guest refreshing the return page
  // must not trigger a second capture attempt.
  if (intent.paymentStatus === 'paid' || intent.status === 'confirmed') {
    return { status: intent.status, paymentStatus: intent.paymentStatus };
  }

  const adapter = paymentAdapter(intent.paymentProvider);
  const key = operationKey.paypalCapture(intent.paymentOrderId);

  let captured: ProviderOrder;
  try {
    captured = await trackedCall<ProviderOrder>(
      {
        key,
        provider: 'paypal',
        type: 'capture',
        intentId: intent.id,
        request: { orderId: intent.paymentOrderId, reference },
        logger,
        isDefiniteFailure: (cause) =>
          cause instanceof PaymentProviderError &&
          (cause.code === 'rejected' || cause.code === 'not_found'),
        resourceIdOf: (result) => result.captureId,
      },
      () =>
        adapter.captureOrder({
          orderId: intent.paymentOrderId!,
          // The order id IS the idempotency domain: capturing twice must be
          // the same as capturing once.
          requestId: `capture:${intent.paymentOrderId}`.slice(0, 108),
        })
    );
  } catch (cause) {
    if (cause instanceof UncertainOperationError) {
      /*
       * The money may have moved. This is the one place where the wrong
       * response is catastrophic in both directions: retrying may double-charge,
       * giving up may lose a payment. So neither — the payment state becomes
       * `unknown`, which BLOCKS any release, and reconciliation reads the order
       * from PayPal to find out what actually happened.
       */
      await transitionIntent(
        intent.id,
        {
          expected: intent.status,
          to: intent.status,
          reason: 'capture_outcome_unknown',
          patch: {
            paymentStatus: 'unknown',
            lastFailureCode: 'PAYMENT_PROVIDER_UNCERTAIN',
            lastFailureReason: 'the capture call did not return an outcome',
            reconciliationState: 'pending',
          },
        },
        logger
      ).catch(() => undefined);
      await queueReconciliation(intent.id, 'PAYMENT_PROVIDER_UNCERTAIN', 1, {
        orderId: intent.paymentOrderId,
      });
      throw new BookingError('pending_verification');
    }
    logger.warn('payment.capture', { reference, outcome: 'capture_failed' });
    await markPaymentFailed(intent, 'capture_rejected', logger);
    throw new BookingError('payment_handoff_failed');
  }

  if (captured.state !== 'paid' || !captured.captureId || !captured.captured) {
    // PENDING is not paid. The booking stays held, the payment state records
    // what PayPal said, and the webhook resolves it when it settles.
    await transitionIntent(
      intent.id,
      {
        expected: intent.status,
        to: 'payment_pending',
        reason: `capture_${captured.state}`,
        patch: { paymentStatus: captured.state },
      },
      logger
    );
    return { status: 'payment_pending', paymentStatus: captured.state };
  }

  const outcome = await applyCapture(
    {
      reference,
      provider: intent.paymentProvider,
      orderId: captured.orderId,
      captureId: captured.captureId,
      amountCents: captured.captured.amountCents,
      currency: captured.captured.currency,
    },
    logger
  );

  const after = await requireIntent(reference);
  return { status: after.status, paymentStatus: after.paymentStatus };
}

async function markPaymentFailed(
  intent: IntentRecord,
  reason: string,
  logger: BookingLogger
): Promise<void> {
  await transitionIntent(
    intent.id,
    {
      expected: intent.status,
      to: 'payment_failed',
      reason,
      patch: { paymentStatus: 'denied' },
      outbox: { type: 'payment.failed', payload: { reference: intent.reference, reason } },
    },
    logger
  ).catch(() => undefined);
}

/* ── The one path every payment takes ──────────────────────────────────── */

/**
 * Apply a capture and, if it is good, finalize the booking.
 *
 * Called by the synchronous capture, by the webhook processor and by
 * reconciliation — deliberately the same function, so the three can never
 * diverge on what "paid" means or on what happens next.
 *
 * Finalization failing does NOT undo the payment. See lib/booking/finalization.ts.
 */
export async function applyCapture(
  input: {
    reference: string;
    provider: PaymentProvider;
    orderId: string;
    captureId: string;
    amountCents: number;
    currency: string;
  },
  logger: BookingLogger
): Promise<CaptureOutcome> {
  const outcome = await recordCapture(input, logger);

  if (outcome.outcome === 'applied') {
    const intent = await requireIntent(input.reference);
    await finalizeBooking(intent, logger);
  }
  return outcome;
}

/* ── Verified events ───────────────────────────────────────────────────── */

/**
 * Turn one verified provider event into a state change.
 *
 * Runs OUTSIDE the webhook request, from the inbox, so that PayPal gets its
 * 2xx in milliseconds and a slow Beds24 call cannot cause a redelivery storm.
 *
 * ── Resolving a reference ────────────────────────────────────────────────
 * An event carries our reference in `custom_id` — usually. When it does not,
 * the order id is looked up instead. An event we cannot attribute to a booking
 * is NOT discarded: it is an orphan payment, which is a severity-2 operational
 * fact, and silently dropping it is how a guest's money goes missing.
 */
export async function processPaymentEvent(
  event: VerifiedPaymentEvent,
  logger: BookingLogger
): Promise<'applied' | 'ignored' | 'escalated'> {
  const reference = event.reference ?? (await referenceForOrder(event.orderId));

  if (!reference) {
    logger.error('payment.event', undefined, {
      eventId: event.providerEventId,
      eventType: event.eventType,
      orderId: event.orderId,
      errorCode: 'PAYMENT_UNKNOWN_REFERENCE',
    });
    return 'escalated';
  }

  const intent = await requireIntent(reference).catch(() => null);
  if (!intent) return 'escalated';

  switch (event.state) {
    case 'paid': {
      if (!event.captureId || event.amountCents === undefined || !event.currency) {
        // A completed capture we cannot verify the amount of is not a
        // confirmation. It is a reason to look.
        await queueReconciliation(intent.id, 'PAYMENT_PROVIDER_UNCERTAIN', 1, {
          eventId: event.providerEventId,
        });
        return 'escalated';
      }
      const outcome = await applyCapture(
        {
          reference,
          provider: 'paypal',
          orderId: event.orderId ?? intent.paymentOrderId ?? '',
          captureId: event.captureId,
          amountCents: event.amountCents,
          currency: event.currency,
        },
        logger
      );
      return outcome.outcome === 'applied' || outcome.outcome === 'duplicate' ? 'applied' : 'escalated';
    }

    case 'capture_pending':
      await transitionIntent(
        intent.id,
        {
          expected: intent.status,
          to: 'payment_pending',
          reason: 'capture_pending',
          patch: { paymentStatus: 'capture_pending' },
        },
        logger
      );
      return 'applied';

    case 'approved':
      await transitionIntent(
        intent.id,
        {
          expected: intent.status,
          to: 'awaiting_payment',
          reason: 'order_approved',
          patch: { paymentStatus: 'approved' },
        },
        logger
      );
      return 'applied';

    case 'denied':
      // The hold is NOT released here. The release saga decides that, and it
      // verifies the nights reopened before freeing them locally.
      await markPaymentFailed(intent, 'capture_denied', logger);
      return 'applied';

    case 'refunded':
    case 'partially_refunded': {
      /*
       * A refund does not cancel a reservation. Whether the guest still has
       * their stay is a business decision — a partial refund for a shortened
       * stay is a perfectly normal thing. So: record it, emit an event,
       * escalate to a human, change nothing about the booking.
       */
      await transitionIntent(
        intent.id,
        {
          expected: intent.status,
          to: intent.status,
          reason: 'refund_recorded',
          patch: { paymentStatus: event.state, reconciliationState: 'manual' },
          outbox: {
            type: 'payment.refunded',
            payload: {
              reference,
              amountCents: event.amountCents,
              currency: event.currency,
              partial: event.state === 'partially_refunded',
            },
          },
        },
        logger
      );
      await queueReconciliation(intent.id, 'PAYMENT_REFUNDED', 3, { eventId: event.providerEventId });
      return 'applied';
    }

    case 'disputed':
      await queueReconciliation(intent.id, 'PAYMENT_DISPUTED', 1, { eventId: event.providerEventId });
      return 'escalated';

    default:
      logger.info('payment.event', {
        reference,
        eventType: event.eventType,
        outcome: 'ignored',
      });
      return 'ignored';
  }
}

async function referenceForOrder(orderId: string | undefined): Promise<string | null> {
  if (!orderId) return null;
  const { findIntentByOrderId } = await import('@/lib/booking/repository');
  const intent = await findIntentByOrderId(orderId);
  return intent?.reference ?? null;
}
