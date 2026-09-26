'use server';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE ACTIONS — the operator's finance commands, all of them.
 *
 * Every action follows the shape of `lib/admin/actions.ts`:
 *   1. resolve the operator from the cookie and the allowlist
 *   2. check the FINANCE capability server-side (`finance.edit`,
 *      `.review`, `.tax_review`, `.export`, `.configure`)
 *   3. refuse in fixture / preview mode (no engine behind the fixtures)
 *   4. validate the input
 *   5. call the finance domain's OWN command — never a table write
 *   6. audit
 *   7. revalidate the screens that changed
 *   8. answer with a structured result
 *
 * Nothing here sends an invoice, moves money, files a return, or touches
 * the booking core. There is no bulk tax classification: a reclassify acts
 * on one line with one reason.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { revalidatePath } from 'next/cache';
import { audit, operatorFor } from '@/lib/admin/auth';
import { adminMode } from '@/lib/admin/config';
import type { Capability } from '@/lib/admin/permissions';
import * as commands from '@/lib/finance/commands';
import { supabaseFinanceSource } from '@/lib/finance/source-supabase';
import { financeRowSource } from '@/lib/finance/source';
import { isIsoDate } from '@/lib/finance/periods';
import { errorMessage } from '@/lib/finance/errors';
import { taxCode as taxCodeOf } from '@/lib/finance/tax-codes';
import { category as categoryOf } from '@/lib/finance/categories';
import { ACCEPTED_MIME, MAX_DOCUMENT_BYTES, detectStructuredFormat, sha256Hex } from '@/lib/finance/documents';
import { documentBucket } from '@/lib/finance/config';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ADAPTERS, detectAdapter, type AdapterId } from '@/lib/finance/import/adapters';
import { parseCsv } from '@/lib/finance/import/csv';
import * as builders from '@/lib/finance/export/builders';
import { loadCashFlow, loadExpenses, loadPl, loadProperties, loadRevenue, loadTaxes, loadVat, unitNamer } from '@/lib/finance/queries';
import { periodRange } from '@/lib/finance/periods';
import { EXPORT_GENERATOR, EXPORT_VERSION, type ExportKind } from '@/lib/finance/export/builders';

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'fixture' | 'invalid' | 'failed' | 'refused'; detail?: string };

async function gate(capability: Capability): Promise<{ ok: true; actor: string; operator: Awaited<ReturnType<typeof operatorFor>> extends infer R ? (R extends { ok: true; operator: infer O } ? O : never) : never } | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'fixture' }> {
  const g = await operatorFor(capability);
  if (!g.ok) return g;
  if (adminMode() !== 'supabase') return { ok: false, reason: adminMode() === 'preview' ? 'preview' : 'fixture' };
  return { ok: true, actor: g.operator.email, operator: g.operator };
}

function refreshFinance(paths: string[] = []): void {
  for (const p of ['/admin/finance', '/admin/finance/inbox', '/admin/finance/transactions', '/admin/finance/expenses', '/admin/finance/revenue', '/admin/finance/vat', '/admin/finance/taxes', '/admin/finance/reconciliation', '/admin/finance/accountant', '/admin/finance/documents', '/admin', ...paths]) revalidatePath(p);
}

function fail(cause: unknown): ActionResult<never> {
  const detail = errorMessage(cause);
  // eslint-disable-next-line no-console -- server-side diagnostics
  console.error(JSON.stringify({ scope: 'finance', event: 'action.error', level: 'error', cause: detail }));
  if (/BLG11/.test(detail) || /locked/.test(detail)) return { ok: false, reason: 'refused', detail: 'The period is locked. Post the correction into the open period.' };
  if (/BLG13/.test(detail)) return { ok: false, reason: 'refused', detail: 'This record is accountant-locked.' };
  if (/BLG1[024]/.test(detail)) return { ok: false, reason: 'refused', detail: detail.replace(/^.*?: /, '') };
  return { ok: false, reason: 'failed', detail: 'The command failed. Nothing was changed.' };
}

const str = (fd: FormData, key: string, max = 400): string => String(fd.get(key) ?? '').trim().slice(0, max);
const int = (fd: FormData, key: string): number | null => { const v = str(fd, key, 20); if (!v) return null; const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/* ── Ingestion, reconciliation, estimates ─────────────────────────────── */

export async function runIngestionAction(): Promise<ActionResult<{ report: commands.FinancePassReport }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  try {
    // The same queue-driven pass the schedule runs, with a larger batch: the
    // operator asked for it now. A backlog beyond the batch drains on the
    // following passes; the health card shows what is left.
    const report = await commands.runFinanceIngestionPass({ actor: g.actor, limit: Math.max(25, commands.financeIngestionBatch()) });
    await audit({ operator: g.operator, action: 'finance.ingest', outcome: report.errors.length ? 'partial' : 'ok', detail: { scanned: report.scanned, revenue: report.revenuePosted, payments: report.paymentsRecorded, refunds: report.refundsPosted, refundsWithoutRevenue: report.refundsWithoutRevenue, errors: report.errors.length } });
    refreshFinance();
    return { ok: true, report };
  } catch (cause) { return fail(cause); }
}

export async function runReconciliationAction(): Promise<ActionResult<{ report: commands.ReconciliationRunReport }>> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  try {
    const report = await commands.runReconciliation(g.actor);
    await audit({ operator: g.operator, action: 'finance.reconcile', outcome: 'ok', detail: { ...report } });
    refreshFinance();
    return { ok: true, report };
  } catch (cause) { return fail(cause); }
}

export async function runTaxEstimatesAction(): Promise<ActionResult<{ report: commands.TaxEstimateRunReport }>> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  try {
    const report = await commands.recordSystemTaxEstimates(g.actor);
    await audit({ operator: g.operator, action: 'finance.tax_estimate', outcome: 'ok', detail: { vatPeriods: report.vatPeriods.join(','), companyYear: report.companyYear, recorded: report.recorded } });
    refreshFinance();
    return { ok: true, report };
  } catch (cause) { return fail(cause); }
}

