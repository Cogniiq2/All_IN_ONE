import 'server-only';

/**
 * Finance items for the GLOBAL attention area (the shell badge, the Today
 * page, the internal health endpoint). Deliberately light: a handful of
 * bounded reads, no ledger scan. Only critical and high items cross over —
 * the Finance Inbox carries the rest. Severity is not permission: every
 * item's next step is to open the record, never to execute anything.
 *
 * Fails soft: a missing finance migration or an unreachable table yields no
 * items and a `degraded` label, never an error on the operations screens.
 */

import type { AttentionItem } from '@/lib/admin/dto';
import { financeRowSource } from '@/lib/finance/source';
import { calendarPolicyFrom } from '@/lib/finance/config';
import { addDays, berlinToday, daysBetween, yearOf } from '@/lib/finance/periods';
import { calculatedDeadlines, mergeDeadlines } from '@/lib/finance/tax/calendar';
import { computeReserve, governingStage, type TaxLiabilityInput, type TaxStage } from '@/lib/finance/tax/reserve';
import { formatCents } from '@/lib/finance/money';

export interface FinanceAttention {
  items: AttentionItem[];
  /** Inputs for the alert derivation. Null when finance could not be read. */
  alerts: { mismatches: number; failedImports: number; overdueDeadlines: number; dueSoonDeadlines: number; reserveCoverage: number | null; reserveGapCents: number; unmatchedRefunds: number; missingDocumentsOverdue: number; lastIngestionAt: string | null } | null;
  degraded: boolean;
}

