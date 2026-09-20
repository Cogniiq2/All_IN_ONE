import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * RELEASING A HOLD — verified, or not at all.
 *
 *   releasing → (cancel at Beds24) → (read back) → (check inventory reopened)
 *             → released      the nights are provably free again
 *             → release_failed we asked and do not know. STILL RESERVED.
 *
 * ── The bug this file exists to prevent ──────────────────────────────────
 * The previous implementation logged a failed release and moved on:
 *
 *     } catch (cause) {
 *       logger.error('beds24.hold_release', cause, …);   // and nothing else
 *     }
 *
 * The local status had already moved to `expired`, which took the row out of
 * the exclusion constraint's predicate. So after a failed release BoLaGio
 * advertised the night as free while Beds24 still had it blocked — and the
 * next direct booking would be accepted for nights Booking.com could not sell
 * and we could not deliver.
 *
 * Here, `release_failed` RESERVES. The local range stays blocked until a read
 * of Beds24 says the nights are genuinely open. Being wrong in that direction
 * costs one unsold night; being wrong the other way costs a guest their stay.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { queueReconciliation, transitionIntent } from '@/lib/booking/commands';
import { OPS_CODES } from '@/lib/booking/errors';
import type { BookingLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import { isPaidSide } from '@/lib/booking/states';
import { addDays } from '@/lib/booking/stay-rules';
import { bookingProvider } from '@/lib/integrations/beds24';
import { operationKey, trackedCall } from '@/lib/ops/external-operations';

export type ReleaseResult =
  | { outcome: 'released'; intent: IntentRecord | null }
  | { outcome: 'nothing_to_release'; intent: IntentRecord | null }
  | { outcome: 'failed'; intent: IntentRecord | null; code: 'BEDS24_RELEASE_FAILED' }
  | { outcome: 'unverified'; intent: IntentRecord | null; code: 'BEDS24_RELEASE_UNVERIFIED' }
  | { outcome: 'refused'; intent: IntentRecord };

/**
 * Cancel the Beds24 hold and verify the nights came back.
 *
 * Refuses outright for anything on the paid side. That refusal is not a
 * courtesy — it is the guarantee that no timer, sweep, webhook or retry can
 * take a stay away from a guest who has paid for it. Releasing a paid booking
 * is a human decision, made in Beds24 and then reflected here.
 */
export async function releaseHold(
  intent: IntentRecord,
  reason: string,
  logger: BookingLogger
): Promise<ReleaseResult> {
  if (isPaidSide(intent.status)) {
    logger.warn('beds24.hold_release', {
      reference: intent.reference,
      status: intent.status,
      outcome: 'refused_paid',
    });
    return { outcome: 'refused', intent };
  }

  if (!intent.beds24BookingId) {
    // Nothing was ever created at Beds24, so there is nothing to give back and
    // the local range can be freed immediately.
    const next = await transitionIntent(
      intent.id,
      {
        expected: intent.status,
        to: 'released',
        reason: `${reason}:no_external_hold`,
        patch: { holdExpiresAt: null, lockExpiresAt: null, reconciliationState: 'ok' },
      },
      logger
    );
    return { outcome: 'nothing_to_release', intent: next };
  }

  const bookingId = intent.beds24BookingId;

  const releasing = await transitionIntent(
    intent.id,
    { expected: intent.status, to: 'releasing', reason },
    logger
  );
  if (!releasing) return { outcome: 'nothing_to_release', intent: null };

  try {
    await trackedCall<void>(
      {
        // Keyed on the Beds24 booking id: cancelling twice is the same
        // operation, and the desired end state ("this booking holds no
        // inventory") is idempotent by nature.
        key: operationKey.beds24Release(bookingId),
        provider: 'beds24',
        type: 'release',
        intentId: intent.id,
        request: { bookingId, reason },
        logger,
        isDefiniteFailure: () => false,
        // Idempotent end state: "this booking holds nothing". Re-sending a
        // cancellation after an unknown outcome cannot take anything away twice.
        retryAfterUnknown: true,
      },
      () => bookingProvider().releaseHold(bookingId, reason)
    );
  } catch (cause) {
    return failed(releasing, bookingId, logger);
  }

  /* ── Verify the nights actually reopened ─────────────────────────────── */
  //
  // A 200 from a cancel is not the fact we need. The fact we need is that the
  // night is on sale again — and only the calendar knows that.

  try {
    const days = await bookingProvider().fetchAvailability({
      unit: {
        provider: 'beds24',
        // The snapshotted ids, not the current mapping: this booking must be
        // releasable against the ids it was made with.
        externalPropertyId: intent.beds24PropertyId ?? '',
        externalRoomId: intent.beds24RoomId ?? '',
      },
      from: intent.checkIn,
      to: addDays(intent.checkOut, 1),
    });

    const stillClosed = days.filter(
      (d) => d.date >= intent.checkIn && d.date < intent.checkOut && !d.available
    );
    if (stillClosed.length > 0) {
      /*
       * Beds24 accepted the cancellation and the nights are still closed.
       * Either it has not propagated yet, or something else holds them — a
       * Booking.com reservation that landed in the meantime, which is a
       * perfectly ordinary reason. Either way we cannot assert the nights are
       * ours to sell, so the local range stays reserved and it is re-checked.
       */
      logger.warn('beds24.hold_release', {
        reference: intent.reference,
        providerBookingId: bookingId,
        outcome: 'nights_still_closed',
        count: stillClosed.length,
      });
      return unverified(releasing, bookingId, logger);
    }
  } catch {
    // Could not check. Not evidence the release failed — but not evidence it
    // worked either, and `released` is an assertion we only make on evidence.
    return unverified(releasing, bookingId, logger);
  }

  const released = await transitionIntent(
    intent.id,
    {
      expected: 'releasing',
      to: 'released',
      reason: `${reason}:verified`,
      patch: {
        holdExpiresAt: null,
        lockExpiresAt: null,
        beds24Status: 'cancelled',
        beds24VerifiedAt: new Date().toISOString(),
        reconciliationState: 'ok',
      },
      outbox: {
        type: 'booking.cancelled',
        payload: { reference: intent.reference, reason, unitSlug: intent.unitSlug },
      },
    },
    logger
  );

  logger.info('beds24.hold_release', {
    reference: intent.reference,
    providerBookingId: bookingId,
    outcome: reason,
    verified: true,
  });
  return { outcome: 'released', intent: released };
}

async function failed(
  intent: IntentRecord,
  bookingId: string,
  logger: BookingLogger
): Promise<ReleaseResult> {
  const next = await transitionIntent(
    intent.id,
    {
      expected: 'releasing',
      to: 'release_failed',
      reason: 'release_failed',
      patch: {
        lastFailureCode: 'BEDS24_RELEASE_FAILED',
        lastFailureReason: 'the Beds24 cancellation did not return an outcome',
        reconciliationState: 'pending',
      },
      outbox: {
        type: 'booking.release_failed',
        payload: { reference: intent.reference, code: 'BEDS24_RELEASE_FAILED' },
      },
    },
    logger
  );
  await queueReconciliation(
    intent.id,
    'BEDS24_RELEASE_FAILED',
    OPS_CODES.BEDS24_RELEASE_FAILED,
    { beds24BookingId: bookingId }
  );
  logger.error('beds24.hold_release', undefined, {
    reference: intent.reference,
    providerBookingId: bookingId,
    errorCode: 'BEDS24_RELEASE_FAILED',
  });
  // `release_failed` reserves. The nights stay blocked locally until proven free.
  return { outcome: 'failed', intent: next, code: 'BEDS24_RELEASE_FAILED' };
}

async function unverified(
  intent: IntentRecord,
  bookingId: string,
  logger: BookingLogger
): Promise<ReleaseResult> {
  const next = await transitionIntent(
    intent.id,
    {
      expected: 'releasing',
      to: 'release_failed',
      reason: 'release_unverified',
      patch: {
        lastFailureCode: 'BEDS24_RELEASE_UNVERIFIED',
        lastFailureReason: 'Beds24 accepted the cancellation but the nights are not open',
        reconciliationState: 'pending',
      },
      outbox: {
        type: 'booking.release_failed',
        payload: { reference: intent.reference, code: 'BEDS24_RELEASE_UNVERIFIED' },
      },
    },
    logger
  );
  await queueReconciliation(
    intent.id,
    'BEDS24_RELEASE_UNVERIFIED',
    OPS_CODES.BEDS24_RELEASE_UNVERIFIED,
    { beds24BookingId: bookingId }
  );
  return { outcome: 'unverified', intent: next, code: 'BEDS24_RELEASE_UNVERIFIED' };
}
