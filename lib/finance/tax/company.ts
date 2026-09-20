/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMPANY TAX ESTIMATES — Körperschaftsteuer, Solidaritätszuschlag, Gewerbesteuer.
 *
 * Pure, explainable, effective-dated. Every result carries the rate rows it
 * used, the adjustments it applied and a list of caveats; the UI shows the
 * caveats beside the figure and the estimate is labelled `system_estimate`
 * until the adviser records another stage.
 *
 *   KSt   (§ 23 Abs. 1 KStG)
 *         management result
 *         + non-deductible expenses (§ 10 KStG, § 4 Abs. 5 EStG, GewSt § 4 Abs. 5b EStG)
 *         − tax-free income
 *         − loss carry-forward used (§ 10d EStG; § 8c/8d KStG restrictions are the adviser's)
 *         = estimated taxable income (zu versteuerndes Einkommen), floored at 0
 *         × KSt rate in force for the fiscal year
 *
 *   Soli  (§ 3 Abs. 1 Nr. 1, § 4 SolzG): 5,5 % OF THE KSt — never of the profit.
 *         No Freigrenze for corporations (§ 3 Abs. 3 SolzG applies to income tax).
 *
 *   GewSt (§§ 7–11, 16 GewStG)
 *         taxable income per KStG (before the loss deduction of § 10d EStG)
 *         + Hinzurechnungen (§ 8 Nr. 1: 25 % of the sum of financing costs
 *           exceeding the € 200,000 Freibetrag — the sum being 100 % of
 *           interest, 20 % of rents for movable assets, 50 % of rents for
 *           immovable assets, 25 % of licence fees; entered by the adviser)
 *         − Kürzungen (§ 9 Nr. 1: 1,2 % of 140 % of the Einheitswert of own
 *           real property; entered by the adviser)
 *         − trade loss carry-forward (§ 10a GewStG)
 *         = Gewerbeertrag, rounded DOWN to a full € 100 (§ 11 Abs. 1 Satz 3)
 *         NO Freibetrag for a GmbH (§ 11 Abs. 1 Satz 3 Nr. 1 names natural
 *         persons and partnerships only)
 *         × Steuermesszahl 3,5 % (§ 11 Abs. 2)  = Steuermessbetrag
 *         × Hebesatz of the municipality (§ 16)  = Gewerbesteuer
 *
 * Gewerbesteuer is itself not deductible (§ 4 Abs. 5b EStG), so the
 * management result must not have it as an expense when used as the KSt/GewSt
 * basis; `management_taxes_excluded` says whether the caller did that.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { roundHalfUp, type Cents } from '@/lib/finance/money';
import type { IsoDate } from '@/lib/finance/periods';
import { resolveRate, type ResolvedRate, type TaxRateRow } from '@/lib/finance/tax/rates';

export const COMPANY_TAX_RULES_VERSION = 'company-tax-2026-09-20.1';

export type AdjustmentKind = 'non_deductible_expense' | 'tax_free_income' | 'loss_carryforward' | 'gewst_addition' | 'gewst_reduction' | 'vat_correction' | 'other';

export interface TaxAdjustment {
  taxType: 'kst' | 'gewst' | 'vat';
  fiscalYear: number;
  kind: AdjustmentKind;
  amountCents: Cents;
  reason: string;
}

export interface CompanyTaxInput {
  fiscalYear: number;
  /** Management result BEFORE company taxes (KSt/Soli/GewSt excluded), in cents. */
  resultBeforeTaxCents: Cents;
  adjustments: readonly TaxAdjustment[];
  /** Database rate rows, if loaded; the seed is the fallback. */
  rateRows?: readonly TaxRateRow[] | null;
  /** Advance payments already made in the year, per tax type. */
  advancePaymentsCents?: Partial<Record<'kst' | 'soli' | 'gewst', Cents>>;
  /** Whether the result already excludes company taxes (it must). */
  managementTaxesExcluded?: boolean;
  /** The date the rates are resolved on; defaults to the last day of the fiscal year. */
  asOf?: IsoDate;
}

export interface TaxFigure {
  taxType: 'kst' | 'soli' | 'gewst';
  basisCents: Cents;
  rate: ResolvedRate | null;
  /** For GewSt: the Messbetrag; for Soli: the KSt it is computed on. */
  intermediateCents?: Cents;
  intermediateLabel?: string;
  hebesatz?: ResolvedRate | null;
  estimateCents: Cents;
  advancePaidCents: Cents;
  remainingCents: Cents;
  steps: Array<{ label: string; cents: Cents; note?: string }>;
  caveats: string[];
}

export interface CompanyTaxEstimate {
  fiscalYear: number;
  rulesVersion: string;
  taxableIncomeCents: Cents;
  gewerbeertragCents: Cents;
  kst: TaxFigure;
  soli: TaxFigure;
  gewst: TaxFigure;
  totalEstimateCents: Cents;
  totalRemainingCents: Cents;
  effectiveRate: number | null;
  caveats: string[];
}

function sumKind(adjustments: readonly TaxAdjustment[], taxType: 'kst' | 'gewst', kind: AdjustmentKind, year: number): Cents {
  return adjustments.filter((a) => a.taxType === taxType && a.kind === kind && a.fiscalYear === year).reduce((s, a) => s + a.amountCents, 0);
}

/** Round down to the next full € 100 (§ 11 Abs. 1 Satz 3 GewStG). */
export function roundDownToHundredEuros(cents: Cents): Cents {
  if (cents <= 0) return 0;
  return Math.floor(cents / 10_000) * 10_000;
}

export function estimateCompanyTaxes(input: CompanyTaxInput): CompanyTaxEstimate {
  const year = input.fiscalYear;
  const asOf = input.asOf ?? `${year}-12-31`;
  const caveats: string[] = [];
  if (input.managementTaxesExcluded === false) caveats.push('The management result passed in still contains company taxes; the basis is overstated in the deducting direction (§ 4 Abs. 5b EStG).');

  const nonDeductible = sumKind(input.adjustments, 'kst', 'non_deductible_expense', year);
  const taxFree = sumKind(input.adjustments, 'kst', 'tax_free_income', year);
  const lossCf = sumKind(input.adjustments, 'kst', 'loss_carryforward', year);
  const incomeBeforeLoss = input.resultBeforeTaxCents + nonDeductible - taxFree;
  const taxableIncome = Math.max(0, incomeBeforeLoss - Math.min(lossCf, Math.max(0, incomeBeforeLoss)));

  /* ── KSt ─────────────────────────────────────────────────────────── */
  const kstRate = resolveRate('kst', asOf, input.rateRows ?? null);
  const kstCents = kstRate ? roundHalfUp((taxableIncome * kstRate.rateBp) / 10000) : 0;
  const kstPaid = input.advancePaymentsCents?.kst ?? 0;
  const kstCaveats: string[] = [];
  if (!kstRate) kstCaveats.push('No KSt rate in force for this year.');
  else if (kstRate.reviewRequired) kstCaveats.push(`KSt rate ${kstRate.rateBp / 100} % for ${year} is seeded from the enacted step-down but not yet confirmed by the adviser.`);
  if (input.adjustments.filter((a) => a.taxType === 'kst' && a.fiscalYear === year).length === 0) kstCaveats.push('No tax adjustments entered: taxable income equals the management result. Non-deductible expenses, tax-free income and loss carry-forwards are the adviser\'s.');
  const kst: TaxFigure = {
    taxType: 'kst', basisCents: taxableIncome, rate: kstRate, estimateCents: kstCents, advancePaidCents: kstPaid, remainingCents: kstCents - kstPaid,
    steps: [
      { label: 'Management result before company taxes', cents: input.resultBeforeTaxCents },
      { label: '+ non-deductible expenses', cents: nonDeductible, note: '§ 10 KStG, § 4 Abs. 5, 5b EStG' },
      { label: '− tax-free income', cents: -taxFree },
      { label: '− loss carry-forward used', cents: -Math.min(lossCf, Math.max(0, incomeBeforeLoss)), note: '§ 10d EStG, § 8c/8d KStG' },
      { label: '= estimated taxable income', cents: taxableIncome },
      { label: `× KSt ${kstRate ? kstRate.rateBp / 100 : '?'} %`, cents: kstCents, note: kstRate?.legalReference },
    ],
    caveats: kstCaveats,
  };

  /* ── Soli ────────────────────────────────────────────────────────── */
  const soliRate = resolveRate('soli', asOf, input.rateRows ?? null);
  const soliCents = soliRate ? roundHalfUp((kstCents * soliRate.rateBp) / 10000) : 0;
  const soliPaid = input.advancePaymentsCents?.soli ?? 0;
  const soli: TaxFigure = {
    taxType: 'soli', basisCents: kstCents, rate: soliRate, intermediateCents: kstCents, intermediateLabel: 'Körperschaftsteuer (the basis)', estimateCents: soliCents, advancePaidCents: soliPaid, remainingCents: soliCents - soliPaid,
    steps: [
      { label: 'Körperschaftsteuer', cents: kstCents },
      { label: `× Solidaritätszuschlag ${soliRate ? soliRate.rateBp / 100 : '?'} %`, cents: soliCents, note: '§ 3 Abs. 1 Nr. 1, § 4 SolzG — on the KSt, not the profit' },
    ],
    caveats: soliRate ? [] : ['No Soli rate in force.'],
  };

  /* ── GewSt ───────────────────────────────────────────────────────── */
  const additions = sumKind(input.adjustments, 'gewst', 'gewst_addition', year);
  const reductions = sumKind(input.adjustments, 'gewst', 'gewst_reduction', year);
  const tradeLossCf = sumKind(input.adjustments, 'gewst', 'loss_carryforward', year);
  const gewinn = Math.max(0, incomeBeforeLoss); // § 7 GewStG: profit per KStG rules before § 10d
  const ertragRaw = Math.max(0, gewinn + additions - reductions - Math.min(tradeLossCf, Math.max(0, gewinn + additions - reductions)));
  const gewerbeertrag = roundDownToHundredEuros(ertragRaw);
  const messzahl = resolveRate('gewst_messzahl', asOf, input.rateRows ?? null);
  const hebesatz = resolveRate('gewst_hebesatz', asOf, input.rateRows ?? null);
  const messbetrag = messzahl ? roundHalfUp((gewerbeertrag * messzahl.rateBp) / 10000) : 0;
  const gewstCents = hebesatz ? roundHalfUp((messbetrag * hebesatz.rateBp) / 10000) : 0;
  const gewstPaid = input.advancePaymentsCents?.gewst ?? 0;
  const gewstCaveats: string[] = [];
  if (!hebesatz) gewstCaveats.push('No Hebesatz configured for Bayreuth — the trade tax cannot be estimated.');
  else if (hebesatz.reviewRequired) gewstCaveats.push(`The Bayreuth Hebesatz (${hebesatz.rateBp / 100} %) for ${year} is a seeded placeholder pending confirmation against the city's Haushaltssatzung.`);
  if (additions === 0 && reductions === 0) gewstCaveats.push('No Hinzurechnungen/Kürzungen entered (§§ 8, 9 GewStG). Rents for the apartments, if leased, add 50 % above the € 200,000 Freibetrag — the adviser decides.');
  const gewst: TaxFigure = {
    taxType: 'gewst', basisCents: gewerbeertrag, rate: messzahl, intermediateCents: messbetrag, intermediateLabel: 'Steuermessbetrag', hebesatz, estimateCents: gewstCents, advancePaidCents: gewstPaid, remainingCents: gewstCents - gewstPaid,
    steps: [
      { label: 'Profit per KStG rules (before loss deduction)', cents: gewinn, note: '§ 7 GewStG' },
      { label: '+ Hinzurechnungen', cents: additions, note: '§ 8 GewStG' },
      { label: '− Kürzungen', cents: -reductions, note: '§ 9 GewStG' },
      { label: '− trade loss carry-forward', cents: -Math.min(tradeLossCf, Math.max(0, gewinn + additions - reductions)), note: '§ 10a GewStG' },
      { label: '= Gewerbeertrag (rounded down to € 100; no Freibetrag for a GmbH)', cents: gewerbeertrag, note: '§ 11 Abs. 1 GewStG' },
      { label: `× Steuermesszahl ${messzahl ? messzahl.rateBp / 100 : '?'} % = Steuermessbetrag`, cents: messbetrag, note: '§ 11 Abs. 2 GewStG' },
      { label: `× Hebesatz Bayreuth ${hebesatz ? hebesatz.rateBp / 100 : '?'} %`, cents: gewstCents, note: '§ 16 GewStG' },
    ],
    caveats: gewstCaveats,
  };

  const total = kstCents + soliCents + gewstCents;
  const remaining = kst.remainingCents + soli.remainingCents + gewst.remainingCents;
  return {
    fiscalYear: year, rulesVersion: COMPANY_TAX_RULES_VERSION, taxableIncomeCents: taxableIncome, gewerbeertragCents: gewerbeertrag,
    kst, soli, gewst, totalEstimateCents: total, totalRemainingCents: remaining,
    effectiveRate: taxableIncome > 0 ? total / taxableIncome : null,
    caveats: [...caveats, ...kstCaveats, ...soli.caveats, ...gewstCaveats],
  };
}

export function companyTaxBasis(e: CompanyTaxEstimate, which: 'kst' | 'soli' | 'gewst'): Record<string, unknown> {
  const f = e[which];
  return {
    rules: e.rulesVersion,
    fiscal_year: e.fiscalYear,
    basis: f.basisCents,
    rate_bp: f.rate?.rateBp ?? null,
    rate_reference: f.rate?.legalReference ?? null,
    rate_review_required: f.rate?.reviewRequired ?? null,
    hebesatz_bp: f.hebesatz?.rateBp ?? null,
    intermediate: f.intermediateCents ?? null,
    steps: f.steps,
    estimate: f.estimateCents,
    advance_paid: f.advancePaidCents,
    caveats: f.caveats,
  };
}
