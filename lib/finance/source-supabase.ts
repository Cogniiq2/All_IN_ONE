import 'server-only';

/**
 * The production finance row source: Supabase, service role, explicit
 * column lists, server-side filters, paginated. No guest personal data is
 * selected from the booking core beyond a surname initial for the stay
 * label. Free text is reduced to a safe character set before it enters a
 * PostgREST filter.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type {
  AccountRow, AssetRow, CategoryRow, CashMonthlyRow, CounterpartyRow, DocumentLinkRow, DocumentRow, ExceptionCountsRow, ExportRow, FinanceRowSource, ImportBatchRow,
  ImportRowRow, OtaPayoutRow, ReservationCandidate, SettlementRow, InvoiceLineRow, InvoiceRow, LineRow, MinibarMovementRow, MinibarProductRow, MinibarStockRow, OverrideRow, PaymentRow, PeriodRow, PlMonthlyRow, PolicyRow,
  ReconciliationRow, ReserveRow, StayRow, TaxAdjustmentRow, TaxCodeRow, TaxEstimateRow, TaxNoticeRow, TaxPaymentRow, TaxPeriodRow, TaxRateRowDb, TransactionQuery,
  TransactionRow, TurnoverCostRow, UnitMonthlyRow,
} from '@/lib/finance/rows';
import type { VatMonthlyRow } from '@/lib/finance/tax/vat';
import { guestListLabel } from '@/lib/admin/format';

const TX = 'id, kind, booked_on, service_from, service_to, invoice_date, due_on, currency, net_cents, vat_cents, gross_cents, counterparty_id, counterparty_label, supplier_invoice_no, description, channel, booking_intent_id, booking_reference, unit_id, source_type, source_system, source_reference, import_batch_id, status, review_state, document_state, payment_state, reconciliation_state, correction_of, reversed_by, reversal_reason, note, posted_by, posted_at, updated_at';
const LINE = 'id, transaction_id, line_no, category, description, quantity, tax_code, rate_bp, net_cents, vat_cents, gross_cents, reverse_charge_vat_cents, input_vat_treatment, deductible_bp, unit_id, allocation_method, allocation_note, cost_centre, asset_state, minibar_product_id, classification, classified_by, classified_at';
const PAY = 'id, direction, source, provider_reference, account_id, amount_cents, fee_cents, currency, occurred_at, value_date, counterparty_label, reference_text, booking_intent_id, booking_reference, import_batch_id, kind, reconciliation_state, note, created_by, created_at';
const DOC = 'id, document_type, original_filename, mime_type, byte_size, sha256, source, structured_format, structured_valid, counterparty_id, tax_period_key, document_date, review_state, retention_class, retention_basis, retain_until, legal_hold, deletion_allowed, retention_review, supersedes_id, received_at, uploaded_by, note';
const INV = 'id, kind, series, number, status, issued_on, issued_at, issued_by, issuer_name, issuer_tax_id_masked, recipient_name, recipient_company, recipient_country, booking_intent_id, booking_reference, unit_id, service_from, service_to, currency, net_cents, vat_cents, gross_cents, payment_state, corrects_invoice_id, transaction_id, document_id, created_by, created_at';

function safeSearch(text: string): string {
  return text.replace(/[^A-Za-z0-9@._\- äöüÄÖÜß]/g, '').trim().slice(0, 80);
}

function num<T extends object>(row: T, keys: (keyof T)[]): T {
  const r = row as unknown as Record<string, unknown>;
  for (const k of keys) if (r[k as string] !== null && r[k as string] !== undefined) r[k as string] = Number(r[k as string]);
  return row;
}

const TX_NUM: (keyof TransactionRow)[] = ['net_cents', 'vat_cents', 'gross_cents'];

// No guest field exists on the settlement table; this list is also the whole of what a screen can see.
const SETTLEMENT = 'id, provider, identity_key, content_sha256, row_type, booking_number, payout_id, payout_date, check_in, check_out, currency, gross_cents, commission_cents, payment_service_fee_cents, net_cents, source_commission_cents, source_payment_service_fee_cents, reservation_status, payment_status, payments_service_provider, reservation_id, unit_id, match_state, match_candidates, local_gross_cents, local_currency, gross_delta_cents, gross_state, matched_at, amendment_state, supersedes_id, ledger_state, revenue_transaction_id, commission_transaction_id, fee_transaction_id, import_batch_id, import_row_id, created_by, created_at';
const SETTLEMENT_NUM: (keyof SettlementRow)[] = ['gross_cents', 'commission_cents', 'payment_service_fee_cents', 'net_cents', 'source_commission_cents', 'source_payment_service_fee_cents', 'local_gross_cents', 'gross_delta_cents', 'match_candidates'];
const LINE_NUM: (keyof LineRow)[] = ['net_cents', 'vat_cents', 'gross_cents', 'reverse_charge_vat_cents', 'deductible_bp', 'rate_bp', 'line_no'];
const PAY_NUM: (keyof PaymentRow)[] = ['amount_cents', 'fee_cents'];

export function supabaseFinanceSource(): FinanceRowSource {
  const db = () => supabaseAdmin();
  const all = async <T>(table: string, columns: string, order?: { column: string; ascending?: boolean }, limit?: number): Promise<T[]> => {
    let q = db().from(table).select(columns);
    if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as T[];
  };

  return {
    async ping() {
      const { error } = await db().from('bolagio_finance_tax_codes').select('code', { head: true, count: 'exact' });
      return !error;
    },
    taxCodes: () => all<TaxCodeRow>('bolagio_finance_tax_codes', 'code, label, description, side, treatment, rate_bp, reverse_charge, review_required, effective_from, effective_to, legal_reference, source_url, active', { column: 'code' }),
    categories: () => all<CategoryRow>('bolagio_finance_categories', 'code, label, pl_group, kind, default_tax_code, asset_candidate, requires_unit, datev_account_skr03, datev_account_skr04, datev_confirmed, sort_order, active', { column: 'sort_order' }),
    taxRates: () => all<TaxRateRowDb>('bolagio_finance_tax_rates', 'id, tax_type, jurisdiction, rate_bp, effective_from, effective_to, legal_reference, source_url, review_required, note', { column: 'effective_from' }),
    policy: () => all<PolicyRow>('bolagio_finance_policy', 'id, key, value, effective_from, effective_to, source_reference, set_by, created_at', { column: 'effective_from' }),
    periods: () => all<PeriodRow>('bolagio_finance_periods', 'period_key, starts_on, ends_on, status, status_at, status_by, locked_at, locked_by, note', { column: 'period_key', ascending: false }),
    counterparties: () => all<CounterpartyRow>('bolagio_finance_counterparties', 'id, name, kind, country, vat_id, default_category, default_tax_code, default_input_vat, default_allocation, auto_verify, match_patterns, active, note', { column: 'name' }),
    accounts: async () => (await all<AccountRow>('bolagio_finance_accounts', 'id, code, label, kind, currency, iban_masked, opening_balance_cents, opening_balance_on, active', { column: 'code' })).map((a) => num(a, ['opening_balance_cents'])),

    async transactions(query: TransactionQuery) {
      let q = db().from('bolagio_finance_transactions').select(TX, { count: 'exact' });
      if (query.from) q = q.gte('booked_on', query.from);
      if (query.to) q = q.lt('booked_on', query.to);
      if (query.kind) q = q.eq('kind', query.kind);
      if (query.sourceType) q = q.eq('source_type', query.sourceType);
      if (query.unitId) q = q.eq('unit_id', query.unitId);
      if (query.reviewState) q = q.eq('review_state', query.reviewState);
      if (query.documentState) q = q.eq('document_state', query.documentState);
      if (query.reconciliationState) q = q.eq('reconciliation_state', query.reconciliationState);
      if (query.paymentState) q = q.eq('payment_state', query.paymentState);
      if (query.channel) q = q.eq('channel', query.channel);
      if (query.counterpartyId) q = q.eq('counterparty_id', query.counterpartyId);
      if (query.status) q = q.eq('status', query.status);
      if (query.minGrossCents !== null && query.minGrossCents !== undefined) q = q.gte('gross_cents', query.minGrossCents);
      if (query.maxGrossCents !== null && query.maxGrossCents !== undefined) q = q.lte('gross_cents', query.maxGrossCents);
      if (query.search) {
        const s = safeSearch(query.search);
        if (s) q = q.or(`description.ilike.%${s}%,counterparty_label.ilike.%${s}%,booking_reference.ilike.%${s}%,supplier_invoice_no.ilike.%${s}%`);
      }
      if (query.category || query.taxCode) {
        let lq = db().from('bolagio_finance_transaction_lines').select('transaction_id');
        if (query.category) lq = lq.eq('category', query.category);
        if (query.taxCode) lq = lq.eq('tax_code', query.taxCode);
        const { data: ids, error: lerr } = await lq.limit(5000);
        if (lerr) throw lerr;
        const list = Array.from(new Set((ids ?? []).map((r: { transaction_id: string }) => r.transaction_id)));
        if (list.length === 0) return { rows: [], total: 0 };
        q = q.in('id', list.slice(0, 1000));
      }
      const sort = query.sort ?? 'booked_desc';
      q = q.order(sort.startsWith('amount') ? 'gross_cents' : 'booked_on', { ascending: sort.endsWith('asc') }).order('posted_at', { ascending: false });
      const from = (query.page - 1) * query.pageSize;
      const { data, error, count } = await q.range(from, from + query.pageSize - 1);
      if (error) throw error;
      return { rows: ((data ?? []) as unknown as TransactionRow[]).map((r) => num(r, TX_NUM)), total: count ?? 0 };
    },
    async transaction(id) {
      const { data, error } = await db().from('bolagio_finance_transactions').select(TX).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? num(data as unknown as TransactionRow, TX_NUM) : null;
    },
    async transactionsByBooking(intentId) {
      const { data, error } = await db().from('bolagio_finance_transactions').select(TX).eq('booking_intent_id', intentId).order('booked_on');
      if (error) throw error;
      return ((data ?? []) as unknown as TransactionRow[]).map((r) => num(r, TX_NUM));
    },
    async lines(ids) {
      if (ids.length === 0) return [];
      const out: LineRow[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await db().from('bolagio_finance_transaction_lines').select(LINE).in('transaction_id', ids.slice(i, i + 500)).order('line_no');
        if (error) throw error;
        out.push(...((data ?? []) as unknown as LineRow[]).map((r) => num(r, LINE_NUM)));
      }
      return out;
    },
    async linesByFilter(f) {
      let tq = db().from('bolagio_finance_transactions').select(TX).gte('booked_on', f.from).lt('booked_on', f.to);
      if (f.unitId) tq = tq.eq('unit_id', f.unitId);
      if (f.kinds && f.kinds.length > 0) tq = tq.in('kind', f.kinds);
      const { data: txs, error } = await tq.limit(5000);
      if (error) throw error;
      const txRows = ((txs ?? []) as unknown as TransactionRow[]).map((r) => num(r, TX_NUM));
      if (txRows.length === 0) return [];
      const byId = new Map(txRows.map((t) => [t.id, t]));
      const out: Array<LineRow & { transaction: TransactionRow }> = [];
      const ids = txRows.map((t) => t.id);
      for (let i = 0; i < ids.length; i += 500) {
        let lq = db().from('bolagio_finance_transaction_lines').select(LINE).in('transaction_id', ids.slice(i, i + 500));
        if (f.category) lq = lq.eq('category', f.category);
        if (f.taxCode) lq = lq.eq('tax_code', f.taxCode);
        if (f.classification) lq = lq.eq('classification', f.classification);
        if (f.assetState) lq = lq.eq('asset_state', f.assetState);
        if (f.unitId) lq = lq.eq('unit_id', f.unitId);
        const { data, error: lerr } = await lq;
        if (lerr) throw lerr;
        for (const raw of (data ?? []) as unknown as LineRow[]) {
          const l = num(raw, LINE_NUM);
          const t = byId.get(l.transaction_id);
          if (t) out.push({ ...l, transaction: t });
        }
      }
      return out;
    },
    async overrides(targetIds) {
      if (targetIds.length === 0) return [];
      const { data, error } = await db().from('bolagio_finance_overrides').select('id, target_type, target_id, field, old_value, new_value, reason, actor, created_at').in('target_id', targetIds.slice(0, 500)).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OverrideRow[];
    },
    async payments(query) {
      let q = db().from('bolagio_finance_payments').select(PAY, { count: 'exact' });
      if (query.from) q = q.gte('occurred_at', `${query.from}T00:00:00Z`);
      if (query.to) q = q.lt('occurred_at', `${query.to}T00:00:00Z`);
      if (query.source) q = q.eq('source', query.source);
      if (query.reconciliationState) q = q.eq('reconciliation_state', query.reconciliationState);
      const from = (query.page - 1) * query.pageSize;
      const { data, error, count } = await q.order('occurred_at', { ascending: false }).range(from, from + query.pageSize - 1);
      if (error) throw error;
      return { rows: ((data ?? []) as unknown as PaymentRow[]).map((r) => num(r, PAY_NUM)), total: count ?? 0 };
    },
    async payment(id) {
      const { data, error } = await db().from('bolagio_finance_payments').select(PAY).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? num(data as unknown as PaymentRow, PAY_NUM) : null;
    },
    async paymentsByBooking(intentId) {
      const { data, error } = await db().from('bolagio_finance_payments').select(PAY).eq('booking_intent_id', intentId).order('occurred_at');
      if (error) throw error;
      return ((data ?? []) as unknown as PaymentRow[]).map((r) => num(r, PAY_NUM));
    },
    async unmatchedPayments(limit) {
      const { data, error } = await db().from('bolagio_finance_payments').select(PAY).in('reconciliation_state', ['unmatched', 'needs_review', 'partially_matched']).order('occurred_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as PaymentRow[]).map((r) => num(r, PAY_NUM));
    },
    async openTransactionsForMatching(limit) {
      const { data, error } = await db().from('bolagio_finance_transactions').select(TX).eq('status', 'posted').in('reconciliation_state', ['unmatched', 'needs_review', 'partially_matched']).order('booked_on', { ascending: false }).limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as TransactionRow[]).map((r) => num(r, TX_NUM));
    },
    async reconciliations(filter) {
      const cols = 'id, transaction_id, payment_id, document_id, amount_cents, state, rule, rule_version, confidence, reason, matched_by, created_at';
      const out: ReconciliationRow[] = [];
      if (filter.transactionIds && filter.transactionIds.length > 0) {
        const { data, error } = await db().from('bolagio_finance_reconciliations').select(cols).in('transaction_id', filter.transactionIds.slice(0, 500)).order('created_at', { ascending: false });
        if (error) throw error;
        out.push(...((data ?? []) as unknown as ReconciliationRow[]));
      }
      if (filter.paymentIds && filter.paymentIds.length > 0) {
        const { data, error } = await db().from('bolagio_finance_reconciliations').select(cols).in('payment_id', filter.paymentIds.slice(0, 500)).order('created_at', { ascending: false });
        if (error) throw error;
        for (const r of (data ?? []) as unknown as ReconciliationRow[]) if (!out.some((x) => x.id === r.id)) out.push(r);
      }
      if (!filter.transactionIds && !filter.paymentIds) {
        const { data, error } = await db().from('bolagio_finance_reconciliations').select(cols).eq('state', 'needs_review').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        out.push(...((data ?? []) as unknown as ReconciliationRow[]));
      }
      return out.map((r) => num(r, ['amount_cents']));
    },
    async documents(query) {
      let q = db().from('bolagio_finance_documents').select(DOC, { count: 'exact' });
      if (query.type) q = q.eq('document_type', query.type);
      if (query.reviewState) q = q.eq('review_state', query.reviewState);
      if (query.search) {
        const s = safeSearch(query.search);
        if (s) q = q.ilike('original_filename', `%${s}%`);
      }
      const from = (query.page - 1) * query.pageSize;
      const { data, error, count } = await q.order('received_at', { ascending: false }).range(from, from + query.pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as DocumentRow[], total: count ?? 0 };
    },
    async document(id) {
      const { data, error } = await db().from('bolagio_finance_documents').select(DOC).eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as unknown as DocumentRow) ?? null;
    },
    async documentLinks(filter) {
      const cols = 'id, document_id, target_type, target_id, linked_by, created_at';
      if (filter.documentIds && filter.documentIds.length > 0) {
        const { data, error } = await db().from('bolagio_finance_document_links').select(cols).in('document_id', filter.documentIds.slice(0, 500));
        if (error) throw error;
        return (data ?? []) as unknown as DocumentLinkRow[];
      }
      if (filter.targets && filter.targets.length > 0) {
        const { data, error } = await db().from('bolagio_finance_document_links').select(cols).in('target_id', filter.targets.map((t) => t.id).slice(0, 500));
        if (error) throw error;
        return (data ?? []) as unknown as DocumentLinkRow[];
      }
      return [];
    },
    async invoices(query) {
      let q = db().from('bolagio_finance_invoices').select(INV, { count: 'exact' });
      if (query.status) q = q.eq('status', query.status);
      const from = (query.page - 1) * query.pageSize;
      const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + query.pageSize - 1);
      if (error) throw error;
      return { rows: ((data ?? []) as unknown as InvoiceRow[]).map((r) => num(r, ['net_cents', 'vat_cents', 'gross_cents'])), total: count ?? 0 };
    },
    async invoice(id) {
      const { data, error } = await db().from('bolagio_finance_invoices').select(INV).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: lines, error: lerr } = await db().from('bolagio_finance_invoice_lines').select('id, invoice_id, line_no, description, quantity, category, tax_code, rate_bp, net_cents, vat_cents, gross_cents').eq('invoice_id', id).order('line_no');
      if (lerr) throw lerr;
      return { invoice: num(data as unknown as InvoiceRow, ['net_cents', 'vat_cents', 'gross_cents']), lines: ((lines ?? []) as unknown as InvoiceLineRow[]).map((l) => num(l, ['net_cents', 'vat_cents', 'gross_cents', 'rate_bp', 'quantity'])) };
    },
    async invoicesByBooking(intentId) {
      const { data, error } = await db().from('bolagio_finance_invoices').select(INV).eq('booking_intent_id', intentId).order('created_at');
      if (error) throw error;
      return ((data ?? []) as unknown as InvoiceRow[]).map((r) => num(r, ['net_cents', 'vat_cents', 'gross_cents']));
    },
    taxPeriods: () => all<TaxPeriodRow>('bolagio_finance_tax_periods', 'id, tax_type, period_key, starts_on, ends_on, filing_due_on, payment_due_on, official_due_on, status, status_at, status_by, note', { column: 'starts_on', ascending: false }),
    async taxEstimates(periodIds) {
      let q = db().from('bolagio_finance_tax_estimates').select('id, tax_period_id, stage, amount_cents, basis, rules_version, computed_at, actor, note, document_id').order('computed_at', { ascending: false });
      if (periodIds && periodIds.length > 0) q = q.in('tax_period_id', periodIds.slice(0, 500));
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      return ((data ?? []) as unknown as TaxEstimateRow[]).map((r) => num(r, ['amount_cents']));
    },
    taxAdjustments: async () => (await all<TaxAdjustmentRow>('bolagio_finance_tax_adjustments', 'id, tax_type, fiscal_year, kind, amount_cents, reason, legal_reference, actor, superseded_by, created_at', { column: 'created_at', ascending: false })).map((r) => num(r, ['amount_cents'])),
    async taxNotices() {
      const { data, error } = await db().from('bolagio_finance_tax_notices').select('id, tax_type, period_key, authority, notice_type, assessment_date, received_on, assessed_cents, advance_payment_cents, paid_cents, status, document_id, tax_period_id, note, created_by, created_at, bolagio_finance_tax_notice_dues(id, due_on, amount_cents, label, paid_cents, paid_on)').order('received_on', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Omit<TaxNoticeRow, 'dues'> & { bolagio_finance_tax_notice_dues?: TaxNoticeRow['dues'] }>).map((r) => {
        const { bolagio_finance_tax_notice_dues, ...rest } = r;
        return { ...num(rest as TaxNoticeRow, ['assessed_cents', 'advance_payment_cents', 'paid_cents']), dues: (bolagio_finance_tax_notice_dues ?? []).map((d) => ({ ...d, amount_cents: Number(d.amount_cents), paid_cents: Number(d.paid_cents) })) };
      });
    },
    taxPayments: async () => (await all<TaxPaymentRow>('bolagio_finance_tax_payments', 'id, tax_type, period_key, kind, amount_cents, paid_on, payment_id, notice_id, note, created_at', { column: 'paid_on', ascending: false })).map((r) => num(r, ['amount_cents'])),
    reserves: async () => (await all<ReserveRow>('bolagio_finance_reserves', 'id, kind, label, amount_cents, account_id, as_of, note, set_by, created_at', { column: 'created_at', ascending: false }, 200)).map((r) => num(r, ['amount_cents'])),
    assets: async () => (await all<AssetRow>('bolagio_finance_assets', 'id, description, line_id, counterparty_id, purchased_on, acquisition_cents, unit_id, category, useful_life_months, depreciation_method, depreciation_start_on, status, accountant_confirmed, confirmed_by, confirmed_at, document_id, note, created_at', { column: 'purchased_on', ascending: false })).map((r) => num(r, ['acquisition_cents'])),
    exports: (limit) => all<ExportRow>('bolagio_finance_exports', 'id, export_kind, period_from, period_to, format, generator, version, row_count, sha256, byte_size, generated_by, generated_at', { column: 'generated_at', ascending: false }, limit),
    importBatches: (limit) => all<ImportBatchRow>('bolagio_finance_import_batches', 'id, source_type, adapter, adapter_version, filename, sha256, byte_size, row_count, valid_rows, error_rows, duplicate_rows, status, error, imported_at, created_by, created_at', { column: 'created_at', ascending: false }, limit),
    async importBatch(id) {
      const { data, error } = await db().from('bolagio_finance_import_batches').select('id, source_type, adapter, adapter_version, filename, sha256, byte_size, row_count, valid_rows, error_rows, duplicate_rows, status, error, imported_at, created_by, created_at').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const settlementCol = data.source_type === 'booking_com_finance_statement' ? ', settlement_id' : '';
      const { data: rows, error: rerr } = await db().from('bolagio_finance_import_rows').select(`id, batch_id, row_no, raw, parsed, status, error, transaction_id, payment_id${settlementCol}`).eq('batch_id', id).order('row_no').limit(5000);
      if (rerr) throw rerr;
      return { batch: data as unknown as ImportBatchRow, rows: (rows ?? []) as unknown as ImportRowRow[] };
    },
    async otaSettlements(filter) {
      let q = db().from('bolagio_finance_ota_settlements').select(SETTLEMENT).order('payout_date', { ascending: false }).order('booking_number').limit(filter.limit ?? 5000);
      if (filter.batchId) q = q.eq('import_batch_id', filter.batchId);
      else if (filter.ids) q = q.in('id', filter.ids.slice(0, 500));
      else {
        q = q.in('amendment_state', ['current', 'conflict']);
        const col = filter.basis === 'checkout' ? 'check_out' : 'payout_date';
        if (filter.from) q = q.gte(col, filter.from);
        if (filter.to) q = q.lt(col, filter.to);
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as SettlementRow[]).map((r) => num(r, SETTLEMENT_NUM));
    },
    otaPayouts: () => all<OtaPayoutRow>('bolagio_finance_ota_payouts', 'id, provider, payout_id, payout_date, currency, bank_state, bank_payment_id, bank_matched_at, first_import_batch_id, created_at', { column: 'payout_date', ascending: false }, 2000),
    async reservationsByChannelReference(refs) {
      const unique = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
      const out: ReservationCandidate[] = [];
      for (let i = 0; i < unique.length; i += 200) {
        const { data, error } = await db().from('bolagio_reservations').select('id, unit_id, channel_reference, source, provider_status, status_class, check_in, check_out, currency, total_amount_cents').in('channel_reference', unique.slice(i, i + 200));
        if (error) throw error;
        out.push(...((data ?? []) as unknown as ReservationCandidate[]).map((r) => num(r, ['total_amount_cents'])));
      }
      return out;
    },
    minibarProducts: async () => (await all<MinibarProductRow>('bolagio_minibar_products', 'id, sku, name, unit_label, active, purchase_cost_cents, selling_price_cents, tax_code, purchase_tax_code, reorder_threshold, supplier_id, unit_id', { column: 'name' })).map((r) => num(r, ['purchase_cost_cents', 'selling_price_cents', 'reorder_threshold'])),
    minibarStock: async () => (await all<MinibarStockRow>('bolagio_minibar_stock', 'product_id, sku, name, active, reorder_threshold, purchase_cost_cents, selling_price_cents, tax_code, unit_id, on_hand, units_sold, shrinkage_units, complimentary_units, stock_value_cents', { column: 'name' })).map((r) => num(r, ['purchase_cost_cents', 'selling_price_cents', 'reorder_threshold', 'on_hand', 'units_sold', 'shrinkage_units', 'complimentary_units', 'stock_value_cents'])),
    async minibarMovements(limit, productId) {
      let q = db().from('bolagio_minibar_movements').select('id, product_id, movement, quantity, unit_cost_cents, unit_price_cents, unit_id, booking_intent_id, booking_reference, charge_state, occurred_on, transaction_id, corrects_id, note, recorded_by, created_at').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
      if (productId) q = q.eq('product_id', productId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as MinibarMovementRow[]).map((r) => num(r, ['quantity', 'unit_cost_cents', 'unit_price_cents']));
    },
    async turnoverCosts(filter) {
      let q = db().from('bolagio_finance_turnover_costs').select('id, turnover_id, booking_intent_id, booking_reference, unit_id, departure, supplier_id, expected_net_cents, expected_tax_code, actual_line_id, state, note').order('departure', { ascending: false }).limit(1000);
      if (filter.from) q = q.gte('departure', filter.from);
      if (filter.to) q = q.lt('departure', filter.to);
      if (filter.state) q = q.eq('state', filter.state);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as TurnoverCostRow[]).map((r) => num(r, ['expected_net_cents']));
    },
    async plMonthly(from, to) {
      const { data, error } = await db().from('bolagio_finance_pl_monthly').select('period_key, pl_group, category, unit_id, channel, revenue_net_cents, expense_net_cents, net_cents, gross_cents, transactions').gte('period_key', from.slice(0, 7)).lt('period_key', to.slice(0, 7) === from.slice(0, 7) ? `${to.slice(0, 7)}~` : to.slice(0, 7) + (to.slice(8, 10) === '01' ? '' : '~'));
      if (error) throw error;
      return ((data ?? []) as unknown as PlMonthlyRow[]).map((r) => num(r, ['revenue_net_cents', 'expense_net_cents', 'net_cents', 'gross_cents', 'transactions']));
    },
    async vatMonthly(from, to) {
      const { data, error } = await db().from('bolagio_finance_vat_monthly').select('period_key, tax_code, treatment, rate_bp, output_basis_cents, output_vat_cents, input_basis_cents, input_vat_cents, non_deductible_vat_cents, review_vat_cents, rc_basis_cents, rc_output_vat_cents, rc_input_vat_cents, lines_needing_review').gte('period_key', from.slice(0, 7)).lte('period_key', to.slice(0, 7) + (to.slice(8, 10) === '01' ? '' : '~')).lt('period_key', to.slice(8, 10) === '01' ? to.slice(0, 7) : `${to.slice(0, 7)}~`);
      if (error) throw error;
      return ((data ?? []) as unknown as VatMonthlyRow[]).map((r) => num(r, ['output_basis_cents', 'output_vat_cents', 'input_basis_cents', 'input_vat_cents', 'non_deductible_vat_cents', 'review_vat_cents', 'rc_basis_cents', 'rc_output_vat_cents', 'rc_input_vat_cents', 'lines_needing_review', 'rate_bp']));
    },
    async cashMonthly(from, to) {
      const { data, error } = await db().from('bolagio_finance_cash_monthly').select('period_key, source, kind, direction, account_id, net_cents, gross_cents, fee_cents, payments').gte('period_key', from.slice(0, 7)).lt('period_key', to.slice(8, 10) === '01' ? to.slice(0, 7) : `${to.slice(0, 7)}~`);
      if (error) throw error;
      return ((data ?? []) as unknown as CashMonthlyRow[]).map((r) => num(r, ['net_cents', 'gross_cents', 'fee_cents', 'payments']));
    },
    async unitMonthly(from, to) {
      const { data, error } = await db().from('bolagio_finance_unit_monthly').select('period_key, unit_id, category, pl_group, net_cents, transactions').gte('period_key', from.slice(0, 7)).lt('period_key', to.slice(8, 10) === '01' ? to.slice(0, 7) : `${to.slice(0, 7)}~`);
      if (error) throw error;
      return ((data ?? []) as unknown as UnitMonthlyRow[]).map((r) => num(r, ['net_cents', 'transactions']));
    },
    async exceptionCounts() {
      const { data, error } = await db().from('bolagio_finance_exception_counts').select('*').single();
      if (error) throw error;
      const r = data as unknown as ExceptionCountsRow;
      return num(r, ['missing_documents', 'lines_needing_review', 'tax_code_review', 'input_vat_review', 'mismatches', 'unreconciled_revenue', 'unmatched_payments', 'unallocated_expense_lines', 'asset_candidates', 'failed_imports', 'minibar_open_charges']);
    },
    async stays(from, to) {
      const { data, error } = await db().from('bolagio_booking_intents')
        .select('id, reference, unit_id, check_in, check_out, status, payment_status, source, currency, quoted_total_cents, paid_amount_cents, refunded_amount_cents, confirmed_at, paid_at, guest_first_name, guest_last_name, bolagio_units(slug)')
        .in('status', ['confirmed', 'paid', 'paid_unfinalized', 'finalizing', 'finalization_failed'])
        .lt('check_in', to).gt('check_out', from).limit(5000);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Record<string, unknown> & { bolagio_units?: { slug: string } | { slug: string }[] | null }>).map((r) => {
        const unit = Array.isArray(r.bolagio_units) ? r.bolagio_units[0] : r.bolagio_units;
        return {
          intent_id: r.id as string, reference: r.reference as string, unit_id: r.unit_id as string, unit_slug: unit?.slug ?? '', check_in: r.check_in as string, check_out: r.check_out as string,
          status: r.status as string, payment_status: r.payment_status as string, source: r.source as string, currency: r.currency as string,
          quoted_total_cents: r.quoted_total_cents === null ? null : Number(r.quoted_total_cents), paid_amount_cents: r.paid_amount_cents === null ? null : Number(r.paid_amount_cents),
          refunded_amount_cents: Number(r.refunded_amount_cents ?? 0), confirmed_at: (r.confirmed_at as string | null) ?? null, paid_at: (r.paid_at as string | null) ?? null,
          guest_label: guestListLabel(r.guest_first_name as string | null, r.guest_last_name as string | null),
        } satisfies StayRow;
      });
    },
    async units() {
      const { data, error } = await db().from('bolagio_units').select('id, slug, display_name, is_bookable').order('display_name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; slug: string; display_name: string; is_bookable: boolean }>;
    },
    async ingestionSignals() {
      const { data, error } = await db().from('bolagio_integration_health').select('signal, observed_at, detail').eq('provider', 'finance').order('observed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ signal: string; observed_at: string; detail: string | null }>;
    },
  };
}
