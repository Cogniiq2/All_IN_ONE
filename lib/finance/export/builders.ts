/**
 * EXPORTS — reproducible CSV builders. Every file starts with a metadata
 * block (kind, period, generated at, generator version, source) so a file
 * found on a disk two years later still says what it is. The runner hashes
 * the bytes and records the export in `bolagio_finance_exports`.
 *
 * DATEV: see `datev.ts`. Nothing here is named DATEV.
 */

import { CATEGORIES, categoryLabel } from '@/lib/finance/categories';
import { formatCents } from '@/lib/finance/money';
import { toCsv } from '@/lib/finance/import/csv';
import type { LineRow, PaymentRow, TaxEstimateRow, TaxPeriodRow, TransactionRow, TaxAdjustmentRow } from '@/lib/finance/rows';
import type { VatPosition } from '@/lib/finance/tax/vat';
import type { PlReport } from '@/lib/finance/reports/pl';
import type { ProfitabilityReport } from '@/lib/finance/reports/profitability';
import type { CashMonth } from '@/lib/finance/reports/cash-flow';
import type { CompanyTaxEstimate } from '@/lib/finance/tax/company';

export const EXPORT_GENERATOR = 'bolagio-control-finance';
export const EXPORT_VERSION = '2026.09.1';

export type ExportKind =
  | 'revenue_ledger' | 'expense_ledger' | 'transaction_ledger' | 'vat_report' | 'reverse_charge_report' | 'booking_com_commission'
  | 'property_profitability' | 'profit_loss' | 'cash_flow' | 'tax_estimate' | 'tax_adjustments' | 'missing_documents' | 'asset_candidates' | 'accountant_review' | 'payments_ledger';

export const EXPORT_LABEL: Record<ExportKind, string> = {
  revenue_ledger: 'Revenue ledger', expense_ledger: 'Expense ledger', transaction_ledger: 'Transaction ledger', vat_report: 'VAT report', reverse_charge_report: 'Reverse-charge report',
  booking_com_commission: 'Booking.com commission report', property_profitability: 'Property profitability', profit_loss: 'Profit & loss', cash_flow: 'Cash-flow report', tax_estimate: 'Tax estimate report',
  tax_adjustments: 'Tax adjustment report', missing_documents: 'Missing document report', asset_candidates: 'Asset candidate report', accountant_review: 'Accountant review report', payments_ledger: 'Payments ledger',
};

export interface ExportMeta {
  kind: ExportKind;
  from: string;
  to: string;
  generatedAt: string;
  generatedBy: string;
  /** Any figure in the file that is an estimate says so here. */
  estimate?: boolean;
}

function header(meta: ExportMeta, extra: string[] = []): string {
  const lines = [
    `# ${EXPORT_LABEL[meta.kind]}`,
    `# period;${meta.from};${meta.to} (exclusive)`,
    `# generated_at;${meta.generatedAt}`,
    `# generated_by;${meta.generatedBy}`,
    `# generator;${EXPORT_GENERATOR};${EXPORT_VERSION}`,
    `# source;BoLaGio Control finance ledger (bolagio_finance_*)`,
    `# amounts;EUR;decimal with two places;negative = credit/reversal`,
    ...(meta.estimate ? ['# NOTE;figures marked ESTIMATE are system estimates, not filed or assessed amounts'] : []),
    ...extra,
  ];
  return `${lines.join('\r\n')}\r\n`;
}

const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function ledgerCsv(meta: ExportMeta, lines: ReadonlyArray<LineRow & { transaction: TransactionRow }>, unitName: (id: string | null) => string): string {
  const rows = lines.map((l) => {
    const t = l.transaction;
    return [t.booked_on, t.kind, t.status, t.description, t.counterparty_label ?? '', t.supplier_invoice_no ?? '', t.booking_reference ?? '', t.channel ?? '', unitName(l.unit_id ?? t.unit_id), l.line_no, l.category, categoryLabel(l.category), l.tax_code, l.rate_bp / 100, eur(l.net_cents), eur(l.vat_cents), eur(l.gross_cents), eur(l.reverse_charge_vat_cents), l.input_vat_treatment, l.deductible_bp / 100, l.allocation_method, l.classification, t.document_state, t.payment_state, t.reconciliation_state, t.source_system, t.source_reference, t.id, l.id];
  });
  return header(meta) + toCsv(['booked_on', 'kind', 'status', 'description', 'counterparty', 'supplier_invoice_no', 'booking_reference', 'channel', 'unit', 'line_no', 'category', 'category_label', 'tax_code', 'rate_pct', 'net', 'vat', 'gross', 'reverse_charge_vat', 'input_vat_treatment', 'deductible_pct', 'allocation', 'classification', 'document_state', 'payment_state', 'reconciliation_state', 'source_system', 'source_reference', 'transaction_id', 'line_id'], rows);
}

