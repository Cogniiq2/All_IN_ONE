/**
 * The operator's "reconcile now" queues exactly what the sweep would. This
 * pins the mapping so a state that must never be auto-acted on (confirmed,
 * cancelled, the non-reserving states) stays out of reach of the button.
 */

import { describe, expect, it } from 'vitest';
import { reconciliationReasonFor } from '@/lib/booking/reconciliation';
import { BOOKING_STATES, reservesInventory } from '@/lib/booking/states';

describe('reconciliationReasonFor', () => {
  it('leaves terminal and non-reserving states alone', () => {
    for (const s of BOOKING_STATES) {
      if (!reservesInventory(s) || s === 'confirmed') {
        expect(reconciliationReasonFor(s, 'not_created'), s).toBeNull();
      }
    }
  });

  it('sweeps an expired hold whose release never finished', () => {
    /*
     * `expired` RESERVES: the lease ran out but the Beds24 hold is still
     * there until the release saga verifies it gone. A booking left here by a
     * process that died between the transition and the release was previously
     * never swept — its hold blocked the nights on every channel indefinitely.
     */
    expect(reconciliationReasonFor('expired', 'not_created')).toEqual({ code: 'BOOKING_HOLD_STALE', severity: 2 });
  });

  it('maps the money-critical states to the top severity', () => {
    for (const s of ['paid', 'paid_unfinalized', 'finalization_failed'] as const) {
      expect(reconciliationReasonFor(s, 'paid')).toEqual({ code: 'PAID_BOOKING_UNFINALIZED', severity: 1 });
    }
  });

  it('maps release and lock problems to their own handlers', () => {
    expect(reconciliationReasonFor('release_failed', 'cancelled')).toEqual({ code: 'BEDS24_RELEASE_FAILED', severity: 2 });
    expect(reconciliationReasonFor('releasing', 'cancelled')).toEqual({ code: 'BEDS24_RELEASE_FAILED', severity: 2 });
    expect(reconciliationReasonFor('locking', 'not_created')).toEqual({ code: 'BOOKING_LOCK_LEASE_EXPIRED', severity: 4 });
  });

  it('never automates manual_review, but does read an unknown payment', () => {
    expect(reconciliationReasonFor('manual_review', 'paid')).toBeNull();
    expect(reconciliationReasonFor('manual_review', 'unknown')).toEqual({ code: 'PAYMENT_PROVIDER_UNCERTAIN', severity: 1 });
    expect(reconciliationReasonFor('hold_created', 'unknown')).toEqual({ code: 'PAYMENT_PROVIDER_UNCERTAIN', severity: 1 });
  });

  it('treats a held, unpaid attempt as a stale hold', () => {
    expect(reconciliationReasonFor('hold_created', 'order_created')).toEqual({ code: 'BOOKING_HOLD_STALE', severity: 3 });
    expect(reconciliationReasonFor('payment_failed', 'denied')).toEqual({ code: 'BOOKING_HOLD_STALE', severity: 3 });
    expect(reconciliationReasonFor('payment_cancelled', 'cancelled')).toEqual({ code: 'BOOKING_HOLD_STALE', severity: 3 });
  });
});
