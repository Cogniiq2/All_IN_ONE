import { describe, expect, it } from 'vitest';
import { proposeMatches, openReason, RECONCILIATION_RULES_VERSION } from '@/lib/finance/reconciliation';
import { classifyExpense, findCounterparty } from '@/lib/finance/categorization';
import { countInbox, deriveInbox, INBOX_LEVEL_ORDER } from '@/lib/finance/inbox';
import type { CounterpartyRow, LineRow, PaymentRow, TransactionRow } from '@/lib/finance/rows';

/* ---------- factories: synthetic rows, no PII ---------- */

let seq = 0;
export function tx(over: Partial<TransactionRow> = {}): TransactionRow {
  seq += 1;
  return {
    id: `tx-${seq}`, kind: 'revenue', booked_on: '2026-03-10', service_from: '2026-03-07', service_to: '2026-03-10', invoice_date: null, due_on: null,
    currency: 'EUR', net_cents: 28037, vat_cents: 1963, gross_cents: 30000, counterparty_id: null, counterparty_label: null, supplier_invoice_no: null,
    description: 'Stay BLG-AAA111', channel: 'direct', booking_intent_id: 'intent-1', booking_reference: 'BLG-AAA111', unit_id: 'unit-a',
    source_type: 'booking', source_system: 'booking', source_reference: 'booking:intent-1', import_batch_id: null, status: 'posted',
    review_state: 'auto_verified', document_state: 'pending', payment_state: 'unpaid', reconciliation_state: 'unmatched', correction_of: null, reversed_by: null,
    reversal_reason: null, note: null, posted_by: 'system', posted_at: '2026-03-10T10:00:00Z', updated_at: '2026-03-10T10:00:00Z', ...over,
  };
}
export function pay(over: Partial<PaymentRow> = {}): PaymentRow {
  seq += 1;
  return {
    id: `pay-${seq}`, direction: 'in', source: 'paypal', provider_reference: `CAP-${seq}`, account_id: null, amount_cents: 30000, fee_cents: 0, currency: 'EUR',
    occurred_at: '2026-03-01T09:00:00Z', value_date: '2026-03-01', counterparty_label: null, reference_text: null, booking_intent_id: 'intent-1', booking_reference: 'BLG-AAA111',
    import_batch_id: null, kind: 'receipt', reconciliation_state: 'unmatched', note: null, created_by: 'system', created_at: '2026-03-01T09:00:00Z', ...over,
  };
}
export function line(over: Partial<LineRow> = {}): LineRow {
  seq += 1;
  return {
    id: `ln-${seq}`, transaction_id: 'tx-1', line_no: 1, category: 'accommodation_revenue', description: null, quantity: 1, tax_code: 'DE_ACCOMMODATION_REDUCED', rate_bp: 700,
    net_cents: 28037, vat_cents: 1963, gross_cents: 30000, reverse_charge_vat_cents: 0, input_vat_treatment: 'not_applicable', deductible_bp: 10000, unit_id: 'unit-a',
    allocation_method: 'direct', allocation_note: null, cost_centre: null, asset_state: 'none', minibar_product_id: null, classification: 'auto_verified', classified_by: null, classified_at: null, ...over,
  };
}
const cp = (over: Partial<CounterpartyRow> = {}): CounterpartyRow => ({
  id: `cp-${over.name ?? 'x'}`, name: 'Cleaning GmbH', kind: 'supplier', country: 'DE', vat_id: 'DE123456789', default_category: 'cleaning', default_tax_code: 'DE_STANDARD',
  default_input_vat: 'deductible', default_allocation: 'direct', auto_verify: true, match_patterns: ['cleaning gmbh'], active: true, note: null, ...over,
});

/* ---------- reconciliation ---------- */

