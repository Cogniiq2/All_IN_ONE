/**
 * The presentation layer describes the domain; it never redefines it.
 * These tests hold it to that: every canonical state has an entry, an
 * unknown state is neutral and never healthy, and the derived facts agree
 * with the state machine's own predicates.
 */

import { describe, expect, it } from 'vitest';
import { BOOKING_STATES, PAYMENT_STATES, isPaidSide, isPaymentSettled, reservesInventory } from '@/lib/booking/states';
import {
  bookingFacts,
  bookingStatePresentation,
  codeTitle,
  jobStatusPresentation,
  operationOutcomePresentation,
  paymentStatePresentation,
  reconciliationStatePresentation,
  sourcePresentation,
} from '@/lib/admin/presentation';
import { OPS_CODES } from '@/lib/booking/errors';

describe('state presentation', () => {
  it('covers every booking and payment state with a distinct label', () => {
    const labels = new Set<string>();
    for (const s of BOOKING_STATES) {
      const p = bookingStatePresentation(s);
      expect(p.label).not.toBe('Unknown');
      labels.add(p.label);
    }
    expect(labels.size).toBe(BOOKING_STATES.length);
    for (const s of PAYMENT_STATES) expect(paymentStatePresentation(s).label).not.toBe('Unknown');
  });

  it('falls back to a neutral Unknown for anything else', () => {
    for (const fn of [bookingStatePresentation, paymentStatePresentation, operationOutcomePresentation, jobStatusPresentation, reconciliationStatePresentation]) {
      const p = fn('definitely_not_a_state');
      expect(p.label).toBe('Unknown');
      expect(p.tone).toBe('neutral');
      expect(p.glyph).toBe('question');
    }
    expect(sourcePresentation('telepathy').label).toBe('Unknown');
  });

  it('never presents an exception state as positive', () => {
    for (const s of ['paid_unfinalized', 'finalization_failed', 'release_failed', 'manual_review', 'expired', 'payment_failed'] as const) {
      expect(bookingStatePresentation(s).tone).not.toBe('positive');
    }
    expect(paymentStatePresentation('unknown').tone).toBe('critical');
    expect(operationOutcomePresentation('outcome_unknown').tone).toBe('critical');
  });

  it('paid_unfinalized reads differently from confirmed', () => {
    const a = bookingStatePresentation('paid_unfinalized');
    const b = bookingStatePresentation('confirmed');
    expect(a.tone).not.toBe(b.tone);
    expect(a.glyph).not.toBe(b.glyph);
  });

  it('has a title for every operational code', () => {
    for (const code of Object.keys(OPS_CODES)) {
      expect(codeTitle(code)).not.toBe(code);
    }
    expect(codeTitle('NOT_A_CODE')).toBe('NOT_A_CODE');
    expect(codeTitle(null)).toBeNull();
  });
});

describe('booking facts', () => {
  it('asks the state machine, not its own table', () => {
    for (const s of BOOKING_STATES) {
      for (const p of PAYMENT_STATES) {
        const f = bookingFacts(s, p);
        expect(f.inventoryHeld).toBe(reservesInventory(s));
        expect(f.paid).toBe(isPaymentSettled(p));
        expect(f.externallyFinalized).toBe(s === 'confirmed');
      }
    }
    expect(bookingFacts('paid_unfinalized', 'paid').paid).toBe(isPaidSide('paid_unfinalized'));
  });

  it('answers unknown for unknown states rather than yes or no', () => {
    const f = bookingFacts('mystery', 'paid');
    expect(f.inventoryHeld).toBe('unknown');
    expect(f.externallyFinalized).toBe('unknown');
    expect(f.needsHuman).toBe(true);
    expect(bookingFacts('confirmed', 'mystery').moneyMayBeInvolved).toBe('unknown');
  });

  it('flags the exception states as needing a person', () => {
    for (const s of ['manual_review', 'paid_unfinalized', 'finalization_failed', 'release_failed'] as const) {
      expect(bookingFacts(s, 'paid').needsHuman).toBe(true);
    }
    expect(bookingFacts('confirmed', 'paid').needsHuman).toBe(false);
    expect(bookingFacts('confirmed', 'unknown').needsHuman).toBe(true);
    expect(bookingFacts('confirmed', 'disputed').needsHuman).toBe(true);
  });
});
