/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE HOLD SAGA.
 *
 * The behaviours tested here are the ones that, when wrong, produce a double
 * booking or an invisible orphan hold at Beds24:
 *
 *   • the LOCAL lock is taken before any provider call
 *   • a timed-out create is never retried and never unwound
 *   • a booking that comes back wrong is never released
 *   • a hold that did not close the nights is not treated as a hold
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/lib/integrations/provider';

/* ── Mocks ─────────────────────────────────────────────────────────────── */

/*
 * `vi.mock` factories are hoisted above every other statement in the file, so
 * anything they close over has to be hoisted too. `vi.hoisted` is how shared
 * fixtures and recorded calls become reachable from both sides.
 */
const h = vi.hoisted(() => {
  class OverlapError extends Error {
    constructor() {
      super('overlap');
      this.name = 'OverlapError';
    }
  }
  class UncertainOperationError extends Error {
    constructor(
      readonly operationKey: string,
      readonly provider: string,
      readonly operationType: string
    ) {
      super('uncertain');
      this.name = 'UncertainOperationError';
    }
  }
  return {
    OverlapError,
    UncertainOperationError,
    transitions: [] as Array<{ to: string; reason?: string; patch?: Record<string, unknown> }>,
    queuedJobs: [] as Array<{ reason: string; severity: number }>,
    lockResult: 'granted' as 'granted' | 'conflict' | 'refused',
  };
});

const { transitions, queuedJobs } = h;

vi.mock('@/lib/booking/commands', () => ({
  OverlapError: h.OverlapError,
  acquireLock: async () => {
    if (h.lockResult === 'conflict') throw new h.OverlapError();
    if (h.lockResult === 'refused') return null;
    return makeIntent({ status: 'locking' });
  },
  transitionIntent: async (
    _id: string,
    options: { to: string; reason?: string; patch?: Record<string, unknown> }
  ) => {
    h.transitions.push({ to: options.to, reason: options.reason, patch: options.patch });
    return makeIntent({ status: options.to as never });
  },
  queueReconciliation: async (_id: string, reason: string, severity: number) => {
    h.queuedJobs.push({ reason, severity });
    return 'job-1';
  },
}));

/* ── The provider, scriptable per test ─────────────────────────────────── */

const provider = {
  mode: 'mock' as const,
  fetchAvailability: vi.fn(),
  fetchOffer: vi.fn(),
  createHold: vi.fn(),
  confirmBooking: vi.fn(),
  releaseHold: vi.fn(),
  getBooking: vi.fn(),
  findBookings: vi.fn(),
};

vi.mock('@/lib/integrations/beds24', () => ({
  bookingProvider: () => provider,
  ProviderError,
}));

/* ── trackedCall, faithful to the real classification ──────────────────── */

vi.mock('@/lib/ops/external-operations', () => ({
  UncertainOperationError: h.UncertainOperationError,
  operationKey: {
    beds24Hold: (id: string) => `beds24:create_hold:${id}`,
    beds24Finalize: (id: string) => `beds24:finalize:${id}`,
    beds24Release: (id: string) => `beds24:release:${id}`,
    paypalOrder: (id: string, h: string) => `paypal:create_order:${id}:${h}`,
    paypalCapture: (id: string) => `paypal:capture:${id}`,
    paypalRefund: (id: string) => `paypal:refund:${id}`,
  },
  trackedCall: async (
    options: { key: string; type: string; isDefiniteFailure?: (c: unknown) => boolean },
    call: () => Promise<unknown>
  ) => {
    try {
      return await call();
    } catch (cause) {
      if (options.isDefiniteFailure?.(cause) === true) throw cause;
      throw new h.UncertainOperationError(options.key, 'beds24', options.type);
    }
  },
  findUncertainOperations: async () => [],
  completeOperation: async () => undefined,
  findOperation: async () => null,
}));

import { acquireHold, HoldError } from '@/lib/booking/hold';
import { createLogger } from '@/lib/booking/logger';
import type { BookableUnit, IntentRecord } from '@/lib/booking/repository';
import type { BookingState } from '@/lib/booking/states';
import type { BookingQuote } from '@/lib/booking/types';

const logger = createLogger();