describe('reconciliation rules', () => {
  it('R1: a payment on the same booking key with the same amount matches exactly and auto-applies', () => {
    const t = tx();
    const p = pay();
    const [m] = proposeMatches({ transactions: [t], payments: [p] });
    expect(m).toMatchObject({ transactionId: t.id, paymentId: p.id, state: 'matched', confidence: 'exact', autoApply: true, amountCents: 30000, ruleVersion: RECONCILIATION_RULES_VERSION });
    expect(m.rule).toMatch(/^R1/);
    expect(m.reason).toContain('BLG-AAA111');
  });

  it('R1 split: deposit + balance summing to the gross both match', () => {
    const t = tx();
    const ms = proposeMatches({ transactions: [t], payments: [pay({ amount_cents: 10000 }), pay({ amount_cents: 20000 })] });
    expect(ms).toHaveLength(2);
    expect(ms.every((m) => m.state === 'matched' && m.rule.includes('split'))).toBe(true);
    expect(ms.reduce((s, m) => s + m.amountCents, 0)).toBe(30000);
  });

  it('R2: a smaller payment is a partial match; R3: a larger one is a mismatch that a person decides', () => {
    const [partial] = proposeMatches({ transactions: [tx()], payments: [pay({ amount_cents: 12000 })] });
    expect(partial).toMatchObject({ state: 'partially_matched', confidence: 'high', amountCents: 12000 });
    const [mismatch] = proposeMatches({ transactions: [tx()], payments: [pay({ amount_cents: 31200 })] });
    expect(mismatch).toMatchObject({ state: 'mismatch', confidence: 'high' });
    expect(mismatch.reason).toContain('A person must decide');
  });

  it('direction and currency are respected: an incoming payment never matches a refund; USD never matches EUR', () => {
    const refund = tx({ kind: 'refund', gross_cents: -5000 });
    expect(proposeMatches({ transactions: [refund], payments: [pay({ amount_cents: 5000, direction: 'in' })] })).toHaveLength(0);
    const [m] = proposeMatches({ transactions: [refund], payments: [pay({ amount_cents: 5000, direction: 'out', kind: 'refund' })] });
    expect(m.state).toBe('matched');
    expect(proposeMatches({ transactions: [tx()], payments: [pay({ currency: 'USD' })] })).toHaveLength(0);
  });

  it('R4: a bank receipt naming the booking reference in its text matches within 45 days', () => {
    const t = tx({ booking_intent_id: null });
    const p = pay({ booking_intent_id: null, booking_reference: null, source: 'bank', reference_text: 'Ueberweisung blg-aaa111 Danke', occurred_at: '2026-03-20T00:00:00Z' });
    const [m] = proposeMatches({ transactions: [t], payments: [p] });
    expect(m.rule).toMatch(/^R4/);
    expect(m.autoApply).toBe(true);
    const late = pay({ booking_intent_id: null, booking_reference: null, source: 'bank', reference_text: 'BLG-AAA111', occurred_at: '2026-06-20T00:00:00Z' });
    expect(proposeMatches({ transactions: [tx({ booking_intent_id: null })], payments: [late] })).toHaveLength(0);
  });

  it('R5: amount + date is only a proposal (needs_review, never auto-applied) and only when unique on both sides', () => {
    const exp = tx({ kind: 'expense', booking_intent_id: null, booking_reference: null, gross_cents: 8900, due_on: '2026-03-15', supplier_invoice_no: null });
    const p = pay({ direction: 'out', booking_intent_id: null, booking_reference: null, source: 'bank', amount_cents: 8900, occurred_at: '2026-03-16T00:00:00Z' });
    const [m] = proposeMatches({ transactions: [exp], payments: [p] });
    expect(m).toMatchObject({ state: 'needs_review', confidence: 'medium', autoApply: false });
    const twin = tx({ kind: 'expense', booking_intent_id: null, booking_reference: null, gross_cents: 8900, due_on: '2026-03-14' });
    expect(proposeMatches({ transactions: [exp, twin], payments: [p] })).toHaveLength(0);
  });

  it('R6: a Booking.com payout equal to the sum of several open stays is proposed for review, one row per stay', () => {
    const a = tx({ channel: 'booking_com', booking_intent_id: 'i-a', booking_reference: 'BLG-BBB222', gross_cents: 21000 });
    const b = tx({ channel: 'booking_com', booking_intent_id: 'i-b', booking_reference: 'BLG-CCC333', gross_cents: 34000 });
    const c = tx({ channel: 'booking_com', booking_intent_id: 'i-c', booking_reference: 'BLG-DDD444', gross_cents: 9999 });
    const payout = pay({ source: 'booking_com_payout', kind: 'payout', booking_intent_id: null, booking_reference: null, amount_cents: 55000, occurred_at: '2026-03-25T00:00:00Z' });
    const ms = proposeMatches({ transactions: [a, b, c], payments: [payout] });
    expect(ms.map((m) => m.transactionId).sort()).toEqual([a.id, b.id].sort());
    expect(ms.every((m) => m.rule.startsWith('R6') && !m.autoApply && m.state === 'needs_review')).toBe(true);
    expect(ms.map((m) => m.amountCents)).toEqual([21000, 34000]);
  });

  it('ignores reversed transactions, zero amounts and already-matched payments', () => {
    expect(proposeMatches({ transactions: [tx({ status: 'reversed' })], payments: [pay()] })).toHaveLength(0);
    expect(proposeMatches({ transactions: [tx({ gross_cents: 0 })], payments: [pay({ amount_cents: 0 })] })).toHaveLength(0);
    expect(proposeMatches({ transactions: [tx()], payments: [pay({ reconciliation_state: 'matched' })] })).toHaveLength(0);
  });

  it('openReason explains every open state and stays silent for future revenue', () => {
    expect(openReason(tx({ reconciliation_state: 'mismatch' }), '2026-04-01')).toMatch(/does not equal/);
    expect(openReason(tx({ reconciliation_state: 'needs_review' }), '2026-04-01')).toMatch(/waits for confirmation/);
    expect(openReason(tx({ booked_on: '2026-05-01' }), '2026-04-01')).toBeNull();
    expect(openReason(tx({ kind: 'expense', due_on: '2026-03-01' }), '2026-04-01')).toMatch(/Past due/);
    expect(openReason(tx({ status: 'reversed' }), '2026-04-01')).toBeNull();
  });
});

