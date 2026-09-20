/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE INBOX — every exception, once, with its cost and its safe next step.
 *
 * Pure derivation over facts the queries already loaded. Each item says WHY
 * it needs a person, the FINANCIAL IMPACT (cents, or unknown), the SAFEST
 * next step, and links to the record. Ordered by cost of ignoring.
 *
 * Nothing here executes anything. Severity is not permission.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { formatCents } from '@/lib/finance/money';
import { daysBetween, type IsoDate } from '@/lib/finance/periods';
import type { DocumentRow, ImportBatchRow, LineRow, MinibarMovementRow, PaymentRow, ReconciliationRow, TaxNoticeRow, TransactionRow } from '@/lib/finance/rows';
import type { Deadline } from '@/lib/finance/tax/calendar';
import type { ReserveReport } from '@/lib/finance/tax/reserve';
import { category, categoryLabel } from '@/lib/finance/categories';

export type InboxLevel = 'critical' | 'high' | 'elevated' | 'watch';

export type InboxKind =
  | 'missing_document' | 'unknown_transaction' | 'tax_classification' | 'reverse_charge_review' | 'input_vat_review' | 'payout_mismatch'
  | 'duplicate_suspect' | 'unmatched_refund' | 'unmatched_payment' | 'unreconciled_revenue' | 'unallocated_cost' | 'tax_notice' | 'tax_deadline'
  | 'missing_invoice_number' | 'minibar_variance' | 'asset_candidate' | 'reserve_gap' | 'import_failed' | 'match_proposal';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  level: InboxLevel;
  title: string;
  why: string;
  impactCents: number | null;
  nextStep: string;
  href: string;
  since: string;
  reference?: string | null;
}

export const INBOX_LEVEL_ORDER: Record<InboxLevel, number> = { critical: 0, high: 1, elevated: 2, watch: 3 };

export interface InboxInput {
  today: IsoDate;
  transactions: readonly TransactionRow[];
  lines: readonly LineRow[];
  payments: readonly PaymentRow[];
  pendingMatches: readonly ReconciliationRow[];
  documents?: readonly DocumentRow[];
  notices: readonly TaxNoticeRow[];
  deadlines: readonly Deadline[];
  reserve: ReserveReport | null;
  imports: readonly ImportBatchRow[];
  minibarMovements: readonly MinibarMovementRow[];
  /** Days after which a missing document becomes high. */
  documentGraceDays?: number;
}

const txHref = (id: string) => `/admin/finance/transactions/${id}`;