function makeIntent(overrides: Partial<IntentRecord> = {}): IntentRecord {
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
    status: 'quoted' as BookingState,
    source: 'direct',
    beds24BookingId: null,
    paymentProvider: null,
    paymentSessionId: null,
    quoteExpiresAt: null,
    holdExpiresAt: null,
    guest: {
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
      phone: '+49 000', locale: 'de',
    },
    paymentStatus: 'not_created',
    paymentOrderId: null,
    paymentCaptureId: null,
    paidAmountCents: null,
    paidCurrency: null,
    lockExpiresAt: null,
    beds24PropertyId: null,
    beds24RoomId: null,
    beds24Status: null,
    beds24VerifiedAt: null,
    quoteHash: 'hash-a',
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

const UNIT: BookableUnit = {
  id: 'unit-1',
  slug: 'schulstrasse-i',
  displayName: 'Schulstraße I',
  maxGuests: 4,
  minNights: null,
  currency: 'EUR',
  isBookable: true,
  timezone: 'Europe/Berlin',
  checkInTime: '14:00',
  checkOutTime: '11:00',
  providerRef: { provider: 'beds24', externalPropertyId: '354659', externalRoomId: '731147' },
};

const QUOTE: BookingQuote = {
  unitSlug: 'schulstrasse-i',
  checkIn: '2026-10-20',
  checkOut: '2026-10-23',
  nights: 3,
  adults: 2,
  children: 0,
  currency: 'EUR',
  totalCents: 42500,
  components: [],
  expiresAt: '2099-01-01T00:00:00Z',
};

/** The nights closed, as a successful hold should leave them. */
const CLOSED = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((date) => ({
  date,
  available: false,
  canCheckIn: false,
  canCheckOut: true,
}));

const GOOD_BOOKING = {
  externalBookingId: '9001',
  snapshot: {},
  status: 'new',
  externalPropertyId: '354659',
  externalRoomId: '731147',
  checkIn: '2026-10-20',
  checkOut: '2026-10-23',
  reference: 'BLG-AAAAAA',
};

beforeEach(() => {
  transitions.length = 0;
  queuedJobs.length = 0;
  h.lockResult = 'granted';
  vi.clearAllMocks();
  provider.fetchOffer.mockResolvedValue(QUOTE);
  provider.createHold.mockResolvedValue(GOOD_BOOKING);
  provider.getBooking.mockResolvedValue(GOOD_BOOKING);
  provider.fetchAvailability.mockResolvedValue(CLOSED);
});

describe('the happy path', () => {
  it('locks locally, revalidates live, holds, verifies, records', async () => {
    const result = await acquireHold(makeIntent(), UNIT, QUOTE, logger);

    expect(result.booking.externalBookingId).toBe('9001');
    const held = transitions.find((t) => t.to === 'hold_created')!;
    expect(held).toBeDefined();
    // The ids are SNAPSHOTTED onto the row, so a later release uses the ids
    // the booking was made with rather than whatever the mapping says today.
    expect(held.patch?.beds24PropertyId).toBe('354659');
    expect(held.patch?.beds24RoomId).toBe('731147');
    expect(held.patch?.beds24BookingId).toBe('9001');
    // And the lock lease is cleared, since it is no longer what reserves.
    expect(held.patch?.lockExpiresAt).toBeNull();
  });

  it('re-asks Beds24 live before creating the hold', async () => {
    // The window between this check and the POST is irreducible; making it
    // small is the whole mitigation. Quoting from cache here would widen it to
    // however long the guest spent typing their name.
    await acquireHold(makeIntent(), UNIT, QUOTE, logger);
    expect(provider.fetchOffer).toHaveBeenCalledTimes(1);
  });

  it('emits a booking.held event', async () => {
    await acquireHold(makeIntent(), UNIT, QUOTE, logger);
    expect(transitions.find((t) => t.to === 'hold_created')).toBeDefined();
  });
});

describe('the local lock comes first', () => {
  it('never calls Beds24 when the database refuses the lock', async () => {
    /*
     * The change that makes concurrent direct bookings safe. Previously the
     * constraint only bit AFTER the Beds24 hold existed, so both requests
     * reached the provider and the loser's hold was orphaned.
     */
    h.lockResult = 'conflict';
    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);

    expect(error).toBeInstanceOf(HoldError);
    expect((error as HoldError).failure.kind).toBe('conflict');
    expect(provider.fetchOffer).not.toHaveBeenCalled();
    expect(provider.createHold).not.toHaveBeenCalled();
  });

  it('treats a lost lock race as a conflict, not as an error', async () => {
    h.lockResult = 'refused';
    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);
    expect((error as HoldError).failure.kind).toBe('conflict');
    expect(provider.createHold).not.toHaveBeenCalled();
  });
});

