/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE ROW SHAPES and the read interface.
 *
 * `FinanceRowSource` is the one seam between the finance screens and where
 * their data comes from: Supabase (`source-supabase.ts`) in production, the
 * synthetic dataset (`fixtures.ts`) under the development flag and the
 * preview demo. Both return the same snake_case rows — the shapes below are
 * the column lists of the finance tables and views, verbatim.
 *
 * Reads only. Writes go through `commands.ts`, which calls the database's
 * own command functions (`bolagio_finance_*`), never a table write.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface TaxCodeRow {
  code: string; label: string; description: string | null; side: string; treatment: string; rate_bp: number;
  reverse_charge: boolean; review_required: boolean; effective_from: string; effective_to: string | null;
  legal_reference: string | null; source_url: string | null; active: boolean;
}

export interface CategoryRow {
  code: string; label: string; pl_group: string; kind: string; default_tax_code: string | null; asset_candidate: boolean;
  requires_unit: boolean; datev_account_skr03: string | null; datev_account_skr04: string | null; datev_confirmed: boolean; sort_order: number; active: boolean;
}

export interface TaxRateRowDb {
  id: string; tax_type: string; jurisdiction: string; rate_bp: number; effective_from: string; effective_to: string | null;
  legal_reference: string | null; source_url: string | null; review_required: boolean; note: string | null;
}

export interface PolicyRow {
  id: string; key: string; value: string; effective_from: string; effective_to: string | null; source_reference: string | null; set_by: string; created_at: string;
}

export interface PeriodRow {
  period_key: string; starts_on: string; ends_on: string; status: string; status_at: string; status_by: string | null; locked_at: string | null; locked_by: string | null; note: string | null;
}

export interface CounterpartyRow {
  id: string; name: string; kind: string; country: string | null; vat_id: string | null; default_category: string | null; default_tax_code: string | null;
  default_input_vat: string | null; default_allocation: string | null; auto_verify: boolean; match_patterns: string[]; active: boolean; note: string | null;
}

export interface AccountRow {
  id: string; code: string; label: string; kind: string; currency: string; iban_masked: string | null; opening_balance_cents: number; opening_balance_on: string | null; active: boolean;
}

export interface TransactionRow {
  id: string; kind: string; booked_on: string; service_from: string | null; service_to: string | null; invoice_date: string | null; due_on: string | null;
  currency: string; net_cents: number; vat_cents: number; gross_cents: number; counterparty_id: string | null; counterparty_label: string | null;
  supplier_invoice_no: string | null; description: string; channel: string | null; booking_intent_id: string | null; booking_reference: string | null;
  unit_id: string | null; source_type: string; source_system: string; source_reference: string; import_batch_id: string | null; status: string;
  review_state: string; document_state: string; payment_state: string; reconciliation_state: string; correction_of: string | null; reversed_by: string | null;
  reversal_reason: string | null; note: string | null; posted_by: string; posted_at: string; updated_at: string;
}

export interface LineRow {
  id: string; transaction_id: string; line_no: number; category: string; description: string | null; quantity: number | null; tax_code: string; rate_bp: number;
  net_cents: number; vat_cents: number; gross_cents: number; reverse_charge_vat_cents: number; input_vat_treatment: string; deductible_bp: number;
  unit_id: string | null; allocation_method: string; allocation_note: string | null; cost_centre: string | null; asset_state: string; minibar_product_id: string | null;
  classification: string; classified_by: string | null; classified_at: string | null;
}

export interface OverrideRow {
  id: string; target_type: string; target_id: string; field: string; old_value: string | null; new_value: string | null; reason: string; actor: string; created_at: string;
}

export interface PaymentRow {
  id: string; direction: string; source: string; provider_reference: string; account_id: string | null; amount_cents: number; fee_cents: number; currency: string;
  occurred_at: string; value_date: string | null; counterparty_label: string | null; reference_text: string | null; booking_intent_id: string | null;
  booking_reference: string | null; import_batch_id: string | null; kind: string; reconciliation_state: string; note: string | null; created_by: string; created_at: string;
}