export async function confirmMatchAction(transactionId: string, paymentId: string, amountCents: number): Promise<ActionResult> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/.test(transactionId) || !/^[0-9a-f-]{36}$/.test(paymentId) || !Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, reason: 'invalid' };
  try {
    await commands.confirmMatch(transactionId, paymentId, g.actor, amountCents);
    await audit({ operator: g.operator, action: 'finance.match.confirm', targetType: 'finance_transaction', targetRef: transactionId, outcome: 'ok', detail: { paymentId, amountCents } });
    refreshFinance([`/admin/finance/transactions/${transactionId}`]);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function rejectMatchAction(transactionId: string, paymentId: string, reason: string): Promise<ActionResult> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  if (!reason.trim()) return { ok: false, reason: 'invalid', detail: 'A reason is required.' };
  try {
    await commands.recordMatch({ transaction_id: transactionId, payment_id: paymentId, amount_cents: 0, state: 'rejected', rule: 'operator-rejected', rule_version: 'manual', confidence: 'exact', reason: reason.slice(0, 400) }, g.actor);
    await commands.setTransactionState(transactionId, { reconciliation_state: 'unmatched' }, g.actor, `match rejected: ${reason}`);
    await audit({ operator: g.operator, action: 'finance.match.reject', targetType: 'finance_transaction', targetRef: transactionId, outcome: 'ok', detail: { paymentId } });
    refreshFinance([`/admin/finance/transactions/${transactionId}`]);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

/* ── Classification and corrections ───────────────────────────────────── */

export async function reclassifyLineAction(fd: FormData): Promise<ActionResult<{ changed: number }>> {
  const asAccountant = str(fd, 'as_accountant') === 'true';
  const g = await gate(asAccountant ? 'finance.tax_review' : 'finance.review');
  if (!g.ok) return g;
  const lineId = str(fd, 'line_id', 40);
  const reason = str(fd, 'reason', 1000);
  const transactionId = str(fd, 'transaction_id', 40);
  if (!/^[0-9a-f-]{36}$/.test(lineId) || !reason) return { ok: false, reason: 'invalid', detail: 'Line and reason are required.' };
  const patch: Record<string, unknown> = {};
  const cat = str(fd, 'category', 60); if (cat) { if (!categoryOf(cat)) return { ok: false, reason: 'invalid', detail: 'Unknown category.' }; patch.category = cat; }
  const code = str(fd, 'tax_code', 60); if (code) { if (!taxCodeOf(code)) return { ok: false, reason: 'invalid', detail: 'Unknown tax code.' }; patch.tax_code = code; }
  const ivat = str(fd, 'input_vat_treatment', 40); if (ivat) patch.input_vat_treatment = ivat;
  const ded = int(fd, 'deductible_bp'); if (ded !== null) patch.deductible_bp = Math.max(0, Math.min(10000, ded));
  const unit = str(fd, 'unit_id', 60); if (unit) patch.unit_id = unit === 'none' ? null : unit;
  const alloc = str(fd, 'allocation_method', 40); if (alloc) patch.allocation_method = alloc;
  const asset = str(fd, 'asset_state', 40); if (asset) patch.asset_state = asset;
  if (Object.keys(patch).length === 0) return { ok: false, reason: 'invalid', detail: 'Nothing to change.' };
  try {
    const r = (await commands.reclassifyLine(lineId, patch, reason, g.actor, asAccountant)) as { ok: boolean; code?: string; changed?: number };
    if (!r.ok) return { ok: false, reason: 'refused', detail: r.code === 'RATE_CHANGE_NEEDS_REVERSAL' ? 'The new code has a different rate. Money is immutable: reverse the transaction and post it again.' : r.code === 'ACCOUNTANT_LOCKED' ? 'This line is accountant-locked.' : r.code === 'VAT_INCONSISTENT_WITH_CODE' ? 'The line\'s VAT does not fit that code. Reverse and re-post with the correct split.' : `Refused (${r.code}).` };
    await audit({ operator: g.operator, action: asAccountant ? 'finance.line.accountant_lock' : 'finance.line.reclassify', targetType: 'finance_line', targetRef: lineId, outcome: 'ok', detail: { fields: Object.keys(patch).join(','), changed: r.changed ?? 0 } });
    refreshFinance(transactionId ? [`/admin/finance/transactions/${transactionId}`] : []);
    return { ok: true, changed: r.changed ?? 0 };
  } catch (cause) { return fail(cause); }
}

export async function reverseTransactionAction(fd: FormData): Promise<ActionResult<{ reversalId: string }>> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  const id = str(fd, 'transaction_id', 40);
  const reason = str(fd, 'reason', 1000);
  const bookedOn = str(fd, 'booked_on', 10);
  if (!/^[0-9a-f-]{36}$/.test(id) || !reason) return { ok: false, reason: 'invalid', detail: 'A reason is required.' };
  if (bookedOn && !isIsoDate(bookedOn)) return { ok: false, reason: 'invalid', detail: 'Correction date must be a date.' };
  try {
    const r = (await commands.reverseTransaction(id, reason, g.actor, bookedOn || undefined)) as { ok: boolean; code?: string; reversal_id?: string };
    if (!r.ok) return { ok: false, reason: 'refused', detail: `Refused (${r.code}).` };
    await audit({ operator: g.operator, action: 'finance.transaction.reverse', targetType: 'finance_transaction', targetRef: id, outcome: 'ok', detail: { reversalId: r.reversal_id ?? null } });
    refreshFinance([`/admin/finance/transactions/${id}`]);
    return { ok: true, reversalId: r.reversal_id! };
  } catch (cause) { return fail(cause); }
}

export async function setTransactionStateAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const id = str(fd, 'transaction_id', 40);
  const reason = str(fd, 'reason', 1000);
  const patch: Record<string, unknown> = {};
  for (const key of ['document_state', 'payment_state', 'note', 'supplier_invoice_no', 'due_on', 'counterparty_label'] as const) { const v = str(fd, key, key === 'note' ? 1000 : 200); if (v) patch[key] = v; }
  if (!/^[0-9a-f-]{36}$/.test(id) || Object.keys(patch).length === 0) return { ok: false, reason: 'invalid' };
  if (patch.document_state === 'not_required' && !reason) return { ok: false, reason: 'invalid', detail: 'Marking a document as not required needs a reason.' };
  try {
    const r = (await commands.setTransactionState(id, patch, g.actor, reason || undefined)) as { ok: boolean; code?: string };
    if (!r.ok) return { ok: false, reason: 'refused', detail: `Refused (${r.code}).` };
    await audit({ operator: g.operator, action: 'finance.transaction.state', targetType: 'finance_transaction', targetRef: id, outcome: 'ok', detail: { fields: Object.keys(patch).join(',') } });
    refreshFinance([`/admin/finance/transactions/${id}`]);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

/* ── Expenses ─────────────────────────────────────────────────────────── */

export async function postExpenseAction(fd: FormData): Promise<ActionResult<{ id: string; created: boolean }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const bookedOn = str(fd, 'booked_on', 10);
  if (!isIsoDate(bookedOn)) return { ok: false, reason: 'invalid', detail: 'Booking date is required.' };
  const counterpartyName = str(fd, 'counterparty_name', 200);
  const description = str(fd, 'description', 400);
  if (!counterpartyName || !description) return { ok: false, reason: 'invalid', detail: 'Supplier and description are required.' };
  const lines: commands.ManualExpenseInput['lines'] = [];
  for (let i = 0; i < 12; i += 1) {
    const cat = str(fd, `line_${i}_category`, 60);
    if (!cat) continue;
    const net = int(fd, `line_${i}_net_cents`);
    const vat = int(fd, `line_${i}_vat_cents`) ?? 0;
    const code = str(fd, `line_${i}_tax_code`, 60);
    if (!categoryOf(cat) || !taxCodeOf(code) || net === null || net === 0) return { ok: false, reason: 'invalid', detail: `Line ${i + 1}: category, tax code and a non-zero net are required.` };
    const meta = taxCodeOf(code)!;
    if ((meta.treatment === 'standard' || meta.treatment === 'reduced') && Math.abs(Math.round((net * meta.rateBp) / 10000) - vat) > 1) return { ok: false, reason: 'invalid', detail: `Line ${i + 1}: VAT ${vat} does not fit ${meta.label} on net ${net}.` };
    const unit = str(fd, `line_${i}_unit_id`, 60);
    lines.push({ category: cat, description: str(fd, `line_${i}_description`, 300) || description, taxCode: code, netCents: net, vatCents: vat, unitId: unit && unit !== 'none' ? unit : null, allocationMethod: str(fd, `line_${i}_allocation`, 40) || 'direct', inputVatTreatment: str(fd, `line_${i}_input_vat`, 40) || (meta.treatment === 'exempt' || meta.treatment === 'outside_scope' ? 'not_applicable' : meta.reviewRequired ? 'review_required' : 'deductible'), assetState: str(fd, `line_${i}_asset`, 20) === 'candidate' ? 'candidate' : 'none' });
  }
  if (lines.length === 0) return { ok: false, reason: 'invalid', detail: 'At least one line is required.' };
  try {
    const registry = await supabaseFinanceSource().counterparties();
    const cpId = str(fd, 'counterparty_id', 40);
    const r = await commands.postManualExpense({
      bookedOn, invoiceDate: str(fd, 'invoice_date', 10) || null, dueOn: str(fd, 'due_on', 10) || null, counterpartyName, counterpartyId: /^[0-9a-f-]{36}$/.test(cpId) ? cpId : null, counterpartyCountry: str(fd, 'counterparty_country', 2).toUpperCase() || null,
      counterpartyVatId: str(fd, 'counterparty_vat_id', 20) || null, supplierInvoiceNo: str(fd, 'supplier_invoice_no', 120) || null, description, note: str(fd, 'note', 1000) || null, lines, documentId: /^[0-9a-f-]{36}$/.test(str(fd, 'document_id', 40)) ? str(fd, 'document_id', 40) : null,
    }, g.actor, registry);
    await audit({ operator: g.operator, action: 'finance.expense.post', targetType: 'finance_transaction', targetRef: r.id, outcome: r.created ? 'ok' : 'duplicate', detail: { lines: lines.length, gross: lines.reduce((s, l) => s + l.netCents + l.vatCents, 0) } });
    refreshFinance();
    return { ok: true, id: r.id, created: r.created };
  } catch (cause) { return fail(cause); }
}

/* ── Documents ────────────────────────────────────────────────────────── */

export async function uploadDocumentAction(fd: FormData): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, reason: 'invalid', detail: 'A file is required.' };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'invalid', detail: 'The file is larger than 15 MB.' };
  const mime = file.type || 'application/octet-stream';
  if (!ACCEPTED_MIME.has(mime)) return { ok: false, reason: 'invalid', detail: `File type ${mime} is not accepted (PDF, JPEG, PNG, WebP, XML, CSV, text).` };
  const type = str(fd, 'document_type', 60) || 'other';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = await sha256Hex(bytes);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
  const bucket = documentBucket();
  let storageKey: string | null = null;
  try {
    if (bucket) {
      storageKey = `finance/${sha.slice(0, 2)}/${sha}`;
      const { error } = await supabaseAdmin().storage.from(bucket).upload(storageKey, bytes, { contentType: mime, upsert: false });
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
    }
    const r = (await commands.registerDocument({ document_type: type, original_filename: file.name.slice(0, 255), mime_type: mime, byte_size: file.size, sha256: sha, storage_key: storageKey, source: 'upload', structured_format: detectStructuredFormat(mime, head), counterparty_id: /^[0-9a-f-]{36}$/.test(str(fd, 'counterparty_id', 40)) ? str(fd, 'counterparty_id', 40) : null, document_date: isIsoDate(str(fd, 'document_date', 10)) ? str(fd, 'document_date', 10) : null, note: str(fd, 'note', 1000) || null }, g.actor)) as { id: string; duplicate?: boolean };
    const target = str(fd, 'target_type', 20);
    const targetId = str(fd, 'target_id', 40);
    if (target && /^[0-9a-f-]{36}$/.test(targetId)) await commands.linkDocument(r.id, target, targetId, g.actor);
    await audit({ operator: g.operator, action: 'finance.document.register', targetType: 'finance_document', targetRef: r.id, outcome: r.duplicate ? 'duplicate' : 'ok', detail: { type, bytes: file.size, stored: Boolean(storageKey) } });
    refreshFinance(target && targetId ? [`/admin/finance/transactions/${targetId}`] : []);
    return { ok: true, id: r.id, duplicate: Boolean(r.duplicate) };
  } catch (cause) { return fail(cause); }
}

