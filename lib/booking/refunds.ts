import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * REFUNDS — the saga, behind a gate.
 *
 *   refund_state = required  ──begin──▶  pending  ──provider──▶  completed
 *                                             │                     ▲
 *                                             ├── answered no ──▶ failed
 *                                             └── no answer ────▶ unknown ──reconcile──┘
 *
 * ── What decides whether money moves ─────────────────────────────────────
 * Not this file. A refund is required only because an AUTHORISED cancellation
 * recorded a refund amount (`bolagio_request_cancellation`). This file
 * executes that decision, once, and records what the provider said.
 *
 * ── Why it is gated ──────────────────────────────────────────────────────
 * `PAYMENT_REFUND_EXECUTION_ENABLED` is off by default and REFUSED on
 * production by the environment rules: the provider's refund contract
 * (request shape, response status vocabulary, the refund's appearance on the
 * order, the REFUNDED webhook's resource shape) has never been exercised
 * against PayPal's sandbox. Until it has, the saga runs only against the
 * local simulator, where every branch below is tested.
 *
 * ── Never twice ──────────────────────────────────────────────────────────
 *   • the database moves `required → pending` exactly once (M);
 *   • the external-operations ledger is keyed on the capture id and refuses a
 *     resend after an unknown outcome (SQLSTATE BLG01);
 *   • the provider request id is deterministic (`refund:<capture>:<amount>`).
 * ══════════════════════════════════════════════════════════════════════════
 */

import { refundExecutionEnabled } from '@/lib/booking/config';
import { beginRefund, recordRefundOutcome } from '@/lib/booking/commands';
import type { BookingLogger } from '@/lib/booking/logger';
import { findIntentByReference, type IntentRecord } from '@/lib/booking/repository';
import { paymentAdapter, PaymentProviderError } from '@/lib/payments';
import type { ProviderRefund } from '@/lib/payments/provider';
import { operationKey, trackedCall, UncertainOperationError, UnresolvedOperationError } from '@/lib/ops/external-operations';

export type RefundExecutionResult =
  | { outcome: 'completed'; refundId: string; amountCents: number; intent: IntentRecord }
  | { outcome: 'unknown'; intent: IntentRecord }
  | { outcome: 'failed'; intent: IntentRecord; issue?: string }
  | { outcome: 'refused'; code: 'EXECUTION_DISABLED' | 'NOT_FOUND' | 'REFUND_ALREADY_COMPLETED' | 'REFUND_IN_PROGRESS' | 'REFUND_NOT_REQUIRED' | 'NO_CAPTURE' | 'AUTHORIZATION_REQUIRED' | 'UNRESOLVED_PREVIOUS_ATTEMPT'; intent: IntentRecord };

/**
 * Execute the refund a cancellation decided.
 *
 * `actor` is audited; the amount comes from the row (`refund_required_cents`),
 * never from a parameter, for the same reason a capture amount never comes
 * from a browser.
 */
export async function executeRefund(
  intent: IntentRecord,
  actor: string,
  logger: BookingLogger
): Promise<RefundExecutionResult> {
  if (!refundExecutionEnabled()) {
    logger.warn('payment.refund', { reference: intent.reference, outcome: 'refused', errorCode: 'EXECUTION_DISABLED' });
    return { outcome: 'refused', code: 'EXECUTION_DISABLED', intent };
  }

  const begun = await beginRefund(intent.id, actor);
  if (!begun.ok) {
    logger.warn('payment.refund', { reference: intent.reference, outcome: 'refused', errorCode: begun.code });
    return { outcome: 'refused', code: begun.code, intent };
  }

  const adapter = paymentAdapter(intent.paymentProvider ?? 'paypal');
  const key = operationKey.paypalRefund(begun.captureId);

  let refund: ProviderRefund;
  try {
    refund = await trackedCall<ProviderRefund>(
      {
        key,
        provider: 'paypal',
        type: 'refund',
        intentId: intent.id,
        request: { captureId: begun.captureId, amountCents: begun.amountCents, currency: begun.currency, reference: intent.reference },
        logger,
        // Only an answered refusal is definite. A timeout or a 5xx may have
        // moved the money.
        isDefiniteFailure: (cause) =>
          cause instanceof PaymentProviderError &&
          (cause.code === 'rejected' || cause.code === 'not_found' || cause.code === 'not_configured' || cause.code === 'unauthorized'),
        resourceIdOf: (result) => result.refundId || undefined,
      },
      () =>
        adapter.refund({
          captureId: begun.captureId,
          amountCents: begun.amountCents,
          currency: begun.currency,
          requestId: `refund:${begun.captureId}:${begun.amountCents}`.slice(0, 108),
          reason: 'BoLaGio cancellation',
        })
    );
  } catch (cause) {
    if (cause instanceof UnresolvedOperationError) {
      // An earlier attempt's outcome is unknown and unreconciled. The row is
      // already `pending`; leave the decision with reconciliation.
      await recordRefundOutcome(intent.id, { outcome: 'unknown', error: 'previous refund attempt unresolved' }, logger);
      const after = (await findIntentByReference(intent.reference)) ?? intent;
      return { outcome: 'refused', code: 'UNRESOLVED_PREVIOUS_ATTEMPT', intent: after };
    }
    if (cause instanceof UncertainOperationError) {
      // K. The money may have moved. Recorded as unknown; reconciliation reads
      // the order; the REFUNDED webhook, if it comes, settles it too.
      await recordRefundOutcome(intent.id, { outcome: 'unknown', error: cause.detail ?? 'no outcome' }, logger);
      const after = (await findIntentByReference(intent.reference)) ?? intent;
      return { outcome: 'unknown', intent: after };
    }
    const issue = cause instanceof PaymentProviderError ? cause.issue ?? cause.code : 'unknown';
    await recordRefundOutcome(intent.id, { outcome: 'failed', error: issue }, logger);
    const after = (await findIntentByReference(intent.reference)) ?? intent;
    logger.warn('payment.refund', { reference: intent.reference, outcome: 'failed', errorCode: issue });
    return { outcome: 'failed', intent: after, issue };
  }

  if (refund.state !== 'refunded' || !refund.refundId) {
    // The provider accepted the request and has not completed it (PENDING).
    // Not completed, not failed: unknown until the order says otherwise.
    await recordRefundOutcome(intent.id, { outcome: 'unknown', error: `provider refund state ${refund.state}` }, logger);
    const after = (await findIntentByReference(intent.reference)) ?? intent;
    return { outcome: 'unknown', intent: after };
  }

  // J. Completed, with the provider's evidence. Idempotent on the refund id.
  const recorded = await recordRefundOutcome(
    intent.id,
    { outcome: 'completed', refundId: refund.refundId, amountCents: refund.refunded.amountCents, source: 'saga' },
    logger
  );
  const after = (await findIntentByReference(intent.reference)) ?? intent;
  if (!recorded.ok) {
    // The evidence contradicts the row (a second refund, or none authorised).
    // Money moved; a person decides. The database has queued the job.
    return { outcome: 'failed', intent: after, issue: recorded.code };
  }
  logger.info('payment.refund', { reference: intent.reference, refundId: refund.refundId, amountCents: refund.refunded.amountCents, outcome: 'completed' });
  return { outcome: 'completed', refundId: refund.refundId, amountCents: refund.refunded.amountCents, intent: after };
}
