/**
 * The pure rules behind the cross-domain invariants, without a database.
 * The integration counterparts live in tests/integration/finance-invariants.
 */

import { describe, expect, it } from 'vitest';
import { refundCashFact, refundPosting, revenuePosting, type BookingFact } from '@/lib/finance/ingestion-rules';
import { errorMessage, asFinanceError, FinanceCommandError } from '@/lib/finance/errors';
import { stageCsv } from '@/lib/finance/import/adapters';

const base: BookingFact = {
  intentId: '11111111-1111-1111-1111-111111111111', reference: 'BLG-AAAAAA', unitId: '22222222-2222-2222-2222-222222222222',
  source: 'direct', status: 'cancelled', paymentStatus: 'refunded', checkIn: '2026-11-02', checkOut: '2026-11-05', currency: 'EUR',
  quotedTotalCents: 46500, paidAmountCents: 46500, paidCurrency: 'EUR', paymentCaptureId: 'CAP-1', paymentProvider: 'paypal',
  paidAt: '2026-10-01T10:00:00Z', confirmedAt: '2026-10-01T10:00:00Z', refundState: 'completed', refundId: 'REF-1',
  refundedAmountCents: 46500, refundCompletedAt: '2026-10-05T10:00:00Z', cancellationCompletedAt: '2026-10-05T09:00:00Z',
  components: [{ code: 'total', label: 'Accommodation', amountCents: 46500, taxCategory: 'accommodation', mandatory: true }],
};

describe('the outgoing cash of a refund', () => {
  it('stands alone when the stay was never recognised as revenue', () => {
    // A cancelled stay is not a revenue fact…
    expect(revenuePosting(base)).toBeNull();
    // …and there are no original lines to reverse pro-rata…
    expect(refundPosting(base, [])).toBeNull();
    // …but the money left the account, and that is still a fact.
    const cash = refundCashFact(base);
    expect(cash).toMatchObject({ direction: 'out', kind: 'refund', amount_cents: 46500, provider_reference: 'REF-1', source: 'paypal', booking_reference: 'BLG-AAAAAA' });
  });

  it('is the same fact the full posting carries, so the two can never diverge', () => {
    const lines = [{ line_no: 1, category: 'accommodation_revenue', description: 'Stay', tax_code: 'DE_ACCOMMODATION_REDUCED', rate_bp: 700, gross_cents: 46500, unit_id: base.unitId }];
    expect(refundPosting(base, lines)!.payment).toEqual(refundCashFact(base));
  });

  it('is nothing at all until the refund has actually completed', () => {
    for (const refundState of ['none', 'required', 'pending', 'failed', 'unknown']) {
      expect(refundCashFact({ ...base, refundState })).toBeNull();
    }
    expect(refundCashFact({ ...base, refundedAmountCents: 0 })).toBeNull();
    expect(refundCashFact({ ...base, refundId: null })).toBeNull();
  });
});

describe('what a caught value says', () => {
  it('keeps the database message and code that `instanceof Error` throws away', () => {
    const pg = { message: 'period 2026-11 is locked', code: 'BLG11', details: '', hint: '' };
    expect(pg instanceof Error).toBe(false);
    expect(errorMessage(pg)).toBe('BLG11 period 2026-11 is locked');
    const wrapped = asFinanceError('bolagio_finance_post_transaction', pg);
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped).toBeInstanceOf(FinanceCommandError);
    expect(wrapped.message).toContain('BLG11');
    expect(wrapped.message).toContain('period 2026-11 is locked');
  });

  it('passes a real Error through untouched, and never invents one', () => {
    const e = new Error('plain');
    expect(asFinanceError('fn', e)).toBe(e);
    expect(errorMessage(e)).toBe('plain');
    expect(errorMessage(undefined)).toBe('unknown');
    expect(errorMessage(null)).toBe('unknown');
  });
});

describe('the Booking.com reservation statement', () => {
  const head = 'Book number,Check-in,Check-out,Status,Price,Commission amount,Currency,Rooms';
  const stage = (line: string) => stageCsv('booking_com_reservations', `${head}\n${line}\n`);

  it('marks a cancelled reservation that still carries a price', async () => {
    const r = await stage('9001,2026-11-02,2026-11-05,cancelled_by_guest,120.00,18.00,EUR,Schulstrasse I');
    expect(r.validRows).toBe(1);
    expect(r.rows[0].parsed).toMatchObject({ target: 'revenue', cancelled: true, grossCents: 12000, commissionCents: 1800 });
  });

  it('leaves a reservation that happened unmarked', async () => {
    const r = await stage('9002,2026-11-02,2026-11-05,ok,120.00,18.00,EUR,Schulstrasse I');
    expect(r.rows[0].parsed).toMatchObject({ cancelled: false });
  });

  it('still drops a cancellation with nothing to post', async () => {
    const r = await stage('9003,2026-11-02,2026-11-05,cancelled_by_guest,0.00,0.00,EUR,Schulstrasse I');
    expect(r.validRows).toBe(0);
  });

  it('refuses a currency nothing here converts rather than summing it as euros', async () => {
    const r = await stage('9004,2026-11-02,2026-11-05,ok,120.00,18.00,USD,Schulstrasse I');
    expect(r.validRows).toBe(0);
    expect(r.rows[0].error).toMatch(/USD/);
  });

  it('refuses an unreadable commission rather than silently booking none', async () => {
    const r = await stage('9005,2026-11-02,2026-11-05,ok,120.00,n/a,EUR,Schulstrasse I');
    expect(r.validRows).toBe(0);
    expect(r.rows[0].error).toMatch(/Commission/);
  });

  it('accepts an empty commission cell, which means no commission', async () => {
    const r = await stage('9006,2026-11-02,2026-11-05,ok,120.00,,EUR,Schulstrasse I');
    expect(r.validRows).toBe(1);
    expect(r.rows[0].parsed).toMatchObject({ commissionCents: null });
  });
});