export function paymentsCsv(meta: ExportMeta, payments: readonly PaymentRow[]): string {
  return header(meta) + toCsv(['occurred_at', 'value_date', 'direction', 'source', 'kind', 'provider_reference', 'amount', 'fee', 'currency', 'counterparty', 'reference_text', 'booking_reference', 'reconciliation_state', 'payment_id'],
    payments.map((p) => [p.occurred_at, p.value_date ?? '', p.direction, p.source, p.kind, p.provider_reference, eur(p.amount_cents), eur(p.fee_cents), p.currency, p.counterparty_label ?? '', p.reference_text ?? '', p.booking_reference ?? '', p.reconciliation_state, p.id]));
}

export function vatReportCsv(meta: ExportMeta, p: VatPosition): string {
  const rows: unknown[][] = [];
  for (const l of p.output) rows.push(['output', l.taxCode, l.label, l.rateBp / 100, eur(l.basisCents), eur(l.vatCents), 'ESTIMATE']);
  rows.push(['reverse_charge', 'DE_REVERSE_CHARGE', 'Reverse charge § 13b — output', 19, eur(p.reverseCharge.basisCents), eur(p.reverseCharge.outputVatCents), 'ESTIMATE']);
  rows.push(['reverse_charge', 'DE_REVERSE_CHARGE', 'Reverse charge § 13b — input', 19, eur(p.reverseCharge.basisCents), eur(-p.reverseCharge.inputVatCents), 'ESTIMATE']);
  for (const l of p.input) rows.push(['input', l.taxCode, l.label, l.rateBp / 100, eur(l.basisCents), eur(-l.vatCents), 'ESTIMATE']);
  rows.push(['excluded', '', 'Input VAT not deductible', '', '', eur(p.nonDeductibleVatCents), 'info']);
  rows.push(['excluded', '', 'VAT on lines awaiting review (not counted)', '', '', eur(p.reviewVatCents), `lines_needing_review=${p.linesNeedingReview}`]);
  rows.push(['adjustments', '', 'Manual VAT adjustments', '', '', eur(p.adjustmentsCents), '']);
  rows.push(['total', '', p.estimateCents >= 0 ? 'Estimated VAT payable' : 'Estimated VAT refund', '', '', eur(p.estimateCents), 'ESTIMATE']);
  return header({ ...meta, estimate: true }, [`# vat_period;${p.periodKey}`, `# rules_version;${p.rulesVersion}`, ...p.caveats.map((c) => `# caveat;${c}`)]) + toCsv(['section', 'tax_code', 'label', 'rate_pct', 'basis', 'vat', 'status'], rows);
}

export function plCsv(meta: ExportMeta, pl: PlReport): string {
  const rows: unknown[][] = [];
  for (const s of pl.sections) {
    for (const l of s.lines) rows.push([s.label, l.label, l.category, eur(l.cents), l.transactions, 'actual']);
    rows.push([s.label, `Total ${s.label}`, '', eur(s.totalCents), '', 'actual']);
  }
  for (const st of pl.subtotals) rows.push(['SUBTOTAL', st.label, st.key, eur(st.cents), '', st.provenance === 'estimate' ? 'ESTIMATE' : 'actual']);
  if (pl.estimatedTaxesCents !== null) rows.push(['Company taxes', 'Estimated KSt + Soli + GewSt', 'taxes', eur(pl.estimatedTaxesCents), '', 'ESTIMATE']);
  return header({ ...meta, estimate: pl.estimatedTaxesCents !== null }, ['# note;balance items (asset acquisition, VAT settlement) are excluded from the P&L']) + toCsv(['section', 'line', 'category', 'amount', 'transactions', 'status'], rows);
}

export function profitabilityCsv(meta: ExportMeta, r: ProfitabilityReport): string {
  const rows = r.units.map((u) => [u.name, u.slug, eur(u.accommodationCents), eur(u.minibarCents), eur(u.otherRevenueCents), eur(u.revenueCents), u.nightsSold, u.nightsAvailable, u.occupancy === null ? '' : (u.occupancy * 100).toFixed(1), u.adrCents === null ? '' : eur(u.adrCents), u.stays, eur(u.directCostsCents), eur(u.propertyCostsCents), eur(u.contributionCents), u.contributionMargin === null ? '' : (u.contributionMargin * 100).toFixed(1), u.costPerOccupiedNightCents === null ? '' : eur(u.costPerOccupiedNightCents), u.cleaningPerStayCents === null ? '' : eur(u.cleaningPerStayCents), u.allocationMethods.map((m) => `${m.method}=${eur(m.cents)}`).join(' ')]);
  rows.push(['UNALLOCATED (not in any unit)', '', '', '', '', '', '', '', '', '', '', '', '', eur(-r.unallocatedCostsCents), '', '', '', r.unallocatedByCategory.map((c) => `${c.category}=${eur(c.cents)}`).join(' ')]);
  return header(meta) + toCsv(['unit', 'slug', 'accommodation', 'minibar', 'other_revenue', 'revenue', 'nights_sold', 'nights_available', 'occupancy_pct', 'adr', 'stays', 'direct_costs', 'property_costs', 'contribution', 'margin_pct', 'cost_per_occupied_night', 'cleaning_per_stay', 'allocation_methods'], rows);
}