export interface ReconciliationRow {
  id: string; transaction_id: string | null; payment_id: string | null; document_id: string | null; amount_cents: number; state: string; rule: string;
  rule_version: string; confidence: string; reason: string; matched_by: string; created_at: string;
}

export interface DocumentRow {
  id: string; document_type: string; original_filename: string; mime_type: string; byte_size: number; sha256: string; source: string; structured_format: string;
  structured_valid: boolean | null; counterparty_id: string | null; tax_period_key: string | null; document_date: string | null; review_state: string;
  retention_class: string; retention_basis: string | null; retain_until: string | null; legal_hold: boolean; deletion_allowed: boolean; retention_review: boolean;
  supersedes_id: string | null; received_at: string; uploaded_by: string | null; note: string | null;
}

export interface DocumentLinkRow {
  id: string; document_id: string; target_type: string; target_id: string; linked_by: string; created_at: string;
}

export interface InvoiceRow {
  id: string; kind: string; series: string | null; number: number | null; status: string; issued_on: string | null; issued_at: string | null; issued_by: string | null;
  issuer_name: string | null; issuer_tax_id_masked: string | null; recipient_name: string; recipient_company: string | null; recipient_country: string | null;
  booking_intent_id: string | null; booking_reference: string | null; unit_id: string | null; service_from: string | null; service_to: string | null; currency: string;
  net_cents: number; vat_cents: number; gross_cents: number; payment_state: string; corrects_invoice_id: string | null; transaction_id: string | null; document_id: string | null;
  created_by: string; created_at: string;
}

export interface InvoiceLineRow {
  id: string; invoice_id: string; line_no: number; description: string; quantity: number; category: string; tax_code: string; rate_bp: number; net_cents: number; vat_cents: number; gross_cents: number;
}

export interface TaxPeriodRow {
  id: string; tax_type: string; period_key: string; starts_on: string; ends_on: string; filing_due_on: string | null; payment_due_on: string | null;
  official_due_on: string | null; status: string; status_at: string; status_by: string | null; note: string | null;
}

export interface TaxEstimateRow {
  id: string; tax_period_id: string; stage: string; amount_cents: number; basis: Record<string, unknown>; rules_version: string; computed_at: string; actor: string; note: string | null; document_id: string | null;
}

export interface TaxAdjustmentRow {
  id: string; tax_type: string; fiscal_year: number; kind: string; amount_cents: number; reason: string; legal_reference: string | null; actor: string; superseded_by: string | null; created_at: string;
}

export interface TaxNoticeRow {
  id: string; tax_type: string; period_key: string; authority: string; notice_type: string; assessment_date: string | null; received_on: string; assessed_cents: number | null;
  advance_payment_cents: number | null; paid_cents: number; status: string; document_id: string | null; tax_period_id: string | null; note: string | null; created_by: string; created_at: string;
  dues: Array<{ id: string; due_on: string; amount_cents: number; label: string | null; paid_cents: number; paid_on: string | null }>;
}

export interface TaxPaymentRow {
  id: string; tax_type: string; period_key: string; kind: string; amount_cents: number; paid_on: string; payment_id: string | null; notice_id: string | null; note: string | null; created_at: string;
}

export interface ReserveRow {
  id: string; kind: string; label: string; amount_cents: number; account_id: string | null; as_of: string; note: string | null; set_by: string; created_at: string;
}

export interface AssetRow {
  id: string; description: string; line_id: string | null; counterparty_id: string | null; purchased_on: string; acquisition_cents: number; unit_id: string | null;
  category: string | null; useful_life_months: number | null; depreciation_method: string | null; depreciation_start_on: string | null; status: string;
  accountant_confirmed: boolean; confirmed_by: string | null; confirmed_at: string | null; document_id: string | null; note: string | null; created_at: string;
}

export interface ExportRow {
  id: string; export_kind: string; period_from: string | null; period_to: string | null; format: string; generator: string; version: string; row_count: number; sha256: string; byte_size: number; generated_by: string; generated_at: string;
}

export interface ImportBatchRow {
  id: string; source_type: string; adapter: string; adapter_version: string; filename: string; sha256: string; byte_size: number; row_count: number; valid_rows: number;
  error_rows: number; duplicate_rows: number; status: string; error: string | null; imported_at: string | null; created_by: string; created_at: string;
}

