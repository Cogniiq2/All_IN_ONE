import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE READ MODELS — one loader per screen, nothing that writes.
 *
 * Each loader composes rows from the finance row source with the pure
 * engines (P&L, VAT, company taxes, reserve, inbox, reconciliation) and
 * answers a `QueryResult`, so a page renders what loaded and names what did
 * not. A database error is never shown as "€ 0".
 *
 * Every figure a screen shows comes back with its provenance: actual
 * (posted facts), calculated (derived from facts), estimated (tax engines),
 * committed / expected (forward-looking). Screens render the badge; they do
 * not decide it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { failed, ok, type QueryResult } from '@/lib/admin/dto';
import { adminPosture } from '@/lib/admin/config';
import { AdminUnconfiguredError, financeRowSource } from '@/lib/finance/source';
import { calendarPolicyFrom, financeConfig } from '@/lib/finance/config';
import { errorMessage } from '@/lib/finance/errors';
import type { FinanceConfigSnapshot } from '@/lib/finance/config-shape';
import { addDays, berlinToday, monthKey, monthKeysBetween, mtd, periodLabel, periodRange, yearOf, yearRange, ytd, type DateRange, type IsoDate } from '@/lib/finance/periods';
import { computeVatPosition, type VatPosition } from '@/lib/finance/tax/vat';
import { estimateCompanyTaxes, type CompanyTaxEstimate, type TaxAdjustment } from '@/lib/finance/tax/company';
import { computeFreeCash, computeReserve, governingStage, type FreeCashReport, type ReserveReport, type TaxLiabilityInput, type TaxStage } from '@/lib/finance/tax/reserve';
import { calculatedDeadlines, mergeDeadlines, urgencyOf, vatPeriodKeyFor, vatPeriodKeysBetween, type Deadline } from '@/lib/finance/tax/calendar';
import { buildPl, type PlReport } from '@/lib/finance/reports/pl';
import { buildCashFlow, cashNow, projectCash, type CashMonth, type CashProjection } from '@/lib/finance/reports/cash-flow';
import { buildChannelEconomics, buildProfitability, type ChannelEconomics, type ProfitabilityReport } from '@/lib/finance/reports/profitability';
import { deriveInbox, type InboxItem } from '@/lib/finance/inbox';
import { proposeMatches, type MatchProposal } from '@/lib/finance/reconciliation';
import { invoiceRequirements, type InvoiceDraft } from '@/lib/finance/invoices';
import { datevGate, proposeDatevRows, type DatevGate, type DatevRowProposal } from '@/lib/finance/export/datev';
import { eInvoiceGate } from '@/lib/finance/e-invoice';
import { datevSkr } from '@/lib/finance/config';
import type {
  AccountRow, AssetRow, CategoryRow, CounterpartyRow, DocumentLinkRow, DocumentRow, ExceptionCountsRow, ExportRow, ImportBatchRow, ImportRowRow, InvoiceLineRow, InvoiceRow, LineRow,
  MinibarMovementRow, MinibarProductRow, MinibarStockRow, OverrideRow, PaymentRow, PeriodRow, PolicyRow, ReconciliationRow, ReserveRow, StayRow, TaxAdjustmentRow, TaxCodeRow, TaxEstimateRow,
  TaxNoticeRow, TaxPaymentRow, TaxPeriodRow, TaxRateRowDb, TransactionQuery, TransactionRow, TurnoverCostRow,
} from '@/lib/finance/rows';
import type { TaxRateRow } from '@/lib/finance/tax/rates';
import { resolveRate } from '@/lib/finance/tax/rates';

function describe(cause: unknown): string {
  if (cause instanceof AdminUnconfiguredError) return 'The finance backend is not configured on this deployment.';
  if (cause && typeof cause === 'object' && 'code' in cause && typeof (cause as { code: unknown }).code === 'string') {
    const code = (cause as { code: string }).code;
    if (code === '42P01') return 'A finance table is missing. The finance migration (20260922) has not been applied to this database.';
    if (code === '42501') return 'The database refused the read. The service role is not configured correctly.';
    return `The database could not answer (code ${code}).`;
  }
  if (cause instanceof Error && /fetch|network|ECONN|timeout/i.test(cause.message)) return 'The database could not be reached.';
  return 'The data could not be loaded.';
}

async function guard<T>(fn: () => Promise<T>): Promise<QueryResult<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    // eslint-disable-next-line no-console -- server-side diagnostics only; the operator sees `describe()`.
    console.error(JSON.stringify({ scope: 'finance', event: 'query.error', level: 'error', cause: errorMessage(cause) }));
    return failed(describe(cause));
  }
}

export type UnitLookup = Array<{ id: string; slug: string; display_name: string; is_bookable: boolean }>;
export function unitNamer(units: UnitLookup): (id: string | null | undefined) => string {
  const m = new Map(units.map((u) => [u.id, u.display_name]));
  return (id) => (id ? m.get(id) ?? 'Unknown unit' : 'Not allocated');
}

function toRateRows(rows: TaxRateRowDb[]): TaxRateRow[] {
  return rows.map((r) => ({ taxType: r.tax_type as TaxRateRow['taxType'], jurisdiction: r.jurisdiction, rateBp: r.rate_bp, effectiveFrom: r.effective_from, effectiveTo: r.effective_to, legalReference: r.legal_reference ?? '', sourceUrl: r.source_url, reviewRequired: r.review_required, note: r.note }));
}

/* ── Shared building blocks ─────────────────────────────────────────── */

export interface TaxLiabilitySummary {
  liabilities: TaxLiabilityInput[];
  governing: Array<{ period: TaxPeriodRow; stage: TaxEstimateRow | null; paidCents: number }>;
}

function taxLiabilities(periods: TaxPeriodRow[], estimates: TaxEstimateRow[], payments: TaxPaymentRow[]): TaxLiabilitySummary {
  const governing = periods.map((p) => {
    const mine = estimates.filter((e) => e.tax_period_id === p.id).map((e) => ({ ...e, computedAt: e.computed_at, stage: e.stage as TaxStage }));
    const g = governingStage(mine);
    const paid = payments.filter((x) => x.tax_type === p.tax_type && x.period_key === p.period_key && x.kind !== 'refund').reduce((s, x) => s + x.amount_cents, 0);
    return { period: p, stage: g ? (estimates.find((e) => e.id === g.id) ?? null) : null, paidCents: paid };
  });
  const liabilities: TaxLiabilityInput[] = governing.filter((g) => g.stage).map((g) => ({ taxType: g.period.tax_type as TaxLiabilityInput['taxType'], periodKey: g.period.period_key, amountCents: g.stage!.amount_cents, stage: g.stage!.stage as TaxStage, paidCents: g.paidCents, periodStatus: g.period.status }));
  return { liabilities, governing };
}

function heldReserve(reserves: ReserveRow[], kind: 'tax' | 'other'): number {
  const latestByLabel = new Map<string, ReserveRow>();
  for (const r of [...reserves].sort((a, b) => a.created_at.localeCompare(b.created_at))) if ((kind === 'tax') === (r.kind === 'tax')) latestByLabel.set(`${r.kind}:${r.label}`, r);
  return Array.from(latestByLabel.values()).reduce((s, r) => s + r.amount_cents, 0);
}

