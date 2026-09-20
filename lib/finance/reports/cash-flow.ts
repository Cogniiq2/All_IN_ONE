/**
 * CASH FLOW — cash is not profit.
 *
 * Actuals from payments (cash facts) by month, source and kind; opening and
 * closing balance from the accounts' opening balances plus movements.
 * Projection for 30/60/90 days from: confirmed future stays (committed
 * inflows, direct bookings already paid are NOT counted again), expected
 * inflows (Booking.com stays whose payout has not arrived), known
 * liabilities (unpaid expenses by due date), estimated tax payments
 * (deadlines with amounts). Each projected line is labelled by certainty.
 */

import type { Cents } from '@/lib/finance/money';
import { addDays, type IsoDate } from '@/lib/finance/periods';
import type { AccountRow, CashMonthlyRow, PaymentRow, StayRow, TransactionRow } from '@/lib/finance/rows';
import type { Deadline } from '@/lib/finance/tax/calendar';

export interface CashMonth {
  month: string;
  inflows: Array<{ label: string; source: string; cents: Cents }>;
  outflows: Array<{ label: string; source: string; cents: Cents }>;
  inflowCents: Cents;
  outflowCents: Cents;
  netCents: Cents;
  openingCents: Cents | null;
  closingCents: Cents | null;
}

const SOURCE_LABEL: Record<string, string> = {
  paypal: 'PayPal (direct bookings)', booking_com_payout: 'Booking.com payouts', bank: 'Bank', cash: 'Cash', manual: 'Manual', other: 'Other',
};
const KIND_LABEL: Record<string, string> = {
  receipt: 'Receipts', refund: 'Refunds', payout: 'Payouts', disbursement: 'Supplier payments', fee: 'Fees', transfer: 'Transfers', tax: 'Tax payments', unknown: 'Unknown',
};

export function buildCashFlow(rows: readonly CashMonthlyRow[], accounts: readonly AccountRow[], months: string[]): { months: CashMonth[]; openingKnown: boolean } {
  const opening = accounts.reduce((s, a) => s + Number(a.opening_balance_cents), 0);
  const openingKnown = accounts.some((a) => a.opening_balance_on !== null);
  let running: Cents | null = openingKnown ? opening : null;
  // Movements before the first shown month roll into the opening balance.
  const first = months[0];
  if (running !== null && first) {
    for (const r of rows) if (r.period_key < first) running += Number(r.net_cents);
  }
  const out: CashMonth[] = months.map((month) => {
    const mine = rows.filter((r) => r.period_key === month);
    const inflows = mine.filter((r) => r.direction === 'in').map((r) => ({ label: `${KIND_LABEL[r.kind] ?? r.kind} · ${SOURCE_LABEL[r.source] ?? r.source}`, source: r.source, cents: Number(r.gross_cents) }));
    const outflows = mine.filter((r) => r.direction === 'out').map((r) => ({ label: `${KIND_LABEL[r.kind] ?? r.kind} · ${SOURCE_LABEL[r.source] ?? r.source}`, source: r.source, cents: Number(r.gross_cents) }));
    const inflowCents = inflows.reduce((s, x) => s + x.cents, 0);
    const outflowCents = outflows.reduce((s, x) => s + x.cents, 0);
    const net = inflowCents - outflowCents;
    const openingCents = running;
    const closingCents = running === null ? null : running + net;
    running = closingCents;
    return { month, inflows, outflows, inflowCents, outflowCents, netCents: net, openingCents, closingCents };
  });
  return { months: out, openingKnown };
}

export type Certainty = 'actual' | 'committed' | 'expected' | 'estimated';

export interface ProjectedLine {
  dueOn: IsoDate;
  label: string;
  cents: Cents; // signed: inflow +, outflow −
  certainty: Certainty;
  href?: string;
}

export interface CashProjection {
  asOf: IsoDate;
  cashNowCents: Cents | null;
  horizons: Array<{ days: 30 | 60 | 90; until: IsoDate; committedInCents: Cents; expectedInCents: Cents; liabilitiesCents: Cents; estimatedTaxCents: Cents; projectedCents: Cents | null }>;
  lines: ProjectedLine[];
}