export interface ImportRowRow {
  id: string; batch_id: string; row_no: number; raw: Record<string, unknown>; parsed: Record<string, unknown> | null; status: string; error: string | null; transaction_id: string | null; payment_id: string | null;
}

export interface MinibarProductRow {
  id: string; sku: string; name: string; unit_label: string; active: boolean; purchase_cost_cents: number; selling_price_cents: number; tax_code: string;
  purchase_tax_code: string | null; reorder_threshold: number; supplier_id: string | null; unit_id: string | null;
}

export interface MinibarStockRow {
  product_id: string; sku: string; name: string; active: boolean; reorder_threshold: number; purchase_cost_cents: number; selling_price_cents: number; tax_code: string;
  unit_id: string | null; on_hand: number; units_sold: number; shrinkage_units: number; complimentary_units: number; stock_value_cents: number;
}

export interface MinibarMovementRow {
  id: string; product_id: string; movement: string; quantity: number; unit_cost_cents: number | null; unit_price_cents: number | null; unit_id: string | null;
  booking_intent_id: string | null; booking_reference: string | null; charge_state: string; occurred_on: string; transaction_id: string | null; corrects_id: string | null;
  note: string | null; recorded_by: string; created_at: string;
}

export interface TurnoverCostRow {
  id: string; turnover_id: string; booking_intent_id: string | null; booking_reference: string | null; unit_id: string | null; departure: string; supplier_id: string | null;
  expected_net_cents: number; expected_tax_code: string | null; actual_line_id: string | null; state: string; note: string | null;
}

/* ── Aggregate views ─────────────────────────────────────────────────── */

export interface PlMonthlyRow {
  period_key: string; pl_group: string; category: string; unit_id: string | null; channel: string | null; revenue_net_cents: number; expense_net_cents: number; net_cents: number; gross_cents: number; transactions: number;
}

export interface CashMonthlyRow {
  period_key: string; source: string; kind: string; direction: string; account_id: string | null; net_cents: number; gross_cents: number; fee_cents: number; payments: number;
}

export interface UnitMonthlyRow {
  period_key: string; unit_id: string; category: string; pl_group: string; net_cents: number; transactions: number;
}

export interface ExceptionCountsRow {
  missing_documents: number; lines_needing_review: number; tax_code_review: number; input_vat_review: number; mismatches: number; unreconciled_revenue: number;
  unmatched_payments: number; unallocated_expense_lines: number; asset_candidates: number; failed_imports: number; minibar_open_charges: number; oldest_open_item: string | null;
}

/** A confirmed/paid stay as finance needs it: nights and unit, no guest data beyond a label. */
export interface StayRow {
  intent_id: string; reference: string; unit_id: string; unit_slug: string; check_in: string; check_out: string; status: string; payment_status: string;
  source: string; currency: string; quoted_total_cents: number | null; paid_amount_cents: number | null; refunded_amount_cents: number; confirmed_at: string | null; paid_at: string | null;
  guest_label: string | null;
}

/* ── Query shapes ──────────────────────────────────────────────────── */

export interface TransactionQuery {
  from?: string | null;
  to?: string | null;
  kind?: string | null;
  sourceType?: string | null;
  unitId?: string | null;
  category?: string | null;
  taxCode?: string | null;
  reviewState?: string | null;
  documentState?: string | null;
  reconciliationState?: string | null;
  paymentState?: string | null;
  channel?: string | null;
  counterpartyId?: string | null;
  status?: string | null;
  search?: string | null;
  minGrossCents?: number | null;
  maxGrossCents?: number | null;
  page: number;
  pageSize: number;
  sort?: 'booked_desc' | 'booked_asc' | 'amount_desc' | 'amount_asc';
}