export function cashFlowCsv(meta: ExportMeta, months: readonly CashMonth[]): string {
  const rows: unknown[][] = [];
  for (const m of months) {
    rows.push([m.month, 'opening', '', m.openingCents === null ? 'unknown' : eur(m.openingCents)]);
    for (const i of m.inflows) rows.push([m.month, 'inflow', i.label, eur(i.cents)]);
    for (const o of m.outflows) rows.push([m.month, 'outflow', o.label, eur(-o.cents)]);
    rows.push([m.month, 'net', '', eur(m.netCents)]);
    rows.push([m.month, 'closing', '', m.closingCents === null ? 'unknown' : eur(m.closingCents)]);
  }
  return header(meta, ['# note;opening/closing are unknown until an account opening balance is recorded']) + toCsv(['month', 'row', 'label', 'amount'], rows);
}

export function taxEstimateCsv(meta: ExportMeta, e: CompanyTaxEstimate, periods: readonly TaxPeriodRow[], estimates: readonly TaxEstimateRow[]): string {
  const rows: unknown[][] = [];
  for (const f of [e.kst, e.soli, e.gewst]) {
    for (const s of f.steps) rows.push([f.taxType, s.label, eur(s.cents), s.note ?? '', 'ESTIMATE']);
    rows.push([f.taxType, 'advance payments recorded', eur(f.advancePaidCents), '', 'actual']);
    rows.push([f.taxType, 'remaining estimate', eur(f.remainingCents), f.caveats.join(' | '), 'ESTIMATE']);
  }
  for (const p of periods) {
    const mine = estimates.filter((x) => x.tax_period_id === p.id).sort((a, b) => a.computed_at.localeCompare(b.computed_at));
    for (const s of mine) rows.push([`${p.tax_type} ${p.period_key}`, `stage ${s.stage}`, eur(s.amount_cents), `${s.computed_at} by ${s.actor} (${s.rules_version})`, s.stage === 'system_estimate' ? 'ESTIMATE' : s.stage.toUpperCase()]);
  }
  return header({ ...meta, estimate: true }, [`# fiscal_year;${e.fiscalYear}`, `# rules_version;${e.rulesVersion}`, ...e.caveats.map((c) => `# caveat;${c}`)]) + toCsv(['tax', 'step', 'amount', 'note', 'status'], rows);
}

export function taxAdjustmentsCsv(meta: ExportMeta, adjustments: readonly TaxAdjustmentRow[]): string {
  return header(meta) + toCsv(['tax_type', 'fiscal_year', 'kind', 'amount', 'reason', 'legal_reference', 'actor', 'created_at', 'superseded_by', 'id'],
    adjustments.map((a) => [a.tax_type, a.fiscal_year, a.kind, eur(a.amount_cents), a.reason, a.legal_reference ?? '', a.actor, a.created_at, a.superseded_by ?? '', a.id]));
}

export function missingDocumentsCsv(meta: ExportMeta, transactions: readonly TransactionRow[]): string {
  return header(meta) + toCsv(['booked_on', 'kind', 'counterparty', 'supplier_invoice_no', 'description', 'gross', 'vat_at_risk', 'transaction_id'],
    transactions.filter((t) => t.document_state === 'missing').map((t) => [t.booked_on, t.kind, t.counterparty_label ?? '', t.supplier_invoice_no ?? '', t.description, eur(t.gross_cents), eur(t.vat_cents), t.id]));
}

export function assetCandidatesCsv(meta: ExportMeta, lines: ReadonlyArray<LineRow & { transaction: TransactionRow }>, unitName: (id: string | null) => string): string {
  return header(meta) + toCsv(['booked_on', 'counterparty', 'description', 'category', 'net', 'unit', 'asset_state', 'transaction_id', 'line_id'],
    lines.filter((l) => l.asset_state === 'candidate' || l.asset_state === 'confirmed_asset').map((l) => [l.transaction.booked_on, l.transaction.counterparty_label ?? '', l.description ?? l.transaction.description, l.category, eur(l.net_cents), unitName(l.unit_id ?? l.transaction.unit_id), l.asset_state, l.transaction.id, l.id]));
}

export function accountantReviewCsv(meta: ExportMeta, summary: Array<{ label: string; value: string | number }>): string {
  return header(meta) + toCsv(['item', 'value'], summary.map((s) => [s.label, s.value]));
}

export function bookingComCommissionCsv(meta: ExportMeta, lines: ReadonlyArray<LineRow & { transaction: TransactionRow }>): string {
  const mine = lines.filter((l) => l.category === 'ota_commission' || (l.transaction.channel === 'booking_com' && l.transaction.kind === 'revenue'));
  return header(meta) + toCsv(['booked_on', 'kind', 'booking_reference', 'description', 'category', 'net', 'reverse_charge_vat', 'tax_code', 'reconciliation_state', 'document_state', 'transaction_id'],
    mine.map((l) => [l.transaction.booked_on, l.transaction.kind, l.transaction.booking_reference ?? '', l.transaction.description, l.category, eur(l.net_cents), eur(l.reverse_charge_vat_cents), l.tax_code, l.transaction.reconciliation_state, l.transaction.document_state, l.transaction.id]));
}

export { formatCents, CATEGORIES };
