import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINALIZATION — turning a paid hold into a confirmed reservation.
 *
 *   paid → finalizing → (update the EXISTING Beds24 booking) → read back
 *        → verify → confirmed
 *
 * ── The rule that governs this whole file ────────────────────────────────
 * NO SECOND BOOKING IS EVER CREATED. The reservation already exists at Beds24;
 * payment promotes it. Creating a new one after payment would leave the
 * original hold blocking the same nights and the guest holding two
 * reservations, one of which nobody is tracking.
 *
 * ── And the rule that governs the failure path ───────────────────────────
 * A payment that succeeded is NEVER undone because a Beds24 call failed.
 * There is no branch in this file that releases inventory, cancels a booking
 * or issues a refund. The failure of a channel-manager update is an
 * operational problem; the guest's money and their nights are not the thing
 * that gives way when we have an operational problem.
 *
 *   paid + Beds24 update failed  →  paid_unfinalized / finalization_failed
 *                                   hold STAYS in place
 *                                   severity-1 reconciliation job
 *                                   retried against the SAME booking id
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beds24ConfirmedStatus } from '@/lib/booking/config';
import { queueReconciliation, transitionIntent } from '@/lib/booking/commands';
import { OPS_CODES } from '@/lib/booking/errors';
import type { BookingLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import { bookingProvider } from '@/lib/integrations/beds24';
import type { ProviderBooking } from '@/lib/integrations/provider';
import { operationKey, trackedCall, UncertainOperationError } from '@/lib/ops/external-operations';

export type FinalizationResult =
  | { outcome: 'confirmed'; intent: IntentRecord }
  | { outcome: 'unfinalized'; intent: IntentRecord | null; code: 'BEDS24_FINALIZATION_FAILED' }
  | { outcome: 'unverified'; intent: IntentRecord | null; code: 'BEDS24_FINALIZATION_UNVERIFIED' }
  | { outcome: 'not_applicable'; intent: IntentRecord };

/**
 * Promote a paid booking at Beds24 and verify it landed.
 *
 * Safe to call repeatedly: it is the retry path as well as the first attempt,
 * which is why reconciliation calls exactly this function rather than a
 * parallel implementation that could drift from it.
 */
export async function finalizeBooking(
  intent: IntentRecord,
  logger: BookingLogger
): Promise<FinalizationResult> {
  if (intent.status === 'confirmed') return { outcome: 'confirmed', intent };

  if (!intent.beds24BookingId) {
    /*
     * Paid, and we have no Beds24 booking id to promote. Either the hold was
     * never created, or the id was lost. Creating one now is exactly what this
     * file must not do — a reconciliation search may still find a hold that
     * exists, and creating a second would double-book the guest.
     */
    const next = await transitionIntent(
      intent.id,
      {
        expected: intent.status,
        to: 'manual_review',
        reason: 'finalize_without_booking_id',
        patch: {
          lastFailureCode: 'BOOKING_MISSING_EXTERNAL_HOLD',
          lastFailureReason: 'paid booking has no Beds24 booking id to finalize',
          reconciliationState: 'manual',
        },
        outbox: {
          type: 'booking.manual_review_required',
          payload: { code: 'BOOKING_MISSING_EXTERNAL_HOLD', reference: intent.reference },
        },
      },
      logger
    );
    await queueReconciliation(intent.id, 'BOOKING_MISSING_EXTERNAL_HOLD', 1);
    return { outcome: 'unfinalized', intent: next, code: 'BEDS24_FINALIZATION_FAILED' };
  }

  const bookingId = intent.beds24BookingId;

  const finalizing = await transitionIntent(
    intent.id,
    { expected: intent.status, to: 'finalizing', reason: 'finalization_started' },
    logger
  );
  if (!finalizing) {
    // Something else is already finalizing, or the booking moved on. Either
    // way this call has nothing to do — and doing it anyway would be a second
    // concurrent update of the same Beds24 booking.
    return { outcome: 'not_applicable', intent };
  }

  let updated: ProviderBooking;
  try {
    updated = await trackedCall<ProviderBooking>(
      {
        // Keyed on the BEDS24 BOOKING ID, not on the attempt. Every retry of
        // this finalization is the same logical operation on the same booking.
        key: operationKey.beds24Finalize(bookingId),
        provider: 'beds24',
        type: 'finalize',
        intentId: intent.id,
        request: { bookingId, targetStatus: beds24ConfirmedStatus() },
        logger,
        isDefiniteFailure: () => false,
        resourceIdOf: () => bookingId,
      },
      () => bookingProvider().confirmBooking(bookingId)
    );
  } catch (cause) {
    const uncertain = cause instanceof UncertainOperationError;
    return unfinalized(
      finalizing,
      uncertain
        ? 'the Beds24 update did not return an outcome'
        : 'the Beds24 update was rejected',
      logger
    );
  }

  /* ── Read it back ─────────────────────────────────────────────────────── */
  //
  // The update response is Beds24's account of what it did. This is what is
  // actually there — and it is the check that makes `BEDS24_CONFIRMED_STATUS`
  // safe to have as a configurable value we have not proven live: a wrong
  // status fails here, loudly, with the hold still in place.

  let readBack: ProviderBooking | null = null;
  try {
    readBack = await bookingProvider().getBooking(bookingId);
  } catch {
    readBack = null;
  }

  const observed = readBack?.status ?? updated.status;
  const expected = beds24ConfirmedStatus();

  if (!observed) {
    // Cannot see what it is. Not evidence of failure, and not evidence of
    // success either — so it does not become `confirmed`.
    logger.warn('beds24.finalize', {
      reference: intent.reference,
      providerBookingId: bookingId,
      outcome: 'status_unreadable',
    });
    return unverified(finalizing, 'Beds24 did not return a status to verify', logger);
  }

  if (observed.toLowerCase() !== expected.toLowerCase()) {
    logger.error('beds24.finalize', undefined, {
      reference: intent.reference,
      providerBookingId: bookingId,
      expected,
      actual: observed,
      errorCode: 'BEDS24_FINALIZATION_UNVERIFIED',
    });
    return unverified(
      finalizing,
      `Beds24 booking is "${observed}" after finalization, expected "${expected}"`,
      logger
    );
  }

  const confirmed = await transitionIntent(
    intent.id,
    {
      expected: 'finalizing',
      to: 'confirmed',
      reason: 'finalized',
      patch: {
        beds24Status: observed,
        beds24VerifiedAt: new Date().toISOString(),
        providerSnapshot: readBack?.snapshot ?? updated.snapshot,
        reconciliationState: 'ok',
        // The lease is over: the booking is confirmed, not held.
        holdExpiresAt: null,
      },
      outbox: {
        type: 'booking.confirmed',
        payload: {
          reference: intent.reference,
          unitSlug: intent.unitSlug,
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          amountCents: intent.quotedTotalCents ?? undefined,
          currency: intent.currency,
        },
      },
    },
    logger
  );

  if (!confirmed) return { outcome: 'not_applicable', intent: finalizing };

  logger.info('beds24.finalize', {
    reference: confirmed.reference,
    providerBookingId: bookingId,
    outcome: 'confirmed',
    verified: true,
  });
  return { outcome: 'confirmed', intent: confirmed };
}

/**
 * The paid-but-not-finalized landing.
 *
 * Note what is absent: no release, no cancel, no refund. The Beds24 hold stays
 * exactly where it is, so the guest's nights remain blocked on Booking.com and
 * Airbnb while a person or a retry sorts it out.
 */
async function unfinalized(
  intent: IntentRecord,
  reason: string,
  logger: BookingLogger
): Promise<FinalizationResult> {
  const next = await transitionIntent(
    intent.id,
    {
      expected: 'finalizing',
      to: 'finalization_failed',
      reason: 'finalization_failed',
      patch: {
        lastFailureCode: 'BEDS24_FINALIZATION_FAILED',
        lastFailureReason: reason,
        reconciliationState: 'pending',
      },
      outbox: {
        type: 'booking.paid_unfinalized',
        payload: {
          reference: intent.reference,
          code: 'BEDS24_FINALIZATION_FAILED',
          amountCents: intent.paidAmountCents ?? intent.quotedTotalCents ?? undefined,
          currency: intent.paidCurrency ?? intent.currency,
        },
      },
    },
    logger
  );
  await queueReconciliation(
    intent.id,
    'PAID_BOOKING_UNFINALIZED',
    OPS_CODES.PAID_BOOKING_UNFINALIZED,
    { beds24BookingId: intent.beds24BookingId }
  );
  logger.error('beds24.finalize', undefined, {
    reference: intent.reference,
    providerBookingId: intent.beds24BookingId ?? undefined,
    errorCode: 'BEDS24_FINALIZATION_FAILED',
  });
  return { outcome: 'unfinalized', intent: next, code: 'BEDS24_FINALIZATION_FAILED' };
}

/** Beds24 answered, but not with the status we asked for. Also never releases. */
async function unverified(
  intent: IntentRecord,
  reason: string,
  logger: BookingLogger
): Promise<FinalizationResult> {
  const next = await transitionIntent(
    intent.id,
    {
      expected: 'finalizing',
      to: 'paid_unfinalized',
      reason: 'finalization_unverified',
      patch: {
        lastFailureCode: 'BEDS24_FINALIZATION_UNVERIFIED',
        lastFailureReason: reason,
        reconciliationState: 'pending',
      },
      outbox: {
        type: 'booking.paid_unfinalized',
        payload: { reference: intent.reference, code: 'BEDS24_FINALIZATION_UNVERIFIED' },
      },
    },
    logger
  );
  await queueReconciliation(
    intent.id,
    'BEDS24_FINALIZATION_UNVERIFIED',
    OPS_CODES.BEDS24_FINALIZATION_UNVERIFIED,
    { beds24BookingId: intent.beds24BookingId }
  );
  return { outcome: 'unverified', intent: next, code: 'BEDS24_FINALIZATION_UNVERIFIED' };
}