export interface FinanceRowSource {
  ping(): Promise<boolean>;
  taxCodes(): Promise<TaxCodeRow[]>;
  categories(): Promise<CategoryRow[]>;
  taxRates(): Promise<TaxRateRowDb[]>;
  policy(): Promise<PolicyRow[]>;
  periods(): Promise<PeriodRow[]>;
  counterparties(): Promise<CounterpartyRow[]>;
  accounts(): Promise<AccountRow[]>;
  transactions(query: TransactionQuery): Promise<{ rows: TransactionRow[]; total: number }>;
  transaction(id: string): Promise<TransactionRow | null>;
  transactionsByBooking(intentId: string): Promise<TransactionRow[]>;
  lines(transactionIds: string[]): Promise<LineRow[]>;
  linesByFilter(filter: { from: string; to: string; category?: string | null; unitId?: string | null; taxCode?: string | null; classification?: string | null; assetState?: string | null; kinds?: string[] | null }): Promise<Array<LineRow & { transaction: TransactionRow }>>;
  overrides(targetIds: string[]): Promise<OverrideRow[]>;
  payments(query: { from?: string | null; to?: string | null; source?: string | null; reconciliationState?: string | null; page: number; pageSize: number }): Promise<{ rows: PaymentRow[]; total: number }>;
  payment(id: string): Promise<PaymentRow | null>;
  paymentsByBooking(intentId: string): Promise<PaymentRow[]>;
  unmatchedPayments(limit: number): Promise<PaymentRow[]>;
  openTransactionsForMatching(limit: number): Promise<TransactionRow[]>;
  reconciliations(filter: { transactionIds?: string[]; paymentIds?: string[] }): Promise<ReconciliationRow[]>;
  documents(query: { type?: string | null; reviewState?: string | null; page: number; pageSize: number; search?: string | null }): Promise<{ rows: DocumentRow[]; total: number }>;
  document(id: string): Promise<DocumentRow | null>;
  documentLinks(filter: { documentIds?: string[]; targets?: Array<{ type: string; id: string }> }): Promise<DocumentLinkRow[]>;
  invoices(query: { status?: string | null; page: number; pageSize: number }): Promise<{ rows: InvoiceRow[]; total: number }>;
  invoice(id: string): Promise<{ invoice: InvoiceRow; lines: InvoiceLineRow[] } | null>;
  invoicesByBooking(intentId: string): Promise<InvoiceRow[]>;
  taxPeriods(): Promise<TaxPeriodRow[]>;
  taxEstimates(periodIds?: string[]): Promise<TaxEstimateRow[]>;
  taxAdjustments(): Promise<TaxAdjustmentRow[]>;
  taxNotices(): Promise<TaxNoticeRow[]>;
  taxPayments(): Promise<TaxPaymentRow[]>;
  reserves(): Promise<ReserveRow[]>;
  assets(): Promise<AssetRow[]>;
  exports(limit: number): Promise<ExportRow[]>;
  importBatches(limit: number): Promise<ImportBatchRow[]>;
  importBatch(id: string): Promise<{ batch: ImportBatchRow; rows: ImportRowRow[] } | null>;
  minibarProducts(): Promise<MinibarProductRow[]>;
  minibarStock(): Promise<MinibarStockRow[]>;
  minibarMovements(limit: number, productId?: string | null): Promise<MinibarMovementRow[]>;
  turnoverCosts(filter: { from?: string | null; to?: string | null; state?: string | null }): Promise<TurnoverCostRow[]>;
  plMonthly(from: string, to: string): Promise<PlMonthlyRow[]>;
  vatMonthly(from: string, to: string): Promise<import('@/lib/finance/tax/vat').VatMonthlyRow[]>;
  cashMonthly(from: string, to: string): Promise<CashMonthlyRow[]>;
  unitMonthly(from: string, to: string): Promise<UnitMonthlyRow[]>;
  exceptionCounts(): Promise<ExceptionCountsRow>;
  /** Paid-side stays overlapping [from, to) — for nights, occupancy, ADR and forecasting. */
  stays(from: string, to: string): Promise<StayRow[]>;
  /** Units known to the booking core (id, slug, name). */
  units(): Promise<Array<{ id: string; slug: string; display_name: string; is_bookable: boolean }>>;
  /** Latest finance ingestion / import heartbeats, when recorded. */
  ingestionSignals(): Promise<Array<{ signal: string; observed_at: string; detail: string | null }>>;
}
