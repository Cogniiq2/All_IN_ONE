/**
 * ══════════════════════════════════════════════════════════════════════════
 * INGESTION RULES — booking facts → finance facts, as pure mappings.
 *
 * A booking, a payment and an invoice are three different facts and become
 * three different records, linked by the booking's id and reference:
 *
 *   confirmed stay        → ONE revenue transaction, booked on the check-out
 *                           date (service end), lines per quote component
 *                           with the component's tax code; source key
 *                           `booking:<intent id>` — never twice
 *   captured payment      → ONE payment (cash fact), key `paypal:<capture id>`
 *   completed refund      → ONE reversal-style refund transaction (negative
 *                           revenue, pro-rata over the lines) with key
 *                           `refund:<refund id>` and ONE outgoing payment
 *   cleaning turnover     → ONE expected-cost row (not an expense)
 *
 * The runner in `ingestion.ts` applies these through the command functions.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { allocate, splitGross } from '@/lib/finance/money';
import { requireTaxCode } from '@/lib/finance/tax-codes';
import { taxCodeForComponent } from '@/lib/finance/invoices';

export interface BookingFact {
  intentId: string;
  reference: string;
  unitId: string;
  source: string;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  quotedTotalCents: number | null;
  paidAmountCents: number | null;
  paidCurrency: string | null;
  paymentCaptureId: string | null;
  paymentProvider: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  refundState: string | null;
  refundId: string | null;
  refundedAmountCents: number;
  refundCompletedAt: string | null;
  cancellationCompletedAt: string | null;
  components: Array<{ code: string; label: { de: string; en: string } | string; amountCents: number; taxCategory?: string; mandatory?: boolean }>;
}

export interface PostingHeader { [k: string]: unknown }
export interface PostingLine { [k: string]: unknown }

export const REVENUE_RECOGNISING_STATUSES = new Set(['confirmed', 'paid', 'paid_unfinalized', 'finalizing', 'finalization_failed']);

function channelOf(source: string): string {
  if (source === 'direct') return 'direct';
  if (source === 'booking_com' || source === 'bookingcom') return 'booking_com';
  if (source === 'airbnb') return 'airbnb';
  if (source === 'manual') return 'manual';
  return 'other';
}

function labelOf(l: { de: string; en: string } | string): string {
  return typeof l === 'string' ? l : l.en || l.de;
}

/** The revenue posting for a stay, or null when the stay is not a revenue fact (yet). */
export function revenuePosting(b: BookingFact, accommodationCode = 'DE_ACCOMMODATION_REDUCED'): { header: PostingHeader; lines: PostingLine[] } | null {
  if (!REVENUE_RECOGNISING_STATUSES.has(b.status)) return null;
  const components = b.components.filter((c) => c.mandatory !== false && c.amountCents > 0);
  const total = components.reduce((s, c) => s + c.amountCents, 0);
  if (total <= 0) return null;
  const lines = components.map((c, i) => {
    const code = taxCodeForComponent(c.taxCategory, accommodationCode);
    const meta = requireTaxCode(code);
    const split = splitGross(c.amountCents, meta.rateBp);
    return {
      line_no: i + 1,
      category: c.taxCategory === 'accommodation' ? 'accommodation_revenue' : c.taxCategory === 'deposit' ? 'other_guest_charges' : 'accommodation_ancillary',
      description: labelOf(c.label),
      quantity: 1,
      tax_code: code,
      rate_bp: meta.rateBp,
      net_cents: split.net,
      vat_cents: split.vat,
      gross_cents: split.gross,
      input_vat_treatment: 'not_applicable',
      unit_id: b.unitId,
      allocation_method: 'direct',
      classification: meta.reviewRequired ? 'needs_review' : 'auto_verified',
    };
  });
  const needsReview = lines.some((l) => l.classification === 'needs_review');
  return {
    header: {
      kind: 'revenue', booked_on: b.checkOut, service_from: b.checkIn, service_to: b.checkOut, currency: b.currency,
      description: `Stay ${b.reference} · ${b.checkIn} – ${b.checkOut}`, channel: channelOf(b.source),
      booking_intent_id: b.intentId, booking_reference: b.reference, unit_id: b.unitId,
      source_type: 'booking', source_system: 'booking', source_reference: `booking:${b.intentId}`,
      review_state: needsReview ? 'needs_review' : 'auto_verified', document_state: 'pending', payment_state: 'unpaid', reconciliation_state: 'unmatched',
    },
    lines,
  };
}

