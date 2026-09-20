/**
 * MANAGEMENT P&L — the hierarchy, from monthly category aggregates.
 *
 *   REVENUE                      accommodation · minibar · other
 *   DIRECT OPERATING COSTS       cleaning · laundry · supplies · OTA · fees · COGS
 *   = CONTRIBUTION MARGIN
 *   PROPERTY OPERATING COSTS     utilities · repairs · internet · insurance …
 *   = PROPERTY OPERATING RESULT
 *   GENERAL COMPANY COSTS        software · professional · marketing · bank …
 *   = OPERATING RESULT
 *   depreciation · interest · other adjustments
 *   = RESULT BEFORE TAX
 *   estimated company taxes (from the tax engine, labelled estimate)
 *   = ESTIMATED RESULT AFTER TAX
 *
 * Signs: revenue positive, costs positive as shown, subtotals as computed.
 * Every line carries its category codes so the UI can drill to the ledger.
 * Balance items (asset acquisition, VAT settlement) are excluded — they are
 * not P&L, and the export says so.
 */

import { CATEGORIES, PL_GROUP_LABEL, type PlGroup } from '@/lib/finance/categories';
import type { Cents } from '@/lib/finance/money';
import type { PlMonthlyRow } from '@/lib/finance/rows';

export interface PlLine {
  category: string;
  label: string;
  cents: Cents;
  transactions: number;
  /** Actual (booked_on ≤ today) vs committed (future service dates) is decided by the caller's range; the line reports the range it covers. */
}

export interface PlSection {
  group: PlGroup;
  label: string;
  lines: PlLine[];
  totalCents: Cents;
}

export interface PlSubtotal {
  key: 'revenue' | 'contribution' | 'property_result' | 'operating_result' | 'result_before_tax' | 'result_after_tax';
  label: string;
  cents: Cents;
  /** Provenance for the badge: actual, or estimate (when taxes are estimated). */
  provenance: 'actual' | 'estimate';
}

export interface PlReport {
  from: string;
  to: string;
  months: string[];
  sections: PlSection[];
  subtotals: PlSubtotal[];
  revenueCents: Cents;
  directCostsCents: Cents;
  contributionCents: Cents;
  propertyCostsCents: Cents;
  propertyResultCents: Cents;
  companyCostsCents: Cents;
  operatingResultCents: Cents;
  belowOperatingCents: Cents;
  resultBeforeTaxCents: Cents;
  estimatedTaxesCents: Cents | null;
  resultAfterTaxCents: Cents | null;
  /** Category → net for drill-downs by month. */
  byMonth: Array<{ month: string; revenueCents: Cents; costsCents: Cents; operatingResultCents: Cents }>;
}

const ORDER: PlGroup[] = ['revenue', 'direct_cost', 'property_cost', 'company_cost', 'depreciation', 'interest', 'other_adjustment'];

export function buildPl(rows: readonly PlMonthlyRow[], from: string, to: string, estimatedTaxesCents: Cents | null = null, filter: { unitId?: string | null; channel?: string | null } = {}): PlReport {
  const relevant = rows.filter((r) => (!filter.unitId || r.unit_id === filter.unitId) && (!filter.channel || r.channel === filter.channel));
  const byCat = new Map<string, { cents: Cents; tx: number }>();
  const months = new Set<string>();
  const perMonth = new Map<string, { rev: Cents; cost: Cents }>();
  for (const r of relevant) {
    months.add(r.period_key);
    const meta = CATEGORIES.find((c) => c.code === r.category);
    if (!meta || meta.plGroup === 'balance' || meta.plGroup === 'excluded') continue;
    // Revenue categories: net as posted (positive). Expense categories: net as posted (positive cost). Neutral: signed.
    const cents = Number(r.net_cents);
    const cur = byCat.get(r.category) ?? { cents: 0, tx: 0 };
    cur.cents += cents;
    cur.tx += Number(r.transactions);
    byCat.set(r.category, cur);
    const pm = perMonth.get(r.period_key) ?? { rev: 0, cost: 0 };
    if (meta.kind === 'revenue') pm.rev += cents; else pm.cost += cents;
    perMonth.set(r.period_key, pm);
  }
  const sections: PlSection[] = ORDER.map((group) => {
    const lines = CATEGORIES.filter((c) => c.plGroup === group).sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ category: c.code, label: c.label, cents: byCat.get(c.code)?.cents ?? 0, transactions: byCat.get(c.code)?.tx ?? 0 }))
      .filter((l) => l.cents !== 0 || l.transactions !== 0);
    return { group, label: PL_GROUP_LABEL[group], lines, totalCents: lines.reduce((s, l) => s + l.cents, 0) };
  });
  const total = (g: PlGroup) => sections.find((s) => s.group === g)?.totalCents ?? 0;
  const revenue = total('revenue');
  const direct = total('direct_cost');
  const contribution = revenue - direct;
  const property = total('property_cost');
  const propertyResult = contribution - property;
  const company = total('company_cost');
  const operating = propertyResult - company;
  const below = total('depreciation') + total('interest') + total('other_adjustment');
  const beforeTax = operating - below;
  const afterTax = estimatedTaxesCents === null ? null : beforeTax - estimatedTaxesCents;
  const subtotals: PlSubtotal[] = [
    { key: 'revenue', label: 'Revenue', cents: revenue, provenance: 'actual' },
    { key: 'contribution', label: 'Contribution margin', cents: contribution, provenance: 'actual' },
    { key: 'property_result', label: 'Property operating result', cents: propertyResult, provenance: 'actual' },
    { key: 'operating_result', label: 'Operating result', cents: operating, provenance: 'actual' },
    { key: 'result_before_tax', label: 'Result before tax', cents: beforeTax, provenance: 'actual' },
    ...(afterTax === null ? [] : [{ key: 'result_after_tax' as const, label: 'Estimated result after tax', cents: afterTax, provenance: 'estimate' as const }]),
  ];
  return {
    from, to, months: Array.from(months).sort(), sections, subtotals,
    revenueCents: revenue, directCostsCents: direct, contributionCents: contribution, propertyCostsCents: property, propertyResultCents: propertyResult,
    companyCostsCents: company, operatingResultCents: operating, belowOperatingCents: below, resultBeforeTaxCents: beforeTax,
    estimatedTaxesCents, resultAfterTaxCents: afterTax,
    byMonth: Array.from(perMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, revenueCents: v.rev, costsCents: v.cost, operatingResultCents: v.rev - v.cost })),
  };
}
