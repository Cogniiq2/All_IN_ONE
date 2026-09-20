import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE COMMANDS — every write, through the database's own functions.
 *
 * Nothing here writes a booking table. Nothing here talks to PayPal, Beds24
 * or a bank. The runners at the bottom (ingestion, reconciliation, import,
 * tax estimates, exports) compose the pure rules in `lib/finance/*` with
 * the command functions in the migration, which enforce the invariants.
 *
 * In fixture / preview mode nothing here runs: the actions refuse first.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { classifyExpense } from '@/lib/finance/categorization';
import { proposeMatches, type MatchProposal } from '@/lib/finance/reconciliation';
import { capturePayment, expectedTurnoverCost, refundCashFact, refundPosting, revenuePosting, type BookingFact } from '@/lib/finance/ingestion-rules';
import { stageCsv, type AdapterId, type StagedRow } from '@/lib/finance/import/adapters';
import { sha256Hex } from '@/lib/finance/documents';
import { buildDraft, canIssue, type InvoiceDraft, type StayForInvoice } from '@/lib/finance/invoices';
import { issuerIdentity, financeConfig } from '@/lib/finance/config';
import { computeVatPosition, vatBasis, VAT_RULES_VERSION } from '@/lib/finance/tax/vat';
import { companyTaxBasis, estimateCompanyTaxes, COMPANY_TAX_RULES_VERSION, type TaxAdjustment } from '@/lib/finance/tax/company';
import { calculatedDeadlines } from '@/lib/finance/tax/calendar';
import { vatPeriodKeysBetween } from '@/lib/finance/tax/calendar';
import { calendarPolicyFrom } from '@/lib/finance/config';
import { periodRange, yearRange, berlinToday, type IsoDate } from '@/lib/finance/periods';
import { supabaseFinanceSource } from '@/lib/finance/source-supabase';
import type { CounterpartyRow, TaxRateRowDb } from '@/lib/finance/rows';
import { fromNet, splitGross } from '@/lib/finance/money';
import { REVIEW_REQUIRED_CODE, requireTaxCode } from '@/lib/finance/tax-codes';
import { allocateInvoiceNumber } from '@/lib/invoicing/numbering';
import { FinanceCommandError, asFinanceError, errorMessage } from '@/lib/finance/errors';

type Json = Record<string, unknown>;

async function rpc<T = Json>(fn: string, args: Json): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw new FinanceCommandError(fn, error);
  return data as T;
}

async function observe(signal: string, detail?: string): Promise<void> {
  try {
    await supabaseAdmin().rpc('bolagio_observe_integration', { p_provider: 'finance', p_signal: signal, p_detail: detail ?? null });
  } catch {
    /* the heartbeat is best-effort */
  }
}

/* ── Command wrappers ─────────────────────────────────────────────────── */

export interface PostResult { ok: boolean; created: boolean; id: string }

export async function postTransaction(header: Json, lines: Json[], actor: string): Promise<PostResult> {
  return rpc<PostResult>('bolagio_finance_post_transaction', { p_header: header, p_lines: lines, p_actor: actor });
}

export async function reverseTransaction(id: string, reason: string, actor: string, bookedOn?: IsoDate): Promise<Json> {
  return rpc('bolagio_finance_reverse_transaction', { p_id: id, p_reason: reason, p_actor: actor, p_booked_on: bookedOn ?? null });
}

export async function reclassifyLine(lineId: string, patch: Json, reason: string, actor: string, asAccountant = false): Promise<Json> {
  return rpc('bolagio_finance_reclassify_line', { p_line_id: lineId, p_patch: patch, p_reason: reason, p_actor: actor, p_as_accountant: asAccountant });
}

export async function setTransactionState(id: string, patch: Json, actor: string, reason?: string): Promise<Json> {
  return rpc('bolagio_finance_set_transaction_state', { p_id: id, p_patch: patch, p_actor: actor, p_reason: reason ?? null });
}

export async function recordPayment(payment: Json, actor: string): Promise<PostResult> {
  return rpc<PostResult>('bolagio_finance_record_payment', { p_payment: payment, p_actor: actor });
}

export async function recordMatch(match: Json, actor: string): Promise<Json> {
  return rpc('bolagio_finance_record_match', { p_match: match, p_actor: actor });
}

export async function registerDocument(doc: Json, actor: string): Promise<Json> {
  return rpc('bolagio_finance_register_document', { p_doc: doc, p_actor: actor });
}

export async function linkDocument(documentId: string, targetType: string, targetId: string, actor: string): Promise<Json> {
  return rpc('bolagio_finance_link_document', { p_document_id: documentId, p_target_type: targetType, p_target_id: targetId, p_actor: actor });
}

export async function setPeriodStatus(periodKey: string, to: string, actor: string, asAccountant = false, note?: string): Promise<Json> {
  return rpc('bolagio_finance_set_period_status', { p_period_key: periodKey, p_to: to, p_actor: actor, p_as_accountant: asAccountant, p_note: note ?? null });
}

export async function recordTaxStage(input: { taxType: string; periodKey: string; startsOn: IsoDate; endsOn: IsoDate; stage: string; amountCents: number; basis: Json; rulesVersion: string; actor: string; asAccountant?: boolean; note?: string; filingDueOn?: IsoDate | null; paymentDueOn?: IsoDate | null }): Promise<Json> {
  return rpc('bolagio_finance_record_tax_stage', {
    p_tax_type: input.taxType, p_period_key: input.periodKey, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_stage: input.stage, p_amount_cents: input.amountCents,
    p_basis: input.basis, p_rules_version: input.rulesVersion, p_actor: input.actor, p_as_accountant: input.asAccountant ?? false, p_note: input.note ?? null,
    p_filing_due_on: input.filingDueOn ?? null, p_payment_due_on: input.paymentDueOn ?? null,
  });
}

