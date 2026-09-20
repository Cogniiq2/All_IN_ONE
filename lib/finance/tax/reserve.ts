/**
 * ══════════════════════════════════════════════════════════════════════════
 * TAX RESERVE AND FREE CASH — the flagship figures, kept honest.
 *
 *   required reserve   Σ over tax types of max(0, estimated liability − paid)
 *                      where the "estimated liability" is the latest stage of
 *                      the figure (assessed > filed > reviewed > estimate)
 *   held reserve       what management DECLARED as set aside (a row in
 *                      bolagio_finance_reserves), never inferred from a bank
 *   gap                required − held (0 when over-reserved)
 *   coverage           held / required
 *
 *   free cash          cash − required tax reserve − open supplier liabilities
 *                      − other declared reserves
 *
 * Nothing here says a bank account exists. "Held" is a statement by a
 * person, timestamped; "required" is arithmetic over estimates whose
 * provenance the UI shows.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Cents } from '@/lib/finance/money';

export type TaxStage = 'system_estimate' | 'accountant_reviewed' | 'filed' | 'assessed' | 'paid';

export const STAGE_RANK: Readonly<Record<TaxStage, number>> = { system_estimate: 0, accountant_reviewed: 1, filed: 2, assessed: 3, paid: 4 };

export interface TaxLiabilityInput {
  taxType: 'vat' | 'kst' | 'soli' | 'gewst' | 'other';
  periodKey: string;
  /** The best available figure and its stage. */
  amountCents: Cents;
  stage: TaxStage;
  /** Advance payments and payments recorded against this period. */
  paidCents: Cents;
  periodStatus: string;
}

export interface ReserveLine {
  taxType: TaxLiabilityInput['taxType'];
  periodKey: string;
  stage: TaxStage;
  liabilityCents: Cents;
  paidCents: Cents;
  remainingCents: Cents;
}

export interface ReserveReport {
  lines: ReserveLine[];
  requiredCents: Cents;
  heldCents: Cents;
  gapCents: Cents;
  coverage: number | null;
  byTaxType: Array<{ taxType: TaxLiabilityInput['taxType']; requiredCents: Cents }>;
  /** True when at least one line is only a system estimate. */
  containsEstimates: boolean;
}

export function computeReserve(liabilities: readonly TaxLiabilityInput[], heldCents: Cents): ReserveReport {
  const lines: ReserveLine[] = liabilities
    .filter((l) => l.periodStatus !== 'closed')
    .map((l) => ({ taxType: l.taxType, periodKey: l.periodKey, stage: l.stage, liabilityCents: l.amountCents, paidCents: l.paidCents, remainingCents: Math.max(0, l.amountCents - l.paidCents) }))
    .filter((l) => l.remainingCents > 0 || l.liabilityCents < 0);
  // A negative VAT period (refund claim) reduces the reserve only when it is
  // at least reviewed: a system-estimated refund is not cash yet.
  const required = lines.reduce((s, l) => s + (l.liabilityCents < 0 ? (STAGE_RANK[l.stage] >= 1 ? Math.max(l.liabilityCents, -s) : 0) : l.remainingCents), 0);
  const byType = new Map<TaxLiabilityInput['taxType'], Cents>();
  for (const l of lines) byType.set(l.taxType, (byType.get(l.taxType) ?? 0) + (l.liabilityCents < 0 ? 0 : l.remainingCents));
  const gap = Math.max(0, required - heldCents);
  return {
    lines,
    requiredCents: Math.max(0, required),
    heldCents,
    gapCents: gap,
    coverage: required > 0 ? heldCents / required : null,
    byTaxType: Array.from(byType.entries()).map(([taxType, requiredCents]) => ({ taxType, requiredCents })).sort((a, b) => b.requiredCents - a.requiredCents),
    containsEstimates: lines.some((l) => l.stage === 'system_estimate'),
  };
}

export interface FreeCashInput {
  cashCents: Cents | null;
  taxReserveRequiredCents: Cents;
  openLiabilitiesCents: Cents;
  otherReservesCents: Cents;
}

export interface FreeCashReport {
  cashCents: Cents | null;
  taxReserveCents: Cents;
  openLiabilitiesCents: Cents;
  otherReservesCents: Cents;
  freeCashCents: Cents | null;
  steps: Array<{ label: string; cents: Cents | null }>;
}

export function computeFreeCash(i: FreeCashInput): FreeCashReport {
  const free = i.cashCents === null ? null : i.cashCents - i.taxReserveRequiredCents - i.openLiabilitiesCents - i.otherReservesCents;
  return {
    cashCents: i.cashCents,
    taxReserveCents: i.taxReserveRequiredCents,
    openLiabilitiesCents: i.openLiabilitiesCents,
    otherReservesCents: i.otherReservesCents,
    freeCashCents: free,
    steps: [
      { label: 'Cash', cents: i.cashCents },
      { label: '− estimated tax reserve required', cents: -i.taxReserveRequiredCents },
      { label: '− open supplier liabilities', cents: -i.openLiabilitiesCents },
      { label: '− other declared reserves', cents: -i.otherReservesCents },
      { label: '= free cash', cents: free },
    ],
  };
}

/** Pick the governing figure among the stages recorded for one period. */
export function governingStage<T extends { stage: TaxStage; computedAt: string }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best || STAGE_RANK[r.stage] > STAGE_RANK[best.stage] || (STAGE_RANK[r.stage] === STAGE_RANK[best.stage] && r.computedAt > best.computedAt)) best = r;
  }
  return best;
}
