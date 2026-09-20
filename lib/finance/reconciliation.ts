/**
 * ══════════════════════════════════════════════════════════════════════════
 * RECONCILIATION — deterministic, explainable matching.
 *
 * Pure. Given open transactions (economic facts) and unmatched payments
 * (cash facts), propose links. Every proposal names its rule, version,
 * confidence, reason and the ids it used. The runner (`commands.ts`)
 * records `exact`/`high` proposals as matches automatically and hands the
 * rest to the Finance Inbox — a fuzzy guess is never a silent match.
 *
 * Rules, in order of certainty:
 *   R1 booking-key       same booking intent id (or reference), same currency,
 *                        payment amount equals the transaction gross           → exact
 *   R2 booking-partial   same booking, payment smaller than gross (deposit /
 *                        partial refund) — partially_matched                   → high
 *   R3 booking-mismatch  same booking, payment differs from gross by more than
 *                        a tolerance — mismatch, needs a person                → high (as a MISMATCH)
 *   R4 reference-text    a payment's reference text contains the transaction's
 *                        booking reference or supplier invoice number, same
 *                        gross, same currency, within 45 days                  → high
 *   R5 amount-date       same gross, same currency, payment within 10 days of
 *                        the transaction's due/booked date, exactly one
 *                        candidate on each side                                → medium (inbox)
 *   R6 payout-bundle     a Booking.com payout whose amount equals the sum of
 *                        2–40 open Booking.com revenue transactions' NET OF
 *                        COMMISSION expectation in a date window               → medium (inbox)
 *
 * Nothing here writes. Nothing here rounds money.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { PaymentRow, TransactionRow } from '@/lib/finance/rows';
import { daysBetween } from '@/lib/finance/periods';

export const RECONCILIATION_RULES_VERSION = 'recon-2026-09-20.1';

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low';
export type MatchState = 'matched' | 'partially_matched' | 'mismatch' | 'needs_review';

export interface MatchProposal {
  transactionId: string;
  paymentId: string;
  amountCents: number;
  state: MatchState;
  rule: string;
  ruleVersion: string;
  confidence: MatchConfidence;
  reason: string;
  /** True when the runner may record it without a person. */
  autoApply: boolean;
}

export interface ReconcileInput {
  transactions: readonly TransactionRow[];
  payments: readonly PaymentRow[];
  /** Cents of tolerance for R3 vs R1 (rounding on FX or fees). Default 0: money is exact. */
  toleranceCents?: number;
}

const DIRECTION_FOR_KIND: Record<string, 'in' | 'out'> = {
  revenue: 'in', refund: 'out', credit_note: 'out', expense: 'out', commission: 'out', fee: 'out', tax_payment: 'out', cogs: 'out', adjustment: 'in',
};

function expectedDirection(t: TransactionRow): 'in' | 'out' {
  // Refunds and credit notes are posted with a NEGATIVE gross (they reduce
  // revenue) and the money always leaves: the sign carries no extra meaning.
  if (t.kind === 'refund' || t.kind === 'credit_note') return 'out';
  const d = DIRECTION_FOR_KIND[t.kind] ?? 'in';
  // For every other kind a negative gross flips the direction (a supplier
  // credit posted as a negative expense is money coming back in).
  return t.gross_cents < 0 ? (d === 'in' ? 'out' : 'in') : d;
}

function absGross(t: TransactionRow): number {
  return Math.abs(t.gross_cents);
}

