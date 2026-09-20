/**
 * ══════════════════════════════════════════════════════════════════════════
 * CROSS-DOMAIN INVARIANTS — the cases where booking and finance can disagree.
 *
 * Every test here reproduces a defect found in the final integration review
 * (docs/final-integration-review.md) and fails on the code as it stood:
 *
 *   1. a stay refunded BEFORE the first ingestion pass — cash in was
 *      recorded, cash out was not, silently and on every later pass
 *   2. a revenue posting the database refuses (a locked period) took the
 *      guest's capture down with it, and reported the reason as "unknown"
 *   3. a cancelled Booking.com reservation carrying a price became full
 *      accommodation revenue at 7 %
 *
 * They run against the real schema through the real command functions.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, holdBooking, startHarness, waitFor, type Harness } from './harness';
import { cancelBooking } from '@/lib/booking/cancellation';
import { executeRefund } from '@/lib/booking/refunds';
import { createLogger } from '@/lib/booking/logger';
import { findIntentByReference } from '@/lib/booking/repository';

let h: Harness;
const logger = createLogger();

beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => {
  await h.resetDb();
  await h.sync();
  process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
});

async function paidStay() {
  const { reference } = await holdBooking(h);
  await approveOrder(h, reference, false);
  await h.call('POST', '/api/booking/payment/capture', { reference });
  await waitFor(h, reference, (r) => r.status === 'confirmed');
  return (await findIntentByReference(reference))!;
}

const sum = (where: string) => Number(h.sql(`select coalesce(sum(amount_cents), 0) from bolagio_finance_payments where ${where}`));

describe('a refund that completes before the first ingestion pass', () => {
  it('still records the outgoing cash, and says the reversal had nothing to reverse', async () => {
    const intent = await paidStay();
    await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.quotedTotalCents! }, logger);
    expect((await executeRefund((await findIntentByReference(intent.reference))!, 'admin@example.com', logger)).outcome).toBe('completed');

    const { ingestBookingFacts } = await import('@/lib/finance/commands');
    const r = await ingestBookingFacts({ actor: 'system:test' });

    expect(r.errors).toEqual([]);
    // No revenue: the stay never reached a revenue-recognising status.
    expect(r.revenuePosted).toBe(0);
    expect(r.refundsPosted).toBe(0);
    // But BOTH cash facts are there, and the anomaly is counted rather than hidden.
    expect(r.refundsWithoutRevenue).toBe(1);
    expect(sum(`direction = 'in'`)).toBe(intent.quotedTotalCents);
    expect(sum(`direction = 'out'`)).toBe(intent.quotedTotalCents);
    expect(h.sql(`select kind || '|' || direction from bolagio_finance_payments where direction = 'out'`)).toBe('refund|out');

    // Idempotent: a second pass adds nothing.
    const again = await ingestBookingFacts({ actor: 'system:test' });
    expect(again).toMatchObject({ paymentsRecorded: 0, refundsPosted: 0, errors: [] });
    expect(Number(h.sql(`select count(*) from bolagio_finance_payments`))).toBe(2);
  });
});

describe('a revenue posting the database refuses', () => {
  it('does not take the capture with it, and names the locked period', async () => {
    const intent = await paidStay();
    const { ingestBookingFacts, setPeriodStatus } = await import('@/lib/finance/commands');
    const key = intent.checkOut.slice(0, 7);
    for (const to of ['review', 'accountant_reviewed', 'locked']) await setPeriodStatus(key, to, 'sb@example.com', true, 'regression');

    const r = await ingestBookingFacts({ actor: 'system:test' });

    // The revenue is refused — correctly, the period is locked.
    expect(r.revenuePosted).toBe(0);
    expect(r.errors).toHaveLength(1);
    // …and the operator is told WHICH period, not "unknown".
    expect(r.errors[0]).toContain('BLG11');
    expect(r.errors[0]).toContain(key);
    expect(r.errors[0]).not.toContain('unknown');
    // The guest's money is a fact about the bank, not about the P&L period.
    expect(r.paymentsRecorded).toBe(1);
    expect(sum(`direction = 'in'`)).toBe(intent.quotedTotalCents);
  });
});

describe('a cancelled Booking.com reservation that still carries a price', () => {
  const csv = (status: string, price: string, currency = 'EUR') =>
    `Book number,Check-in,Check-out,Status,Price,Commission amount,Currency,Rooms\n9001,2026-11-02,2026-11-05,${status},${price},"",${currency},Schulstrasse I\n`;

  async function importAll(text: string) {
    const { stageImport, commitImport } = await import('@/lib/finance/commands');
    const staged = await stageImport('booking_com_reservations', 'statement.csv', text, 'ops@example.com');
    if (!staged.ok || staged.validRows === 0) return { staged, committed: null };
    return { staged, committed: await commitImport(staged.batchId, 'ops@example.com') };
  }

  it('is recorded as a cancellation charge parked for review, never as 7 % accommodation', async () => {
    const { committed } = await importAll(csv('cancelled_by_guest', '120.00'));
    expect(committed?.errors).toEqual([]);
    const tx = JSON.parse(h.sql(`select row_to_json(t) from (select kind, gross_cents, review_state, description from bolagio_finance_transactions where source_system = 'booking_com_reservations') t`));
    expect(tx).toMatchObject({ kind: 'revenue', gross_cents: 12000, review_state: 'needs_review' });
    expect(tx.description).toMatch(/cancellation charge/i);
    const line = JSON.parse(h.sql(`select row_to_json(l) from (select tax_code, rate_bp, net_cents, vat_cents, gross_cents, classification from bolagio_finance_transaction_lines where transaction_id = (select id from bolagio_finance_transactions where source_system = 'booking_com_reservations')) l`));
    expect(line).toMatchObject({ tax_code: 'DE_REVIEW_REQUIRED', rate_bp: 0, vat_cents: 0, classification: 'needs_review' });
    // The whole amount is net: no VAT is asserted either way.
    expect(Number(line.net_cents)).toBe(12000);
  });

  it('is still posted at 7 % when the reservation actually happened', async () => {
    const { committed } = await importAll(csv('ok', '120.00'));
    expect(committed?.errors).toEqual([]);
    expect(h.sql(`select tax_code || '|' || rate_bp from bolagio_finance_transaction_lines`)).toBe('DE_ACCOMMODATION_REDUCED|700');
  });

  it('refuses a reservation in a currency nothing here converts', async () => {
    const { staged } = await importAll(csv('ok', '120.00', 'USD'));
    expect(staged.ok && staged.validRows).toBe(0);
    expect(staged.ok && staged.errorRows).toBe(1);
    // Nothing reached the ledger.
    expect(Number(h.sql(`select count(*) from bolagio_finance_transactions`))).toBe(0);
  });
});
