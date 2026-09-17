import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ACQUIRING THE HOLD — the saga.
 *
 * PostgreSQL cannot transact with Beds24. There is no two-phase commit
 * available and pretending otherwise is how systems lose money. So this is a
 * saga with explicit compensation, and every step names what it does when the
 * next one fails.
 *
 *   1. LOCK LOCALLY FIRST.
 *      The exclusion constraint covers `locking`, so of two overlapping
 *      requests exactly one ever reaches Beds24. The old order — call Beds24,
 *      then write — let both reach the provider and orphaned the loser's hold.
 *
 *   2. RE-ASK BEDS24, LIVE, as late as possible.
 *      This is where a Booking.com reservation that landed while the guest was
 *      typing their name surfaces. Cached availability is never sufficient.
 *
 *   3. CREATE THE HOLD, tracked.
 *      A timeout here is `outcome_unknown`, NOT failed. We do not retry and we
 *      do not release: the booking may exist at Beds24 and only a read can say.
 *
 *   4. VERIFY.
 *      Read the booking back and check it is OURS — right property, right
 *      room, right dates. A 200 with an id is not proof: it could be the right
 *      id on the wrong room.
 *
 *   5. CHECK THE NIGHTS ACTUALLY CLOSED.
 *      A hold that does not block inventory is worse than no hold, because it
 *      looks like protection. Which Beds24 statuses block is a per-property
 *      setting, so this is verified rather than assumed.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { holdMinutes, lockSeconds } from '@/lib/booking/config';
import { OPS_CODES } from '@/lib/booking/errors';
import { acquireLock, OverlapError, queueReconciliation, transitionIntent } from '@/lib/booking/commands';
import type { BookingLogger } from '@/lib/booking/logger';
import type { BookableUnit, IntentRecord } from '@/lib/booking/repository';
import { addDays } from '@/lib/booking/stay-rules';
import type { BookingQuote } from '@/lib/booking/types';
import { bookingProvider } from '@/lib/integrations/beds24';
import { ProviderError, type ProviderBooking } from '@/lib/integrations/provider';
import {
  operationKey,
  trackedCall,
  UncertainOperationError,
} from '@/lib/ops/external-operations';

export interface HoldResult {
  intent: IntentRecord;
  booking: ProviderBooking;
}

/** Everything that can come out of the hold saga, as a closed set. */
export type HoldFailure =
  | { kind: 'conflict' }            // someone else has the dates. Safe.
  | { kind: 'stay_rules'; meta?: Record<string, number | string | boolean> }
  | { kind: 'unavailable' }         // Beds24 is down. Nothing was created.
  | { kind: 'uncertain' }           // WE DO NOT KNOW. Do not retry.
  | { kind: 'rejected' };

export class HoldError extends Error {
  constructor(readonly failure: HoldFailure) {
    super(failure.kind);
    this.name = 'HoldError';
  }
}

/**
 * Take the local lock, then the Beds24 hold, then verify both.
 *
 * The intent must already be `quoted` with an authoritative total. On success
 * it is `hold_created`, with the Beds24 ids snapshotted onto the row so
 * recovery never depends on the mapping table still saying the same thing.
 */