export function deriveInbox(i: InboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  const grace = i.documentGraceDays ?? 14;
  const txById = new Map(i.transactions.map((t) => [t.id, t]));
  const posted = i.transactions.filter((t) => t.status === 'posted');

  /* Missing documents */
  for (const t of posted) {
    if (t.document_state !== 'missing' || !['expense', 'commission', 'fee'].includes(t.kind)) continue;
    const age = daysBetween(t.booked_on, i.today);
    items.push({
      id: `doc:${t.id}`, kind: 'missing_document', level: age > grace * 3 ? 'high' : age > grace ? 'elevated' : 'watch',
      title: `Missing document · ${t.counterparty_label ?? t.description}`,
      why: `An ${t.kind} of ${formatCents(t.gross_cents)} booked on ${t.booked_on} has no invoice or receipt linked. Without it the input VAT (${formatCents(t.vat_cents)}) is not deductible and the period cannot close.`,
      impactCents: t.vat_cents, nextStep: 'Upload the invoice or receipt and link it; if none exists, mark the document as not required with a reason.', href: txHref(t.id), since: t.posted_at, reference: t.booking_reference,
    });
  }

  /* Classification */
  for (const l of i.lines) {
    const t = txById.get(l.transaction_id);
    if (!t || t.status !== 'posted') continue;
    if (l.tax_code === 'DE_REVIEW_REQUIRED' || l.tax_code === 'DE_ANCILLARY_REVIEW') {
      items.push({
        id: `tax:${l.id}`, kind: 'tax_classification', level: Math.abs(l.gross_cents) >= 50_000 ? 'high' : 'elevated',
        title: `Tax code needed · ${t.counterparty_label ?? t.description}`,
        why: `Line ${l.line_no} (${categoryLabel(l.category)}, ${formatCents(l.gross_cents)}) is parked under a review-required code. It counts toward no VAT figure until a person classifies it.`,
        impactCents: Math.abs(l.gross_cents), nextStep: 'Open the transaction and choose the tax code the invoice supports; ask the adviser if the treatment is unsettled.', href: txHref(t.id), since: t.posted_at, reference: t.booking_reference,
      });
    } else if (l.input_vat_treatment === 'reverse_charge' && l.classification !== 'auto_verified' && l.classification !== 'reviewed' && l.classification !== 'accountant_locked') {
      items.push({
        id: `rc:${l.id}`, kind: 'reverse_charge_review', level: 'elevated', title: `Reverse charge to confirm · ${t.counterparty_label ?? t.description}`,
        why: `Suggested § 13b reverse charge on ${formatCents(l.net_cents)} net: the company would declare ${formatCents(l.reverse_charge_vat_cents)} output VAT and deduct the same. Depends on the issuing entity on the invoice.`,
        impactCents: l.reverse_charge_vat_cents, nextStep: 'Check the invoice issuer, country and VAT id; confirm or change the classification.', href: txHref(t.id), since: t.posted_at,
      });
    } else if (['review_required', 'unknown'].includes(l.input_vat_treatment) && !['revenue', 'refund', 'credit_note'].includes(t.kind) && l.vat_cents > 0) {
      items.push({
        id: `ivat:${l.id}`, kind: 'input_vat_review', level: 'elevated', title: `Input VAT deductibility · ${t.counterparty_label ?? t.description}`,
        why: `${formatCents(l.vat_cents)} VAT on line ${l.line_no} has no deductibility decision; it is excluded from the VAT estimate.`,
        impactCents: l.vat_cents, nextStep: 'Decide deductible / partially / not deductible per the invoice and use.', href: txHref(t.id), since: t.posted_at,
      });
    } else if (l.classification === 'suggested') {
      items.push({
        id: `sugg:${l.id}`, kind: 'tax_classification', level: 'watch', title: `Suggested classification · ${t.counterparty_label ?? t.description}`,
        why: `The rule engine suggested ${categoryLabel(l.category)} at ${l.rate_bp / 100} % for ${formatCents(l.gross_cents)}; it is not verified.`,
        impactCents: null, nextStep: 'Confirm the suggestion or correct it.', href: txHref(t.id), since: t.posted_at,
      });
    }
    if (l.allocation_method === 'unallocated' && t.kind === 'expense' && ['direct_cost', 'property_cost'].includes(plGroupOf(l.category))) {
      items.push({
        id: `alloc:${l.id}`, kind: 'unallocated_cost', level: 'watch', title: `Cost not allocated · ${categoryLabel(l.category)}`,
        why: `${formatCents(l.net_cents)} of ${categoryLabel(l.category)} is not attributed to a unit; property profitability is understated for every unit.`,
        impactCents: l.net_cents, nextStep: 'Allocate to a unit directly or by the configured shared-cost method.', href: txHref(t.id), since: t.posted_at,
      });
    }
    if (l.asset_state === 'candidate') {
      items.push({
        id: `asset:${l.id}`, kind: 'asset_candidate', level: 'watch', title: `Asset candidate · ${t.counterparty_label ?? t.description}`,
        why: `${formatCents(l.net_cents)} of ${categoryLabel(l.category)} may be a fixed asset rather than an expense; the useful life and method are the adviser's.`,
        impactCents: l.net_cents, nextStep: 'Confirm as asset (with useful life) or as expense.', href: txHref(t.id), since: t.posted_at,
      });
    }
  }

  /* Reconciliation */
  for (const t of posted) {
    if (t.reconciliation_state === 'mismatch') {
      items.push({
        id: `mismatch:${t.id}`, kind: t.channel === 'booking_com' ? 'payout_mismatch' : 'unknown_transaction', level: 'critical',
        title: `${t.channel === 'booking_com' ? 'Payout' : 'Payment'} mismatch · ${t.booking_reference ?? t.description}`,
        why: `The payment linked to this ${t.kind} (${formatCents(t.gross_cents)}) does not equal it. Money and revenue disagree.`,
        impactCents: Math.abs(t.gross_cents), nextStep: 'Compare with the provider statement; record a correction or a fee/commission line, never adjust the payment.', href: txHref(t.id), since: t.updated_at, reference: t.booking_reference,
      });
    } else if (t.kind === 'refund' && ['unmatched', 'needs_review'].includes(t.reconciliation_state)) {
      items.push({
        id: `refund:${t.id}`, kind: 'unmatched_refund', level: 'high', title: `Refund not reconciled · ${t.booking_reference ?? t.description}`,
        why: `A refund of ${formatCents(Math.abs(t.gross_cents))} is posted but no outgoing payment is linked. Either the money has not left, or the provider's refund is not imported.`,
        impactCents: Math.abs(t.gross_cents), nextStep: 'Check the PayPal refund id on the booking; import the statement if the refund is there.', href: txHref(t.id), since: t.updated_at, reference: t.booking_reference,
      });
    } else if (t.kind === 'revenue' && t.reconciliation_state === 'unmatched' && t.booked_on <= i.today && t.channel !== null) {
      const age = daysBetween(t.booked_on, i.today);
      if (age >= (t.channel === 'booking_com' ? 30 : 3)) {
        items.push({
          id: `unrec:${t.id}`, kind: 'unreconciled_revenue', level: age > 60 ? 'high' : 'elevated', title: `Revenue without payment · ${t.booking_reference ?? t.description}`,
          why: `${formatCents(t.gross_cents)} of ${t.channel} revenue for a stay that ended ${age} days ago has no payment or payout linked.`,
          impactCents: t.gross_cents, nextStep: t.channel === 'booking_com' ? 'Import the Booking.com payout statement for the period.' : 'Check the payment record on the booking.', href: txHref(t.id), since: t.posted_at, reference: t.booking_reference,
        });
      }
    }
    if (['expense', 'commission'].includes(t.kind) && !t.supplier_invoice_no && t.source_type !== 'system' && t.document_state !== 'not_required') {
      items.push({
        id: `invno:${t.id}`, kind: 'missing_invoice_number', level: 'watch', title: `No invoice number · ${t.counterparty_label ?? t.description}`,
        why: 'An invoice number is a mandatory element (§ 14 Abs. 4 Nr. 4 UStG) for the input-VAT deduction and for duplicate detection.', impactCents: t.vat_cents,
        nextStep: 'Enter the number from the document.', href: txHref(t.id), since: t.posted_at,
      });
    }
  }

  /* Duplicate suspects: same counterparty, same gross, within 7 days, different source keys */
  const exp = posted.filter((t) => ['expense', 'commission', 'fee'].includes(t.kind)).sort((a, b) => a.booked_on.localeCompare(b.booked_on));
  for (let a = 0; a < exp.length; a += 1) {
    for (let b = a + 1; b < exp.length; b += 1) {
      const x = exp[a], y = exp[b];
      if (daysBetween(x.booked_on, y.booked_on) > 7) break;
      if (x.gross_cents !== y.gross_cents || (x.counterparty_id ?? x.counterparty_label) !== (y.counterparty_id ?? y.counterparty_label)) continue;
      if (x.supplier_invoice_no && y.supplier_invoice_no && x.supplier_invoice_no !== y.supplier_invoice_no) continue;
      items.push({
        id: `dup:${x.id}:${y.id}`, kind: 'duplicate_suspect', level: 'high', title: `Duplicate-looking expense · ${x.counterparty_label ?? x.description}`,
        why: `Two ${x.kind}s of ${formatCents(x.gross_cents)} from the same counterparty within ${daysBetween(x.booked_on, y.booked_on)} days${x.supplier_invoice_no ? ` (invoice ${x.supplier_invoice_no})` : ''}.`,
        impactCents: x.gross_cents, nextStep: 'Compare the documents; reverse the duplicate with a reason if it is one.', href: txHref(y.id), since: y.posted_at,
      });
    }
  }

  /* Payments */
  for (const p of i.payments) {
    if (!['unmatched', 'needs_review'].includes(p.reconciliation_state)) continue;
    const age = daysBetween(p.occurred_at.slice(0, 10), i.today);
    items.push({
      id: `pay:${p.id}`, kind: 'unmatched_payment', level: age > 30 ? 'high' : age > 7 ? 'elevated' : 'watch',
      title: `Unmatched ${p.direction === 'in' ? 'receipt' : 'payment'} · ${p.counterparty_label ?? p.source} ${formatCents(p.amount_cents)}`,
      why: `Money moved ${age} days ago (${p.source}, ${p.provider_reference}) and no revenue or expense explains it.`,
      impactCents: p.amount_cents, nextStep: p.direction === 'in' ? 'Find the booking or post the revenue it belongs to.' : 'Post the expense with its invoice, then match.', href: `/admin/finance/reconciliation?payment=${p.id}`, since: p.created_at, reference: p.booking_reference,
    });
  }
  for (const m of i.pendingMatches) {
    if (m.state !== 'needs_review') continue;
    items.push({
      id: `match:${m.id}`, kind: 'match_proposal', level: 'watch', title: `Match proposed (${m.confidence}) · ${m.rule}`,
      why: m.reason, impactCents: m.amount_cents, nextStep: 'Confirm or reject the proposed match.', href: m.transaction_id ? txHref(m.transaction_id) : `/admin/finance/reconciliation?payment=${m.payment_id}`, since: m.created_at,
    });
  }

  /* Tax notices and deadlines */
  for (const n of i.notices) {
    if (n.status !== 'received') continue;
    items.push({
      id: `notice:${n.id}`, kind: 'tax_notice', level: 'high', title: `Tax notice to review · ${n.tax_type.toUpperCase()} ${n.period_key}`,
      why: `A ${n.notice_type} from ${n.authority} received on ${n.received_on}${n.assessed_cents !== null ? ` assesses ${formatCents(n.assessed_cents)}` : ''}. Its figures override the system estimate once reviewed.`,
      impactCents: n.assessed_cents ?? n.advance_payment_cents, nextStep: 'Compare with the estimate, record the due dates, mark reviewed (or disputed within the objection period).', href: '/admin/finance/taxes#notices', since: n.created_at,
    });
  }
  for (const d of i.deadlines) {
    const days = daysBetween(i.today, d.dueOn);
    if (days > 14) continue;
    items.push({
      id: `deadline:${d.taxType}:${d.periodKey}:${d.kind}`, kind: 'tax_deadline', level: days < 0 ? 'critical' : days <= 5 ? 'high' : 'elevated',
      title: days < 0 ? `Overdue · ${d.label}` : `Due in ${days} day${days === 1 ? '' : 's'} · ${d.label}`,
      why: `${d.origin === 'official' ? 'Official' : 'Planning'} date ${d.dueOn} (${d.legalReference}).${d.amountCents ? ` Amount ${formatCents(d.amountCents)}.` : ''}`,
      impactCents: d.amountCents ?? null, nextStep: d.taxType === 'vat' ? 'Check the VAT position, hand the period to the adviser, ensure the payment.' : 'Ensure the advance payment leaves the account by the date.', href: '/admin/finance/taxes#calendar', since: i.today,
    });
  }

  /* Reserve */
  if (i.reserve && i.reserve.requiredCents > 0 && (i.reserve.coverage ?? 0) < 0.5) {
    items.push({
      id: 'reserve:gap', kind: 'reserve_gap', level: (i.reserve.coverage ?? 0) < 0.25 ? 'high' : 'elevated', title: `Tax reserve ${Math.round((i.reserve.coverage ?? 0) * 100)} % covered`,
      why: `Estimated remaining tax liabilities are ${formatCents(i.reserve.requiredCents)}; ${formatCents(i.reserve.heldCents)} is declared as reserved. Gap ${formatCents(i.reserve.gapCents)}.`,
      impactCents: i.reserve.gapCents, nextStep: 'Move cash to the reserve and record the new held amount, or review the estimate with the adviser.', href: '/admin/finance/taxes#reserve', since: i.today,
    });
  }

  /* Imports */
  for (const b of i.imports) {
    if (b.status !== 'failed') continue;
    items.push({ id: `import:${b.id}`, kind: 'import_failed', level: 'elevated', title: `Import failed · ${b.filename}`, why: b.error ?? 'The import did not complete.', impactCents: null, nextStep: 'Open the batch, read the row errors, fix the file or the adapter mapping and re-import.', href: `/admin/finance/imports/${b.id}`, since: b.created_at });
  }

  /* Minibar */
  for (const m of i.minibarMovements) {
    if (m.charge_state === 'needs_review') {
      items.push({ id: `minibar:${m.id}`, kind: 'minibar_variance', level: 'watch', title: `Minibar entry to review · ${m.booking_reference ?? m.occurred_on}`, why: m.note ?? 'A consumption was recorded with an unresolved charge state.', impactCents: m.unit_price_cents ? Math.abs(m.quantity) * m.unit_price_cents : null, nextStep: 'Set the charge state (paid, included, written off).', href: '/admin/finance/minibar', since: m.created_at, reference: m.booking_reference });
    }
  }

  return items.sort((a, b) => INBOX_LEVEL_ORDER[a.level] - INBOX_LEVEL_ORDER[b.level] || (b.impactCents ?? 0) - (a.impactCents ?? 0) || a.since.localeCompare(b.since));
}

function plGroupOf(code: string): string {
  return category(code)?.plGroup ?? '';
}

export function countInbox(items: readonly InboxItem[]): Record<InboxLevel, number> {
  const out: Record<InboxLevel, number> = { critical: 0, high: 0, elevated: 0, watch: 0 };
  for (const i of items) out[i.level] += 1;
  return out;
}
