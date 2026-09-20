/**
 * ══════════════════════════════════════════════════════════════════════════
 * CATEGORISATION RULES — deterministic suggestions, never silent tax law.
 *
 * Given what is known about an incoming expense (counterparty, country, VAT
 * id, description, source, VAT printed on the invoice) and the counterparty
 * registry, propose category, tax code, input-VAT treatment and allocation,
 * each with a classification level:
 *
 *   auto_verified   every input matched a counterparty rule marked
 *                   `auto_verify`, the printed VAT agrees with the code, and
 *                   the code is not review-required
 *   suggested       a rule matched but something is missing (no VAT printed,
 *                   foreign supplier without VAT id, mixed-use category)
 *   needs_review    no rule, or the rule leads to a review-required code
 *
 * Ambiguity is preserved on purpose: an Amazon invoice is `needs_review`
 * unless line data says otherwise; a foreign supplier is `suggested`
 * reverse charge only when its VAT id is known and the invoice carries no VAT.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { category as categoryOf } from '@/lib/finance/categories';
import { requireTaxCode, REVIEW_REQUIRED_CODE, type InputVatTreatment } from '@/lib/finance/tax-codes';
import type { CounterpartyRow } from '@/lib/finance/rows';
import { vatFromNet } from '@/lib/finance/money';

export type Classification = 'auto_verified' | 'suggested' | 'needs_review';

export interface ClassificationInput {
  counterpartyName?: string | null;
  counterpartyId?: string | null;
  counterpartyCountry?: string | null;
  counterpartyVatId?: string | null;
  description?: string | null;
  /** Net and VAT as printed on the invoice, when known. */
  netCents?: number | null;
  vatCents?: number | null;
  /** Category the operator picked, if any. */
  categoryHint?: string | null;
  sourceType?: string | null;
}

export interface ClassificationResult {
  counterpartyId: string | null;
  category: string;
  taxCode: string;
  rateBp: number;
  inputVatTreatment: InputVatTreatment;
  allocationMethod: string;
  classification: Classification;
  /** Human sentences explaining the decision, in order. */
  reasons: string[];
}

const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

/** Marketplaces and mixed-basket suppliers that never auto-verify. */
const AMBIGUOUS_SUPPLIERS = [/amazon/i, /ebay/i, /ikea/i, /lidl/i, /aldi/i, /rewe/i, /edeka/i, /metro/i, /obi/i, /hornbach/i, /bauhaus/i, /dm[- ]drogerie/i, /rossmann/i, /kaufland/i];

export function findCounterparty(name: string | null | undefined, registry: readonly CounterpartyRow[]): CounterpartyRow | null {
  if (!name) return null;
  const n = name.toLowerCase();
  return registry.find((c) => c.active && (c.name.toLowerCase() === n || c.match_patterns.some((p) => p && n.includes(p.toLowerCase())))) ?? null;
}

