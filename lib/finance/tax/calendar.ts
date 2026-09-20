/**
 * ══════════════════════════════════════════════════════════════════════════
 * TAX CALENDAR — planning dates derived from policy and statute.
 *
 * These are PLANNING dates. A date named by a tax notice or by the tax
 * office (`official_due_on` on the tax period, or a notice due) overrides
 * them; the merge happens in `mergeDeadlines`.
 *
 * Statutory footing (docs/finance/tax-sources.md):
 *   UStVA        due the 10th day after the end of the pre-registration period
 *                (§ 18 Abs. 1 Satz 1 UStG); the payment on the same day
 *                (§ 18 Abs. 1 Satz 4). Dauerfristverlängerung: one month
 *                later (§ 46 UStDV); monthly filers pay a 1/11
 *                Sondervorauszahlung by 10 February (§ 47, § 48 UStDV).
 *   Frequency    quarterly by default; monthly when the prior year's VAT
 *                exceeded € 9,000; none when it did not exceed € 2,000
 *                (§ 18 Abs. 2 UStG as amended for 2025). The tax office's
 *                actual determination is policy, not computed here.
 *   Annual VAT   § 149 Abs. 2 AO: 31 July of the following year; with an
 *                adviser, § 149 Abs. 3 AO (end of February of the second
 *                following year, with transitional extensions) — policy.
 *   KSt advance  10 March, 10 June, 10 September, 10 December
 *                (§ 31 Abs. 1 KStG with § 37 Abs. 1 EStG).
 *   GewSt advance 15 February, 15 May, 15 August, 15 November (§ 19 Abs. 1 GewStG).
 *   Weekend/holiday → next working day (§ 108 Abs. 3 AO).
 * ══════════════════════════════════════════════════════════════════════════
 */

import { addDays, addMonths, monthKeysBetween, nextWorkingDay, quarterKey, yearOf, type IsoDate, type PeriodKey } from '@/lib/finance/periods';

export type VatFilingFrequency = 'monthly' | 'quarterly' | 'annual_only';

export interface TaxCalendarPolicy {
  vatFilingFrequency: VatFilingFrequency;
  dauerfristverlaengerung: boolean;
  /** Month of the annual VAT return deadline in the following year (7 = 31 July; adviser deadlines differ). */
  vatAnnualReturnMonth: number;
  fiscalYearStartMonth: number;
}

export const DEFAULT_TAX_CALENDAR_POLICY: TaxCalendarPolicy = {
  vatFilingFrequency: 'quarterly',
  dauerfristverlaengerung: false,
  vatAnnualReturnMonth: 7,
  fiscalYearStartMonth: 1,
};

export type DeadlineKind = 'vat_advance_return' | 'vat_special_prepayment' | 'vat_annual_return' | 'kst_advance' | 'gewst_advance' | 'notice' | 'custom';

export interface Deadline {
  kind: DeadlineKind;
  taxType: 'vat' | 'kst' | 'soli' | 'gewst' | 'other';
  periodKey: PeriodKey;
  label: string;
  /** The statutory/planning date after the working-day shift. */
  dueOn: IsoDate;
  /** The date before the working-day shift, for transparency. */
  nominalOn: IsoDate;
  origin: 'calculated' | 'official' | 'custom';
  legalReference: string;
  amountCents?: number | null;
  href?: string;
}

function shifted(nominal: IsoDate): { nominalOn: IsoDate; dueOn: IsoDate } {
  return { nominalOn: nominal, dueOn: nextWorkingDay(nominal) };
}

/** VAT pre-registration periods and their due dates for a year. */
export function vatDeadlinesForYear(year: number, policy: TaxCalendarPolicy): Deadline[] {
  const out: Deadline[] = [];
  const extension = policy.dauerfristverlaengerung ? 1 : 0;
  if (policy.vatFilingFrequency === 'monthly') {
    for (let m = 1; m <= 12; m += 1) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const nominal = addMonths(`${key}-10`, 1 + extension);
      out.push({ kind: 'vat_advance_return', taxType: 'vat', periodKey: key, label: `VAT advance return ${key}`, ...shifted(nominal), origin: 'calculated', legalReference: `§ 18 Abs. 1 UStG${extension ? '; § 46 UStDV' : ''}` });
    }
    if (policy.dauerfristverlaengerung) {
      out.push({ kind: 'vat_special_prepayment', taxType: 'vat', periodKey: String(year), label: `VAT special prepayment (1/11) ${year}`, ...shifted(`${year}-02-10`), origin: 'calculated', legalReference: '§ 47, § 48 UStDV' });
    }
  } else if (policy.vatFilingFrequency === 'quarterly') {
    for (let q = 1; q <= 4; q += 1) {
      const key = `${year}-Q${q}`;
      const endMonth = q * 3;
      const nominal = addMonths(`${year}-${String(endMonth).padStart(2, '0')}-10`, 1 + extension);
      out.push({ kind: 'vat_advance_return', taxType: 'vat', periodKey: key, label: `VAT advance return Q${q} ${year}`, ...shifted(nominal), origin: 'calculated', legalReference: `§ 18 Abs. 1, 2 UStG${extension ? '; § 46 UStDV' : ''}` });
    }
  }
  const annualNominal = addDays(addMonths(`${year + 1}-${String(policy.vatAnnualReturnMonth).padStart(2, '0')}-01`, 1), -1);
  out.push({ kind: 'vat_annual_return', taxType: 'vat', periodKey: String(year), label: `VAT annual return ${year}`, ...shifted(annualNominal), origin: 'calculated', legalReference: '§ 18 Abs. 3 UStG; § 149 Abs. 2 AO (adviser deadlines differ)' });
  return out;
}