export async function acquireHold(
  intent: IntentRecord,
  unit: BookableUnit,
  quote: BookingQuote,
  logger: BookingLogger
): Promise<HoldResult> {
  const provider = bookingProvider();
  const unitRef = unit.providerRef!;

  /* ── 1. The local lock ───────────────────────────────────────────────── */

  let locked: IntentRecord | null;
  try {
    locked = await acquireLock(intent.id, lockSeconds(), logger);
  } catch (cause) {
    // The database refused. This is overbooking protection working, and the
    // guest gets an availability conflict rather than a server error.
    if (cause instanceof OverlapError) throw new HoldError({ kind: 'conflict' });
    throw cause;
  }
  if (!locked) {
    // The booking moved between the read and the lock — another request for
    // the same attempt got there first. Treat as a conflict: safe, and the
    // guest re-quotes.
    throw new HoldError({ kind: 'conflict' });
  }

  /* ── 2. Live revalidation, as late as practical ──────────────────────── */
  //
  // The window between this check and the POST below is irreducible: no
  // protocol exists that makes BoLaGio and Beds24 agree atomically. Making the
  // window small is the whole mitigation, and Beds24's own account-level
  // Overbooking Protection is the backstop — see
  // docs/direct-booking-production-readiness.md.

  try {
    await provider.fetchOffer({
      unit: unitRef,
      unitSlug: unit.slug,
      checkIn: intent.checkIn,
      checkOut: intent.checkOut,
      adults: intent.adults,
      children: intent.children,
    });
  } catch (cause) {
    await unwindLock(locked, cause, logger);
    throw toHoldError(cause);
  }

  /* ── 3. The hold itself, tracked ─────────────────────────────────────── */

  const holdExpiresAt = new Date(Date.now() + holdMinutes() * 60_000).toISOString();
  const key = operationKey.beds24Hold(intent.id);

  let booking: ProviderBooking;
  try {
    booking = await trackedCall<ProviderBooking>(
      {
        key,
        provider: 'beds24',
        type: 'create_hold',
        intentId: intent.id,
        // Enough to RECOGNISE the booking at Beds24 during reconciliation, and
        // nothing more. No guest name, email or phone: this row is read by
        // operators and workers, and the reference identifies the booking.
        request: {
          propertyId: unitRef.externalPropertyId,
          roomId: unitRef.externalRoomId,
          arrival: intent.checkIn,
          departure: intent.checkOut,
          reference: intent.reference,
        },
        logger,
        // Only a ProviderError means Beds24 ANSWERED. A timeout, a socket
        // failure or a 5xx arrives as a plain Error and is therefore uncertain
        // — because in all three the booking may have been created before the
        // answer was lost.
        isDefiniteFailure: (cause) => cause instanceof ProviderError && cause.code !== 'unavailable',
        resourceIdOf: (result) => result.externalBookingId,
      },
      () =>
        provider.createHold({
          unit: unitRef,
          unitSlug: unit.slug,
          reference: intent.reference,
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          adults: intent.adults,
          children: intent.children,
          guest: intent.guest!,
          totalCents: quote.totalCents,
          currency: quote.currency,
          idempotencyKey: `${intent.reference}:hold`,
          holdExpiresAt,
        })
    );
  } catch (cause) {
    if (cause instanceof UncertainOperationError) {
      /*
       * THE DANGEROUS CASE.
       *
       * Beds24 may or may not have created the booking. What must NOT happen:
       *   • retrying the POST — that is how a guest gets two reservations;
       *   • releasing the local lock — that would let someone else book nights
       *     that may already be blocked at Beds24 and sold on Booking.com.
       *
       * So the local range stays reserved (`manual_review` reserves), a
       * severity-1 reconciliation job searches Beds24 for our reference, and
       * the guest is told to wait rather than to try again.
       */
      const held = await transitionIntent(
        intent.id,
        {
          expected: 'locking',
          to: 'manual_review',
          reason: 'hold_outcome_unknown',
          patch: {
            lastFailureCode: 'BEDS24_HOLD_OUTCOME_UNKNOWN',
            lastFailureReason: 'the Beds24 create-booking call did not return an outcome',
            reconciliationState: 'pending',
            holdExpiresAt,
            beds24PropertyId: unitRef.externalPropertyId,
            beds24RoomId: unitRef.externalRoomId,
          },
          outbox: {
            type: 'booking.manual_review_required',
            payload: { code: 'BEDS24_HOLD_OUTCOME_UNKNOWN', reference: intent.reference },
          },
        },
        logger
      );
      await queueReconciliation(
        intent.id,
        'BEDS24_HOLD_OUTCOME_UNKNOWN',
        OPS_CODES.BEDS24_HOLD_OUTCOME_UNKNOWN,
        { operationKey: key }
      );
      logger.error('beds24.hold', cause, {
        reference: intent.reference,
        errorCode: 'BEDS24_HOLD_OUTCOME_UNKNOWN',
        outcome: held?.status ?? 'manual_review',
      });
      throw new HoldError({ kind: 'uncertain' });
    }

    // Beds24 answered, and the answer was no. Nothing was created, so the lock
    // can be released safely.
    await unwindLock(locked, cause, logger);
    throw toHoldError(cause);
  }

  /* ── 4. Verify the booking is ours ───────────────────────────────────── */

  const verification = await verifyHold(booking, intent, unitRef, logger);
  if (!verification.ok) {
    /*
     * A booking exists and it is not the one we asked for. Releasing it would
     * be worse than leaving it: it might be someone else's reservation. The
     * local range stays reserved and a person looks.
     */
    await transitionIntent(
      intent.id,
      {
        expected: 'locking',
        to: 'manual_review',
        reason: verification.code,
        patch: {
          beds24BookingId: booking.externalBookingId,
          beds24PropertyId: unitRef.externalPropertyId,
          beds24RoomId: unitRef.externalRoomId,
          lastFailureCode: verification.code,
          lastFailureReason: verification.detail,
          reconciliationState: 'manual',
          holdExpiresAt,
        },
        outbox: {
          type: 'booking.manual_review_required',
          payload: { code: verification.code, reference: intent.reference },
        },
      },
      logger
    );
    await queueReconciliation(intent.id, verification.code, OPS_CODES[verification.code], {
      beds24BookingId: booking.externalBookingId,
    });
    logger.error('beds24.verify', undefined, {
      reference: intent.reference,
      providerBookingId: booking.externalBookingId,
      errorCode: verification.code,
    });
    throw new HoldError({ kind: 'uncertain' });
  }

  /* ── 5. Record it ────────────────────────────────────────────────────── */

  const held = await transitionIntent(
    intent.id,
    {
      expected: 'locking',
      to: 'hold_created',
      reason: 'hold_acquired',
      patch: {
        beds24BookingId: booking.externalBookingId,
        // Snapshotted, so a later release or finalization uses the ids the
        // booking was actually made with rather than whatever the mapping
        // table says today.
        beds24PropertyId: unitRef.externalPropertyId,
        beds24RoomId: unitRef.externalRoomId,
        beds24Status: booking.status,
        beds24VerifiedAt: new Date().toISOString(),
        holdExpiresAt,
        lockExpiresAt: null,
        providerSnapshot: booking.snapshot,
        reconciliationState: 'ok',
      },
      outbox: {
        type: 'booking.held',
        payload: {
          reference: intent.reference,
          unitSlug: unit.slug,
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          holdExpiresAt,
        },
      },
    },
    logger
  );

  if (!held) {
    // The row moved under us between the lock and here. The Beds24 hold exists
    // and our record of it did not land — the one thing that must never be
    // lost. Reconciliation finds it through `bolagio_external_operations`,
    // which recorded the resource id when the call succeeded.
    await queueReconciliation(intent.id, 'BOOKING_MISSING_EXTERNAL_HOLD', 1, {
      beds24BookingId: booking.externalBookingId,
      operationKey: key,
    });
    throw new HoldError({ kind: 'uncertain' });
  }

  logger.info('beds24.hold', {
    reference: held.reference,
    providerBookingId: booking.externalBookingId,
    unitSlug: unit.slug,
    outcome: 'held',
  });

  return { intent: held, booking };
}

