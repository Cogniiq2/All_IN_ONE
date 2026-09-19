/**
 * Attention derivation: deterministic, ordered like `bolagio_ops_attention`,
 * one item per booking, and never a "retry" as the next step.
 */

import { describe, expect, it } from 'vitest';
import {
  assessBooking,
  assessOperation,
  assessOutboxEvent,
  assessPaymentEvent,
  assessReconciliationJob,
  collectAttention,
  countByLevel,
  levelFromSeverity,
  OUTBOX_BACKLOG_MS,
  PAYMENT_EVENT_STUCK_MS,
} from '@/lib/admin/attention';
import type { BookingSummaryDto, ExternalOperationDto, OutboxEventDto, PaymentEventDto, ReconciliationJobDto } from '@/lib/admin/dto';

const NOW = new Date('2026-09-19T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function booking(overrides: Partial<BookingSummaryDto>): BookingSummaryDto {
  return {
    reference: 'BLG-TEST01',
    unitSlug: 'schulstrasse-i',
    unitName: 'Schulstraße I',
    checkIn: '2026-10-01',
    checkOut: '2026-10-04',
    nights: 3,
    adults: 2,
    children: 0,
    source: 'direct',
    status: 'confirmed',
    paymentStatus: 'paid',
    currency: 'EUR',
    quotedTotalCents: 45000,
    paidAmountCents: 45000,
    guestLabel: 'Mustermann, A.',
    guestCountry: 'DE',
    reconciliationState: 'ok',
    lastFailureCode: null,
    hasExternalBooking: true,
    holdExpiresAt: null,
    paidAt: ago(60),
    confirmedAt: ago(59),
    createdAt: ago(70),
    updatedAt: ago(59),
    ...overrides,
  };
}

describe('booking attention', () => {
  it('is silent for a healthy confirmed booking', () => {
    expect(assessBooking(booking({}))).toBeNull();
  });

  it('ranks like the operations view', () => {
    expect(assessBooking(booking({ status: 'paid_unfinalized' }))?.level).toBe('critical');
    expect(assessBooking(booking({ status: 'finalization_failed', lastFailureCode: 'BEDS24_FINALIZATION_FAILED' }))?.level).toBe('critical');
    expect(assessBooking(booking({ status: 'manual_review', paymentStatus: 'unknown' }))?.level).toBe('critical');
    expect(assessBooking(booking({ status: 'release_failed', paymentStatus: 'cancelled' }))?.level).toBe('high');
    expect(assessBooking(booking({ status: 'hold_created', paymentStatus: 'unknown', confirmedAt: null }))?.level).toBe('high');
    expect(assessBooking(booking({ status: 'paid', confirmedAt: null }))?.level).toBe('high');
    expect(assessBooking(booking({ status: 'releasing', paymentStatus: 'cancelled' }))?.level).toBe('elevated');
    expect(assessBooking(booking({ status: 'locking', paymentStatus: 'not_created' }))?.level).toBe('elevated');
    expect(assessBooking(booking({ reconciliationState: 'pending' }))?.level).toBe('watch');
  });

  it('reports money and inventory from the domain predicates', () => {
    const item = assessBooking(booking({ status: 'paid_unfinalized' }));
    expect(item?.moneyInvolved).toBe(true);
    expect(item?.inventoryHeld).toBe(true);
    const released = assessBooking(booking({ status: 'release_failed', paymentStatus: 'cancelled' }));
    expect(released?.inventoryHeld).toBe(true); // release_failed still reserves
    expect(released?.moneyInvolved).toBe(false);
  });

  it('treats an unknown state as needing attention, never as healthy', () => {
    const item = assessBooking(booking({ status: 'brand_new_state' }));
    expect(item?.level).toBe('high');
    expect(item?.inventoryHeld).toBe('unknown');
  });

  it('never suggests retrying', () => {
    const items = [
      assessBooking(booking({ status: 'paid_unfinalized' })),
      assessBooking(booking({ status: 'release_failed' })),
      assessBooking(booking({ status: 'manual_review', paymentStatus: 'unknown' })),
      assessBooking(booking({ paymentStatus: 'unknown' })),
    ];
    for (const item of items) {
      expect(item).not.toBeNull();
      expect(item?.nextStep.toLowerCase()).not.toMatch(/\bretry\b(?! blind| the capture)/);
      expect(item?.nextStep.toLowerCase()).not.toContain('retry all');
    }
  });

  it('links every booking item to its detail page', () => {
    expect(assessBooking(booking({ status: 'manual_review' }))?.href).toBe('/admin/bookings/BLG-TEST01');
  });
});