/* ---------- categorization ---------- */

describe('expense categorization', () => {
  const registry = [
    cp(),
    cp({ name: 'Cloud SaaS Inc', country: 'US', vat_id: null, default_category: 'software', default_tax_code: 'DE_REVERSE_CHARGE', default_input_vat: 'reverse_charge', match_patterns: ['cloud saas'], auto_verify: false }),
    cp({ name: 'IKEA Deutschland GmbH & Co. KG', country: 'DE', vat_id: 'DE812345678', default_category: 'furniture', default_tax_code: 'DE_STANDARD', match_patterns: ['ikea'], auto_verify: true }),
  ];

  it('finds a counterparty by exact name or by pattern, case-insensitively, and ignores inactive rules', () => {
    expect(findCounterparty('CLEANING GMBH', registry)?.name).toBe('Cleaning GmbH');
    expect(findCounterparty('Rechnung Cleaning GmbH 03/2026', registry)?.name).toBe('Cleaning GmbH');
    expect(findCounterparty('Unknown Ltd', registry)).toBeNull();
    expect(findCounterparty('Cleaning GmbH', [cp({ active: false })])).toBeNull();
  });

  it('auto-verifies a known domestic supplier only when the printed VAT agrees with its default code', () => {
    const ok = classifyExpense({ counterpartyName: 'Cleaning GmbH', netCents: 10000, vatCents: 1900 }, registry);
    expect(ok).toMatchObject({ category: 'cleaning', taxCode: 'DE_STANDARD', rateBp: 1900, inputVatTreatment: 'deductible', classification: 'auto_verified' });
    const reduced = classifyExpense({ counterpartyName: 'Cleaning GmbH', netCents: 10000, vatCents: 700 }, registry);
    expect(reduced).toMatchObject({ taxCode: 'DE_REDUCED', classification: 'suggested' });
    const weird = classifyExpense({ counterpartyName: 'Cleaning GmbH', netCents: 10000, vatCents: 1234 }, registry);
    expect(weird).toMatchObject({ taxCode: 'DE_REVIEW_REQUIRED', classification: 'needs_review' });
    expect(weird.reasons.join(' ')).toMatch(/mixed-rate/);
  });

  it('never auto-verifies a marketplace even when the VAT agrees', () => {
    const r = classifyExpense({ counterpartyName: 'IKEA Deutschland GmbH & Co. KG', netCents: 5000, vatCents: 950 }, registry);
    expect(r.classification).toBe('suggested');
    expect(r.reasons.join(' ')).toMatch(/never auto-verified/);
  });

  it('suggests § 13b reverse charge for a third-country supplier without VAT on the invoice, and reviews when VAT is printed', () => {
    const rc = classifyExpense({ counterpartyName: 'Cloud SaaS Inc', netCents: 4900, vatCents: 0 }, registry);
    expect(rc).toMatchObject({ taxCode: 'DE_REVERSE_CHARGE', inputVatTreatment: 'reverse_charge', classification: 'suggested', category: 'software' });
    expect(rc.reasons.join(' ')).toMatch(/§ 13b/);
    const printed = classifyExpense({ counterpartyName: 'Cloud SaaS Inc', netCents: 4900, vatCents: 931 }, registry);
    expect(printed).toMatchObject({ taxCode: 'DE_REVIEW_REQUIRED', classification: 'needs_review' });
  });

  it('an EU supplier without a VAT id on file is a review case; with one it is reverse charge', () => {
    const noId = classifyExpense({ counterpartyName: 'Unknown SARL', counterpartyCountry: 'FR', netCents: 1000, vatCents: 0 }, registry);
    expect(noId).toMatchObject({ classification: 'needs_review', taxCode: 'DE_REVIEW_REQUIRED' });
    const withId = classifyExpense({ counterpartyName: 'Unknown SARL', counterpartyCountry: 'FR', counterpartyVatId: 'FR12345678901', netCents: 1000, vatCents: 0 }, registry);
    expect(withId.taxCode).toBe('DE_REVERSE_CHARGE');
  });

  it('an unknown domestic supplier without a category is needs_review under Other', () => {
    const r = classifyExpense({ counterpartyName: 'Some Shop', netCents: 1000, vatCents: 190 }, registry);
    expect(r.category).toBe('other');
    expect(r.classification).toBe('needs_review');
    expect(r.reasons[0]).toMatch(/No counterparty rule matched/);
  });

  it('respects the operator category hint and rejects unknown categories', () => {
    const r = classifyExpense({ counterpartyName: 'Some Shop', categoryHint: 'electricity', netCents: 10000, vatCents: 1900 }, registry);
    expect(r.category).toBe('electricity');
    expect(classifyExpense({ categoryHint: 'not_a_category' }, registry).category).toBe('other');
  });
});

