/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE HOLD LEASE.
 *
 * The ordering under test is real and routine: a guest completes a PayPal
 * payment at 14:58 and the webhook lands at 15:02. The old sweep released on
 * the clock alone and cancelled paid stays. Every assertion here is one way
 * the lease check must refuse.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Mocks ─────────────────────────────────────────────────────────────── */

let uncertainOperations: unknown[] = [];
let unprocessedEvents: unknown[] = [];
let eventQueryFails = false;
const queued: Array<{ reason: string }> = [];

vi.mock('@/lib/ops/external-operations', () => ({
  findUncertainOperations: async () => uncertainOperations,
}));

vi.mock('@/lib/booking/commands', () => ({
  queueReconciliation: async (_id: string, reason: string) => {
    queued.push({ reason });
    return 'job-1';
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            or: () => ({
              limit: async () =>
                eventQueryFails
                  ? { data: null, error: { code: 'XX000' } }
                  : { data: unprocessedEvents, error: null },
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { evaluateLease } from '@/lib/booking/lease';
import { createLogger } from '@/lib/booking/logger';
import type { IntentRecord } from '@/lib/booking/repository';
import type { BookingState, PaymentState } from '@/lib/booking/states';

const logger = createLogger();
const NOW = new Date('2026-09-17T15:00:00Z');
const ELAPSED = '2026-09-17T14:58:00Z';
const RUNNING = '2026-09-17T15:10:00Z';

function intent(overrides: Partial<IntentRecord> = {}): IntentRecord {
  return {
    id: 'intent-1',
    reference: 'BLG-AAAAAA',
    unitId: 'unit-1',
    unitSlug: 'schulstrasse-i',
    checkIn: '2026-10-20',
    checkOut: '2026-10-23',
    adults: 2,
    children: 0,
    currency: 'EUR',
    quotedTotalCents: 42500,
    quoteComponents: [],
    status: 'hold_created' as BookingState,
    source: 'direct',
    beds24BookingId: '9001',
    paymentProvider: 'paypal',
    paymentSessionId: null,
    quoteExpiresAt: null,
    holdExpiresAt: ELAPSED,
    guest: null,
    paymentStatus: 'order_created' as PaymentState,
    paymentOrderId: 'ORDER-1',
    paymentCaptureId: null,
    paidAmountCents: null,
    paidCurrency: null,
    lockExpiresAt: null,
    beds24PropertyId: '354659',
    beds24RoomId: '731147',
    beds24Status: 'new',
    beds24VerifiedAt: null,
    quoteHash: 'hash',
    lastFailureCode: null,
    reconciliationState: 'ok',
    confirmedAt: null,
    paidAt: null,
    refundedAmountCents: 0,
    cancellationRequestedAt: null,
    cancellationRequestedBy: null,
    cancellationReason: null,
    cancellationAuthorizedBy: null,
    cancellationCompletedAt: null,
    refundState: 'none',
    refundRequiredCents: null,
    refundId: null,
    ...overrides,
  };
}

beforeEach(() => {
  uncertainOperations = [];
  unprocessedEvents = [];
  eventQueryFails = false;
  queued.length = 0;
});

describe('waiting', () => {
  it('does nothing while the lease is still running', async () => {
    const decision = await evaluateLease(intent({ holdExpiresAt: RUNNING }), logger, NOW);
    expect(decision.action).toBe('wait');
  });

  it('does nothing when there is no lease at all', async () => {
    /*
     * A row without a lease has no lease. Inferring one here would mean
     * releasing inventory on a clock we invented; the age-based sweep in the
     * reconciler handles these, where `updated_at` is visible and nothing is
     * on a guest-facing path.
     */
    const decision = await evaluateLease(intent({ holdExpiresAt: null }), logger, NOW);
    expect(decision.action).toBe('wait');
  });
});

describe('releasing', () => {
  it('releases an elapsed lease with no payment evidence whatsoever', async () => {
    const decision = await evaluateLease(
      intent({ paymentStatus: 'not_created', paymentOrderId: null }),
      logger,
      NOW
    );
    expect(decision.action).toBe('release');
  });

  it('releases when the provider definitively said no', async () => {
    for (const state of ['denied', 'cancelled'] as PaymentState[]) {
      const decision = await evaluateLease(intent({ paymentStatus: state }), logger, NOW);
      expect(decision.action, `payment ${state}`).toBe('release');
    }
  });
});

describe('refusing to release', () => {
  it('refuses for anything on the paid side, however old the lease', async () => {
    for (const status of [
      'paid', 'finalizing', 'confirmed', 'paid_unfinalized', 'finalization_failed',
    ] as BookingState[]) {
      const decision = await evaluateLease(
        intent({ status, holdExpiresAt: '2020-01-01T00:00:00Z' }),
        logger,
        NOW
      );
      expect(decision.action, status).toBe('hold');
    }
  });

  it('refuses while a capture is pending', async () => {
    // PENDING is PayPal saying the money may yet arrive. Cancelling here
    // cancels a stay that is about to be paid for.
    const decision = await evaluateLease(intent({ paymentStatus: 'capture_pending' }), logger, NOW);
    expect(decision.action).toBe('hold');
    expect(queued.map((q) => q.reason)).toContain('BOOKING_LEASE_HELD_FOR_PAYMENT');
  });

  it('refuses while the guest has approved but we have not captured', async () => {
    const decision = await evaluateLease(intent({ paymentStatus: 'approved' }), logger, NOW);
    expect(decision.action).toBe('hold');
  });

  it('refuses while the payment state is unknown', async () => {
    const decision = await evaluateLease(intent({ paymentStatus: 'unknown' }), logger, NOW);
    expect(decision.action).toBe('hold');
  });

  it('refuses while an external operation has no known outcome', async () => {
    // A capture whose answer was lost. Releasing would be gambling that the
    // money did not move.
    uncertainOperations = [{ id: 'op-1', outcome: 'outcome_unknown' }];
    const decision = await evaluateLease(
      intent({ paymentStatus: 'not_created', paymentOrderId: null }),
      logger,
      NOW
    );
    expect(decision.action).toBe('hold');
  });

  it('refuses while a VERIFIED webhook sits unprocessed in the inbox', async () => {
    /*
     * The subtle one. PayPal told us the capture completed, the ingress stored
     * it, and the processor has not run yet. A timer-driven release here
     * cancels a stay we have already been told was paid for.
     */
    unprocessedEvents = [{ id: 'event-1' }];
    const decision = await evaluateLease(
      intent({ paymentStatus: 'not_created', paymentOrderId: null }),
      logger,
      NOW
    );
    expect(decision.action).toBe('hold');
  });

  it('refuses when it cannot CHECK for unprocessed events', async () => {
    // A failure to rule money out is not a licence to release.
    eventQueryFails = true;
    const decision = await evaluateLease(
      intent({ paymentStatus: 'not_created', paymentOrderId: null }),
      logger,
      NOW
    );
    expect(decision.action).toBe('hold');
  });
});

describe('the decision is always explained', () => {
  it('carries an operational code when it holds', async () => {
    const decision = await evaluateLease(intent({ paymentStatus: 'capture_pending' }), logger, NOW);
    expect(decision.action === 'hold' && decision.code).toBe('BOOKING_LEASE_HELD_FOR_PAYMENT');
    expect(decision.reason.length).toBeGreaterThan(0);
  });
});