export async function loadFinanceAttention(now: Date = new Date()): Promise<FinanceAttention> {
  const today = berlinToday(now);
  try {
    const source = await financeRowSource();
    const [counts, mismatches, refunds, imports, notices, periods, estimates, taxPayments, reserves, policy, signals, oldDocs] = await Promise.all([
      source.exceptionCounts(),
      source.transactions({ page: 1, pageSize: 20, status: 'posted', reconciliationState: 'mismatch' }),
      source.transactions({ page: 1, pageSize: 20, status: 'posted', kind: 'refund', reconciliationState: 'unmatched' }),
      source.importBatches(10),
      source.taxNotices(),
      source.taxPeriods(), source.taxEstimates(), source.taxPayments(), source.reserves(), source.policy(), source.ingestionSignals(),
      source.transactions({ page: 1, pageSize: 20, status: 'posted', documentState: 'missing', to: addDays(today, -45) }),
    ]);
    const items: AttentionItem[] = [];
    const base = (id: string, level: AttentionItem['level'], title: string, explanation: string, nextStep: string, href: string, since: string, money: boolean, reference: string | null = null): AttentionItem => ({
      id, level, category: 'finance', code: null, title, explanation, nextStep, reference, unitSlug: null, unitName: null, since, moneyInvolved: money, inventoryHeld: false, href,
    });
    for (const t of mismatches.rows) items.push(base(`finance:mismatch:${t.id}`, 'critical', `Payment mismatch · ${t.booking_reference ?? t.description}`, `The payment linked to this ${t.kind} (${formatCents(t.gross_cents)}) does not equal it.`, 'Compare with the provider statement on the transaction; record a correction, never adjust the payment.', `/admin/finance/transactions/${t.id}`, t.updated_at, true, t.booking_reference));
    for (const t of refunds.rows) items.push(base(`finance:refund:${t.id}`, 'high', `Refund not reconciled · ${t.booking_reference ?? t.description}`, `A refund of ${formatCents(Math.abs(t.gross_cents))} is posted but no outgoing payment is linked.`, 'Check the PayPal refund id on the booking; import the statement if the refund is there.', `/admin/finance/transactions/${t.id}`, t.updated_at, true, t.booking_reference));
    for (const b of imports.filter((x) => x.status === 'failed')) items.push(base(`finance:import:${b.id}`, 'high', `Finance import failed · ${b.filename}`, b.error ?? 'The import did not complete.', 'Open the batch and read the row errors.', `/admin/finance/imports/${b.id}`, b.created_at, false));
    for (const n of notices.filter((x) => x.status === 'received')) items.push(base(`finance:notice:${n.id}`, 'high', `Tax notice to review · ${n.tax_type.toUpperCase()} ${n.period_key}`, `${n.notice_type.replace('_', ' ')} from ${n.authority}, received ${n.received_on}.`, 'Compare with the estimate and record the due dates.', '/admin/finance/taxes#notices', n.created_at, true));
    const calendar = calendarPolicyFrom(policy, today);
    const official: Parameters<typeof mergeDeadlines>[1] = [];
    for (const n of notices) for (const d of n.dues) if (d.paid_cents < d.amount_cents) official.push({ taxType: n.tax_type as 'vat' | 'kst' | 'soli' | 'gewst' | 'other', periodKey: n.period_key, dueOn: d.due_on, label: `${n.tax_type.toUpperCase()} ${n.period_key} · ${d.label ?? n.notice_type}`, amountCents: d.amount_cents - d.paid_cents, kind: 'notice' });
    const deadlines = mergeDeadlines([...calculatedDeadlines(yearOf(today), calendar), ...calculatedDeadlines(yearOf(today) + 1, calendar)], official).filter((d) => d.dueOn >= addDays(today, -60) && d.dueOn <= addDays(today, 14));
    let overdue = 0, soon = 0;
    for (const d of deadlines) {
      const days = daysBetween(today, d.dueOn);
      const period = periods.find((p) => p.tax_type === d.taxType && p.period_key === d.periodKey);
      if (period && ['filed', 'assessed', 'paid', 'closed'].includes(period.status) && d.kind === 'vat_advance_return') continue;
      if (days < 0) { overdue += 1; items.push(base(`finance:deadline:${d.taxType}:${d.periodKey}:${d.kind}`, 'critical', `Tax deadline overdue · ${d.label}`, `${d.origin === 'official' ? 'Official' : 'Planning'} date ${d.dueOn} has passed (${d.legalReference}).`, 'Confirm with the adviser whether it was filed/paid; record the stage or the payment.', '/admin/finance/taxes#calendar', now.toISOString(), true)); }
      else if (days <= 5) { soon += 1; items.push(base(`finance:deadline:${d.taxType}:${d.periodKey}:${d.kind}`, 'high', `Tax deadline in ${days} day${days === 1 ? '' : 's'} · ${d.label}`, `${d.origin === 'official' ? 'Official' : 'Planning'} date ${d.dueOn}.`, 'Make sure the filing and the payment are on their way.', '/admin/finance/taxes#calendar', now.toISOString(), true)); }
      else soon += 1;
    }
    const governing = periods.map((p) => { const mine = estimates.filter((e) => e.tax_period_id === p.id).map((e) => ({ ...e, computedAt: e.computed_at, stage: e.stage as TaxStage })); return { p, g: governingStage(mine) }; });
    const liabilities: TaxLiabilityInput[] = governing.filter((x) => x.g).map((x) => ({ taxType: x.p.tax_type as TaxLiabilityInput['taxType'], periodKey: x.p.period_key, amountCents: x.g!.amount_cents, stage: x.g!.stage as TaxStage, paidCents: taxPayments.filter((y) => y.tax_type === x.p.tax_type && y.period_key === x.p.period_key && y.kind !== 'refund').reduce((s, y) => s + y.amount_cents, 0), periodStatus: x.p.status }));
    const held = Array.from(new Map([...reserves].sort((a, b) => a.created_at.localeCompare(b.created_at)).filter((r) => r.kind === 'tax').map((r) => [r.label, r])).values()).reduce((s, r) => s + r.amount_cents, 0);
    const reserve = computeReserve(liabilities, held);
    if (reserve.requiredCents > 0 && (reserve.coverage ?? 0) < 0.25) items.push(base('finance:reserve', 'high', `Tax reserve ${Math.round((reserve.coverage ?? 0) * 100)} % covered`, `Estimated remaining liabilities ${formatCents(reserve.requiredCents)} against ${formatCents(held)} declared as held.`, 'Move cash to the reserve and record it, or review the estimate.', '/admin/finance/taxes#reserve', now.toISOString(), true));
    if (oldDocs.total > 0) items.push(base('finance:documents', 'high', `${oldDocs.total} expense${oldDocs.total === 1 ? '' : 's'} without a document for over 45 days`, `Input VAT on them (${formatCents(oldDocs.rows.reduce((s, t) => s + t.vat_cents, 0))} on this page) is not deductible until the invoices are linked.`, 'Work the Finance Inbox: upload or mark not required with a reason.', '/admin/finance/transactions?document=missing', now.toISOString(), true));
    const lastIngestion = signals.find((s) => s.signal === 'booking_ingestion.success')?.observed_at ?? null;
    return {
      items,
      alerts: { mismatches: counts.mismatches, failedImports: counts.failed_imports, overdueDeadlines: overdue, dueSoonDeadlines: soon, reserveCoverage: reserve.requiredCents > 0 ? reserve.coverage : null, reserveGapCents: reserve.gapCents, unmatchedRefunds: refunds.total, missingDocumentsOverdue: oldDocs.total, lastIngestionAt: lastIngestion },
      degraded: false,
    };
  } catch {
    return { items: [], alerts: null, degraded: true };
  }
}