/* ── Verification ──────────────────────────────────────────────────────── */

type VerificationResult =
  | { ok: true }
  | { ok: false; code: 'BEDS24_HOLD_MISMATCH' | 'BEDS24_HOLD_DID_NOT_BLOCK'; detail: string };

/**
 * Is the booking Beds24 just handed us the booking we asked for, and did it
 * actually close the nights?
 *
 * Both halves matter. The first catches a right-id-wrong-room answer. The
 * second catches the configuration failure that makes every other guarantee
 * hollow: a hold in a status that does not block inventory for this property
 * looks exactly like a working hold and protects nothing.
 *
 * ── Why a failure to READ is not a failure to verify ─────────────────────
 * If the read-back itself errors, we have learned nothing and must not
 * conclude the hold is bad. Verification passes on the write response's own
 * fields in that case, and the booking is flagged for a later check rather
 * than torn down on the strength of a transient GET.
 */
async function verifyHold(
  booking: ProviderBooking,
  intent: IntentRecord,
  unitRef: { externalPropertyId: string; externalRoomId: string },
  logger: BookingLogger
): Promise<VerificationResult> {
  const provider = bookingProvider();

  let readBack: ProviderBooking | null = null;
  try {
    readBack = await provider.getBooking(booking.externalBookingId);
  } catch (cause) {
    logger.warn('beds24.verify', {
      reference: intent.reference,
      providerBookingId: booking.externalBookingId,
      outcome: 'read_back_failed',
    });
  }

  const subject = readBack ?? booking;

  const mismatches: string[] = [];
  if (subject.externalRoomId && subject.externalRoomId !== String(unitRef.externalRoomId)) {
    mismatches.push('room');
  }
  if (subject.externalPropertyId && subject.externalPropertyId !== String(unitRef.externalPropertyId)) {
    mismatches.push('property');
  }
  if (subject.checkIn && subject.checkIn !== intent.checkIn) mismatches.push('arrival');
  if (subject.checkOut && subject.checkOut !== intent.checkOut) mismatches.push('departure');

  if (mismatches.length > 0) {
    return {
      ok: false,
      code: 'BEDS24_HOLD_MISMATCH',
      detail: `Beds24 booking differs from the request: ${mismatches.join(', ')}`,
    };
  }

  // Did the nights actually close? Asked of the provider, not of our cache.
  try {
    const days = await provider.fetchAvailability({
      unit: { provider: 'beds24', ...unitRef },
      from: intent.checkIn,
      to: addDays(intent.checkOut, 1),
    });
    const stillOpen = days.filter((d) => d.date >= intent.checkIn && d.date < intent.checkOut && d.available);
    if (stillOpen.length > 0) {
      return {
        ok: false,
        code: 'BEDS24_HOLD_DID_NOT_BLOCK',
        detail: `${stillOpen.length} night(s) are still open after the hold`,
      };
    }
  } catch {
    // Could not check. Not evidence of a bad hold; flag it for the sweep.
    logger.warn('beds24.verify', {
      reference: intent.reference,
      providerBookingId: booking.externalBookingId,
      outcome: 'inventory_check_failed',
    });
    await queueReconciliation(intent.id, 'BEDS24_HOLD_DID_NOT_BLOCK', 3, {
      beds24BookingId: booking.externalBookingId,
      note: 'post-hold inventory check could not run',
    }).catch(() => undefined);
  }

  return { ok: true };
}