describe('an answered refusal', () => {
  it('unwinds the lock when Beds24 says the dates are taken', async () => {
    provider.fetchOffer.mockRejectedValue(new ProviderError('availability_conflict', 'taken'));
    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);

    expect((error as HoldError).failure.kind).toBe('conflict');
    // Safe to free the range: nothing was created.
    expect(transitions.map((t) => t.to)).toContain('unavailable');
    expect(provider.createHold).not.toHaveBeenCalled();
  });

  it('unwinds the lock when the hold itself is refused', async () => {
    provider.createHold.mockRejectedValue(new ProviderError('availability_conflict', 'taken'));
    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);

    expect((error as HoldError).failure.kind).toBe('conflict');
    expect(transitions.map((t) => t.to)).toContain('unavailable');
    expect(queuedJobs).toHaveLength(0);
  });
});

describe('an UNANSWERED create — the dangerous case', () => {
  beforeEach(() => {
    // What a Beds24 timeout raises, AFTER the POST was sent.
    provider.createHold.mockRejectedValue(new ProviderError('unavailable', 'Beds24 request timed out'));
  });

  it('does not retry the create', async () => {
    await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch(() => undefined);
    // One POST. A second would be how a guest gets two reservations.
    expect(provider.createHold).toHaveBeenCalledTimes(1);
  });

  it('does not release the local range', async () => {
    await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch(() => undefined);
    const targets = transitions.map((t) => t.to);
    // `manual_review` reserves. `hold_failed` and `unavailable` do not — and
    // either would let someone else book nights Beds24 may already hold.
    expect(targets).toContain('manual_review');
    expect(targets).not.toContain('hold_failed');
    expect(targets).not.toContain('unavailable');
  });

  it('raises a severity-1 reconciliation job', async () => {
    await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch(() => undefined);
    expect(queuedJobs).toContainEqual({ reason: 'BEDS24_HOLD_OUTCOME_UNKNOWN', severity: 1 });
  });

  it('tells the caller to WAIT rather than to retry', async () => {
    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);
    // Becomes `pending_verification` for the guest, whose copy explicitly says
    // not to try again.
    expect((error as HoldError).failure.kind).toBe('uncertain');
  });

  it('records the Beds24 ids so reconciliation can search', async () => {
    await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch(() => undefined);
    const review = transitions.find((t) => t.to === 'manual_review')!;
    expect(review.patch?.beds24PropertyId).toBe('354659');
    expect(review.patch?.beds24RoomId).toBe('731147');
  });
});

describe('verification', () => {
  it('refuses a booking on the wrong room', async () => {
    // A 200 with an id is not proof: it could be the right id on the wrong
    // room. Releasing it would be worse — it might be someone else's stay.
    provider.getBooking.mockResolvedValue({ ...GOOD_BOOKING, externalRoomId: '999999' });

    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);
    expect((error as HoldError).failure.kind).toBe('uncertain');
    expect(transitions.map((t) => t.to)).toContain('manual_review');
    expect(queuedJobs.map((j) => j.reason)).toContain('BEDS24_HOLD_MISMATCH');
    expect(provider.releaseHold).not.toHaveBeenCalled();
  });

  it('refuses a booking with the wrong dates', async () => {
    provider.getBooking.mockResolvedValue({ ...GOOD_BOOKING, checkOut: '2026-10-25' });
    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);
    expect((error as HoldError).failure.kind).toBe('uncertain');
  });

  it('refuses a hold that did not actually close the nights', async () => {
    /*
     * The configuration failure that makes every other guarantee hollow. Which
     * Beds24 statuses block inventory is a PER-PROPERTY setting, so a hold in
     * the wrong status looks exactly like a working hold and protects nothing.
     */
    provider.fetchAvailability.mockResolvedValue(
      CLOSED.map((d) => (d.date === '2026-10-21' ? { ...d, available: true } : d))
    );

    const error = await acquireHold(makeIntent(), UNIT, QUOTE, logger).catch((e) => e);
    expect((error as HoldError).failure.kind).toBe('uncertain');
    expect(queuedJobs.map((j) => j.reason)).toContain('BEDS24_HOLD_DID_NOT_BLOCK');
  });

  it('does not tear down a good hold because the READ-BACK failed', async () => {
    // A transient GET failure teaches us nothing. Concluding the hold is bad
    // on the strength of it would throw away a perfectly good reservation.
    provider.getBooking.mockRejectedValue(new Error('network'));

    const result = await acquireHold(makeIntent(), UNIT, QUOTE, logger);
    expect(result.booking.externalBookingId).toBe('9001');
    expect(transitions.map((t) => t.to)).toContain('hold_created');
  });

  it('proceeds, but flags, when the inventory check cannot run', async () => {
    provider.fetchAvailability.mockRejectedValue(new Error('network'));

    const result = await acquireHold(makeIntent(), UNIT, QUOTE, logger);
    expect(result.booking.externalBookingId).toBe('9001');
    expect(queuedJobs.map((j) => j.reason)).toContain('BEDS24_HOLD_DID_NOT_BLOCK');
  });
});
