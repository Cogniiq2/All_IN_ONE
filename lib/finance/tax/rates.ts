/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMPANY TAX RATES — effective-dated, source-referenced, review-flagged.
 *
 * Mirrors `bolagio_finance_tax_rates`. The database rows win at runtime (an
 * administrator can add a confirmed Hebesatz row without a deploy); this
 * mirror is the seed and the fallback for pure computations and fixtures.
 *
 * Nothing here is a legal opinion. Each row names the paragraph it rests on
 * and whether it is CONFIRMED for the period or merely seeded pending
 * confirmation (`reviewRequired`). docs/finance/tax-sources.md carries the
 * research notes and dates.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BasisPoints } from '@/lib/finance/money';
import type { IsoDate } from '@/lib/finance/periods';

export type CompanyTaxRateType = 'kst' | 'soli' | 'gewst_messzahl' | 'gewst_hebesatz';

export interface TaxRateRow {
  taxType: CompanyTaxRateType;
  jurisdiction: string;
  rateBp: BasisPoints;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  legalReference: string;
  sourceUrl: string | null;
  reviewRequired: boolean;
  note: string | null;
}

export const BAYREUTH = 'DE-BY-Bayreuth';

export const TAX_RATE_SEED: readonly TaxRateRow[] = [
  { taxType: 'kst', jurisdiction: 'DE', rateBp: 1500, effectiveFrom: '2008-01-01', effectiveTo: '2027-12-31', legalReference: '§ 23 Abs. 1 KStG', sourceUrl: 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', reviewRequired: false, note: null },
  { taxType: 'kst', jurisdiction: 'DE', rateBp: 1400, effectiveFrom: '2028-01-01', effectiveTo: '2028-12-31', legalReference: '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', sourceUrl: 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', reviewRequired: true, note: 'scheduled step-down; confirm before use' },
  { taxType: 'kst', jurisdiction: 'DE', rateBp: 1300, effectiveFrom: '2029-01-01', effectiveTo: '2029-12-31', legalReference: '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', sourceUrl: 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', reviewRequired: true, note: 'scheduled step-down; confirm before use' },
  { taxType: 'kst', jurisdiction: 'DE', rateBp: 1200, effectiveFrom: '2030-01-01', effectiveTo: '2030-12-31', legalReference: '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', sourceUrl: 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', reviewRequired: true, note: 'scheduled step-down; confirm before use' },
  { taxType: 'kst', jurisdiction: 'DE', rateBp: 1100, effectiveFrom: '2031-01-01', effectiveTo: '2031-12-31', legalReference: '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', sourceUrl: 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', reviewRequired: true, note: 'scheduled step-down; confirm before use' },
  { taxType: 'kst', jurisdiction: 'DE', rateBp: 1000, effectiveFrom: '2032-01-01', effectiveTo: null, legalReference: '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', sourceUrl: 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', reviewRequired: true, note: 'scheduled step-down; confirm before use' },
  { taxType: 'soli', jurisdiction: 'DE', rateBp: 550, effectiveFrom: '1998-01-01', effectiveTo: null, legalReference: '§ 4 Satz 1 SolzG 1995 (5,5 % of the KSt)', sourceUrl: 'https://www.gesetze-im-internet.de/solzg_1995/__4.html', reviewRequired: false, note: null },
  { taxType: 'gewst_messzahl', jurisdiction: 'DE', rateBp: 350, effectiveFrom: '2008-01-01', effectiveTo: null, legalReference: '§ 11 Abs. 2 GewStG', sourceUrl: 'https://www.gesetze-im-internet.de/gewstg/__11.html', reviewRequired: false, note: null },
  { taxType: 'gewst_hebesatz', jurisdiction: BAYREUTH, rateBp: 39000, effectiveFrom: '2020-01-01', effectiveTo: null, legalReference: 'Haushaltssatzung der Stadt Bayreuth (§ 16 GewStG)', sourceUrl: 'https://www.bayreuth.de', reviewRequired: true, note: 'CONFIRM: Bayreuth Hebesatz per year; 390 % is the seeded placeholder' },
];

export interface ResolvedRate {
  rateBp: BasisPoints;
  reviewRequired: boolean;
  legalReference: string;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  /** Where the value came from: the database, or this module's seed. */
  origin: 'database' | 'seed';
}

/**
 * The rate in force on a date. Rows from the database (if given) take
 * precedence over the seed for the same (type, jurisdiction, effectiveFrom);
 * the most recent `effectiveFrom` not after `on` wins.
 */
export function resolveRate(taxType: CompanyTaxRateType, on: IsoDate, rows: readonly TaxRateRow[] | null = null, jurisdiction = taxType === 'gewst_hebesatz' ? BAYREUTH : 'DE'): ResolvedRate | null {
  const merged = new Map<string, { row: TaxRateRow; origin: 'database' | 'seed' }>();
  for (const row of TAX_RATE_SEED) if (row.taxType === taxType && row.jurisdiction === jurisdiction) merged.set(row.effectiveFrom, { row, origin: 'seed' });
  for (const row of rows ?? []) if (row.taxType === taxType && row.jurisdiction === jurisdiction) merged.set(row.effectiveFrom, { row, origin: 'database' });
  const candidates = Array.from(merged.values())
    .filter(({ row }) => row.effectiveFrom <= on && (row.effectiveTo === null || row.effectiveTo >= on))
    .sort((a, b) => b.row.effectiveFrom.localeCompare(a.row.effectiveFrom));
  const hit = candidates[0];
  if (!hit) return null;
  return { rateBp: hit.row.rateBp, reviewRequired: hit.row.reviewRequired, legalReference: hit.row.legalReference, effectiveFrom: hit.row.effectiveFrom, effectiveTo: hit.row.effectiveTo, origin: hit.origin };
}