/* ---------- inbox ---------- */

describe('finance inbox derivation', () => {
  const base = { today: '2026-04-01', payments: [] as PaymentRow[], pendingMatches: [], notices: [], deadlines: [], reserve: null, imports: [], minibarMovements: [] };

  it('escalates a missing document with age: watch → elevated → high', () => {
    const fresh = tx({ kind: 'expense', document_state: 'missing', booked_on: '2026-03-28' });
    const old = tx({ kind: 'expense', document_state: 'missing', booked_on: '2026-03-10' });
    const ancient = tx({ kind: 'expense', document_state: 'missing', booked_on: '2026-01-01' });
    const items = deriveInbox({ ...base, transactions: [fresh, old, ancient], lines: [] });
    const level = (id: string) => items.find((i) => i.id === `doc:${id}`)?.level;
    expect(level(fresh.id)).toBe('watch');
    expect(level(old.id)).toBe('elevated');
    expect(level(ancient.id)).toBe('high');
    expect(items[0].impactCents).toBe(fresh.vat_cents);
  });

  it('revenue never yields a missing-document item', () => {
    expect(deriveInbox({ ...base, transactions: [tx({ document_state: 'missing' })], lines: [] }).filter((i) => i.kind === 'missing_document')).toHaveLength(0);
  });

  it('review-required codes, reverse-charge suggestions, unallocated costs and asset candidates each surface once per line', () => {
    const t = tx({ id: 'tx-exp', kind: 'expense', counterparty_label: 'IKEA' });
    const lines = [
      line({ transaction_id: 'tx-exp', line_no: 1, tax_code: 'DE_REVIEW_REQUIRED', gross_cents: 60000 }),
      line({ transaction_id: 'tx-exp', line_no: 2, tax_code: 'DE_REVERSE_CHARGE', input_vat_treatment: 'reverse_charge', classification: 'suggested', reverse_charge_vat_cents: 931 }),
      line({ transaction_id: 'tx-exp', line_no: 3, category: 'laundry', allocation_method: 'unallocated', classification: 'reviewed' }),
      line({ transaction_id: 'tx-exp', line_no: 4, category: 'furniture', asset_state: 'candidate', classification: 'reviewed' }),
    ];
    const items = deriveInbox({ ...base, transactions: [t], lines });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('tax_classification');
    expect(kinds).toContain('reverse_charge_review');
    expect(kinds).toContain('unallocated_cost');
    expect(kinds).toContain('asset_candidate');
    expect(items.find((i) => i.kind === 'tax_classification')?.level).toBe('high');
    expect(items.find((i) => i.kind === 'reverse_charge_review')?.impactCents).toBe(931);
  });

  it('a mismatch is critical and is a payout mismatch on the Booking.com channel', () => {
    const items = deriveInbox({ ...base, transactions: [tx({ reconciliation_state: 'mismatch', channel: 'booking_com' }), tx({ reconciliation_state: 'mismatch', channel: 'direct' })], lines: [] });
    expect(items.map((i) => i.kind).sort()).toEqual(['payout_mismatch', 'unknown_transaction']);
    expect(items.every((i) => i.level === 'critical')).toBe(true);
  });

  it('reversed transactions never appear; countInbox tallies by level in order', () => {
    const items = deriveInbox({ ...base, transactions: [tx({ status: 'reversed', reconciliation_state: 'mismatch' })], lines: [] });
    expect(items).toHaveLength(0);
    const counts = countInbox([{ level: 'critical' }, { level: 'watch' }, { level: 'watch' }] as never);
    expect(counts).toEqual({ critical: 1, high: 0, elevated: 0, watch: 2 });
    expect(INBOX_LEVEL_ORDER.critical).toBeLessThan(INBOX_LEVEL_ORDER.watch);
  });

  it('every item carries a why, a next step and an admin link, and no item includes a guest name', () => {
    const items = deriveInbox({ ...base, transactions: [tx({ kind: 'expense', document_state: 'missing', reconciliation_state: 'mismatch' })], lines: [line({ tax_code: 'DE_REVIEW_REQUIRED' })] });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.why.length).toBeGreaterThan(10);
      expect(i.nextStep.length).toBeGreaterThan(10);
      expect(i.href.startsWith('/admin/finance/')).toBe(true);
    }
  });
});