export function proposeMatches(input: ReconcileInput): MatchProposal[] {
  const tol = input.toleranceCents ?? 0;
  const open = input.transactions.filter((t) => t.status === 'posted' && ['unmatched', 'partially_matched', 'needs_review'].includes(t.reconciliation_state) && t.gross_cents !== 0);
  const payments = input.payments.filter((p) => ['unmatched', 'needs_review', 'partially_matched'].includes(p.reconciliation_state));
  const proposals: MatchProposal[] = [];
  const usedTx = new Set<string>();
  const usedPay = new Set<string>();

  const propose = (t: TransactionRow, p: PaymentRow, state: MatchState, rule: string, confidence: MatchConfidence, reason: string, autoApply: boolean, amount = Math.min(absGross(t), p.amount_cents)) => {
    proposals.push({ transactionId: t.id, paymentId: p.id, amountCents: amount, state, rule, ruleVersion: RECONCILIATION_RULES_VERSION, confidence, reason, autoApply });
    usedTx.add(t.id);
    usedPay.add(p.id);
  };

  /* R1–R3: booking key */
  for (const t of open) {
    if (!t.booking_intent_id && !t.booking_reference) continue;
    const dir = expectedDirection(t);
    const candidates = payments.filter((p) => !usedPay.has(p.id) && p.currency === t.currency && p.direction === dir
      && ((t.booking_intent_id && p.booking_intent_id === t.booking_intent_id) || (t.booking_reference && p.booking_reference === t.booking_reference)));
    if (candidates.length === 0) continue;
    const exact = candidates.find((p) => Math.abs(p.amount_cents - absGross(t)) <= tol);
    if (exact) {
      propose(t, exact, 'matched', 'R1 booking-key exact', 'exact', `Payment ${exact.provider_reference} belongs to booking ${t.booking_reference ?? t.booking_intent_id} and equals the ${t.kind} gross of ${absGross(t)} cents.`, true);
      continue;
    }
    // Sum of several payments for one booking (deposit + balance)?
    const sum = candidates.reduce((s, p) => s + p.amount_cents, 0);
    if (candidates.length > 1 && Math.abs(sum - absGross(t)) <= tol) {
      for (const p of candidates) propose(t, p, 'matched', 'R1 booking-key exact (split)', 'exact', `${candidates.length} payments for booking ${t.booking_reference} sum to the gross of ${absGross(t)} cents.`, true, p.amount_cents);
      continue;
    }
    const first = candidates[0];
    if (first.amount_cents < absGross(t)) {
      propose(t, first, 'partially_matched', 'R2 booking-key partial', 'high', `Payment ${first.provider_reference} (${first.amount_cents} cents) is less than the ${t.kind} gross (${absGross(t)} cents) for booking ${t.booking_reference}; the remainder is still open.`, true);
    } else {
      propose(t, first, 'mismatch', 'R3 booking-key mismatch', 'high', `Payment ${first.provider_reference} (${first.amount_cents} cents) exceeds the ${t.kind} gross (${absGross(t)} cents) for booking ${t.booking_reference}. A person must decide.`, true);
    }
  }

  /* R4: reference text */
  for (const t of open) {
    if (usedTx.has(t.id)) continue;
    const tokens = [t.booking_reference, t.supplier_invoice_no].filter((x): x is string => Boolean(x && x.length >= 5));
    if (tokens.length === 0) continue;
    const dir = expectedDirection(t);
    const hit = payments.find((p) => !usedPay.has(p.id) && p.currency === t.currency && p.direction === dir && p.amount_cents === absGross(t)
      && tokens.some((tok) => (p.reference_text ?? '').toUpperCase().includes(tok.toUpperCase()))
      && Math.abs(daysBetween(t.booked_on, p.occurred_at.slice(0, 10))) <= 45);
    if (hit) propose(t, hit, 'matched', 'R4 reference-text', 'high', `Payment reference "${hit.reference_text}" names ${tokens.join(' / ')} and the amount equals the gross.`, true);
  }

  /* R5: amount + date, unique on both sides */
  for (const t of open) {
    if (usedTx.has(t.id)) continue;
    const dir = expectedDirection(t);
    const anchor = t.due_on ?? t.booked_on;
    const cands = payments.filter((p) => !usedPay.has(p.id) && p.currency === t.currency && p.direction === dir && p.amount_cents === absGross(t) && Math.abs(daysBetween(anchor, p.occurred_at.slice(0, 10))) <= 10);
    if (cands.length !== 1) continue;
    const p = cands[0];
    const otherTx = open.filter((o) => o.id !== t.id && !usedTx.has(o.id) && o.currency === t.currency && absGross(o) === p.amount_cents && expectedDirection(o) === dir && Math.abs(daysBetween(o.due_on ?? o.booked_on, p.occurred_at.slice(0, 10))) <= 10);
    if (otherTx.length > 0) continue;
    propose(t, p, 'needs_review', 'R5 amount-date', 'medium', `Same amount (${p.amount_cents} cents) within 10 days of ${anchor}; no booking or reference links them. Confirm before matching.`, false);
  }

  /* R6: Booking.com payout bundle */
  const payouts = payments.filter((p) => !usedPay.has(p.id) && p.source === 'booking_com_payout' && p.direction === 'in');
  if (payouts.length > 0) {
    const bcom = open.filter((t) => !usedTx.has(t.id) && t.channel === 'booking_com' && t.kind === 'revenue' && t.gross_cents > 0);
    for (const p of payouts) {
      const windowTx = bcom.filter((t) => !usedTx.has(t.id) && Math.abs(daysBetween(t.booked_on, p.occurred_at.slice(0, 10))) <= 45).sort((a, b) => a.booked_on.localeCompare(b.booked_on));
      const found = subsetSum(windowTx.map((t) => t.gross_cents), p.amount_cents, 40);
      if (found && found.length >= 2) {
        for (const idx of found) propose(windowTx[idx], p, 'needs_review', 'R6 payout-bundle', 'medium', `Booking.com payout ${p.provider_reference} (${p.amount_cents} cents) equals the sum of ${found.length} open Booking.com stays' gross in the 45-day window. Confirm against the payout statement.`, false, windowTx[idx].gross_cents);
      }
    }
  }

  return proposals;
}

/** Greedy-then-exact subset sum for small n; returns indexes or null. */
function subsetSum(values: number[], target: number, maxN: number): number[] | null {
  const n = Math.min(values.length, maxN);
  if (n === 0) return null;
  const total = values.slice(0, n).reduce((a, b) => a + b, 0);
  if (total === target) return values.slice(0, n).map((_, i) => i);
  if (n > 22) return null; // bound the search; larger bundles need the statement import
  const best: number[] | null = null;
  const stack: Array<{ i: number; sum: number; picked: number[] }> = [{ i: 0, sum: 0, picked: [] }];
  while (stack.length > 0) {
    const s = stack.pop()!;
    if (s.sum === target && s.picked.length >= 2) return s.picked;
    if (s.i >= n || s.sum > target) continue;
    stack.push({ i: s.i + 1, sum: s.sum, picked: s.picked });
    stack.push({ i: s.i + 1, sum: s.sum + values[s.i], picked: [...s.picked, s.i] });
  }
  return best;
}

/** Explain why a transaction is still open, for the inbox. */
export function openReason(t: TransactionRow, today: string): string | null {
  if (t.status !== 'posted') return null;
  if (t.reconciliation_state === 'mismatch') return 'The linked payment does not equal the amount.';
  if (t.reconciliation_state === 'needs_review') return 'A proposed match waits for confirmation.';
  if (t.reconciliation_state === 'partially_matched') return 'Part of the amount has been received or paid; the rest is open.';
  if (t.reconciliation_state === 'unmatched') {
    if (t.kind === 'revenue' && t.booked_on <= today) return 'No payment has been linked to this revenue.';
    if (t.kind !== 'revenue' && t.due_on && t.due_on < today) return 'Past due and no payment linked.';
  }
  return null;
}