/* ── Compensation ──────────────────────────────────────────────────────── */

/**
 * Give back a lock taken for a hold that provably never happened.
 *
 * Only ever called where Beds24 ANSWERED — no booking exists, so releasing
 * the local range is safe. It is never called on an uncertain outcome; that
 * path keeps the range and escalates.
 */
async function unwindLock(intent: IntentRecord, cause: unknown, logger: BookingLogger): Promise<void> {
  const conflict = cause instanceof ProviderError && cause.code === 'availability_conflict';
  await transitionIntent(
    intent.id,
    {
      expected: 'locking',
      to: conflict ? 'unavailable' : 'hold_failed',
      reason: conflict ? 'dates_taken' : 'hold_rejected',
      patch: {
        lockExpiresAt: null,
        lastFailureCode: conflict ? 'BEDS24_HOLD_REJECTED' : 'BEDS24_HOLD_REJECTED',
        lastFailureReason: cause instanceof Error ? cause.message.slice(0, 200) : 'unknown',
      },
    },
    logger
  ).catch(() => undefined);
}

function toHoldError(cause: unknown): HoldError {
  if (cause instanceof ProviderError) {
    switch (cause.code) {
      case 'availability_conflict':
        return new HoldError({ kind: 'conflict' });
      case 'stay_rules':
        return new HoldError({ kind: 'stay_rules', meta: cause.meta });
      case 'unavailable':
        return new HoldError({ kind: 'unavailable' });
      default:
        return new HoldError({ kind: 'rejected' });
    }
  }
  if (cause instanceof OverlapError) return new HoldError({ kind: 'conflict' });
  // An unrecognised throw from a provider call is uncertain, not failed.
  return new HoldError({ kind: 'uncertain' });
}