function officialDeadlines(notices: TaxNoticeRow[], periods: TaxPeriodRow[]) {
  const out: Parameters<typeof mergeDeadlines>[1] = [];
  for (const n of notices) for (const d of n.dues) if (d.paid_cents < d.amount_cents) out.push({ taxType: n.tax_type as Deadline['taxType'], periodKey: n.period_key, dueOn: d.due_on, label: `${n.tax_type.toUpperCase()} ${n.period_key} · ${d.label ?? n.notice_type} (notice)`, amountCents: d.amount_cents - d.paid_cents, kind: 'notice', href: '/admin/finance/taxes#notices' });
  for (const p of periods) if (p.official_due_on && !['paid', 'closed'].includes(p.status)) out.push({ taxType: p.tax_type as Deadline['taxType'], periodKey: p.period_key, dueOn: p.official_due_on, label: `${p.tax_type.toUpperCase()} ${p.period_key} (official date)`, kind: p.tax_type === 'vat' ? 'vat_advance_return' : 'notice' });
  return out;
}

/* ── Overview ───────────────────────────────────────────────────────── */

export interface Figure { cents: number | null; provenance: 'actual' | 'calculated' | 'estimated' | 'committed' | 'unknown'; note?: string; href?: string }

export interface FinanceOverview {
  today: IsoDate;
  mode: 'supabase' | 'fixture' | 'preview' | 'unconfigured';
  inbox: InboxItem[];
  inboxCounts: Record<'critical' | 'high' | 'elevated' | 'watch', number>;
  revenueMtd: Figure; revenueYtd: Figure; expensesMtd: Figure; expensesYtd: Figure; operatingMtd: Figure; operatingYtd: Figure;
  committedRevenueNext30: Figure;
  taxReserve: ReserveReport;
  freeCash: FreeCashReport;
  cash: Figure;
  receivables: Figure;
  liabilities: Figure;
  documents: { total: number; complete: number; missing: number };
  nextDeadlines: Array<Deadline & { urgency: ReturnType<typeof urgencyOf>; daysLeft: number }>;
  trend: PlReport['byMonth'];
  units: UnitLookup;
  config: FinanceConfigSnapshot;
  signals: Array<{ signal: string; observed_at: string; detail: string | null }>;
  exceptionCounts: ExceptionCountsRow;
}

