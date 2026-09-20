/**
 * ══════════════════════════════════════════════════════════════════════════
 * TAX CODES — the effective-dated catalogue, mirrored from the migration.
 *
 * The database rows (`bolagio_finance_tax_codes`) are the runtime truth; this
 * module carries the same seed so pure code (arithmetic, fixtures, tests,
 * classification rules) can reason about a code without a database round
 * trip, and so `tests/finance/tax-codes.test.ts` can prove the two agree.
 *
 * Rates are as researched on 2026-09-20 (docs/finance/tax-sources.md). A code
 * whose legal footing is not settled is `reviewRequired` and never verifies.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BasisPoints } from '@/lib/finance/money';
import type { IsoDate } from '@/lib/finance/periods';

export type TaxSide = 'output' | 'input' | 'both';
export type TaxTreatment = 'standard' | 'reduced' | 'reverse_charge' | 'exempt' | 'outside_scope' | 'review_required';

export interface TaxCode {
  code: string;
  label: string;
  description: string;
  jurisdiction: 'DE';
  side: TaxSide;
  treatment: TaxTreatment;
  rateBp: BasisPoints;
  reverseCharge: boolean;
  reviewRequired: boolean;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  legalReference: string;
  sourceUrl: string | null;
}

export const REVIEW_REQUIRED_CODE = 'DE_REVIEW_REQUIRED';

export const TAX_CODES: readonly TaxCode[] = [
  { code: 'DE_ACCOMMODATION_REDUCED', label: 'Accommodation 7 %', description: 'Short-term letting of living and sleeping rooms to strangers. Services not directly serving the accommodation are excluded (Aufteilungsgebot).', jurisdiction: 'DE', side: 'output', treatment: 'reduced', rateBp: 700, reverseCharge: false, reviewRequired: false, effectiveFrom: '2010-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 2 Nr. 11 UStG', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__12.html' },
  { code: 'DE_STANDARD', label: 'Standard 19 %', description: 'Standard rate.', jurisdiction: 'DE', side: 'both', treatment: 'standard', rateBp: 1900, reverseCharge: false, reviewRequired: false, effectiveFrom: '2007-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 1 UStG', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__12.html' },
  { code: 'DE_REDUCED', label: 'Reduced 7 %', description: 'Reduced rate for Anlage 2 goods and other § 12 Abs. 2 supplies.', jurisdiction: 'DE', side: 'both', treatment: 'reduced', rateBp: 700, reverseCharge: false, reviewRequired: false, effectiveFrom: '2007-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 2 Nr. 1 UStG, Anlage 2', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html' },
  { code: 'DE_FOOD_REDUCED', label: 'Food items 7 %', description: 'Delivery of food items listed in Anlage 2 (snacks, chocolate, fruit). Beverages are NOT included except milk / milk mixes ≥ 75 % milk and water under Anlage 2.', jurisdiction: 'DE', side: 'both', treatment: 'reduced', rateBp: 700, reverseCharge: false, reviewRequired: false, effectiveFrom: '2007-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 2 Nr. 1 UStG, Anlage 2', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html' },
  { code: 'DE_BEVERAGE_STANDARD', label: 'Beverages 19 %', description: 'Delivery of beverages — standard rate.', jurisdiction: 'DE', side: 'both', treatment: 'standard', rateBp: 1900, reverseCharge: false, reviewRequired: false, effectiveFrom: '2007-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 1 UStG; Anlage 2 exclusions', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__12.html' },
  { code: 'DE_ANCILLARY_STANDARD', label: 'Accommodation ancillary 19 %', description: 'Services with a stay that do not directly serve the accommodation.', jurisdiction: 'DE', side: 'output', treatment: 'standard', rateBp: 1900, reverseCharge: false, reviewRequired: false, effectiveFrom: '2010-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 2 Nr. 11 Satz 2 UStG', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__12.html' },
  { code: 'DE_ANCILLARY_REVIEW', label: 'Accommodation ancillary — review', description: 'A charge sold with the stay whose classification (7 % vs 19 %) the adviser has not decided — e.g. a mandatory final-cleaning fee.', jurisdiction: 'DE', side: 'output', treatment: 'review_required', rateBp: 0, reverseCharge: false, reviewRequired: true, effectiveFrom: '2010-01-01', effectiveTo: null, legalReference: '§ 12 Abs. 2 Nr. 11 UStG; BFH XI R 11/23, 13/23, 14/23', sourceUrl: 'https://www.bundesfinanzhof.de' },
  { code: 'DE_REVERSE_CHARGE', label: 'Reverse charge 19 % (§ 13b)', description: 'B2B service from an entrepreneur established abroad: recipient owes 19 % on the net and deducts it where entitled.', jurisdiction: 'DE', side: 'input', treatment: 'reverse_charge', rateBp: 1900, reverseCharge: true, reviewRequired: false, effectiveFrom: '2010-01-01', effectiveTo: null, legalReference: '§ 13b Abs. 1, 2 Nr. 1, 5 UStG; § 15 Abs. 1 Nr. 4 UStG', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__13b.html' },
  { code: 'DE_EXEMPT', label: 'Exempt 0 %', description: 'Exempt without input-VAT deduction (bank, insurance, payment-service fees).', jurisdiction: 'DE', side: 'both', treatment: 'exempt', rateBp: 0, reverseCharge: false, reviewRequired: false, effectiveFrom: '2007-01-01', effectiveTo: null, legalReference: '§ 4 Nr. 8, Nr. 10 UStG', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__4.html' },
  { code: 'DE_OUTSIDE_SCOPE', label: 'Outside scope', description: 'Not a taxable supply: taxes, fines, COGS, transfers, deposits.', jurisdiction: 'DE', side: 'both', treatment: 'outside_scope', rateBp: 0, reverseCharge: false, reviewRequired: false, effectiveFrom: '2007-01-01', effectiveTo: null, legalReference: '§ 1 UStG', sourceUrl: 'https://www.gesetze-im-internet.de/ustg_1980/__1.html' },
  { code: REVIEW_REQUIRED_CODE, label: 'Review required', description: 'Tax treatment not yet determined. Parked until classified; never counts toward any VAT figure.', jurisdiction: 'DE', side: 'both', treatment: 'review_required', rateBp: 0, reverseCharge: false, reviewRequired: true, effectiveFrom: '2000-01-01', effectiveTo: null, legalReference: '—', sourceUrl: null },
];

const BY_CODE = new Map(TAX_CODES.map((c) => [c.code, c]));

export function taxCode(code: string): TaxCode | undefined {
  return BY_CODE.get(code);
}

export function requireTaxCode(code: string): TaxCode {
  const c = BY_CODE.get(code);
  if (!c) throw new Error(`unknown tax code ${code}`);
  return c;
}

export function isEffective(code: TaxCode, on: IsoDate): boolean {
  return on >= code.effectiveFrom && (code.effectiveTo === null || on <= code.effectiveTo);
}

/** Codes usable on a date, for a side. */
export function effectiveTaxCodes(on: IsoDate, side?: TaxSide): TaxCode[] {
  return TAX_CODES.filter((c) => isEffective(c, on) && (!side || c.side === 'both' || c.side === side));
}

/** Does a line under this code contribute to output VAT, input VAT, both (reverse charge) or nothing? */
export function contributes(code: TaxCode): { output: boolean; input: boolean; reverseCharge: boolean } {
  switch (code.treatment) {
    case 'standard':
    case 'reduced':
      return { output: code.side !== 'input', input: code.side !== 'output', reverseCharge: false };
    case 'reverse_charge':
      return { output: true, input: true, reverseCharge: true };
    default:
      return { output: false, input: false, reverseCharge: false };
  }
}

export type InputVatTreatment = 'deductible' | 'partially_deductible' | 'not_deductible' | 'reverse_charge' | 'review_required' | 'unknown' | 'not_applicable';

export const INPUT_VAT_TREATMENTS: readonly InputVatTreatment[] = ['deductible', 'partially_deductible', 'not_deductible', 'reverse_charge', 'review_required', 'unknown', 'not_applicable'];

export function isInputVatTreatment(value: unknown): value is InputVatTreatment {
  return typeof value === 'string' && (INPUT_VAT_TREATMENTS as readonly string[]).includes(value);
}