export function projectCash(input: {
  today: IsoDate;
  cashNowCents: Cents | null;
  stays: readonly StayRow[];
  paidStayIntentIds: ReadonlySet<string>;
  openLiabilities: readonly TransactionRow[];
  deadlines: readonly Deadline[];
  /** Fallback Booking.com net share when a stay's commission is unknown (bp of gross). */
  otaNetShareBp?: number;
}): CashProjection {
  const lines: ProjectedLine[] = [];
  const until90 = addDays(input.today, 90);
  for (const s of input.stays) {
    if (s.check_out <= input.today || s.check_out > until90) continue;
    if (!['confirmed', 'paid'].includes(s.status)) continue;
    const gross = s.quoted_total_cents ?? 0;
    if (gross <= 0) continue;
    if (s.source === 'direct') {
      if (input.paidStayIntentIds.has(s.intent_id)) continue; // cash already in
      lines.push({ dueOn: s.check_in, label: `Direct stay ${s.reference} · payment expected before arrival`, cents: gross, certainty: 'committed', href: `/admin/bookings/${s.reference}` });
    } else {
      const net = Math.round((gross * (input.otaNetShareBp ?? 8500)) / 10000);
      lines.push({ dueOn: addDays(s.check_out, 14), label: `Booking.com payout for ${s.reference} (after commission, estimated)`, cents: net, certainty: 'expected', href: `/admin/bookings/${s.reference}` });
    }
  }
  for (const t of input.openLiabilities) {
    if (t.status !== 'posted' || !['unpaid', 'partially_paid'].includes(t.payment_state)) continue;
    if (!['expense', 'commission', 'fee'].includes(t.kind)) continue;
    const due = t.due_on ?? addDays(t.booked_on, 30);
    lines.push({ dueOn: due < input.today ? input.today : due, label: `${t.counterparty_label ?? t.description} · ${t.supplier_invoice_no ?? 'open invoice'}`, cents: -Math.abs(t.gross_cents), certainty: 'committed', href: `/admin/finance/transactions/${t.id}` });
  }
  for (const d of input.deadlines) {
    if (d.dueOn < input.today || d.dueOn > until90) continue;
    if (!d.amountCents) continue;
    lines.push({ dueOn: d.dueOn, label: d.label, cents: -d.amountCents, certainty: d.origin === 'official' ? 'committed' : 'estimated', href: '/admin/finance/taxes' });
  }
  lines.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const horizons = ([30, 60, 90] as const).map((days) => {
    const until = addDays(input.today, days);
    const inWindow = lines.filter((l) => l.dueOn <= until);
    const committedIn = inWindow.filter((l) => l.cents > 0 && l.certainty === 'committed').reduce((s, l) => s + l.cents, 0);
    const expectedIn = inWindow.filter((l) => l.cents > 0 && l.certainty === 'expected').reduce((s, l) => s + l.cents, 0);
    const liabilities = inWindow.filter((l) => l.cents < 0 && l.certainty === 'committed').reduce((s, l) => s - l.cents, 0);
    const tax = inWindow.filter((l) => l.cents < 0 && l.certainty === 'estimated').reduce((s, l) => s - l.cents, 0);
    const projected = input.cashNowCents === null ? null : input.cashNowCents + committedIn + expectedIn - liabilities - tax;
    return { days, until, committedInCents: committedIn, expectedInCents: expectedIn, liabilitiesCents: liabilities, estimatedTaxCents: tax, projectedCents: projected };
  });
  return { asOf: input.today, cashNowCents: input.cashNowCents, horizons, lines };
}

/** Current cash = opening balances + all recorded movements (null when no opening balance is known). */
export function cashNow(accounts: readonly AccountRow[], allPaymentsNet: Cents, anyOpeningKnown: boolean): Cents | null {
  if (!anyOpeningKnown) return null;
  return accounts.reduce((s, a) => s + Number(a.opening_balance_cents), 0) + allPaymentsNet;
}

export function paymentsNet(payments: readonly PaymentRow[]): Cents {
  return payments.filter((p) => p.reconciliation_state !== 'ignored').reduce((s, p) => s + (p.direction === 'in' ? p.amount_cents : -p.amount_cents), 0);
}