export async function linkDocumentAction(documentId: string, targetType: string, targetId: string): Promise<ActionResult> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/.test(documentId) || !/^[0-9a-f-]{36}$/.test(targetId) || !['transaction', 'payment', 'tax_notice', 'invoice', 'asset'].includes(targetType)) return { ok: false, reason: 'invalid' };
  try {
    await commands.linkDocument(documentId, targetType, targetId, g.actor);
    await audit({ operator: g.operator, action: 'finance.document.link', targetType: 'finance_document', targetRef: documentId, outcome: 'ok', detail: { targetType, targetId } });
    refreshFinance([`/admin/finance/transactions/${targetId}`]);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

/* ── Periods and tax stages (accountant path) ─────────────────────────── */

export async function setPeriodStatusAction(fd: FormData): Promise<ActionResult<{ status: string; blockers?: Record<string, number> }>> {
  const to = str(fd, 'to', 30);
  const accountantMove = to === 'accountant_reviewed' || to === 'locked' || to === 'open';
  const g = await gate(accountantMove ? 'finance.tax_review' : 'finance.review');
  if (!g.ok) return g;
  const key = str(fd, 'period_key', 7);
  if (!/^\d{4}-\d{2}$/.test(key) || !['open', 'review', 'accountant_reviewed', 'locked'].includes(to)) return { ok: false, reason: 'invalid' };
  try {
    const r = (await commands.setPeriodStatus(key, to, g.actor, accountantMove, str(fd, 'note', 1000) || undefined)) as { ok: boolean; code?: string; blockers?: Record<string, number>; status?: string; to?: string };
    if (!r.ok) return { ok: false, reason: 'refused', detail: r.code === 'BLOCKED' ? `The period still has ${Object.entries(r.blockers ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ')}.` : r.code === 'ACCOUNTANT_REQUIRED' ? 'Only the accountant path (administrator) can do that.' : `Refused (${r.code}).` };
    await audit({ operator: g.operator, action: 'finance.period.status', targetType: 'finance_period', targetRef: key, outcome: 'ok', detail: { to } });
    refreshFinance();
    return { ok: true, status: r.to ?? r.status ?? to, blockers: r.blockers };
  } catch (cause) { return fail(cause); }
}

export async function recordTaxStageAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.tax_review');
  if (!g.ok) return g;
  const taxType = str(fd, 'tax_type', 10), periodKey = str(fd, 'period_key', 10), stage = str(fd, 'stage', 30);
  const amount = int(fd, 'amount_cents');
  const range = (() => { try { return periodRange(periodKey); } catch { return null; } })();
  if (!['vat', 'kst', 'soli', 'gewst'].includes(taxType) || !range || !['accountant_reviewed', 'filed', 'assessed', 'paid'].includes(stage) || amount === null) return { ok: false, reason: 'invalid' };
  try {
    const endsOn = new Date(Date.parse(`${range.to}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await commands.recordTaxStage({ taxType, periodKey, startsOn: range.from, endsOn, stage, amountCents: amount, basis: { recorded_by: g.actor }, rulesVersion: 'manual', actor: g.actor, asAccountant: true, note: str(fd, 'note', 1000) || undefined });
    await audit({ operator: g.operator, action: 'finance.tax.stage', targetType: 'finance_tax_period', targetRef: `${taxType}:${periodKey}`, outcome: 'ok', detail: { stage, amount } });
    refreshFinance();
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function addTaxAdjustmentAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.tax_review');
  if (!g.ok) return g;
  const taxType = str(fd, 'tax_type', 10), kind = str(fd, 'kind', 40), reason = str(fd, 'reason', 1000);
  const year = int(fd, 'fiscal_year'), amount = int(fd, 'amount_cents');
  if (!['kst', 'gewst', 'vat'].includes(taxType) || !kind || !reason || year === null || amount === null) return { ok: false, reason: 'invalid' };
  try {
    await commands.insertTaxAdjustment({ tax_type: taxType, fiscal_year: year, kind, amount_cents: amount, reason, legal_reference: str(fd, 'legal_reference', 200) || null, actor: g.actor });
    await audit({ operator: g.operator, action: 'finance.tax.adjustment', outcome: 'ok', detail: { taxType, year, kind, amount } });
    refreshFinance();
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function addTaxNoticeAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const taxType = str(fd, 'tax_type', 10), periodKey = str(fd, 'period_key', 10), authority = str(fd, 'authority', 120), noticeType = str(fd, 'notice_type', 40), receivedOn = str(fd, 'received_on', 10);
  if (!taxType || !periodKey || !authority || !noticeType || !isIsoDate(receivedOn)) return { ok: false, reason: 'invalid' };
  const dues: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 6; i += 1) { const on = str(fd, `due_${i}_on`, 10); const amt = int(fd, `due_${i}_amount_cents`); if (isIsoDate(on) && amt !== null) dues.push({ due_on: on, amount_cents: amt, label: str(fd, `due_${i}_label`, 60) || null }); }
  try {
    const row = await commands.insertTaxNotice({ tax_type: taxType, period_key: periodKey, authority, notice_type: noticeType, assessment_date: str(fd, 'assessment_date', 10) || null, received_on: receivedOn, assessed_cents: int(fd, 'assessed_cents'), advance_payment_cents: int(fd, 'advance_payment_cents'), note: str(fd, 'note', 1000) || null, created_by: g.actor }, dues);
    const docId = str(fd, 'document_id', 40);
    if (/^[0-9a-f-]{36}$/.test(docId)) await commands.linkDocument(docId, 'tax_notice', (row as { id: string }).id, g.actor);
    await audit({ operator: g.operator, action: 'finance.tax.notice', outcome: 'ok', detail: { taxType, periodKey, noticeType, dues: dues.length } });
    refreshFinance();
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function setNoticeStatusAction(id: string, status: string): Promise<ActionResult> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/.test(id) || !['reviewed', 'disputed', 'paid', 'superseded'].includes(status)) return { ok: false, reason: 'invalid' };
  try {
    await commands.updateTaxNoticeStatus(id, status);
    await audit({ operator: g.operator, action: 'finance.tax.notice.status', targetType: 'finance_tax_notice', targetRef: id, outcome: 'ok', detail: { status } });
    refreshFinance();
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function recordTaxPaymentAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const taxType = str(fd, 'tax_type', 10), periodKey = str(fd, 'period_key', 10), kind = str(fd, 'kind', 20), paidOn = str(fd, 'paid_on', 10);
  const amount = int(fd, 'amount_cents');
  if (!taxType || !periodKey || !['advance', 'final', 'refund', 'interest', 'surcharge'].includes(kind) || !isIsoDate(paidOn) || amount === null) return { ok: false, reason: 'invalid' };
  try {
    await commands.insertTaxPayment({ tax_type: taxType, period_key: periodKey, kind, amount_cents: amount, paid_on: paidOn, note: str(fd, 'note', 400) || null, created_by: g.actor, notice_id: /^[0-9a-f-]{36}$/.test(str(fd, 'notice_id', 40)) ? str(fd, 'notice_id', 40) : null });
    await audit({ operator: g.operator, action: 'finance.tax.payment', outcome: 'ok', detail: { taxType, periodKey, kind, amount } });
    refreshFinance();
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function setReserveAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const kind = str(fd, 'kind', 20), label = str(fd, 'label', 120), asOf = str(fd, 'as_of', 10);
  const amount = int(fd, 'amount_cents');
  if (!['tax', 'maintenance', 'deposit', 'other'].includes(kind) || !label || !isIsoDate(asOf) || amount === null || amount < 0) return { ok: false, reason: 'invalid' };
  try {
    await commands.insertReserve({ kind, label, amount_cents: amount, as_of: asOf, note: str(fd, 'note', 400) || null, set_by: g.actor });
    await audit({ operator: g.operator, action: 'finance.reserve.set', outcome: 'ok', detail: { kind, amount } });
    refreshFinance();
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

/* ── Minibar ──────────────────────────────────────────────────────────── */

export async function recordMinibarMovementAction(fd: FormData): Promise<ActionResult<{ transactionId: string | null }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const productId = str(fd, 'product_id', 40), movement = str(fd, 'movement', 20), occurredOn = str(fd, 'occurred_on', 10) || undefined;
  const qty = int(fd, 'quantity');
  if (!/^[0-9a-f-]{36}$/.test(productId) || !['purchase', 'sale', 'adjustment', 'waste', 'complimentary', 'correction'].includes(movement) || qty === null || qty === 0) return { ok: false, reason: 'invalid', detail: 'Product, movement and a non-zero quantity are required.' };
  const signed = movement === 'purchase' ? Math.abs(qty) : ['sale', 'waste', 'complimentary'].includes(movement) ? -Math.abs(qty) : qty;
  // Whitelisted like `movement` is: the column carries a CHECK constraint, and
  // a value that fails it should be refused here with a sentence rather than
  // surface as a database error the operator cannot act on.
  const chargeState = str(fd, 'charge_state', 20);
  if (chargeState && !['not_applicable', 'unpaid', 'paid', 'included', 'written_off', 'needs_review'].includes(chargeState)) return { ok: false, reason: 'invalid', detail: 'Unknown charge state.' };
  const ref = str(fd, 'booking_reference', 20) || null;
  try {
    const r = (await commands.recordMinibarMovement({ product_id: productId, movement, quantity: signed, occurred_on: occurredOn, unit_id: /^[0-9a-f-]{36}$/.test(str(fd, 'unit_id', 40)) ? str(fd, 'unit_id', 40) : null, booking_intent_id: /^[0-9a-f-]{36}$/.test(str(fd, 'booking_intent_id', 40)) ? str(fd, 'booking_intent_id', 40) : null, booking_reference: ref, charge_state: chargeState || undefined, source_reference: movement === 'sale' && ref ? `${ref}:${str(fd, 'sku', 40) || productId}:${occurredOn ?? ''}` : undefined, note: str(fd, 'note', 400) || null }, g.actor)) as { ok: boolean; code?: string; transaction_id?: string | null; created?: boolean };
    if (!r.ok) return { ok: false, reason: 'refused', detail: `Refused (${r.code}).` };
    await audit({ operator: g.operator, action: 'finance.minibar.movement', targetType: 'minibar_product', targetRef: productId, outcome: r.created === false ? 'duplicate' : 'ok', detail: { movement, quantity: signed, reference: ref } });
    refreshFinance(['/admin/finance/minibar']);
    return { ok: true, transactionId: r.transaction_id ?? null };
  } catch (cause) { return fail(cause); }
}

export async function addMinibarProductAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.configure');
  if (!g.ok) return g;
  const sku = str(fd, 'sku', 40).toUpperCase(), name = str(fd, 'name', 120), code = str(fd, 'tax_code', 60);
  const price = int(fd, 'selling_price_cents'), cost = int(fd, 'purchase_cost_cents') ?? 0;
  if (!sku || !name || !taxCodeOf(code) || price === null || price < 0) return { ok: false, reason: 'invalid', detail: 'SKU, name, tax code and price are required.' };
  try {
    await commands.insertProduct({ sku, name, unit_label: str(fd, 'unit_label', 20) || 'piece', purchase_cost_cents: cost, selling_price_cents: price, tax_code: code, purchase_tax_code: str(fd, 'purchase_tax_code', 60) || null, reorder_threshold: int(fd, 'reorder_threshold') ?? 0, supplier_id: /^[0-9a-f-]{36}$/.test(str(fd, 'supplier_id', 40)) ? str(fd, 'supplier_id', 40) : null });
    await audit({ operator: g.operator, action: 'finance.minibar.product', outcome: 'ok', detail: { sku, taxCode: code } });
    refreshFinance(['/admin/finance/minibar']);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

/* ── Counterparties, accounts, policy ─────────────────────────────────── */

export async function addCounterpartyAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.configure');
  if (!g.ok) return g;
  const name = str(fd, 'name', 200), kind = str(fd, 'kind', 30);
  if (!name || !['supplier', 'customer', 'ota', 'payment_provider', 'authority', 'bank', 'other'].includes(kind)) return { ok: false, reason: 'invalid' };
  const cat = str(fd, 'default_category', 60), code = str(fd, 'default_tax_code', 60);
  if (cat && !categoryOf(cat)) return { ok: false, reason: 'invalid', detail: 'Unknown category.' };
  if (code && !taxCodeOf(code)) return { ok: false, reason: 'invalid', detail: 'Unknown tax code.' };
  try {
    await commands.insertCounterparty({ name, kind, country: str(fd, 'country', 2).toUpperCase() || null, vat_id: str(fd, 'vat_id', 20) || null, default_category: cat || null, default_tax_code: code || null, default_input_vat: str(fd, 'default_input_vat', 30) || null, default_allocation: str(fd, 'default_allocation', 30) || null, auto_verify: str(fd, 'auto_verify') === 'true', match_patterns: str(fd, 'match_patterns', 400).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), note: str(fd, 'note', 400) || null });
    await audit({ operator: g.operator, action: 'finance.counterparty.add', outcome: 'ok', detail: { name, kind } });
    refreshFinance(['/admin/finance/settings']);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function addAccountAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.configure');
  if (!g.ok) return g;
  const code = str(fd, 'code', 20).toUpperCase(), label = str(fd, 'label', 120), kind = str(fd, 'kind', 20);
  const opening = int(fd, 'opening_balance_cents');
  const on = str(fd, 'opening_balance_on', 10);
  if (!code || !label || !['bank', 'paypal', 'cash', 'ota_wallet', 'other'].includes(kind)) return { ok: false, reason: 'invalid' };
  const iban = str(fd, 'iban', 34).replace(/\s/g, '');
  try {
    await commands.insertAccount({ code, label, kind, currency: 'EUR', iban_masked: iban ? `${iban.slice(0, 2)}•• •••• •••• •••• •••• ${iban.slice(-4)}` : null, opening_balance_cents: opening ?? 0, opening_balance_on: isIsoDate(on) ? on : null });
    await audit({ operator: g.operator, action: 'finance.account.add', outcome: 'ok', detail: { code, kind } });
    refreshFinance(['/admin/finance/settings', '/admin/finance/cash-flow']);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function setPolicyAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.configure');
  if (!g.ok) return g;
  const key = str(fd, 'key', 60), value = str(fd, 'value', 60), from = str(fd, 'effective_from', 10);
  const allowed: Record<string, RegExp> = { vat_filing_frequency: /^(monthly|quarterly|annual_only)$/, dauerfristverlaengerung: /^(true|false)$/, fiscal_year_start_month: /^([1-9]|1[0-2])$/, vat_annual_return_month: /^([1-9]|1[0-2])$/, tax_reserve_policy: /^[a-z_]{3,40}$/, local_levy_enabled: /^(true|false)$/, small_business_scheme: /^(true|false)$/, default_shared_cost_allocation: /^(manual|revenue_share|occupied_nights|floor_area|equal_units|custom)$/ };
  if (!allowed[key] || !allowed[key].test(value) || !isIsoDate(from)) return { ok: false, reason: 'invalid' };
  try {
    await commands.insertPolicy({ key, value, effective_from: from, source_reference: str(fd, 'source_reference', 300) || null, set_by: g.actor });
    await audit({ operator: g.operator, action: 'finance.policy.set', outcome: 'ok', detail: { key, value, from } });
    refreshFinance(['/admin/finance/settings']);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

export async function addTaxRateAction(fd: FormData): Promise<ActionResult> {
  const g = await gate('finance.configure');
  if (!g.ok) return g;
  const type = str(fd, 'tax_type', 20), from = str(fd, 'effective_from', 10), ref = str(fd, 'legal_reference', 300);
  const bp = int(fd, 'rate_bp');
  if (!['kst', 'soli', 'gewst_messzahl', 'gewst_hebesatz'].includes(type) || !isIsoDate(from) || bp === null || bp < 0 || !ref) return { ok: false, reason: 'invalid', detail: 'Type, date, rate and a legal/source reference are required.' };
  try {
    await commands.insertTaxRate({ tax_type: type, jurisdiction: type === 'gewst_hebesatz' ? 'DE-BY-Bayreuth' : 'DE', rate_bp: bp, effective_from: from, effective_to: str(fd, 'effective_to', 10) || null, legal_reference: ref, source_url: str(fd, 'source_url', 300) || null, review_required: str(fd, 'confirmed') !== 'true', note: str(fd, 'note', 300) || null });
    await audit({ operator: g.operator, action: 'finance.tax_rate.add', outcome: 'ok', detail: { type, bp, from } });
    refreshFinance(['/admin/finance/settings']);
    return { ok: true };
  } catch (cause) { return fail(cause); }
}

/* ── Imports ──────────────────────────────────────────────────────────── */

/** A CSV by name and by declared type. Browsers report CSV inconsistently (Excel on Windows says vnd.ms-excel), so the type is an allow-list, and the content is then parsed as data only. */
const CSV_EXTENSIONS = /\.(csv|txt)$/i;
const CSV_MIME = new Set(['', 'text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'text/comma-separated-values', 'application/octet-stream']);
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function stageImportAction(fd: FormData): Promise<ActionResult<{ batchId?: string; summary: string }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  const requested = str(fd, 'adapter', 40);
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMPORT_BYTES) return { ok: false, reason: 'invalid', detail: 'A CSV file up to 5 MB is required.' };
  if (!CSV_EXTENSIONS.test(file.name) || !CSV_MIME.has(file.type.toLowerCase())) return { ok: false, reason: 'invalid', detail: 'Only a .csv (or .txt) text export is accepted.' };
  try {
    const text = await file.text();
    let adapter: AdapterId;
    if (requested === 'auto') {
      // Detection reads the header line only, and never picks a retired adapter.
      const detected = detectAdapter(parseCsv(text.slice(0, 4096).split(/\r?\n/)[0] ?? '').headers);
      if (!detected) return { ok: false, reason: 'refused', detail: 'The file’s columns match no adapter. Choose the adapter explicitly to see which columns are missing.' };
      adapter = detected.id;
    } else {
      const spec = ADAPTERS.find((a) => a.id === requested);
      if (!spec) return { ok: false, reason: 'invalid', detail: 'Unknown adapter.' };
      if (spec.readiness === 'retired') return { ok: false, reason: 'refused', detail: `${spec.label} no longer accepts uploads.` };
      adapter = spec.id;
    }
    const r = await commands.stageImport(adapter, file.name, text, g.actor);
    // Counts and the filename only: never a row, a header value or a name from the file.
    await audit({ operator: g.operator, action: 'finance.import.stage', outcome: r.ok ? 'ok' : r.reason, detail: { adapter, detected: requested === 'auto', filename: file.name.slice(0, 120), bytes: file.size, ...(r.ok ? { rows: r.rowCount, valid: r.validRows, errors: r.errorRows, duplicates: r.duplicateRows } : {}) } });
    refreshFinance(['/admin/finance/imports']);
    if (!r.ok) return { ok: false, reason: 'refused', detail: r.detail };
    const label = ADAPTERS.find((a) => a.id === adapter)?.label ?? adapter;
    return { ok: true, batchId: r.batchId, summary: `${label}: ${r.validRows} valid, ${r.errorRows} error, ${r.duplicateRows} duplicate rows (${r.readiness} adapter).` };
  } catch (cause) { return fail(cause); }
}

export async function commitImportAction(batchId: string): Promise<ActionResult<{ posted: number; errors: string[]; alreadyImported: number; amendments: number }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/.test(batchId)) return { ok: false, reason: 'invalid' };
  try {
    const r = await commands.commitImport(batchId, g.actor);
    await audit({ operator: g.operator, action: 'finance.import.commit', targetType: 'finance_import_batch', targetRef: batchId, outcome: r.errors.length ? 'partial' : 'ok', detail: { posted: r.posted, skipped: r.skipped, alreadyImported: r.alreadyImported, amendments: r.amendments, errors: r.errors.length } });
    refreshFinance(['/admin/finance/imports', `/admin/finance/imports/${batchId}`, '/admin/finance/booking-com']);
    return { ok: true, posted: r.posted, errors: r.errors, alreadyImported: r.alreadyImported, amendments: r.amendments };
  } catch (cause) { return fail(cause); }
}

/* ── Booking.com settlements ──────────────────────────────────────────── */

/** Re-run the reservation match for every current Booking.com line (after a reservation backfill) and post any pending ledger facts. */
export async function rematchSettlementsAction(): Promise<ActionResult<{ report: commands.SettlementRematchReport }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  try {
    const report = await commands.rematchSettlements(g.actor);
    await audit({ operator: g.operator, action: 'finance.settlement.rematch', outcome: report.errors.length ? 'partial' : 'ok', detail: { scanned: report.scanned, changed: report.changed, matched: report.matched, unmatched: report.unmatched, ambiguous: report.ambiguous, ledgerPosted: report.ledgerPosted, errors: report.errors.length } });
    refreshFinance(['/admin/finance/booking-com']);
    return { ok: true, report };
  } catch (cause) { return fail(cause); }
}

/** Accept an amended Booking.com line: reverse the original's ledger facts, supersede it, post the amendment. A reason is required. */
export async function acceptSettlementAmendmentAction(settlementId: string, reason: string): Promise<ActionResult<{ revenueTransactionId: string | null }>> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  const why = String(reason ?? '').trim().slice(0, 500);
  if (!/^[0-9a-f-]{36}$/.test(settlementId) || why.length < 3) return { ok: false, reason: 'invalid', detail: 'A reason is required.' };
  try {
    const r = await commands.acceptSettlementAmendment(settlementId, why, g.actor);
    await audit({ operator: g.operator, action: 'finance.settlement.accept_amendment', targetType: 'finance_ota_settlement', targetRef: settlementId, outcome: r.ok ? 'ok' : (r.code ?? 'refused'), detail: { reason: why } });
    refreshFinance(['/admin/finance/booking-com']);
    if (!r.ok) return { ok: false, reason: 'refused', detail: r.code === 'STALE' ? 'The line this amendment replaces is no longer current.' : r.code === 'NOT_AN_AMENDMENT' ? 'This line is not an amendment awaiting review.' : 'Not found.' };
    return { ok: true, revenueTransactionId: r.revenueTransactionId ?? null };
  } catch (cause) { return fail(cause); }
}

/* ── Invoices ─────────────────────────────────────────────────────────── */

export async function createInvoiceDraftAction(intentId: string): Promise<ActionResult<{ id: string }>> {
  const g = await gate('finance.edit');
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/.test(intentId)) return { ok: false, reason: 'invalid' };
  try {
    const { data, error } = await supabaseAdmin().from('bolagio_booking_intents').select('id, reference, unit_id, check_in, check_out, currency, guest_first_name, guest_last_name, country, quote_components, quoted_total_cents, bolagio_units(display_name)').eq('id', intentId).maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, reason: 'invalid', detail: 'Booking not found.' };
    const unit = Array.isArray(data.bolagio_units) ? data.bolagio_units[0] : data.bolagio_units;
    const nights = Math.round((Date.parse(`${data.check_out}T00:00:00Z`) - Date.parse(`${data.check_in}T00:00:00Z`)) / 86_400_000);
    const comps = Array.isArray(data.quote_components) ? (data.quote_components as Array<{ code: string; label: { de: string; en: string }; amountCents: number; taxCategory?: string; mandatory?: boolean }>) : [];
    const r = await commands.createInvoiceDraft({
      intentId: data.id, reference: data.reference, unitId: data.unit_id, unitName: (unit as { display_name: string } | null)?.display_name ?? 'Unit', checkIn: data.check_in, checkOut: data.check_out, nights, currency: data.currency,
      guestName: `${data.guest_first_name ?? ''} ${data.guest_last_name ?? ''}`.trim() || 'Guest', guestAddress: null, guestCountry: data.country, company: null, companyVatId: null,
      components: (comps.length > 0 ? comps.filter((c) => c.mandatory !== false) : [{ code: 'total', label: { de: 'Unterkunft', en: 'Accommodation' }, amountCents: Number(data.quoted_total_cents ?? 0), taxCategory: 'accommodation' }]).map((c) => ({ code: c.code, label: c.label.en || c.label.de, amountCents: c.amountCents, taxCategory: c.taxCategory })),
    }, g.actor);
    await audit({ operator: g.operator, action: 'finance.invoice.draft', targetType: 'finance_invoice', targetRef: r.id, outcome: 'ok', detail: { reference: data.reference } });
    refreshFinance(['/admin/finance/invoices']);
    return { ok: true, id: r.id };
  } catch (cause) { return fail(cause); }
}

export async function issueInvoiceAction(invoiceId: string): Promise<ActionResult<{ number: string }>> {
  const g = await gate('finance.review');
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) return { ok: false, reason: 'invalid' };
  try {
    const r = await commands.issueInvoice(invoiceId, g.actor);
    if (!r.ok) {
      await audit({ operator: g.operator, action: 'finance.invoice.issue', targetType: 'finance_invoice', targetRef: invoiceId, outcome: `refused:${r.reason}`, detail: { blockers: r.blockers?.length ?? 0 } });
      return { ok: false, reason: 'refused', detail: r.reason === 'blocked' ? `Fails closed: ${(r.blockers ?? []).join('; ')}` : `Refused (${r.reason}).` };
    }
    await audit({ operator: g.operator, action: 'finance.invoice.issue', targetType: 'finance_invoice', targetRef: invoiceId, outcome: 'ok', detail: { number: r.number } });
    refreshFinance(['/admin/finance/invoices', `/admin/finance/invoices/${invoiceId}`]);
    return { ok: true, number: r.number };
  } catch (cause) { return fail(cause); }
}

/* ── Exports ──────────────────────────────────────────────────────────── */

export async function exportAction(kind: ExportKind, from: string, to: string): Promise<ActionResult<{ filename: string; text: string; sha256: string }>> {
  const g = await gate('finance.export');
  if (!g.ok) return g;
  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) return { ok: false, reason: 'invalid', detail: 'A date range is required.' };
  try {
    const source = await financeRowSource();
    const units = await source.units();
    const name = unitNamer(units);
    const meta = { kind, from, to, generatedAt: new Date().toISOString(), generatedBy: g.actor };
    let text: string;
    let rows = 0;
    const lines = () => source.linesByFilter({ from, to });
    switch (kind) {
      case 'revenue_ledger': { const l = (await lines()).filter((x) => ['revenue', 'refund', 'credit_note'].includes(x.transaction.kind)); rows = l.length; text = builders.ledgerCsv(meta, l, name); break; }
      case 'expense_ledger': { const l = (await lines()).filter((x) => ['expense', 'commission', 'fee', 'cogs'].includes(x.transaction.kind)); rows = l.length; text = builders.ledgerCsv(meta, l, name); break; }
      case 'transaction_ledger': { const l = await lines(); rows = l.length; text = builders.ledgerCsv(meta, l, name); break; }
      case 'payments_ledger': { const p = await source.payments({ from, to, page: 1, pageSize: 5000 }); rows = p.rows.length; text = builders.paymentsCsv(meta, p.rows); break; }
      case 'vat_report': { const key = /^\d{4}-(0[1-9]|1[0-2])-01$/.test(from) ? (await import('@/lib/finance/tax/calendar')).vatPeriodKeyFor(from, (await import('@/lib/finance/config')).calendarPolicyFrom(await source.policy(), from)) : from.slice(0, 7); const v = await loadVat(key); if (!v.ok) throw new Error(v.error); rows = v.data.position.output.length + v.data.position.input.length; text = builders.vatReportCsv(meta, v.data.position); break; }
      case 'reverse_charge_report': { const l = (await lines()).filter((x) => x.tax_code === 'DE_REVERSE_CHARGE'); rows = l.length; text = builders.ledgerCsv(meta, l, name); break; }
      case 'booking_com_commission': { const l = await lines(); text = builders.bookingComCommissionCsv(meta, l); rows = l.filter((x) => x.category === 'ota_commission').length; break; }
      case 'property_profitability': { const r = await loadProperties({ from, to }); if (!r.ok) throw new Error(r.error); rows = r.data.report.units.length; text = builders.profitabilityCsv(meta, r.data.report); break; }
      case 'profit_loss': { const r = await loadPl({ from, to }); if (!r.ok) throw new Error(r.error); rows = r.data.pl.sections.reduce((s, x) => s + x.lines.length, 0); text = builders.plCsv(meta, r.data.pl); break; }
      case 'cash_flow': { const r = await loadCashFlow(12); if (!r.ok) throw new Error(r.error); const months = r.data.months.filter((m) => `${m.month}-01` >= from.slice(0, 7) + '-01' && `${m.month}-01` < to); rows = months.length; text = builders.cashFlowCsv(meta, months); break; }
      case 'tax_estimate': { const r = await loadTaxes(Number(from.slice(0, 4))); if (!r.ok) throw new Error(r.error); const est = await source.taxEstimates(); rows = est.length; text = builders.taxEstimateCsv(meta, r.data.estimate, r.data.periods, est); break; }
      case 'tax_adjustments': { const a = await source.taxAdjustments(); rows = a.length; text = builders.taxAdjustmentsCsv(meta, a); break; }
      case 'missing_documents': { const t = await source.transactions({ from, to, page: 1, pageSize: 5000, documentState: 'missing', status: 'posted' }); rows = t.rows.length; text = builders.missingDocumentsCsv(meta, t.rows); break; }
      case 'asset_candidates': { const l = (await lines()).filter((x) => x.asset_state !== 'none'); rows = l.length; text = builders.assetCandidatesCsv(meta, l, name); break; }
      case 'accountant_review': {
        const [rev, exp, vat] = await Promise.all([loadRevenue({ from, to }), loadExpenses({ from, to }), loadVat(from.slice(0, 7))]);
        const summary = [
          { label: 'period', value: `${from} – ${to}` }, { label: 'revenue net', value: rev.ok ? (rev.data.totals.netCents / 100).toFixed(2) : 'n/a' }, { label: 'expenses net', value: exp.ok ? (exp.data.totals.netCents / 100).toFixed(2) : 'n/a' },
          { label: 'expense lines needing review', value: exp.ok ? exp.data.totals.needsReview : 'n/a' }, { label: 'missing documents', value: exp.ok ? exp.data.totals.missingDocs : 'n/a' }, { label: 'input VAT deductible (estimate)', value: exp.ok ? (exp.data.totals.deductibleVatCents / 100).toFixed(2) : 'n/a' },
          { label: 'VAT estimate (first month of range)', value: vat.ok ? (vat.data.position.estimateCents / 100).toFixed(2) : 'n/a' },
        ];
        rows = summary.length; text = builders.accountantReviewCsv(meta, summary); break;
      }
      default: return { ok: false, reason: 'invalid' };
    }
    const rec = await commands.recordExport({ kind, from, to, format: 'csv', version: EXPORT_VERSION, generator: EXPORT_GENERATOR, rowCount: rows, text, actor: g.actor });
    await audit({ operator: g.operator, action: 'finance.export', targetType: 'finance_export', targetRef: rec.id, outcome: 'ok', detail: { kind, from, to, rows, sha256: rec.sha256 } });
    revalidatePath('/admin/finance/accountant');
    return { ok: true, filename: `bolagio-${kind}-${from}-${to}.csv`, text, sha256: rec.sha256 };
  } catch (cause) { return fail(cause); }
}