export async function recordMinibarMovement(move: Json, actor: string): Promise<Json> {
  return rpc('bolagio_minibar_record_movement', { p_move: move, p_actor: actor });
}

/* Plain inserts for tables without a command function (reference and registry data). */

async function insert<T extends Json>(table: string, row: Json): Promise<T> {
  const { data, error } = await supabaseAdmin().from(table).insert(row).select().single();
  if (error) throw error;
  return data as T;
}

export const insertCounterparty = (row: Json) => insert('bolagio_finance_counterparties', row);
export const insertAccount = (row: Json) => insert('bolagio_finance_accounts', row);
export const insertProduct = (row: Json) => insert('bolagio_minibar_products', row);
export const insertReserve = (row: Json) => insert('bolagio_finance_reserves', row);
export const insertTaxAdjustment = (row: Json) => insert('bolagio_finance_tax_adjustments', row);
export const insertTaxPayment = (row: Json) => insert('bolagio_finance_tax_payments', row);
export const insertAsset = (row: Json) => insert('bolagio_finance_assets', row);
export const insertPolicy = (row: Json) => insert('bolagio_finance_policy', row);
export const insertTaxRate = (row: Json) => insert('bolagio_finance_tax_rates', row);
export const insertExport = (row: Json) => insert('bolagio_finance_exports', row);

export async function insertTaxNotice(notice: Json, dues: Json[]): Promise<Json> {
  const row = await insert<Json & { id: string }>('bolagio_finance_tax_notices', notice);
  if (dues.length > 0) {
    const { error } = await supabaseAdmin().from('bolagio_finance_tax_notice_dues').insert(dues.map((d) => ({ ...d, notice_id: row.id })));
    if (error) throw error;
  }
  return row;
}

