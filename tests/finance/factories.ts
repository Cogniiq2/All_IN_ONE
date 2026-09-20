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
export const cp = (over: Partial<CounterpartyRow> = {}): CounterpartyRow => ({
  id: `cp-${over.name ?? 'x'}`, name: 'Cleaning GmbH', kind: 'supplier', country: 'DE', vat_id: 'DE123456789', default_category: 'cleaning', default_tax_code: 'DE_STANDARD',
  default_input_vat: 'deductible', default_allocation: 'direct', auto_verify: true, match_patterns: ['cleaning gmbh'], active: true, note: null, ...over,
});