describe('other sources', () => {
  const op = (overrides: Partial<ExternalOperationDto>): ExternalOperationDto => ({
    id: 'op-1',
    provider: 'beds24',
    operationType: 'create_hold',
    outcome: 'succeeded',
    attempts: 1,
    resourceId: null,
    startedAt: ago(5),
    completedAt: ago(5),
    uncertainAt: null,
    reconciledAt: null,
    lastError: null,
    reference: 'BLG-TEST01',
    ...overrides,
  });

  it('flags unknown outcomes as critical and stale in-flight operations as high', () => {
    expect(assessOperation(op({}), NOW)).toBeNull();
    expect(assessOperation(op({ outcome: 'failed' }), NOW)).toBeNull();
    expect(assessOperation(op({ outcome: 'outcome_unknown', uncertainAt: ago(3) }), NOW)?.level).toBe('critical');
    expect(assessOperation(op({ outcome: 'in_flight', startedAt: ago(2) }), NOW)).toBeNull();
    expect(assessOperation(op({ outcome: 'in_flight', startedAt: ago(30) }), NOW)?.level).toBe('high');
  });

  const job = (overrides: Partial<ReconciliationJobDto>): ReconciliationJobDto => ({
    id: 'job-1',
    reason: 'PAID_BOOKING_UNFINALIZED',
    severity: 1,
    status: 'pending',
    attempts: 0,
    reference: 'BLG-TEST01',
    nextAttemptAt: ago(0),
    createdAt: ago(10),
    updatedAt: ago(10),
    resolvedAt: null,
    resolution: null,
    lastError: null,
    ...overrides,
  });

  it('maps job severity to level and exhausted to critical', () => {
    expect(assessReconciliationJob(job({ status: 'resolved' }))).toBeNull();
    expect(assessReconciliationJob(job({ severity: 1 }))?.level).toBe('critical');
    expect(assessReconciliationJob(job({ severity: 3, reason: 'BOOKING_HOLD_STALE' }))?.level).toBe('elevated');
    expect(assessReconciliationJob(job({ severity: 4, status: 'exhausted' }))?.level).toBe('critical');
    expect(levelFromSeverity(5)).toBe('watch');
  });

  const ev = (overrides: Partial<PaymentEventDto>): PaymentEventDto => ({
    id: 'pe-1',
    provider: 'paypal',
    providerEventId: 'WH-1',
    eventType: 'PAYMENT.CAPTURE.COMPLETED',
    verification: 'verified',
    status: 'succeeded',
    attempts: 1,
    amountCents: 1000,
    currency: 'EUR',
    orderId: null,
    captureId: null,
    reference: 'BLG-TEST01',
    receivedAt: ago(1),
    processedAt: ago(1),
    lastError: null,
    ...overrides,
  });

  it('flags failed verification, exhausted processing and stuck verified events', () => {
    expect(assessPaymentEvent(ev({}), NOW)).toBeNull();
    expect(assessPaymentEvent(ev({ verification: 'failed', status: 'failed' }), NOW)?.level).toBe('high');
    expect(assessPaymentEvent(ev({ status: 'exhausted' }), NOW)?.level).toBe('critical');
    expect(assessPaymentEvent(ev({ status: 'pending', receivedAt: ago(2) }), NOW)).toBeNull();
    expect(assessPaymentEvent(ev({ status: 'pending', receivedAt: new Date(NOW.getTime() - PAYMENT_EVENT_STUCK_MS - 1000).toISOString() }), NOW)?.level).toBe('high');
  });

  const ob = (overrides: Partial<OutboxEventDto>): OutboxEventDto => ({
    id: 'ob-1',
    eventType: 'booking.confirmed',
    status: 'succeeded',
    attempts: 1,
    reference: 'BLG-TEST01',
    createdAt: ago(1),
    availableAt: ago(1),
    processedAt: ago(1),
    lastError: null,
    ...overrides,
  });

  it('flags dead letters and a stale backlog, and nothing else', () => {
    expect(assessOutboxEvent(ob({}), NOW)).toBeNull();
    expect(assessOutboxEvent(ob({ status: 'pending', processedAt: null, createdAt: ago(5) }), NOW)).toBeNull();
    expect(assessOutboxEvent(ob({ status: 'pending', processedAt: null, createdAt: new Date(NOW.getTime() - OUTBOX_BACKLOG_MS - 1000).toISOString() }), NOW)?.level).toBe('elevated');
    expect(assessOutboxEvent(ob({ status: 'exhausted', processedAt: null, attempts: 8 }), NOW)?.level).toBe('high');
  });
});

describe('collectAttention', () => {
  it('orders by level, then oldest first, deterministically', () => {
    const input = {
      bookings: [
        booking({ reference: 'BLG-AAAAA1', status: 'releasing', paymentStatus: 'cancelled', updatedAt: ago(200) }),
        booking({ reference: 'BLG-AAAAA2', status: 'paid_unfinalized', updatedAt: ago(5) }),
        booking({ reference: 'BLG-AAAAA3', status: 'paid_unfinalized', updatedAt: ago(50) }),
        booking({ reference: 'BLG-AAAAA4' }),
      ],
      operations: [],
      jobs: [],
      paymentEvents: [],
      outbox: [],
    };
    const a = collectAttention(input, NOW);
    const b = collectAttention(input, NOW);
    expect(a.map((i) => i.reference)).toEqual(['BLG-AAAAA3', 'BLG-AAAAA2', 'BLG-AAAAA1']);
    expect(a).toEqual(b);
    expect(countByLevel(a)).toEqual({ critical: 2, high: 0, elevated: 1, watch: 0 });
  });
});