export async function loadFinanceOverview(today: IsoDate = berlinToday()): Promise<QueryResult<FinanceOverview>> {
  return guard(async () => {
    const source = await financeRowSource();
    const posture = adminPosture();
    const mtdRange = mtd(today);
    const ytdRange = ytd(today);
    const trendFrom = `${monthKey(addDays(today, -365))}-01`;
    const [linesYtd, plTrend, periods, estimates, taxPayments, reserves, accounts, cashAll, openExpenses, openRevenue, counts, notices, policy, units, signals, imports, unmatched, pending, movements, staysAhead] = await Promise.all([
      source.linesByFilter({ from: ytdRange.from, to: ytdRange.to }),
      source.plMonthly(trendFrom, addDays(today, 1)),
      source.taxPeriods(), source.taxEstimates(), source.taxPayments(), source.reserves(), source.accounts(),
      source.cashMonthly('2000-01-01', addDays(today, 1)),
      source.transactions({ page: 1, pageSize: 500, status: 'posted', paymentState: 'unpaid', to: addDays(today, 1) }),
      source.transactions({ page: 1, pageSize: 500, status: 'posted', kind: 'revenue', reconciliationState: 'unmatched', to: addDays(today, 1) }),
      source.exceptionCounts(), source.taxNotices(), source.policy(), source.units(), source.ingestionSignals(), source.importBatches(20), source.unmatchedPayments(200), source.reconciliations({}), source.minibarMovements(200),
      source.stays(today, addDays(today, 31)),
    ]);
    const config = financeConfig(policy, today);
    const sumRange = (range: DateRange, kind: 'revenue' | 'expense') => linesYtd.filter((l) => l.transaction.booked_on >= range.from && l.transaction.booked_on < range.to).filter((l) => (kind === 'revenue' ? ['revenue', 'refund', 'credit_note'].includes(l.transaction.kind) : ['expense', 'commission', 'fee', 'cogs'].includes(l.transaction.kind)) && !['vat_settlement', 'asset_acquisition', 'taxes_non_operating'].includes(l.category)).reduce((s, l) => s + l.net_cents, 0);
    const revM = sumRange(mtdRange, 'revenue'), revY = sumRange(ytdRange, 'revenue'), expM = sumRange(mtdRange, 'expense'), expY = sumRange(ytdRange, 'expense');
    const tl = taxLiabilities(periods, estimates, taxPayments);
    const reserve = computeReserve(tl.liabilities, heldReserve(reserves, 'tax'));
    const paymentsNet = cashAll.reduce((s, r) => s + Number(r.net_cents), 0);
    const cash = cashNow(accounts, paymentsNet, accounts.some((a) => a.opening_balance_on !== null));
    const liabilitiesCents = openExpenses.rows.filter((t) => ['expense', 'commission', 'fee'].includes(t.kind)).reduce((s, t) => s + Math.abs(t.gross_cents), 0);
    const receivablesCents = openRevenue.rows.reduce((s, t) => s + t.gross_cents, 0);
    const freeCash = computeFreeCash({ cashCents: cash, taxReserveRequiredCents: reserve.requiredCents, openLiabilitiesCents: liabilitiesCents, otherReservesCents: heldReserve(reserves, 'other') });
    const calendar = calendarPolicyFrom(policy, today);
    const deadlines = mergeDeadlines([...calculatedDeadlines(yearOf(today), calendar), ...calculatedDeadlines(yearOf(today) + 1, calendar)], officialDeadlines(notices, periods)).filter((d) => d.dueOn >= addDays(today, -30));
    const inbox = deriveInbox({ today, transactions: [...openExpenses.rows, ...openRevenue.rows, ...linesYtd.map((l) => l.transaction)].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i), lines: linesYtd, payments: unmatched, pendingMatches: pending, notices, deadlines, reserve, imports, minibarMovements: movements });
    const inboxCounts = { critical: 0, high: 0, elevated: 0, watch: 0 };
    for (const i of inbox) inboxCounts[i.level] += 1;
    const committed = staysAhead.filter((s) => s.check_out > today && s.check_out <= addDays(today, 30)).reduce((s, st) => s + (st.quoted_total_cents ?? 0), 0);
    const allExp = linesYtd.filter((l) => ['expense', 'commission', 'fee'].includes(l.transaction.kind)).map((l) => l.transaction).filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    const trend = buildPl(plTrend, trendFrom, addDays(today, 1), null).byMonth;
    return {
      today, mode: posture.mode, inbox, inboxCounts,
      revenueMtd: { cents: revM, provenance: 'actual', href: `/admin/finance/revenue?from=${mtdRange.from}&to=${mtdRange.to}` }, revenueYtd: { cents: revY, provenance: 'actual', href: `/admin/finance/revenue?from=${ytdRange.from}&to=${ytdRange.to}` },
      expensesMtd: { cents: expM, provenance: 'actual', href: `/admin/finance/expenses?from=${mtdRange.from}&to=${mtdRange.to}` }, expensesYtd: { cents: expY, provenance: 'actual', href: `/admin/finance/expenses?from=${ytdRange.from}&to=${ytdRange.to}` },
      operatingMtd: { cents: revM - expM, provenance: 'calculated', href: `/admin/finance/profit-loss?from=${mtdRange.from}&to=${mtdRange.to}` }, operatingYtd: { cents: revY - expY, provenance: 'calculated', href: `/admin/finance/profit-loss?from=${ytdRange.from}&to=${ytdRange.to}` },
      committedRevenueNext30: { cents: committed, provenance: 'committed', note: 'Confirmed stays ending in the next 30 days, gross', href: '/admin/finance/cash-flow' },
      taxReserve: reserve, freeCash, cash: { cents: cash, provenance: cash === null ? 'unknown' : 'calculated', note: cash === null ? 'No account opening balance recorded' : 'Opening balances + recorded movements', href: '/admin/finance/cash-flow' },
      receivables: { cents: receivablesCents, provenance: 'calculated', note: 'Revenue with no payment linked', href: '/admin/finance/transactions?kind=revenue&reconciliation=unmatched' },
      liabilities: { cents: liabilitiesCents, provenance: 'calculated', note: 'Unpaid supplier invoices and commissions', href: '/admin/finance/transactions?payment=unpaid' },
      documents: { total: allExp.length, complete: allExp.filter((t) => t.document_state === 'complete' || t.document_state === 'not_required').length, missing: allExp.filter((t) => t.document_state === 'missing').length },
      nextDeadlines: deadlines.filter((d) => d.dueOn >= today).slice(0, 5).map((d) => ({ ...d, urgency: urgencyOf(d, today), daysLeft: Math.round((Date.parse(`${d.dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) })),
      trend, units, config, signals, exceptionCounts: counts,
    };
  });
}

/* ── Inbox ──────────────────────────────────────────────────────────── */

export async function loadFinanceInbox(today: IsoDate = berlinToday()): Promise<QueryResult<{ items: InboxItem[]; proposals: MatchProposal[] }>> {
  return guard(async () => {
    const source = await financeRowSource();
    const from = `${yearOf(today) - 1}-01-01`;
    const [lines, open, unmatched, pending, notices, periods, estimates, taxPayments, reserves, policy, imports, movements] = await Promise.all([
      source.linesByFilter({ from, to: addDays(today, 400) }), source.openTransactionsForMatching(1000), source.unmatchedPayments(500), source.reconciliations({}), source.taxNotices(), source.taxPeriods(), source.taxEstimates(), source.taxPayments(), source.reserves(), source.policy(), source.importBatches(50), source.minibarMovements(300),
    ]);
    const tx = [...lines.map((l) => l.transaction), ...open].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    const reserve = computeReserve(taxLiabilities(periods, estimates, taxPayments).liabilities, heldReserve(reserves, 'tax'));
    const calendar = calendarPolicyFrom(policy, today);
    const deadlines = mergeDeadlines([...calculatedDeadlines(yearOf(today), calendar), ...calculatedDeadlines(yearOf(today) + 1, calendar)], officialDeadlines(notices, periods)).filter((d) => d.dueOn >= addDays(today, -60) && d.dueOn <= addDays(today, 60));
    const items = deriveInbox({ today, transactions: tx, lines, payments: unmatched, pendingMatches: pending, notices, deadlines, reserve, imports, minibarMovements: movements });
    const proposals = proposeMatches({ transactions: open, payments: unmatched }).filter((p) => !p.autoApply);
    return { items, proposals };
  });
}

/* ── Transactions ───────────────────────────────────────────────────── */

export interface TransactionList { rows: TransactionRow[]; total: number; units: UnitLookup; categories: CategoryRow[]; taxCodes: TaxCodeRow[]; counterparties: CounterpartyRow[]; sums: { grossCents: number; netCents: number; vatCents: number } }

export async function loadTransactions(query: TransactionQuery): Promise<QueryResult<TransactionList>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [page, units, categories, taxCodes, counterparties] = await Promise.all([source.transactions(query), source.units(), source.categories(), source.taxCodes(), source.counterparties()]);
    return { ...page, units, categories, taxCodes, counterparties, sums: { grossCents: page.rows.reduce((s, t) => s + t.gross_cents, 0), netCents: page.rows.reduce((s, t) => s + t.net_cents, 0), vatCents: page.rows.reduce((s, t) => s + t.vat_cents, 0) } };
  });
}

export interface TransactionDetail {
  transaction: TransactionRow; lines: LineRow[]; overrides: OverrideRow[]; reconciliations: ReconciliationRow[]; payments: PaymentRow[]; documents: DocumentRow[]; links: DocumentLinkRow[];
  related: TransactionRow[]; units: UnitLookup; categories: CategoryRow[]; taxCodes: TaxCodeRow[]; period: PeriodRow | null; counterparty: CounterpartyRow | null; turnoverCosts: TurnoverCostRow[]; invoices: InvoiceRow[];
}

export async function loadTransaction(id: string): Promise<QueryResult<TransactionDetail | null>> {
  return guard(async () => {
    const source = await financeRowSource();
    const transaction = await source.transaction(id);
    if (!transaction) return null;
    const [lines, recs, links, units, categories, taxCodes, periods, counterparties] = await Promise.all([
      source.lines([id]), source.reconciliations({ transactionIds: [id] }), source.documentLinks({ targets: [{ type: 'transaction', id }] }), source.units(), source.categories(), source.taxCodes(), source.periods(), source.counterparties(),
    ]);
    const [overrides, payments, documents, related, turnoverCosts, invoices] = await Promise.all([
      source.overrides([id, ...lines.map((l) => l.id)]),
      Promise.all(recs.filter((r) => r.payment_id).map((r) => source.payment(r.payment_id!))).then((ps) => ps.filter((p): p is PaymentRow => Boolean(p))),
      Promise.all(links.map((l) => source.document(l.document_id))).then((ds) => ds.filter((d): d is DocumentRow => Boolean(d))),
      transaction.booking_intent_id ? source.transactionsByBooking(transaction.booking_intent_id) : Promise.resolve([] as TransactionRow[]),
      transaction.booking_intent_id ? source.turnoverCosts({}).then((r) => r.filter((t) => t.booking_intent_id === transaction.booking_intent_id || lines.some((l) => l.id === t.actual_line_id))) : source.turnoverCosts({}).then((r) => r.filter((t) => lines.some((l) => l.id === t.actual_line_id))),
      transaction.booking_intent_id ? source.invoicesByBooking(transaction.booking_intent_id) : Promise.resolve([] as InvoiceRow[]),
    ]);
    const extra = [transaction.correction_of, transaction.reversed_by].filter((x): x is string => Boolean(x));
    const extraRows = (await Promise.all(extra.map((x) => source.transaction(x)))).filter((t): t is TransactionRow => Boolean(t));
    return {
      transaction, lines, overrides, reconciliations: recs, payments, documents, links, related: [...related.filter((r) => r.id !== id), ...extraRows.filter((r) => !related.some((x) => x.id === r.id))], units, categories, taxCodes,
      period: periods.find((p) => p.period_key === monthKey(transaction.booked_on)) ?? null, counterparty: counterparties.find((c) => c.id === transaction.counterparty_id) ?? null, turnoverCosts, invoices,
    };
  });
}

/* ── Revenue / expenses ─────────────────────────────────────────────── */

export interface RevenueReport {
  range: DateRange; lines: Array<LineRow & { transaction: TransactionRow }>; byCategory: Array<{ category: string; netCents: number; vatCents: number; grossCents: number; count: number }>;
  byChannel: ChannelEconomics[]; byUnit: Array<{ unitId: string | null; name: string; netCents: number; nights: number; adrCents: number | null }>; stays: StayRow[]; units: UnitLookup;
  totals: { netCents: number; vatCents: number; grossCents: number; refundsCents: number; commissionCents: number };
  minibar: { netCents: number; cogsCents: number; units: number };
}

export async function loadRevenue(range: DateRange): Promise<QueryResult<RevenueReport>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [lines, stays, units] = await Promise.all([source.linesByFilter({ from: range.from, to: range.to }), source.stays(range.from, range.to), source.units()]);
    const rev = lines.filter((l) => ['revenue', 'refund', 'credit_note'].includes(l.transaction.kind));
    const cat = new Map<string, { netCents: number; vatCents: number; grossCents: number; count: number }>();
    for (const l of rev) {
      const c = cat.get(l.category) ?? { netCents: 0, vatCents: 0, grossCents: 0, count: 0 };
      c.netCents += l.net_cents; c.vatCents += l.vat_cents; c.grossCents += l.gross_cents; c.count += 1;
      cat.set(l.category, c);
    }
    const name = unitNamer(units);
    const byUnit: Array<{ unitId: string | null; name: string; netCents: number; nights: number; adrCents: number | null }> = units.map((u) => {
      const mine = rev.filter((l) => (l.unit_id ?? l.transaction.unit_id) === u.id);
      const nights = stays.filter((s) => s.unit_id === u.id).reduce((s, st) => s + Math.max(0, Math.round((Date.parse(`${st.check_out < range.to ? st.check_out : range.to}T00:00:00Z`) - Date.parse(`${st.check_in > range.from ? st.check_in : range.from}T00:00:00Z`)) / 86_400_000)), 0);
      const acc = mine.filter((l) => l.category === 'accommodation_revenue').reduce((s, l) => s + l.net_cents, 0);
      return { unitId: u.id, name: u.display_name, netCents: mine.reduce((s, l) => s + l.net_cents, 0), nights, adrCents: nights > 0 ? Math.round(acc / nights) : null };
    }).filter((u) => u.netCents !== 0 || u.nights > 0);
    const unalloc = rev.filter((l) => !(l.unit_id ?? l.transaction.unit_id));
    if (unalloc.length > 0) byUnit.push({ unitId: null, name: name(null), netCents: unalloc.reduce((s, l) => s + l.net_cents, 0), nights: 0, adrCents: null });
    const minibarNet = rev.filter((l) => l.category === 'minibar_sales').reduce((s, l) => s + l.net_cents, 0);
    return {
      range, lines: rev, byCategory: Array.from(cat.entries()).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.netCents - a.netCents), byChannel: buildChannelEconomics(lines, stays, range), byUnit, stays, units,
      totals: { netCents: rev.reduce((s, l) => s + l.net_cents, 0), vatCents: rev.reduce((s, l) => s + l.vat_cents, 0), grossCents: rev.reduce((s, l) => s + l.gross_cents, 0), refundsCents: rev.filter((l) => l.transaction.kind !== 'revenue' || l.net_cents < 0).reduce((s, l) => s - l.net_cents, 0), commissionCents: lines.filter((l) => l.category === 'ota_commission').reduce((s, l) => s + l.net_cents, 0) },
      minibar: { netCents: minibarNet, cogsCents: -lines.filter((l) => l.category === 'minibar_cogs').reduce((s, l) => s + l.net_cents, 0), units: rev.filter((l) => l.category === 'minibar_sales').reduce((s, l) => s + (l.quantity ?? 0), 0) },
    };
  });
}

export interface ExpenseReport {
  range: DateRange; lines: Array<LineRow & { transaction: TransactionRow }>; byCategory: Array<{ category: string; netCents: number; vatCents: number; deductibleVatCents: number; count: number; missingDocs: number }>;
  bySupplier: Array<{ label: string; counterpartyId: string | null; netCents: number; count: number }>; units: UnitLookup; counterparties: CounterpartyRow[]; categories: CategoryRow[]; taxCodes: TaxCodeRow[];
  totals: { netCents: number; vatCents: number; grossCents: number; deductibleVatCents: number; unpaidCents: number; missingDocs: number; needsReview: number };
  cleaning: { netCents: number; stays: number; perStayCents: number | null; expected: TurnoverCostRow[] };
}

export async function loadExpenses(range: DateRange): Promise<QueryResult<ExpenseReport>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [lines, units, counterparties, categories, taxCodes, turnoverCosts, stays] = await Promise.all([source.linesByFilter({ from: range.from, to: range.to }), source.units(), source.counterparties(), source.categories(), source.taxCodes(), source.turnoverCosts({ from: range.from, to: range.to }), source.stays(range.from, range.to)]);
    const exp = lines.filter((l) => ['expense', 'commission', 'fee', 'cogs'].includes(l.transaction.kind) && l.category !== 'minibar_cogs');
    const byCat = new Map<string, { netCents: number; vatCents: number; deductibleVatCents: number; count: number; missingDocs: number }>();
    const bySup = new Map<string, { label: string; counterpartyId: string | null; netCents: number; count: number }>();
    for (const l of exp) {
      const c = byCat.get(l.category) ?? { netCents: 0, vatCents: 0, deductibleVatCents: 0, count: 0, missingDocs: 0 };
      c.netCents += l.net_cents; c.vatCents += l.vat_cents; c.deductibleVatCents += ['deductible', 'partially_deductible'].includes(l.input_vat_treatment) ? Math.round((l.vat_cents * l.deductible_bp) / 10000) : 0; c.count += 1; if (l.transaction.document_state === 'missing') c.missingDocs += 1;
      byCat.set(l.category, c);
      const key = l.transaction.counterparty_id ?? l.transaction.counterparty_label ?? 'unknown';
      const s = bySup.get(key) ?? { label: l.transaction.counterparty_label ?? 'Unknown', counterpartyId: l.transaction.counterparty_id, netCents: 0, count: 0 };
      s.netCents += l.net_cents; s.count += 1;
      bySup.set(key, s);
    }
    const txs = exp.map((l) => l.transaction).filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    const cleaningNet = exp.filter((l) => l.category === 'cleaning').reduce((s, l) => s + l.net_cents, 0);
    const stayCount = stays.filter((s) => s.check_out > range.from && s.check_out <= range.to).length;
    return {
      range, lines: exp, byCategory: Array.from(byCat.entries()).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.netCents - a.netCents), bySupplier: Array.from(bySup.values()).sort((a, b) => b.netCents - a.netCents), units, counterparties, categories, taxCodes,
      totals: { netCents: exp.reduce((s, l) => s + l.net_cents, 0), vatCents: exp.reduce((s, l) => s + l.vat_cents, 0), grossCents: exp.reduce((s, l) => s + l.gross_cents, 0), deductibleVatCents: Array.from(byCat.values()).reduce((s, c) => s + c.deductibleVatCents, 0), unpaidCents: txs.filter((t) => ['unpaid', 'partially_paid'].includes(t.payment_state)).reduce((s, t) => s + Math.abs(t.gross_cents), 0), missingDocs: txs.filter((t) => t.document_state === 'missing').length, needsReview: exp.filter((l) => ['needs_review', 'suggested'].includes(l.classification)).length },
      cleaning: { netCents: cleaningNet, stays: stayCount, perStayCents: stayCount > 0 ? Math.round(cleaningNet / stayCount) : null, expected: turnoverCosts },
    };
  });
}

/* ── Documents ──────────────────────────────────────────────────────── */

export async function loadDocuments(query: { type?: string | null; reviewState?: string | null; search?: string | null; page: number; pageSize: number }): Promise<QueryResult<{ rows: DocumentRow[]; total: number; links: DocumentLinkRow[]; counterparties: CounterpartyRow[]; config: FinanceConfigSnapshot; missing: TransactionRow[] }>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [page, counterparties, policy, missing] = await Promise.all([source.documents(query), source.counterparties(), source.policy(), source.transactions({ page: 1, pageSize: 100, status: 'posted', documentState: 'missing' })]);
    const links = await source.documentLinks({ documentIds: page.rows.map((d) => d.id) });
    return { ...page, links, counterparties, config: financeConfig(policy), missing: missing.rows };
  });
}

/* ── VAT ────────────────────────────────────────────────────────────── */

export interface VatScreen {
  periodKey: string; label: string; position: VatPosition; keys: string[]; taxPeriod: TaxPeriodRow | null; stages: TaxEstimateRow[]; adjustments: TaxAdjustmentRow[]; deadline: Deadline | null; calendar: ReturnType<typeof calendarPolicyFrom>; reviewLines: Array<LineRow & { transaction: TransactionRow }>; rcLines: Array<LineRow & { transaction: TransactionRow }>;
}

export async function loadVat(periodKey: string | null, today: IsoDate = berlinToday()): Promise<QueryResult<VatScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [policy, taxPeriods, adjustments] = await Promise.all([source.policy(), source.taxPeriods(), source.taxAdjustments()]);
    const calendar = calendarPolicyFrom(policy, today);
    const key = periodKey ?? vatPeriodKeyFor(today, calendar);
    const range = periodRange(key);
    const [rows, estimates, lines] = await Promise.all([source.vatMonthly(range.from, range.to), source.taxEstimates(taxPeriods.filter((p) => p.tax_type === 'vat').map((p) => p.id)), source.linesByFilter({ from: range.from, to: range.to })]);
    const adj = adjustments.filter((a) => a.tax_type === 'vat' && a.superseded_by === null && a.fiscal_year === yearOf(range.from)).reduce((s, a) => s + a.amount_cents, 0);
    const position = computeVatPosition(key, rows, adj);
    const taxPeriod = taxPeriods.find((p) => p.tax_type === 'vat' && p.period_key === key) ?? null;
    const keys = vatPeriodKeysBetween(`${yearOf(today) - 1}-01-01`, addDays(today, 1), calendar).reverse();
    const deadline = calculatedDeadlines(yearOf(range.from), calendar).find((d) => d.kind === 'vat_advance_return' && d.periodKey === key) ?? null;
    return {
      periodKey: key, label: periodLabel(key), position, keys, taxPeriod, stages: taxPeriod ? estimates.filter((e) => e.tax_period_id === taxPeriod.id).sort((a, b) => a.computed_at.localeCompare(b.computed_at)) : [], adjustments: adjustments.filter((a) => a.tax_type === 'vat'), deadline, calendar,
      reviewLines: lines.filter((l) => ['needs_review', 'suggested'].includes(l.classification) || l.tax_code.includes('REVIEW') || ['review_required', 'unknown'].includes(l.input_vat_treatment)), rcLines: lines.filter((l) => l.tax_code === 'DE_REVERSE_CHARGE'),
    };
  });
}

/* ── Taxes ──────────────────────────────────────────────────────────── */

export interface TaxesScreen {
  year: number; estimate: CompanyTaxEstimate; pl: PlReport; periods: TaxPeriodRow[]; governing: TaxLiabilitySummary['governing']; reserve: ReserveReport; freeCash: FreeCashReport; reserves: ReserveRow[];
  notices: TaxNoticeRow[]; payments: TaxPaymentRow[]; adjustments: TaxAdjustmentRow[]; rates: TaxRateRowDb[]; deadlines: Array<Deadline & { urgency: ReturnType<typeof urgencyOf> }>; calendar: ReturnType<typeof calendarPolicyFrom>; policy: PolicyRow[];
  hebesatz: ReturnType<typeof resolveRate>; variance: Array<{ taxType: string; periodKey: string; estimateCents: number | null; officialCents: number | null; varianceCents: number | null }>;
}

export async function loadTaxes(year: number, today: IsoDate = berlinToday()): Promise<QueryResult<TaxesScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const yr = yearRange(year);
    const [pl, periods, estimates, taxPayments, reserves, notices, adjustments, rates, policy, accounts, cashAll, openExp] = await Promise.all([
      source.plMonthly(yr.from, yr.to), source.taxPeriods(), source.taxEstimates(), source.taxPayments(), source.reserves(), source.taxNotices(), source.taxAdjustments(), source.taxRates(), source.policy(), source.accounts(), source.cashMonthly('2000-01-01', addDays(today, 1)),
      source.transactions({ page: 1, pageSize: 500, status: 'posted', paymentState: 'unpaid' }),
    ]);
    const plReport = buildPl(pl, yr.from, yr.to, null);
    const adj: TaxAdjustment[] = adjustments.filter((a) => a.superseded_by === null && a.tax_type !== 'vat').map((a) => ({ taxType: a.tax_type as 'kst' | 'gewst', fiscalYear: a.fiscal_year, kind: a.kind as TaxAdjustment['kind'], amountCents: a.amount_cents, reason: a.reason }));
    const paid = (type: string) => taxPayments.filter((p) => p.tax_type === type && p.period_key === String(year) && p.kind === 'advance').reduce((s, p) => s + p.amount_cents, 0);
    const estimate = estimateCompanyTaxes({ fiscalYear: year, resultBeforeTaxCents: plReport.resultBeforeTaxCents, adjustments: adj, rateRows: toRateRows(rates), managementTaxesExcluded: true, advancePaymentsCents: { kst: paid('kst'), soli: paid('soli'), gewst: paid('gewst') } });
    const tl = taxLiabilities(periods, estimates, taxPayments);
    // The current year's company taxes may not have a recorded estimate row yet; include the live estimate for the reserve.
    for (const which of ['kst', 'soli', 'gewst'] as const) {
      if (!tl.liabilities.some((l) => l.taxType === which && l.periodKey === String(year))) tl.liabilities.push({ taxType: which, periodKey: String(year), amountCents: estimate[which].estimateCents, stage: 'system_estimate', paidCents: paid(which), periodStatus: 'estimated' });
    }
    const reserve = computeReserve(tl.liabilities, heldReserve(reserves, 'tax'));
    const cash = cashNow(accounts, cashAll.reduce((s, r) => s + Number(r.net_cents), 0), accounts.some((a) => a.opening_balance_on !== null));
    const freeCash = computeFreeCash({ cashCents: cash, taxReserveRequiredCents: reserve.requiredCents, openLiabilitiesCents: openExp.rows.filter((t) => ['expense', 'commission', 'fee'].includes(t.kind)).reduce((s, t) => s + Math.abs(t.gross_cents), 0), otherReservesCents: heldReserve(reserves, 'other') });
    const calendar = calendarPolicyFrom(policy, today);
    const deadlines = mergeDeadlines([...calculatedDeadlines(year, calendar), ...calculatedDeadlines(year + 1, calendar)], officialDeadlines(notices, periods)).filter((d) => d.dueOn >= addDays(today, -60)).map((d) => ({ ...d, urgency: urgencyOf(d, today) }));
    const variance = notices.filter((n) => n.assessed_cents !== null || n.advance_payment_cents !== null).map((n) => {
      const est = tl.governing.find((g) => g.period.tax_type === n.tax_type && g.period.period_key === n.period_key && g.stage?.stage === 'system_estimate')?.stage?.amount_cents ?? (n.tax_type !== 'vat' && n.period_key === String(year) ? estimate[n.tax_type as 'kst' | 'soli' | 'gewst']?.estimateCents ?? null : null);
      const official = n.assessed_cents ?? n.advance_payment_cents;
      return { taxType: n.tax_type, periodKey: n.period_key, estimateCents: est ?? null, officialCents: official, varianceCents: est !== null && est !== undefined && official !== null ? official - est : null };
    });
    return { year, estimate, pl: plReport, periods, governing: tl.governing, reserve, freeCash, reserves, notices, payments: taxPayments, adjustments, rates, deadlines, calendar, policy, hebesatz: resolveRate('gewst_hebesatz', `${year}-12-31`, toRateRows(rates)), variance };
  });
}

/* ── P&L, cash flow, properties ─────────────────────────────────────── */

export async function loadPl(range: DateRange, filter: { unitId?: string | null; channel?: string | null } = {}): Promise<QueryResult<{ pl: PlReport; units: UnitLookup; estimate: CompanyTaxEstimate | null }>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [rows, units, adjustments, rates, taxPayments] = await Promise.all([source.plMonthly(range.from, range.to), source.units(), source.taxAdjustments(), source.taxRates(), source.taxPayments()]);
    const base = buildPl(rows, range.from, range.to, null, filter);
    // Estimated taxes are shown only for a full fiscal year without a unit/channel filter: a partial-year tax figure would be a fiction.
    const wholeYear = /^\d{4}-01-01$/.test(range.from) && range.to === `${yearOf(range.from) + 1}-01-01` && !filter.unitId && !filter.channel;
    let estimate: CompanyTaxEstimate | null = null;
    if (wholeYear) {
      const year = yearOf(range.from);
      const adj: TaxAdjustment[] = adjustments.filter((a) => a.superseded_by === null && a.tax_type !== 'vat').map((a) => ({ taxType: a.tax_type as 'kst' | 'gewst', fiscalYear: a.fiscal_year, kind: a.kind as TaxAdjustment['kind'], amountCents: a.amount_cents, reason: a.reason }));
      const paid = (type: string) => taxPayments.filter((p) => p.tax_type === type && p.period_key === String(year) && p.kind === 'advance').reduce((s, p) => s + p.amount_cents, 0);
      estimate = estimateCompanyTaxes({ fiscalYear: year, resultBeforeTaxCents: base.resultBeforeTaxCents, adjustments: adj, rateRows: toRateRows(rates), managementTaxesExcluded: true, advancePaymentsCents: { kst: paid('kst'), soli: paid('soli'), gewst: paid('gewst') } });
    }
    return { pl: estimate ? buildPl(rows, range.from, range.to, estimate.totalEstimateCents, filter) : base, units, estimate };
  });
}

export interface CashFlowScreen { months: CashMonth[]; openingKnown: boolean; projection: CashProjection; accounts: AccountRow[]; recent: PaymentRow[] }

export async function loadCashFlow(monthsBack = 6, today: IsoDate = berlinToday()): Promise<QueryResult<CashFlowScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const from = `${monthKey(addDays(today, -30 * monthsBack))}-01`;
    const keys = monthKeysBetween(from, addDays(today, 1));
    const [cashAll, accounts, stays, open, notices, periods, policy, recent] = await Promise.all([
      source.cashMonthly('2000-01-01', addDays(today, 1)), source.accounts(), source.stays(today, addDays(today, 91)), source.transactions({ page: 1, pageSize: 500, status: 'posted', paymentState: 'unpaid' }), source.taxNotices(), source.taxPeriods(), source.policy(), source.payments({ page: 1, pageSize: 40 }),
    ]);
    const built = buildCashFlow(cashAll, accounts, keys);
    const paidNet = cashAll.reduce((s, r) => s + Number(r.net_cents), 0);
    const cash = cashNow(accounts, paidNet, accounts.some((a) => a.opening_balance_on !== null));
    const calendar = calendarPolicyFrom(policy, today);
    const deadlines = mergeDeadlines([...calculatedDeadlines(yearOf(today), calendar), ...calculatedDeadlines(yearOf(today) + 1, calendar)], officialDeadlines(notices, periods));
    const paidIds = new Set(stays.filter((s) => s.paid_amount_cents && s.paid_amount_cents > 0).map((s) => s.intent_id));
    return { months: built.months, openingKnown: built.openingKnown, projection: projectCash({ today, cashNowCents: cash, stays, paidStayIntentIds: paidIds, openLiabilities: open.rows, deadlines }), accounts, recent: recent.rows };
  });
}

export async function loadProperties(range: DateRange): Promise<QueryResult<{ report: ProfitabilityReport; channels: ChannelEconomics[]; units: UnitLookup }>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [units, unitRows, lines, stays] = await Promise.all([source.units(), source.unitMonthly(range.from, range.to), source.linesByFilter({ from: range.from, to: range.to }), source.stays(range.from, range.to)]);
    return { report: buildProfitability({ range, units, unitRows, lines, stays }), channels: buildChannelEconomics(lines, stays, range), units };
  });
}

/* ── Reconciliation ─────────────────────────────────────────────────── */

export interface ReconciliationScreen { open: TransactionRow[]; payments: PaymentRow[]; proposals: MatchProposal[]; pending: ReconciliationRow[]; counts: ExceptionCountsRow; units: UnitLookup; recentMatches: ReconciliationRow[] }

export async function loadReconciliation(): Promise<QueryResult<ReconciliationScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [open, payments, pending, counts, units] = await Promise.all([source.openTransactionsForMatching(300), source.unmatchedPayments(300), source.reconciliations({}), source.exceptionCounts(), source.units()]);
    const proposals = proposeMatches({ transactions: open, payments });
    const recent = await source.reconciliations({ transactionIds: open.slice(0, 50).map((t) => t.id) });
    return { open, payments, proposals, pending, counts, units, recentMatches: recent };
  });
}

/* ── Accountant ─────────────────────────────────────────────────────── */

export interface PeriodReadiness {
  period: PeriodRow; transactions: number; documentsComplete: number; documentsMissing: number; unclassified: number; vatReview: number; reverseChargeReview: number; unreconciled: number; mismatches: number; assetCandidates: number; taxAdjustments: number;
  readiness: 'not_ready' | 'ready_for_review' | 'accountant_reviewed' | 'locked'; blockers: string[]; revenueNetCents: number; expenseNetCents: number;
}

export interface AccountantScreen { periods: PeriodReadiness[]; exports: ExportRow[]; datev: DatevGate; datevPreview: DatevRowProposal[]; eInvoice: ReturnType<typeof eInvoiceGate>; config: FinanceConfigSnapshot; categories: CategoryRow[] }

export async function loadAccountant(today: IsoDate = berlinToday()): Promise<QueryResult<AccountantScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const from = `${monthKey(addDays(today, -365))}-01`;
    const [periodRows, lines, exportsList, categories, policy] = await Promise.all([source.periods(), source.linesByFilter({ from, to: addDays(today, 1) }), source.exports(30), source.categories(), source.policy()]);
    const keys = monthKeysBetween(from, addDays(today, 1)).reverse();
    const periods: PeriodReadiness[] = keys.map((key) => {
      const period = periodRows.find((p) => p.period_key === key) ?? { period_key: key, starts_on: `${key}-01`, ends_on: periodRange(key).to, status: 'open', status_at: '', status_by: null, locked_at: null, locked_by: null, note: null };
      const mine = lines.filter((l) => monthKey(l.transaction.booked_on) === key && l.transaction.status === 'posted');
      const txs = mine.map((l) => l.transaction).filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
      const expTx = txs.filter((t) => ['expense', 'commission', 'fee'].includes(t.kind));
      const unclassified = mine.filter((l) => ['needs_review', 'suggested'].includes(l.classification)).length;
      const vatReview = mine.filter((l) => l.tax_code.includes('REVIEW') || ['review_required', 'unknown'].includes(l.input_vat_treatment)).length;
      const rc = mine.filter((l) => l.tax_code === 'DE_REVERSE_CHARGE' && !['reviewed', 'accountant_locked', 'auto_verified'].includes(l.classification)).length;
      const mismatches = txs.filter((t) => t.reconciliation_state === 'mismatch').length;
      const unreconciled = txs.filter((t) => ['unmatched', 'needs_review', 'partially_matched'].includes(t.reconciliation_state) && t.kind !== 'cogs' && t.booked_on <= today).length;
      const missing = expTx.filter((t) => t.document_state === 'missing').length;
      const blockers: string[] = [];
      if (unclassified > 0) blockers.push(`${unclassified} line${unclassified === 1 ? '' : 's'} unclassified`);
      if (mismatches > 0) blockers.push(`${mismatches} reconciliation mismatch${mismatches === 1 ? '' : 'es'}`);
      if (missing > 0) blockers.push(`${missing} document${missing === 1 ? '' : 's'} missing`);
      const readiness: PeriodReadiness['readiness'] = period.status === 'locked' ? 'locked' : period.status === 'accountant_reviewed' ? 'accountant_reviewed' : blockers.length === 0 && txs.length > 0 ? 'ready_for_review' : 'not_ready';
      return {
        period, transactions: txs.length, documentsComplete: expTx.filter((t) => t.document_state === 'complete' || t.document_state === 'not_required').length, documentsMissing: missing, unclassified, vatReview, reverseChargeReview: rc, unreconciled, mismatches,
        assetCandidates: mine.filter((l) => l.asset_state === 'candidate').length, taxAdjustments: 0, readiness, blockers,
        revenueNetCents: mine.filter((l) => ['revenue', 'refund', 'credit_note'].includes(l.transaction.kind)).reduce((s, l) => s + l.net_cents, 0), expenseNetCents: mine.filter((l) => ['expense', 'commission', 'fee'].includes(l.transaction.kind)).reduce((s, l) => s + l.net_cents, 0),
      };
    });
    const config = financeConfig(policy, today);
    const used = new Set(lines.map((l) => l.category));
    const skr = datevSkr();
    const datev = datevGate({ flagEnabled: config.datevExportEnabled, categories, usedCategories: used, skr });
    return { periods, exports: exportsList, datev, datevPreview: proposeDatevRows(lines.slice(0, 25), categories, skr ?? 'SKR03'), eInvoice: eInvoiceGate(config.eInvoiceGenerationEnabled, Boolean(process.env.FINANCE_EINVOICE_VALIDATOR_URL)), config, categories };
  });
}

/* ── Minibar ────────────────────────────────────────────────────────── */

export interface MinibarScreen { products: MinibarProductRow[]; stock: MinibarStockRow[]; movements: MinibarMovementRow[]; units: UnitLookup; taxCodes: TaxCodeRow[]; counterparties: CounterpartyRow[]; metrics: { revenueNetCents: number; cogsCents: number; contributionCents: number; margin: number | null; unitsSold: number; stockValueCents: number; shrinkageUnits: number; openCharges: number }; stays: StayRow[] }

export async function loadMinibar(range: DateRange, today: IsoDate = berlinToday()): Promise<QueryResult<MinibarScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [products, stock, movements, units, taxCodes, counterparties, lines, stays] = await Promise.all([source.minibarProducts(), source.minibarStock(), source.minibarMovements(200), source.units(), source.taxCodes(), source.counterparties(), source.linesByFilter({ from: range.from, to: range.to }), source.stays(addDays(today, -3), addDays(today, 3))]);
    const sales = lines.filter((l) => l.category === 'minibar_sales');
    const cogs = -lines.filter((l) => l.category === 'minibar_cogs').reduce((s, l) => s + l.net_cents, 0);
    const rev = sales.reduce((s, l) => s + l.net_cents, 0);
    return { products, stock, movements, units, taxCodes, counterparties, metrics: { revenueNetCents: rev, cogsCents: cogs, contributionCents: rev - cogs, margin: rev > 0 ? (rev - cogs) / rev : null, unitsSold: sales.reduce((s, l) => s + (l.quantity ?? 0), 0), stockValueCents: stock.reduce((s, p) => s + p.stock_value_cents, 0), shrinkageUnits: stock.reduce((s, p) => s + Math.abs(p.shrinkage_units), 0), openCharges: movements.filter((m) => ['unpaid', 'needs_review'].includes(m.charge_state)).length }, stays };
  });
}

/* ── Imports, invoices, settings, booking panel ─────────────────────── */

export async function loadImports(): Promise<QueryResult<{ batches: ImportBatchRow[] }>> {
  return guard(async () => ({ batches: await (await financeRowSource()).importBatches(50) }));
}

export async function loadImportBatch(id: string): Promise<QueryResult<{ batch: ImportBatchRow; rows: ImportRowRow[] } | null>> {
  return guard(async () => (await financeRowSource()).importBatch(id));
}

export interface InvoicesScreen { rows: InvoiceRow[]; total: number; config: FinanceConfigSnapshot; requirementsForDraft: (d: InvoiceDraft) => ReturnType<typeof invoiceRequirements>; eligibleStays: StayRow[] }

export async function loadInvoices(page = 1): Promise<QueryResult<{ rows: InvoiceRow[]; total: number; config: FinanceConfigSnapshot; eligibleStays: StayRow[] }>> {
  return guard(async () => {
    const source = await financeRowSource();
    const today = berlinToday();
    const [list, policy, stays] = await Promise.all([source.invoices({ page, pageSize: 50 }), source.policy(), source.stays(addDays(today, -60), addDays(today, 1))]);
    const invoiced = new Set(list.rows.map((i) => i.booking_intent_id));
    return { ...list, config: financeConfig(policy, today), eligibleStays: stays.filter((s) => s.check_out <= today && s.source === 'direct' && !invoiced.has(s.intent_id)) };
  });
}

export async function loadInvoice(id: string): Promise<QueryResult<{ invoice: InvoiceRow; lines: InvoiceLineRow[]; config: FinanceConfigSnapshot; requirements: ReturnType<typeof invoiceRequirements> } | null>> {
  return guard(async () => {
    const source = await financeRowSource();
    const found = await source.invoice(id);
    if (!found) return null;
    const config = financeConfig(await source.policy());
    const draft: InvoiceDraft = { kind: found.invoice.kind as 'invoice' | 'credit_note', recipient: { name: found.invoice.recipient_name, address: null, company: found.invoice.recipient_company, vatId: null, country: found.invoice.recipient_country }, bookingIntentId: found.invoice.booking_intent_id, bookingReference: found.invoice.booking_reference, unitId: found.invoice.unit_id, serviceFrom: found.invoice.service_from, serviceTo: found.invoice.service_to, currency: found.invoice.currency, lines: found.lines.map((l) => ({ lineNo: l.line_no, description: l.description, quantity: l.quantity, category: l.category, taxCode: l.tax_code, rateBp: l.rate_bp, netCents: l.net_cents, vatCents: l.vat_cents, grossCents: l.gross_cents })), netCents: found.invoice.net_cents, vatCents: found.invoice.vat_cents, grossCents: found.invoice.gross_cents };
    return { ...found, config, requirements: invoiceRequirements(draft, config) };
  });
}

export interface SettingsScreen { config: FinanceConfigSnapshot; policy: PolicyRow[]; rates: TaxRateRowDb[]; taxCodes: TaxCodeRow[]; categories: CategoryRow[]; counterparties: CounterpartyRow[]; accounts: AccountRow[]; assets: AssetRow[]; units: UnitLookup }

export async function loadFinanceSettings(): Promise<QueryResult<SettingsScreen>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [policy, rates, taxCodes, categories, counterparties, accounts, assets, units] = await Promise.all([source.policy(), source.taxRates(), source.taxCodes(), source.categories(), source.counterparties(), source.accounts(), source.assets(), source.units()]);
    return { config: financeConfig(policy), policy, rates, taxCodes, categories, counterparties, accounts, assets, units };
  });
}

export interface BookingFinancePanel { transactions: TransactionRow[]; payments: PaymentRow[]; invoices: InvoiceRow[]; movements: MinibarMovementRow[] }

export async function loadFinanceForBooking(intentId: string): Promise<QueryResult<BookingFinancePanel>> {
  return guard(async () => {
    const source = await financeRowSource();
    const [transactions, payments, invoices, movements] = await Promise.all([source.transactionsByBooking(intentId), source.paymentsByBooking(intentId), source.invoicesByBooking(intentId), source.minibarMovements(50).then((m) => m.filter((x) => x.booking_intent_id === intentId))]);
    return { transactions, payments, invoices, movements };
  });
}

/* ── Health section for /admin/system and the finance overview ──────── */

export interface FinanceHealth { status: 'healthy' | 'attention' | 'degraded' | 'not_instrumented' | 'unavailable'; summary: string; facts: Array<{ label: string; value: string; tone?: 'positive' | 'caution' | 'critical' | 'muted' }> }

export async function loadFinanceHealth(now: Date = new Date()): Promise<FinanceHealth> {
  try {
    const source = await financeRowSource();
    const [reachable, counts, signals] = await Promise.all([source.ping().catch(() => false), source.exceptionCounts().catch(() => null), source.ingestionSignals().catch(() => null)]);
    if (!reachable || !counts) return { status: 'unavailable', summary: 'The finance tables could not be read. The finance migration may not be applied.', facts: [] };
    const facts: FinanceHealth['facts'] = [];
    const age = (iso: string | null | undefined) => (iso ? Math.round((now.getTime() - Date.parse(iso)) / 60_000) : null);
    const sig = (name: string) => signals?.find((s) => s.signal === name) ?? null;
    const ingest = sig('booking_ingestion.success');
    const ingestFail = sig('booking_ingestion.failure');
    const a = age(ingest?.observed_at);
    facts.push({ label: 'last ingestion', value: a === null ? 'never observed' : `${a} min ago`, tone: a === null ? 'caution' : a > 24 * 60 ? 'critical' : 'positive' });
    if (ingestFail && (!ingest || ingestFail.observed_at > ingest.observed_at)) facts.push({ label: 'ingestion', value: 'last run failed', tone: 'critical' });
    const bcom = signals?.filter((s) => s.signal.startsWith('import.booking_com')).sort((x, y) => y.observed_at.localeCompare(x.observed_at))[0];
    const bank = signals?.filter((s) => s.signal.startsWith('import.bank')).sort((x, y) => y.observed_at.localeCompare(x.observed_at))[0];
    facts.push({ label: 'last Booking.com import', value: bcom ? `${Math.round((age(bcom.observed_at) ?? 0) / 1440)} d ago` : 'never', tone: bcom ? 'positive' : 'muted' });
    facts.push({ label: 'last bank import', value: bank ? `${Math.round((age(bank.observed_at) ?? 0) / 1440)} d ago` : 'never', tone: bank ? 'positive' : 'muted' });
    facts.push({ label: 'unreconciled', value: String(counts.unmatched_payments + counts.unreconciled_revenue), tone: counts.unmatched_payments + counts.unreconciled_revenue > 0 ? 'caution' : 'positive' });
    facts.push({ label: 'missing documents', value: String(counts.missing_documents), tone: counts.missing_documents > 0 ? 'caution' : 'positive' });
    facts.push({ label: 'tax review', value: String(counts.tax_code_review + counts.input_vat_review), tone: counts.tax_code_review + counts.input_vat_review > 0 ? 'caution' : 'positive' });
    facts.push({ label: 'failed imports', value: String(counts.failed_imports), tone: counts.failed_imports > 0 ? 'critical' : 'positive' });
    facts.push({ label: 'oldest open item', value: counts.oldest_open_item ? `${Math.round((age(counts.oldest_open_item) ?? 0) / 1440)} d` : '—', tone: 'muted' });
    const mismatches = counts.mismatches;
    const status: FinanceHealth['status'] = !ingest && !signals?.length ? 'not_instrumented' : mismatches > 0 || counts.failed_imports > 0 || (a !== null && a > 24 * 60) ? 'degraded' : counts.missing_documents + counts.tax_code_review + counts.unmatched_payments > 0 ? 'attention' : 'healthy';
    const summary = status === 'not_instrumented' ? 'No finance ingestion has ever run. Facts appear once the reconcile schedule (or a manual run) ingests bookings.' : status === 'degraded' ? `${mismatches} mismatch${mismatches === 1 ? '' : 'es'}, ${counts.failed_imports} failed import${counts.failed_imports === 1 ? '' : 's'}.` : status === 'attention' ? 'Exceptions wait in the Finance Inbox.' : 'Everything reconciled; no open exceptions.';
    return { status, summary, facts };
  } catch (cause) {
    return { status: cause instanceof AdminUnconfiguredError ? 'unavailable' : 'degraded', summary: describe(cause), facts: [] };
  }
}