export async function updateTaxNoticeStatus(id: string, status: string): Promise<void> {
  const { error } = await supabaseAdmin().from('bolagio_finance_tax_notices').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function updateCounterparty(id: string, patch: Json): Promise<void> {
  const { error } = await supabaseAdmin().from('bolagio_finance_counterparties').update(patch).eq('id', id);
  if (error) throw error;
}

export async function updateAsset(id: string, patch: Json): Promise<void> {
  const { error } = await supabaseAdmin().from('bolagio_finance_assets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setMinibarChargeState(movementId: string, chargeState: string, actor: string, note: string): Promise<void> {
  // Movements are append-only: a charge-state change is a correction movement of zero effect plus a transaction state change.
  const { data, error } = await supabaseAdmin().from('bolagio_minibar_movements').select('id, transaction_id, product_id, unit_id, booking_intent_id, booking_reference, occurred_on').eq('id', movementId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('movement not found');
  if (data.transaction_id) {
    await setTransactionState(data.transaction_id, { payment_state: chargeState === 'paid' ? 'paid' : chargeState === 'unpaid' ? 'unpaid' : 'not_applicable', reconciliation_state: chargeState === 'paid' || chargeState === 'unpaid' ? 'unmatched' : 'not_applicable' }, actor, `minibar charge ${chargeState}: ${note}`);
  }
  await recordMinibarMovement({ product_id: data.product_id, movement: 'correction', quantity: 1, unit_id: data.unit_id, booking_intent_id: data.booking_intent_id, booking_reference: data.booking_reference, charge_state: chargeState, occurred_on: data.occurred_on, corrects_id: movementId, note: `charge state → ${chargeState}: ${note}` }, actor).catch(() => undefined);
}

/* ── Ingestion: booking facts → finance facts ─────────────────────────── */

interface IntentFactRow {
  id: string; reference: string; unit_id: string; source: string; status: string; payment_status: string; check_in: string; check_out: string; currency: string;
  quoted_total_cents: number | null; quote_components: unknown; paid_amount_cents: number | null; paid_currency: string | null; payment_capture_id: string | null; payment_provider: string | null;
  paid_at: string | null; confirmed_at: string | null; refund_state: string | null; refund_id: string | null; refunded_amount_cents: number | null; refund_completed_at: string | null; cancellation_completed_at: string | null;
}

export interface IngestionReport {
  scanned: number;
  revenuePosted: number;
  paymentsRecorded: number;
  refundsPosted: number;
  /** Refunds whose stay was never recognised as revenue: the cash is recorded, the reversal has nothing to reverse. */
  refundsWithoutRevenue: number;
  turnoverCosts: number;
  matches: number;
  errors: string[];
}

function toFact(r: IntentFactRow): BookingFact {
  const components = Array.isArray(r.quote_components) ? (r.quote_components as BookingFact['components']) : [];
  return {
    intentId: r.id, reference: r.reference, unitId: r.unit_id, source: r.source, status: r.status, paymentStatus: r.payment_status, checkIn: r.check_in, checkOut: r.check_out, currency: r.currency,
    quotedTotalCents: r.quoted_total_cents === null ? null : Number(r.quoted_total_cents), paidAmountCents: r.paid_amount_cents === null ? null : Number(r.paid_amount_cents), paidCurrency: r.paid_currency,
    paymentCaptureId: r.payment_capture_id, paymentProvider: r.payment_provider, paidAt: r.paid_at, confirmedAt: r.confirmed_at, refundState: r.refund_state, refundId: r.refund_id,
    refundedAmountCents: Number(r.refunded_amount_cents ?? 0), refundCompletedAt: r.refund_completed_at, cancellationCompletedAt: r.cancellation_completed_at,
    components: components.length > 0 ? components : r.quoted_total_cents ? [{ code: 'total', label: 'Accommodation', amountCents: Number(r.quoted_total_cents), taxCategory: 'accommodation', mandatory: true }] : [],
  };
}

/**
 * Idempotent: every source key posts once. Safe to run every pass. Reads
 * the booking core; writes only finance tables.
 */
export async function ingestBookingFacts(options: { since?: IsoDate; limit?: number; actor?: string } = {}): Promise<IngestionReport> {
  const actor = options.actor ?? 'system:ingestion';
  const report: IngestionReport = { scanned: 0, revenuePosted: 0, paymentsRecorded: 0, refundsPosted: 0, refundsWithoutRevenue: 0, turnoverCosts: 0, matches: 0, errors: [] };
  const db = supabaseAdmin();
  let q = db.from('bolagio_booking_intents')
    .select('id, reference, unit_id, source, status, payment_status, check_in, check_out, currency, quoted_total_cents, quote_components, paid_amount_cents, paid_currency, payment_capture_id, payment_provider, paid_at, confirmed_at, refund_state, refund_id, refunded_amount_cents, refund_completed_at, cancellation_completed_at')
    .or('status.in.(confirmed,paid,paid_unfinalized,finalizing,finalization_failed),refund_state.eq.completed')
    .order('updated_at', { ascending: false }).limit(options.limit ?? 500);
  if (options.since) q = q.gte('updated_at', `${options.since}T00:00:00Z`);
  const { data, error } = await q;
  if (error) throw asFinanceError('booking_intents.select', error);
  const config = financeConfig();
  const accommodationCode = config.accommodationTaxCode ?? 'DE_ACCOMMODATION_REDUCED';
  for (const raw of (data ?? []) as IntentFactRow[]) {
    report.scanned += 1;
    const fact = toFact(raw);
    // Three INDEPENDENT facts. A revenue posting that the database refuses —
    // a locked period, an inactive tax code — must not take the guest's
    // money with it: the capture and the refund are cash facts that happened
    // whatever the P&L does, and each one is recorded, or reported, alone.
    const step = async (what: string, run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (cause) {
        report.errors.push(`${fact.reference} (${what}): ${errorMessage(cause)}`);
      }
    };

    await step('revenue', async () => {
      const rev = revenuePosting(fact, accommodationCode);
      if (!rev) return;
      const r = await postTransaction(rev.header, rev.lines, actor);
      if (r.created) report.revenuePosted += 1;
    });

    await step('capture', async () => {
      const cap = capturePayment(fact);
      if (!cap) return;
      const r = await recordPayment(cap, actor);
      if (r.created) report.paymentsRecorded += 1;
    });

    if (fact.refundState === 'completed' && fact.refundId) {
      // The outgoing cash is recorded FIRST and unconditionally. It does not
      // depend on a revenue transaction existing: a stay cancelled and
      // refunded before the first ingestion pass never had one, and nesting
      // the refund payment under that lookup lost the money silently —
      // cash in recorded, cash out never, on every pass, for ever.
      await step('refund payment', async () => {
        const cash = refundCashFact(fact);
        if (!cash) return;
        const p = await recordPayment(cash, actor);
        if (p.created) report.paymentsRecorded += 1;
      });

      await step('refund posting', async () => {
        const { data: orig, error: oerr } = await db.from('bolagio_finance_transactions').select('id').eq('source_system', 'booking').eq('source_reference', `booking:${fact.intentId}`).maybeSingle();
        if (oerr) throw asFinanceError('finance_transactions.select', oerr);
        if (!orig) {
          // Nothing to reverse pro-rata. The cash fact above stands on its
          // own and surfaces as an unmatched outgoing payment, which is the
          // honest state: money left, and no stay was ever recognised.
          report.refundsWithoutRevenue += 1;
          return;
        }
        const { data: lines, error: lerr } = await db.from('bolagio_finance_transaction_lines').select('line_no, category, description, tax_code, rate_bp, gross_cents, unit_id').eq('transaction_id', orig.id).order('line_no');
        if (lerr) throw asFinanceError('finance_transaction_lines.select', lerr);
        const refund = refundPosting(fact, ((lines ?? []) as Array<{ line_no: number; category: string; description: string | null; tax_code: string; rate_bp: number; gross_cents: number; unit_id: string | null }>).map((l) => ({ ...l, gross_cents: Number(l.gross_cents), rate_bp: Number(l.rate_bp) })));
        if (!refund) return;
        const r = await postTransaction(refund.header, refund.lines, actor);
        if (r.created) report.refundsPosted += 1;
      });
    }
  }
  // Expected cleaning costs for turnovers: only when a cleaning policy exists (a counterparty with a default cleaning category and a configured expected cost).
  try {
    report.turnoverCosts = await syncTurnoverCosts();
  } catch (cause) {
    report.errors.push(`turnover costs: ${errorMessage(cause)}`);
  }
  try {
    report.matches = (await runReconciliation(actor)).recorded;
  } catch (cause) {
    report.errors.push(`reconciliation: ${errorMessage(cause)}`);
  }
  await observe(report.errors.length > 0 ? 'booking_ingestion.failure' : 'booking_ingestion.success', `${report.scanned} scanned, ${report.revenuePosted} revenue, ${report.paymentsRecorded} payments, ${report.refundsPosted} refunds, ${report.errors.length} errors`);
  return report;
}

/** Expected cleaning cost per turnover from `FINANCE_CLEANING_EXPECTED_NET_CENTS` (integer) — an expectation, never an expense. */
export async function syncTurnoverCosts(): Promise<number> {
  const expected = Number.parseInt(process.env.FINANCE_CLEANING_EXPECTED_NET_CENTS ?? '', 10);
  if (!Number.isFinite(expected) || expected <= 0) return 0;
  const db = supabaseAdmin();
  const { data: cps } = await db.from('bolagio_finance_counterparties').select('id').eq('default_category', 'cleaning').eq('active', true).limit(1);
  const supplierId = (cps?.[0] as { id: string } | undefined)?.id ?? null;
  const { data: turnovers, error } = await db.from('bolagio_turnovers').select('id, intent_id, unit_id, departure, status, bolagio_booking_intents(reference)').in('status', ['required', 'in_progress', 'done']).gte('departure', new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)).limit(500);
  if (error) throw error;
  let created = 0;
  for (const t of (turnovers ?? []) as Array<{ id: string; intent_id: string; unit_id: string; departure: string; bolagio_booking_intents?: { reference: string } | { reference: string }[] | null }>) {
    const ref = Array.isArray(t.bolagio_booking_intents) ? t.bolagio_booking_intents[0]?.reference : t.bolagio_booking_intents?.reference;
    const row = expectedTurnoverCost({ id: t.id, intent_id: t.intent_id, unit_id: t.unit_id, departure: t.departure, reference: ref ?? null }, { expectedNetCents: expected, supplierId, taxCode: 'DE_STANDARD' });
    if (!row) continue;
    const { error: ierr, data } = await db.from('bolagio_finance_turnover_costs').upsert(row, { onConflict: 'turnover_id', ignoreDuplicates: true }).select('id');
    if (ierr) throw ierr;
    if (data && data.length > 0) created += 1;
  }
  return created;
}

/* ── Reconciliation runner ────────────────────────────────────────────── */

export interface ReconciliationRunReport { proposals: number; recorded: number; autoMatched: number; forReview: number }

export async function runReconciliation(actor = 'system:reconciliation'): Promise<ReconciliationRunReport> {
  const source = supabaseFinanceSource();
  const [transactions, payments] = await Promise.all([source.openTransactionsForMatching(1000), source.unmatchedPayments(1000)]);
  const proposals = proposeMatches({ transactions, payments });
  let recorded = 0, auto = 0, review = 0;
  for (const p of proposals) {
    const r = await recordMatch(proposalToMatch(p), actor);
    if ((r as { created?: boolean }).created) {
      recorded += 1;
      if (p.autoApply) auto += 1; else review += 1;
    }
  }
  await observe('reconciliation.success', `${proposals.length} proposals, ${auto} auto, ${review} for review`);
  return { proposals: proposals.length, recorded, autoMatched: auto, forReview: review };
}

export function proposalToMatch(p: MatchProposal): Json {
  return { transaction_id: p.transactionId, payment_id: p.paymentId, amount_cents: p.amountCents, state: p.autoApply ? p.state : 'needs_review', rule: p.rule, rule_version: p.ruleVersion, confidence: p.confidence, reason: p.reason };
}

/** A person confirms a proposed match: the needs_review row is superseded by a matched row. */
export async function confirmMatch(transactionId: string, paymentId: string, actor: string, amountCents: number): Promise<Json> {
  await supabaseAdmin().from('bolagio_finance_reconciliations').update({ state: 'rejected' }).eq('transaction_id', transactionId).eq('payment_id', paymentId).eq('state', 'needs_review').throwOnError().then(() => undefined, () => undefined);
  return recordMatch({ transaction_id: transactionId, payment_id: paymentId, amount_cents: amountCents, state: 'matched', rule: 'operator-confirmed', rule_version: 'manual', confidence: 'exact', reason: `Confirmed by ${actor}` }, actor);
}

/* ── Import runner ────────────────────────────────────────────────────── */

export type StageResult = { ok: true; batchId: string; rowCount: number; validRows: number; errorRows: number; duplicateRows: number; readiness: string } | { ok: false; reason: 'duplicate_file' | 'rejected' | 'failed'; detail: string };

export async function stageImport(adapterId: AdapterId, filename: string, text: string, actor: string): Promise<StageResult> {
  const bytes = new TextEncoder().encode(text);
  const sha = await sha256Hex(bytes);
  const db = supabaseAdmin();
  const { data: dup } = await db.from('bolagio_finance_import_batches').select('id, status').eq('sha256', sha).maybeSingle();
  if (dup) return { ok: false, reason: 'duplicate_file', detail: `This exact file was already uploaded (batch ${dup.id}, ${dup.status}).` };
  const staged = await stageCsv(adapterId, text);
  const spec = (await import('@/lib/finance/import/adapters')).adapterSpec(adapterId);
  const { data: batch, error } = await db.from('bolagio_finance_import_batches').insert({
    source_type: spec.sourceType, adapter: spec.id, adapter_version: spec.version, filename: filename.slice(0, 255), sha256: sha, byte_size: bytes.byteLength,
    row_count: staged.rowCount, valid_rows: staged.validRows, error_rows: staged.errorRows, duplicate_rows: staged.duplicateRows,
    status: staged.rejected ? 'rejected' : staged.validRows > 0 ? 'validated' : 'failed', error: staged.rejected ?? (staged.validRows === 0 ? 'No valid rows.' : null), created_by: actor,
  }).select('id').single();
  if (error) throw error;
  if (staged.rows.length > 0) {
    const { error: rerr } = await db.from('bolagio_finance_import_rows').insert(staged.rows.map((r) => ({ batch_id: batch.id, row_no: r.rowNo, raw: r.raw, parsed: r.parsed, status: r.status, error: r.error })));
    if (rerr) throw rerr;
  }
  if (staged.rejected) return { ok: false, reason: 'rejected', detail: staged.rejected };
  return { ok: true, batchId: batch.id, rowCount: staged.rowCount, validRows: staged.validRows, errorRows: staged.errorRows, duplicateRows: staged.duplicateRows, readiness: staged.readiness };
}

export interface CommitResult { posted: number; skipped: number; errors: string[] }

/** Post the valid rows of a validated batch. Each row is idempotent on its own key. */
export async function commitImport(batchId: string, actor: string): Promise<CommitResult> {
  const db = supabaseAdmin();
  const source = supabaseFinanceSource();
  const found = await source.importBatch(batchId);
  if (!found) throw new Error('batch not found');
  if (found.batch.status !== 'validated') throw new Error(`batch is ${found.batch.status}`);
  const [registry, units] = await Promise.all([source.counterparties(), source.units()]);
  const result: CommitResult = { posted: 0, skipped: 0, errors: [] };
  for (const row of found.rows) {
    if (row.status !== 'valid' || !row.parsed) { result.skipped += 1; continue; }
    const parsed = row.parsed as unknown as StagedRow;
    try {
      const ids = await postStagedRow(parsed, batchId, actor, registry, units);
      await db.from('bolagio_finance_import_rows').update({ status: 'imported', transaction_id: ids.transactionId ?? null, payment_id: ids.paymentId ?? null }).eq('id', row.id);
      result.posted += 1;
    } catch (cause) {
      const msg = errorMessage(cause);
      result.errors.push(`row ${row.row_no}: ${msg}`);
      await db.from('bolagio_finance_import_rows').update({ status: 'error', error: msg }).eq('id', row.id);
    }
  }
  await db.from('bolagio_finance_import_batches').update({ status: result.errors.length > 0 && result.posted === 0 ? 'failed' : 'imported', imported_at: new Date().toISOString(), error: result.errors.length > 0 ? result.errors.slice(0, 5).join(' | ') : null }).eq('id', batchId);
  await observe(`import.${found.batch.source_type}.${result.errors.length > 0 && result.posted === 0 ? 'failure' : 'success'}`, `${found.batch.filename}: ${result.posted} posted`);
  try { await runReconciliation(actor); } catch { /* reported by its own signal */ }
  return result;
}

async function postStagedRow(row: StagedRow, batchId: string, actor: string, registry: CounterpartyRow[], units: Array<{ id: string; slug: string }>): Promise<{ transactionId?: string; paymentId?: string }> {
  if (row.target === 'payment') {
    const r = await recordPayment({ direction: row.direction, source: row.source, provider_reference: row.providerReference, amount_cents: row.amountCents, fee_cents: row.feeCents, currency: row.currency, occurred_at: row.occurredAt, value_date: row.valueDate, counterparty_label: row.counterpartyLabel, reference_text: row.referenceText, booking_reference: row.bookingReference, import_batch_id: batchId, kind: row.kind }, actor);
    return { paymentId: r.id };
  }
  if (row.target === 'expense') {
    const cls = classifyExpense({ counterpartyName: row.counterpartyName, counterpartyCountry: row.counterpartyCountry, counterpartyVatId: row.counterpartyVatId, netCents: row.netCents, vatCents: row.vatCents, categoryHint: row.categoryHint, sourceType: 'import' }, registry);
    const unitId = row.unitSlug ? units.find((u) => u.slug === row.unitSlug)?.id ?? null : null;
    const code = requireTaxCode(cls.taxCode);
    const amounts = code.treatment === 'reverse_charge' ? { net: row.grossCents, vat: 0, gross: row.grossCents } : code.treatment === 'review_required' ? { net: row.netCents, vat: row.vatCents, gross: row.grossCents } : { net: row.netCents, vat: row.vatCents, gross: row.grossCents };
    const r = await postTransaction({
      kind: 'expense', booked_on: row.bookedOn, invoice_date: row.invoiceDate, due_on: row.dueOn, currency: row.currency, counterparty_id: cls.counterpartyId, counterparty_label: row.counterpartyName, supplier_invoice_no: row.supplierInvoiceNo,
      description: row.description, unit_id: unitId, source_type: 'import', source_system: 'import', source_reference: row.sourceReference, import_batch_id: batchId, review_state: cls.classification, document_state: 'missing', payment_state: 'unpaid', reconciliation_state: 'unmatched',
    }, [{
      line_no: 1, category: cls.category, description: row.description, tax_code: cls.taxCode, rate_bp: code.treatment === 'review_required' ? 0 : code.rateBp, net_cents: amounts.net, vat_cents: code.treatment === 'review_required' ? amounts.vat : amounts.vat, gross_cents: amounts.gross,
      reverse_charge_vat_cents: code.reverseCharge ? fromNet(amounts.net, code.rateBp).vat : 0, input_vat_treatment: cls.inputVatTreatment, unit_id: unitId, allocation_method: unitId ? 'direct' : cls.allocationMethod, classification: cls.classification,
    }], actor);
    return { transactionId: r.id };
  }
  // revenue (Booking.com reservation)
  const unitId = row.unitHint ? units.find((u) => row.unitHint!.toLowerCase().includes(u.slug.replace(/-/g, ' ')) || row.unitHint!.toLowerCase().includes(u.slug))?.id ?? null : null;
  // A cancelled or no-show reservation that still carries a price is a
  // cancellation charge, not a night sold. Posting it at 7 % would assert a
  // VAT treatment nobody has decided — untaxed compensation and a taxable
  // supply are both arguable — so the amount is recorded and the tax
  // question is parked on the review-required code, which counts toward no
  // VAT figure until the adviser classifies it.
  const split = row.cancelled ? { net: row.grossCents, vat: 0, gross: row.grossCents } : splitGross(row.grossCents, 700);
  const taxCode = row.cancelled ? REVIEW_REQUIRED_CODE : 'DE_ACCOMMODATION_REDUCED';
  const rateBp = row.cancelled ? 0 : 700;
  const notes = [
    unitId ? null : 'Unit could not be derived from the statement; allocate manually.',
    row.cancelled ? `Statement status "${row.status}": a cancellation or no-show charge, not accommodation. Classify the VAT treatment before this counts anywhere.` : null,
  ].filter(Boolean);
  const r = await postTransaction({
    kind: 'revenue', booked_on: row.checkOut, service_from: row.checkIn, service_to: row.checkOut, currency: row.currency,
    description: row.cancelled ? `Booking.com cancellation charge ${row.bookingReference} · ${row.checkIn} – ${row.checkOut}` : `Booking.com stay ${row.bookingReference} · ${row.checkIn} – ${row.checkOut}`, channel: 'booking_com',
    booking_reference: row.bookingReference, unit_id: unitId, source_type: 'import', source_system: 'booking_com_reservations', source_reference: row.sourceReference, import_batch_id: batchId,
    review_state: unitId && !row.cancelled ? 'suggested' : 'needs_review', document_state: 'complete', payment_state: 'unpaid', reconciliation_state: 'unmatched', note: notes.length > 0 ? notes.join(' ') : null,
  }, [{ line_no: 1, category: row.cancelled ? 'other_guest_charges' : 'accommodation_revenue', description: row.cancelled ? 'Cancellation / no-show charge per statement' : 'Accommodation (whole price; ancillary split not available from the statement)', tax_code: taxCode, rate_bp: rateBp, net_cents: split.net, vat_cents: split.vat, gross_cents: split.gross, input_vat_treatment: 'not_applicable', unit_id: unitId, allocation_method: unitId ? 'direct' : 'unallocated', classification: row.cancelled ? 'needs_review' : 'suggested' }], actor);
  if (row.commissionCents && row.commissionCents > 0) {
    const bcom = registry.find((c) => c.name.toLowerCase().includes('booking.com'));
    await postTransaction({
      kind: 'commission', booked_on: row.checkOut, service_from: row.checkIn, service_to: row.checkOut, currency: row.currency, counterparty_id: bcom?.id ?? null, counterparty_label: 'Booking.com B.V.', description: `Booking.com commission · ${row.bookingReference}`, channel: 'booking_com',
      booking_reference: row.bookingReference, unit_id: unitId, source_type: 'import', source_system: 'booking_com_reservations', source_reference: `${row.sourceReference}:commission`, import_batch_id: batchId, review_state: 'suggested', document_state: 'missing', payment_state: 'unpaid', reconciliation_state: 'not_applicable',
    }, [{ line_no: 1, category: 'ota_commission', description: 'Commission per statement (invoice to follow)', tax_code: 'DE_REVERSE_CHARGE', rate_bp: 1900, net_cents: row.commissionCents, vat_cents: 0, gross_cents: row.commissionCents, reverse_charge_vat_cents: fromNet(row.commissionCents, 1900).vat, input_vat_treatment: 'reverse_charge', unit_id: unitId, allocation_method: unitId ? 'direct' : 'unallocated', classification: 'suggested' }], actor);
  }
  return { transactionId: r.id };
}

/* ── Manual expense posting (the expense form) ────────────────────────── */

export interface ManualExpenseInput {
  bookedOn: IsoDate; invoiceDate: IsoDate | null; dueOn: IsoDate | null; counterpartyName: string; counterpartyId: string | null; counterpartyCountry: string | null; counterpartyVatId: string | null;
  supplierInvoiceNo: string | null; description: string; note: string | null;
  lines: Array<{ category: string; description: string; taxCode: string; netCents: number; vatCents: number; unitId: string | null; allocationMethod: string; inputVatTreatment: string; assetState: 'none' | 'candidate' }>;
  documentId: string | null;
}

export async function postManualExpense(input: ManualExpenseInput, actor: string, registry: CounterpartyRow[]): Promise<PostResult> {
  const key = `manual:${await sha256Hex(new TextEncoder().encode(`${input.counterpartyName}|${input.supplierInvoiceNo ?? ''}|${input.bookedOn}|${input.lines.map((l) => `${l.netCents}:${l.vatCents}`).join(',')}`))}`;
  const cls = classifyExpense({ counterpartyName: input.counterpartyName, counterpartyId: input.counterpartyId, counterpartyCountry: input.counterpartyCountry, counterpartyVatId: input.counterpartyVatId }, registry);
  const lines = input.lines.map((l, i) => {
    const code = requireTaxCode(l.taxCode);
    return {
      line_no: i + 1, category: l.category, description: l.description, tax_code: l.taxCode, rate_bp: code.rateBp, net_cents: l.netCents, vat_cents: code.treatment === 'standard' || code.treatment === 'reduced' ? l.vatCents : 0, gross_cents: l.netCents + (code.treatment === 'standard' || code.treatment === 'reduced' ? l.vatCents : 0),
      reverse_charge_vat_cents: code.reverseCharge ? fromNet(l.netCents, code.rateBp).vat : 0, input_vat_treatment: code.reverseCharge ? 'reverse_charge' : l.inputVatTreatment, unit_id: l.unitId, allocation_method: l.unitId ? (l.allocationMethod === 'unallocated' ? 'direct' : l.allocationMethod) : 'unallocated',
      asset_state: l.assetState, classification: code.reviewRequired ? 'needs_review' : 'reviewed',
    };
  });
  const r = await postTransaction({
    kind: 'expense', booked_on: input.bookedOn, invoice_date: input.invoiceDate, due_on: input.dueOn, currency: 'EUR', counterparty_id: input.counterpartyId ?? cls.counterpartyId, counterparty_label: input.counterpartyName, supplier_invoice_no: input.supplierInvoiceNo,
    description: input.description, note: input.note, source_type: 'manual', source_system: 'manual', source_reference: key, review_state: lines.some((l) => l.classification === 'needs_review') ? 'needs_review' : 'reviewed', document_state: input.documentId ? 'complete' : 'missing', payment_state: 'unpaid', reconciliation_state: 'unmatched',
  }, lines, actor);
  if (r.created && input.documentId) await linkDocument(input.documentId, 'transaction', r.id, actor);
  return r;
}

/* ── Invoices ─────────────────────────────────────────────────────────── */

export async function createInvoiceDraft(stay: StayForInvoice, actor: string): Promise<{ id: string; draft: InvoiceDraft }> {
  const db = supabaseAdmin();
  const config = financeConfig();
  const { data: sales } = await db.from('bolagio_minibar_movements').select('quantity, unit_price_cents, product_id, bolagio_minibar_products(name, tax_code)').eq('booking_intent_id', stay.intentId).eq('movement', 'sale').in('charge_state', ['unpaid', 'paid']);
  const minibar = ((sales ?? []) as Array<{ quantity: number; unit_price_cents: number | null; bolagio_minibar_products?: { name: string; tax_code: string } | { name: string; tax_code: string }[] | null }>).map((s) => {
    const p = Array.isArray(s.bolagio_minibar_products) ? s.bolagio_minibar_products[0] : s.bolagio_minibar_products;
    return { description: p?.name ?? 'Minibar', quantity: -Number(s.quantity), unitPriceCents: Number(s.unit_price_cents ?? 0), taxCode: p?.tax_code ?? 'DE_REVIEW_REQUIRED' };
  }).filter((m) => m.quantity > 0 && m.unitPriceCents > 0);
  const draft = buildDraft(stay, minibar, config);
  const { data: tx } = await db.from('bolagio_finance_transactions').select('id').eq('source_system', 'booking').eq('source_reference', `booking:${stay.intentId}`).maybeSingle();
  const txId: string | null = (tx as { id: string } | null)?.id ?? null;
  const { data: row, error } = await db.from('bolagio_finance_invoices').insert({
    kind: 'invoice', status: 'draft', recipient_name: draft.recipient.name, recipient_address: draft.recipient.address, recipient_company: draft.recipient.company, recipient_vat_id: draft.recipient.vatId, recipient_country: draft.recipient.country,
    booking_intent_id: draft.bookingIntentId, booking_reference: draft.bookingReference, unit_id: draft.unitId, service_from: draft.serviceFrom, service_to: draft.serviceTo, currency: draft.currency,
    net_cents: draft.netCents, vat_cents: draft.vatCents, gross_cents: draft.grossCents, payment_state: 'unpaid', transaction_id: txId, created_by: actor,
  }).select('id').single();
  if (error) throw error;
  const { error: lerr } = await db.from('bolagio_finance_invoice_lines').insert(draft.lines.map((l) => ({ invoice_id: row.id, line_no: l.lineNo, description: l.description, quantity: l.quantity, category: l.category, tax_code: l.taxCode, rate_bp: l.rateBp, net_cents: l.netCents, vat_cents: l.vatCents, gross_cents: l.grossCents })));
  if (lerr) throw lerr;
  return { id: row.id, draft };
}

export type IssueResult = { ok: true; number: string } | { ok: false; reason: 'not_found' | 'not_draft' | 'blocked'; blockers?: string[] };

/** Issue a draft: fail closed on any § 14 gap; draw the number gaplessly; freeze; register the document record. Nothing is sent. */
export async function issueInvoice(invoiceId: string, actor: string): Promise<IssueResult> {
  const source = supabaseFinanceSource();
  const found = await source.invoice(invoiceId);
  if (!found) return { ok: false, reason: 'not_found' };
  if (found.invoice.status !== 'draft') return { ok: false, reason: 'not_draft' };
  const config = financeConfig(await source.policy());
  const db = supabaseAdmin();
  const { data: full } = await db.from('bolagio_finance_invoices').select('recipient_address, recipient_vat_id').eq('id', invoiceId).single();
  const draft: InvoiceDraft = {
    kind: found.invoice.kind as 'invoice' | 'credit_note', recipient: { name: found.invoice.recipient_name, address: (full?.recipient_address as string | null) ?? null, company: found.invoice.recipient_company, vatId: (full?.recipient_vat_id as string | null) ?? null, country: found.invoice.recipient_country },
    bookingIntentId: found.invoice.booking_intent_id, bookingReference: found.invoice.booking_reference, unitId: found.invoice.unit_id, serviceFrom: found.invoice.service_from, serviceTo: found.invoice.service_to, currency: found.invoice.currency,
    lines: found.lines.map((l) => ({ lineNo: l.line_no, description: l.description, quantity: l.quantity, category: l.category, taxCode: l.tax_code, rateBp: l.rate_bp, netCents: l.net_cents, vatCents: l.vat_cents, grossCents: l.gross_cents })),
    netCents: found.invoice.net_cents, vatCents: found.invoice.vat_cents, grossCents: found.invoice.gross_cents,
  };
  const gate = canIssue(draft, config);
  if (!gate.ready) return { ok: false, reason: 'blocked', blockers: gate.blockers.map((b) => `${b.label} (${b.legal})${b.detail ? ` — ${b.detail}` : ''}`) };
  const issuer = issuerIdentity();
  const series = issuer.series!;
  const allocated = await allocateInvoiceNumber(series);
  const n = allocated.counter;
  const number = allocated.number;
  const today = berlinToday();
  const masked = config.issuerTaxIdMasked;
  const { error } = await db.from('bolagio_finance_invoices').update({
    status: 'issued', series, number: n, issued_on: today, issued_at: new Date().toISOString(), issued_by: actor, issuer_name: issuer.legalName, issuer_address: issuer.address, issuer_tax_id_kind: config.issuerTaxIdKind, issuer_tax_id_masked: masked,
  }).eq('id', invoiceId).eq('status', 'draft');
  if (error) throw error;
  // The registry keeps a record of the issued document (its canonical content hash); the rendered PDF is generated on demand from the frozen row.
  const canonical = JSON.stringify({ number, issued_on: today, ...draft });
  const sha = await sha256Hex(new TextEncoder().encode(canonical));
  const reg = await registerDocument({ document_type: draft.kind === 'credit_note' ? 'credit_note' : 'guest_invoice', original_filename: `${number}.json`, mime_type: 'application/json', byte_size: canonical.length, sha256: sha, source: 'generated', structured_format: 'none', document_date: today, note: 'Canonical content of the issued invoice; the PDF view is rendered from the frozen row.' }, actor);
  const docId = (reg as { id?: string }).id;
  if (docId) {
    await db.from('bolagio_finance_invoices').update({ document_id: docId }).eq('id', invoiceId);
    await linkDocument(docId, 'invoice', invoiceId, actor);
    if (found.invoice.transaction_id) {
      await linkDocument(docId, 'transaction', found.invoice.transaction_id, actor);
    }
  }
  return { ok: true, number };
}

/* ── Tax estimates runner ─────────────────────────────────────────────── */

export interface TaxEstimateRunReport { vatPeriods: string[]; companyYear: number; recorded: number }

export async function recordSystemTaxEstimates(actor = 'system:tax-estimates', today: IsoDate = berlinToday()): Promise<TaxEstimateRunReport> {
  const source = supabaseFinanceSource();
  const [policy, rates, adjustments, taxPayments] = await Promise.all([source.policy(), source.taxRates(), source.taxAdjustments(), source.taxPayments()]);
  const calendar = calendarPolicyFrom(policy, today);
  const year = Number(today.slice(0, 4));
  const yr = yearRange(year);
  let recorded = 0;
  const keys = vatPeriodKeysBetween(yr.from, today, calendar);
  for (const key of keys) {
    const range = periodRange(key);
    const rows = await source.vatMonthly(range.from, range.to);
    const adj = adjustments.filter((a) => a.tax_type === 'vat' && a.superseded_by === null && a.fiscal_year === year).reduce((s, a) => s + a.amount_cents, 0);
    const position = computeVatPosition(key, rows, adj);
    const deadline = calculatedDeadlines(Number(key.slice(0, 4)), calendar).find((d) => d.kind === 'vat_advance_return' && d.periodKey === key);
    await recordTaxStage({ taxType: 'vat', periodKey: key, startsOn: range.from, endsOn: new Date(Date.parse(`${range.to}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), stage: 'system_estimate', amountCents: position.estimateCents, basis: vatBasis(position), rulesVersion: VAT_RULES_VERSION, actor, filingDueOn: deadline?.dueOn ?? null, paymentDueOn: deadline?.dueOn ?? null });
    recorded += 1;
  }
  const pl = await source.plMonthly(yr.from, yr.to);
  const { buildPl } = await import('@/lib/finance/reports/pl');
  const report = buildPl(pl, yr.from, yr.to, null);
  const dbRates: import('@/lib/finance/tax/rates').TaxRateRow[] = rates.map((r: TaxRateRowDb) => ({ taxType: r.tax_type as import('@/lib/finance/tax/rates').CompanyTaxRateType, jurisdiction: r.jurisdiction, rateBp: r.rate_bp, effectiveFrom: r.effective_from, effectiveTo: r.effective_to, legalReference: r.legal_reference ?? '', sourceUrl: r.source_url, reviewRequired: r.review_required, note: r.note }));
  const adj: TaxAdjustment[] = adjustments.filter((a) => a.superseded_by === null && a.tax_type !== 'vat').map((a) => ({ taxType: a.tax_type as 'kst' | 'gewst', fiscalYear: a.fiscal_year, kind: a.kind as TaxAdjustment['kind'], amountCents: a.amount_cents, reason: a.reason }));
  const paid = (type: string) => taxPayments.filter((p) => p.tax_type === type && p.period_key === String(year) && p.kind === 'advance').reduce((s, p) => s + p.amount_cents, 0);
  const estimate = estimateCompanyTaxes({ fiscalYear: year, resultBeforeTaxCents: report.resultBeforeTaxCents, adjustments: adj, rateRows: dbRates, managementTaxesExcluded: true, advancePaymentsCents: { kst: paid('kst'), soli: paid('soli'), gewst: paid('gewst') } });
  for (const which of ['kst', 'soli', 'gewst'] as const) {
    await recordTaxStage({ taxType: which, periodKey: String(year), startsOn: yr.from, endsOn: `${year}-12-31`, stage: 'system_estimate', amountCents: estimate[which].estimateCents, basis: companyTaxBasis(estimate, which), rulesVersion: COMPANY_TAX_RULES_VERSION, actor, filingDueOn: `${year + 1}-07-31` });
    recorded += 1;
  }
  await observe('tax_estimates.success', `${keys.length} VAT periods, ${year} company taxes`);
  return { vatPeriods: keys, companyYear: year, recorded };
}

/* ── Exports ──────────────────────────────────────────────────────────── */

export async function recordExport(input: { kind: string; from: string; to: string; format: string; version: string; generator: string; rowCount: number; text: string; actor: string; parameters?: Json }): Promise<{ id: string; sha256: string }> {
  const bytes = new TextEncoder().encode(input.text);
  const sha = await sha256Hex(bytes);
  const row = await insertExport({ export_kind: input.kind, period_from: input.from, period_to: input.to, format: input.format, generator: input.generator, version: input.version, row_count: input.rowCount, sha256: sha, byte_size: bytes.byteLength, parameters: input.parameters ?? {}, generated_by: input.actor });
  return { id: (row as { id: string }).id, sha256: sha };
}