export function kstAdvanceDeadlines(year: number): Deadline[] {
  return [3, 6, 9, 12].map((m) => ({
    kind: 'kst_advance' as const, taxType: 'kst' as const, periodKey: String(year), label: `Corporation tax advance payment ${['I', 'II', 'III', 'IV'][m / 3 - 1]}/${year}`,
    ...shifted(`${year}-${String(m).padStart(2, '0')}-10`), origin: 'calculated' as const, legalReference: '§ 31 Abs. 1 KStG, § 37 Abs. 1 EStG',
  }));
}

export function gewstAdvanceDeadlines(year: number): Deadline[] {
  return [2, 5, 8, 11].map((m) => ({
    kind: 'gewst_advance' as const, taxType: 'gewst' as const, periodKey: String(year), label: `Trade tax advance payment ${['I', 'II', 'III', 'IV'][(m - 2) / 3]}/${year}`,
    ...shifted(`${year}-${String(m).padStart(2, '0')}-15`), origin: 'calculated' as const, legalReference: '§ 19 Abs. 1 GewStG',
  }));
}

export function calculatedDeadlines(year: number, policy: TaxCalendarPolicy): Deadline[] {
  return [...vatDeadlinesForYear(year, policy), ...kstAdvanceDeadlines(year), ...gewstAdvanceDeadlines(year)];
}

export interface OfficialDeadline {
  taxType: Deadline['taxType'];
  periodKey: PeriodKey;
  dueOn: IsoDate;
  label: string;
  amountCents?: number | null;
  href?: string;
  kind?: DeadlineKind;
}

/**
 * Official dates override calculated ones for the same (taxType, periodKey,
 * kind family); custom deadlines are appended. Output sorted by due date.
 */
export function mergeDeadlines(calculated: Deadline[], official: OfficialDeadline[], custom: OfficialDeadline[] = []): Deadline[] {
  const out: Deadline[] = [];
  const overridden = new Set<string>();
  for (const o of official) {
    const kind = o.kind ?? 'notice';
    overridden.add(`${o.taxType}:${o.periodKey}:${kind}`);
    out.push({ kind, taxType: o.taxType, periodKey: o.periodKey, label: o.label, dueOn: o.dueOn, nominalOn: o.dueOn, origin: 'official', legalReference: 'per notice / tax office', amountCents: o.amountCents ?? null, href: o.href });
  }
  for (const c of calculated) {
    if (overridden.has(`${c.taxType}:${c.periodKey}:${c.kind}`)) continue;
    out.push(c);
  }
  for (const c of custom) out.push({ kind: c.kind ?? 'custom', taxType: c.taxType, periodKey: c.periodKey, label: c.label, dueOn: c.dueOn, nominalOn: c.dueOn, origin: 'custom', legalReference: 'adviser', amountCents: c.amountCents ?? null, href: c.href });
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.label.localeCompare(b.label));
}

export type DeadlineUrgency = 'overdue' | 'due_soon' | 'upcoming' | 'later';

export function urgencyOf(deadline: Deadline, today: IsoDate, soonDays = 14): DeadlineUrgency {
  const d = Math.round((Date.parse(`${deadline.dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (d < 0) return 'overdue';
  if (d <= soonDays) return 'due_soon';
  if (d <= 60) return 'upcoming';
  return 'later';
}

/** Which VAT period key a booked date belongs to under the policy. */
export function vatPeriodKeyFor(on: IsoDate, policy: TaxCalendarPolicy): PeriodKey {
  if (policy.vatFilingFrequency === 'monthly') return on.slice(0, 7);
  if (policy.vatFilingFrequency === 'quarterly') return quarterKey(on);
  return String(yearOf(on));
}

/** The VAT period keys touching [from, to). */
export function vatPeriodKeysBetween(from: IsoDate, to: IsoDate, policy: TaxCalendarPolicy): PeriodKey[] {
  const keys = new Set<PeriodKey>();
  for (const m of monthKeysBetween(from, to)) keys.add(vatPeriodKeyFor(`${m}-01`, policy));
  return Array.from(keys);
}