/** The cash fact for a captured payment, or null. */
export function capturePayment(b: BookingFact): Record<string, unknown> | null {
  if (!b.paymentCaptureId || !b.paidAmountCents || b.paidAmountCents <= 0) return null;
  if (!['paid', 'partially_refunded', 'refunded', 'disputed'].includes(b.paymentStatus)) return null;
  return {
    direction: 'in', source: b.paymentProvider === 'paypal' ? 'paypal' : 'other', provider_reference: b.paymentCaptureId,
    amount_cents: b.paidAmountCents, fee_cents: 0, currency: b.paidCurrency ?? b.currency, occurred_at: b.paidAt ?? b.confirmedAt ?? new Date().toISOString(),
    value_date: (b.paidAt ?? b.confirmedAt ?? '').slice(0, 10) || null, counterparty_label: `Guest · ${b.reference}`, reference_text: b.reference,
    booking_intent_id: b.intentId, booking_reference: b.reference, kind: 'receipt',
  };
}

/** A completed refund: negative revenue pro-rata over the original lines, plus the outgoing cash fact. */
export function refundPosting(b: BookingFact, originalLines: Array<{ line_no: number; category: string; description: string | null; tax_code: string; rate_bp: number; gross_cents: number; unit_id: string | null }>): { header: PostingHeader; lines: PostingLine[]; payment: Record<string, unknown> } | null {
  if (b.refundState !== 'completed' || !b.refundId || b.refundedAmountCents <= 0) return null;
  const total = originalLines.reduce((s, l) => s + l.gross_cents, 0);
  if (total <= 0 || originalLines.length === 0) return null;
  const refunded = Math.min(b.refundedAmountCents, total);
  const parts = allocate(refunded, originalLines.map((l) => l.gross_cents));
  const lines = originalLines.map((l, i) => {
    const gross = -parts[i];
    const split = splitGross(gross, l.rate_bp);
    return { line_no: i + 1, category: l.category, description: `Refund · ${l.description ?? ''}`.trim(), quantity: 1, tax_code: l.tax_code, rate_bp: l.rate_bp, net_cents: split.net, vat_cents: split.vat, gross_cents: split.gross, input_vat_treatment: 'not_applicable', unit_id: l.unit_id, allocation_method: 'direct', classification: requireTaxCode(l.tax_code).reviewRequired ? 'needs_review' : 'auto_verified' };
  }).filter((l) => l.gross_cents !== 0);
  const on = (b.refundCompletedAt ?? b.cancellationCompletedAt ?? new Date().toISOString()).slice(0, 10);
  return {
    header: {
      kind: 'refund', booked_on: on, service_from: b.checkIn, service_to: b.checkOut, currency: b.currency,
      description: `Refund ${b.reference} · ${refunded === total ? 'full' : 'partial'}${b.refundedAmountCents > total ? ' · exceeds the original stay: review' : ''}`, channel: channelOf(b.source),
      booking_intent_id: b.intentId, booking_reference: b.reference, unit_id: b.unitId,
      source_type: 'refund', source_system: 'booking', source_reference: `refund:${b.refundId}`,
      review_state: lines.some((l) => l.classification === 'needs_review') || b.refundedAmountCents > total ? 'needs_review' : 'auto_verified', document_state: 'not_required', payment_state: 'unpaid', reconciliation_state: 'unmatched',
    },
    lines,
    payment: {
      direction: 'out', source: b.paymentProvider === 'paypal' ? 'paypal' : 'other', provider_reference: b.refundId, amount_cents: b.refundedAmountCents, fee_cents: 0, currency: b.paidCurrency ?? b.currency,
      occurred_at: b.refundCompletedAt ?? new Date().toISOString(), value_date: on, counterparty_label: `Guest · ${b.reference}`, reference_text: `refund ${b.reference}`,
      booking_intent_id: b.intentId, booking_reference: b.reference, kind: 'refund',
    },
  };
}

/** Expected cleaning cost for a turnover: an expectation, never an expense. */
export function expectedTurnoverCost(turnover: { id: string; intent_id: string; unit_id: string; departure: string; reference?: string | null }, policy: { expectedNetCents: number; supplierId: string | null; taxCode: string } | null) {
  if (!policy || policy.expectedNetCents <= 0) return null;
  return { turnover_id: turnover.id, booking_intent_id: turnover.intent_id, booking_reference: turnover.reference ?? null, unit_id: turnover.unit_id, departure: turnover.departure, supplier_id: policy.supplierId, expected_net_cents: policy.expectedNetCents, expected_tax_code: policy.taxCode, state: 'expected' };
}
