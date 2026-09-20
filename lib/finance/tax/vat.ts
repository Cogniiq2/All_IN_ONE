/**
 * ══════════════════════════════════════════════════════════════════════════
 * VAT POSITION — from aggregated ledger lines to an estimated payable.
 *
 * Pure. Takes the rows of `bolagio_finance_vat_monthly` (or anything of
 * that shape) for the months in a period and computes:
 *
 *   output VAT           on sales by tax code (7 %, 19 %)
 *   reverse charge       output VAT owed on foreign B2B services (§ 13b) and
 *                        the corresponding input VAT (§ 15 Abs. 1 Nr. 4)
 *   input VAT            deductible input VAT on purchases, weighted by the
 *                        line's deductible share
 *   review               VAT on lines whose treatment is undecided — shown,
 *                        NEVER counted, and flagged
 *   adjustments          manual VAT corrections entered by the adviser
 *   estimate             output + RC output − input − RC input + adjustments
 *
 * A positive estimate is payable; negative is a refund claim. Everything is
 * labelled `system_estimate` until the adviser records another stage.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Cents } from '@/lib/finance/money';
import { taxCode } from '@/lib/finance/tax-codes';

export const VAT_RULES_VERSION = 'vat-2026-09-20.1';

export interface VatMonthlyRow {
  period_key: string;
  tax_code: string;
  treatment: string;
  rate_bp: number;
  output_basis_cents: number;
  output_vat_cents: number;
  input_basis_cents: number;
  input_vat_cents: number;
  non_deductible_vat_cents: number;
  review_vat_cents: number;
  rc_basis_cents: number;
  rc_output_vat_cents: number;
  rc_input_vat_cents: number;
  lines_needing_review: number;
}

export interface VatLine {
  taxCode: string;
  label: string;
  rateBp: number;
  basisCents: Cents;
  vatCents: Cents;
}

export interface VatPosition {
  periodKey: string;
  months: string[];
  output: VatLine[];
  outputVatCents: Cents;
  outputBasisCents: Cents;
  reverseCharge: { basisCents: Cents; outputVatCents: Cents; inputVatCents: Cents };
  input: VatLine[];
  inputVatCents: Cents;
  inputBasisCents: Cents;
  nonDeductibleVatCents: Cents;
  reviewVatCents: Cents;
  linesNeedingReview: number;
  adjustmentsCents: Cents;
  /** output + RC output − input − RC input + adjustments. Positive = payable. */
  estimateCents: Cents;
  rulesVersion: string;
  /** Why the estimate cannot be relied on yet, if anything. */
  caveats: string[];
}

export function computeVatPosition(periodKey: string, rows: readonly VatMonthlyRow[], adjustmentsCents: Cents = 0): VatPosition {
  const months = Array.from(new Set(rows.map((r) => r.period_key))).sort();
  const byCode = new Map<string, VatMonthlyRow[]>();
  for (const r of rows) {
    const list = byCode.get(r.tax_code) ?? [];
    list.push(r);
    byCode.set(r.tax_code, list);
  }
  const output: VatLine[] = [];
  const input: VatLine[] = [];
  let outputVat = 0, outputBasis = 0, inputVat = 0, inputBasis = 0, nonDed = 0, review = 0, rcBasis = 0, rcOut = 0, rcIn = 0, needing = 0;
  for (const [code, list] of Array.from(byCode.entries())) {
    const meta = taxCode(code);
    const label = meta?.label ?? code;
    const rateBp = list[0].rate_bp;
    const sum = (f: (r: VatMonthlyRow) => number) => list.reduce((a, r) => a + Number(f(r) || 0), 0);
    const ob = sum((r) => r.output_basis_cents), ov = sum((r) => r.output_vat_cents);
    const ib = sum((r) => r.input_basis_cents), iv = sum((r) => r.input_vat_cents);
    needing += sum((r) => r.lines_needing_review);
    nonDed += sum((r) => r.non_deductible_vat_cents);
    review += sum((r) => r.review_vat_cents);
    if (meta?.treatment === 'reverse_charge') {
      rcBasis += sum((r) => r.rc_basis_cents);
      rcOut += sum((r) => r.rc_output_vat_cents);
      rcIn += sum((r) => r.rc_input_vat_cents);
      continue;
    }
    if (meta?.treatment === 'review_required') {
      // Counted in review_vat_cents only; never in a figure.
      continue;
    }
    if (ob !== 0 || ov !== 0) {
      output.push({ taxCode: code, label, rateBp, basisCents: ob, vatCents: ov });
      outputBasis += ob;
      outputVat += ov;
    }
    if (ib !== 0 || iv !== 0) {
      input.push({ taxCode: code, label, rateBp, basisCents: ib, vatCents: iv });
      inputBasis += ib;
      inputVat += iv;
    }
  }
  output.sort((a, b) => b.rateBp - a.rateBp || a.taxCode.localeCompare(b.taxCode));
  input.sort((a, b) => b.rateBp - a.rateBp || a.taxCode.localeCompare(b.taxCode));
  const caveats: string[] = [];
  if (needing > 0) caveats.push(`${needing} line${needing === 1 ? '' : 's'} still need${needing === 1 ? 's' : ''} a tax classification; their VAT is excluded.`);
  if (review !== 0) caveats.push('Input VAT with undecided deductibility is excluded from the estimate.');
  const estimate = outputVat + rcOut - inputVat - rcIn + adjustmentsCents;
  return {
    periodKey, months, output, outputVatCents: outputVat, outputBasisCents: outputBasis,
    reverseCharge: { basisCents: rcBasis, outputVatCents: rcOut, inputVatCents: rcIn },
    input, inputVatCents: inputVat, inputBasisCents: inputBasis, nonDeductibleVatCents: nonDed, reviewVatCents: review,
    linesNeedingReview: needing, adjustmentsCents, estimateCents: estimate, rulesVersion: VAT_RULES_VERSION, caveats,
  };
}

/** A structured basis for the append-only estimate row. */
export function vatBasis(p: VatPosition): Record<string, unknown> {
  return {
    rules: p.rulesVersion,
    months: p.months,
    output: p.output.map((l) => ({ code: l.taxCode, basis: l.basisCents, vat: l.vatCents })),
    input: p.input.map((l) => ({ code: l.taxCode, basis: l.basisCents, vat: l.vatCents })),
    reverse_charge: p.reverseCharge,
    non_deductible: p.nonDeductibleVatCents,
    excluded_review_vat: p.reviewVatCents,
    lines_needing_review: p.linesNeedingReview,
    adjustments: p.adjustmentsCents,
    estimate: p.estimateCents,
  };
}