export function classifyExpense(input: ClassificationInput, registry: readonly CounterpartyRow[]): ClassificationResult {
  const reasons: string[] = [];
  const cp = input.counterpartyId ? registry.find((c) => c.id === input.counterpartyId) ?? null : findCounterparty(input.counterpartyName, registry);
  const country = (input.counterpartyCountry ?? cp?.country ?? null)?.toUpperCase() ?? null;
  const vatId = input.counterpartyVatId ?? cp?.vat_id ?? null;
  const ambiguousName = AMBIGUOUS_SUPPLIERS.some((re) => re.test(input.counterpartyName ?? cp?.name ?? ''));

  let category = input.categoryHint ?? cp?.default_category ?? 'other';
  if (!categoryOf(category)) category = 'other';
  const catMeta = categoryOf(category)!;
  reasons.push(cp ? `Counterparty "${cp.name}" recognised${input.categoryHint ? '' : `; default category ${catMeta.label}`}.` : input.categoryHint ? `Category ${catMeta.label} chosen by the operator.` : 'No counterparty rule matched; category defaults to Other.');

  let level: Classification = cp ? 'suggested' : 'needs_review';
  let taxCode = cp?.default_tax_code ?? catMeta.defaultTaxCode ?? REVIEW_REQUIRED_CODE;
  let treatment: InputVatTreatment = (cp?.default_input_vat as InputVatTreatment | null) ?? 'review_required';

  /* Foreign supplier logic (§ 13b UStG) */
  const foreign = country !== null && country !== 'DE';
  const printedVat = input.vatCents ?? null;
  if (foreign) {
    if (printedVat && printedVat > 0) {
      taxCode = REVIEW_REQUIRED_CODE;
      treatment = 'review_required';
      level = 'needs_review';
      reasons.push(`Supplier is in ${country} but the invoice shows VAT (${printedVat} cents): reverse charge does not fit; the invoice may carry foreign VAT that is not deductible in Germany. Review.`);
    } else if (vatId || !EU.has(country)) {
      taxCode = 'DE_REVERSE_CHARGE';
      treatment = 'reverse_charge';
      level = cp?.auto_verify ? 'auto_verified' : 'suggested';
      reasons.push(`Supplier established in ${country}${vatId ? ` (VAT id ${vatId})` : ' (third country)'}, no VAT on the invoice: reverse charge under § 13b Abs. 1/2 Nr. 1 UStG is suggested; the recipient owes 19 % and deducts it (§ 15 Abs. 1 Nr. 4).`);
    } else {
      taxCode = REVIEW_REQUIRED_CODE;
      treatment = 'review_required';
      level = 'needs_review';
      reasons.push(`Supplier is in ${country} (EU) but no VAT id is on file: whether reverse charge applies depends on the invoice. Review.`);
    }
  } else {
    /* Domestic */
    const code = requireTaxCode(taxCode);
    if (code.reviewRequired) {
      level = 'needs_review';
      reasons.push(`The default tax code for ${catMeta.label} is review-required: a person decides the rate.`);
    } else if (input.netCents !== null && input.netCents !== undefined && printedVat !== null) {
      const expected = vatFromNet(input.netCents, code.rateBp);
      if (Math.abs(expected - printedVat) <= 1) {
        reasons.push(`Printed VAT ${printedVat} cents agrees with ${code.label}.`);
        if (cp?.auto_verify && !ambiguousName) level = 'auto_verified';
      } else {
        const alt = ['DE_STANDARD', 'DE_REDUCED', 'DE_EXEMPT'].find((c) => Math.abs(vatFromNet(input.netCents!, requireTaxCode(c).rateBp) - printedVat) <= 1);
        if (alt) {
          taxCode = alt;
          level = 'suggested';
          reasons.push(`Printed VAT ${printedVat} cents does not fit ${code.label} but fits ${requireTaxCode(alt).label}; suggested, not verified.`);
        } else {
          taxCode = REVIEW_REQUIRED_CODE;
          treatment = 'review_required';
          level = 'needs_review';
          reasons.push(`Printed VAT ${printedVat} cents fits no German rate on a net of ${input.netCents} cents (a mixed-rate invoice?). Split the lines and review.`);
        }
      }
    } else {
      reasons.push('No VAT amount known for the line; the code is suggested from the rule only.');
      level = level === 'needs_review' ? 'needs_review' : 'suggested';
    }
    if (treatment === 'review_required' && !code.reviewRequired) {
      treatment = code.treatment === 'exempt' || code.treatment === 'outside_scope' ? 'not_applicable' : 'deductible';
      if (!cp) level = 'needs_review';
    }
  }

  if (ambiguousName) {
    if (level === 'auto_verified') level = 'suggested';
    reasons.push('Marketplace / mixed-basket supplier: line contents decide the rate and the category; never auto-verified.');
  }
  if (input.sourceType === 'import' && level === 'auto_verified') {
    level = 'suggested';
    reasons.push('Imported from a statement without the invoice document: suggested until the document is linked.');
  }

  const allocation = cp?.default_allocation ?? (catMeta.requiresUnit ? 'manual' : 'unallocated');
  return { counterpartyId: cp?.id ?? null, category, taxCode, rateBp: requireTaxCode(taxCode).rateBp, inputVatTreatment: treatment, allocationMethod: allocation, classification: level, reasons };
}
