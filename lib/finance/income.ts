/**
 * ══════════════════════════════════════════════════════════════════════════
 * INCOME — what the business earned in a period, in one line:
 *
 *   stays (net of VAT) + minibar (net) − platform commission and fees − cleaning
 *
 * Pure. The stays come from the stay-tax engine (the same calculation as the
 * VAT return), so income and VAT can never disagree. VAT is left out on
 * purpose: it is collected for the Finanzamt, not earned. Every part says
 * where it came from, and a part that is not known is reported as unknown —
 * never silently as zero.
 *
 * Period: stays whose check-out falls in it (the service date, as for VAT).
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { StayTax } from '@/lib/finance/tax/stay-tax';

export const INCOME_RULES_VERSION = 'income-2026-10-19.1';

export interface IncomeInputs {
  stays: readonly StayTax[];
  unitOf: (reservationId: string) => { id: string | null; name: string };
  /** Minibar sales in the period from the books, net of VAT, and their cost of goods. */
  minibarNetCents: number;
  minibarCogsCents: number;
  minibarItems: number;
  /** Cleaning invoices booked in the period (net). Null when none is booked. */
  cleaningActualNetCents: number | null;
  /** Company setting: expected net cleaning cost per stay. Null when not set. */
  cleaningPerStayCents: number | null;
}

export type IncomePartState = 'known' | 'partial' | 'expected' | 'unknown' | 'none';

export interface IncomeReport {
  rulesVersion: string;
  stays: { count: number; running: number; grossCents: number; vatCents: number; netCents: number };
  minibar: { netCents: number; cogsCents: number; items: number; state: IncomePartState };
  platform: { commissionCents: number; feeCents: number; staysKnown: number; staysUnknown: number; state: IncomePartState };
  cleaning: { cents: number; stays: number; perStayCents: number | null; source: 'invoices' | 'setting' | 'none'; state: IncomePartState };
  /** stays net + minibar net − commission − fees − cleaning. */
  incomeCents: number;
  /** The figure is final only when every part is known and no stay in it is still running. */
  final: boolean;
  byUnit: Array<{ unitId: string | null; name: string; stays: number; netCents: number; platformCents: number; cleaningCents: number; incomeCents: number }>;
  /** Plain sentences on what is missing, strongest first. */
  gaps: string[];
}

export function buildIncome(input: IncomeInputs): IncomeReport {
  // Only stays that were sold: cancellations without a charge and owner blocks earn nothing.
  const sold = input.stays.filter((t) => t.revenue !== null && t.kind !== 'cancelled' && t.kind !== 'not_a_stay');
  const nights = sold.filter((t) => t.kind === 'short_stay' || t.kind === 'long_stay');
  const sum = (f: (t: StayTax) => number) => sold.reduce((a, t) => a + f(t), 0);

  const staysNet = sum((t) => t.revenue!.netCents);
  const commission = sum((t) => t.commission?.netCents ?? 0);
  const fees = sum((t) => t.paymentFee?.netCents ?? 0);
  // VAT the platform charges by reverse charge is owed and deducted in the same return — no cost —
  // except on an exempt long stay, where it is a real cost of that stay.
  const rcCost = sum((t) => (t.commission ? t.commission.reverseChargeVatCents - t.commission.deductibleVatCents : 0) + (t.paymentFee ? t.paymentFee.reverseChargeVatCents - t.paymentFee.deductibleVatCents : 0));
  const platformStays = sold.filter((t) => t.questions.some((q) => q.code === 'commission_unknown') || t.commission !== null);
  const unknown = platformStays.filter((t) => t.commission === null).length;

  const cleaningStays = nights.length;
  const cleaning =
    input.cleaningActualNetCents !== null
      ? { cents: input.cleaningActualNetCents, source: 'invoices' as const }
      : input.cleaningPerStayCents !== null
        ? { cents: input.cleaningPerStayCents * cleaningStays, source: 'setting' as const }
        : { cents: 0, source: 'none' as const };

  const platformCents = commission + fees + rcCost;
  const income = staysNet + input.minibarNetCents - platformCents - cleaning.cents;
  const running = sold.filter((t) => !t.completed).length;

  const platformState: IncomePartState = platformStays.length === 0 ? 'none' : unknown === 0 ? 'known' : unknown === platformStays.length ? 'unknown' : 'partial';
  const cleaningState: IncomePartState = cleaningStays === 0 ? 'none' : cleaning.source === 'invoices' ? 'known' : cleaning.source === 'setting' ? 'expected' : 'unknown';

  // Per apartment: the same parts, allocated by the stay they belong to; cleaning by its stays.
  const units = new Map<string, { unitId: string | null; name: string; stays: number; netCents: number; platformCents: number; cleaningStays: number }>();
  for (const t of sold) {
    const u = input.unitOf(t.reservationId);
    const key = u.id ?? 'none';
    const row = units.get(key) ?? { unitId: u.id, name: u.name, stays: 0, netCents: 0, platformCents: 0, cleaningStays: 0 };
    row.stays += 1;
    row.netCents += t.revenue!.netCents;
    row.platformCents += (t.commission?.netCents ?? 0) + (t.paymentFee?.netCents ?? 0) + (t.commission ? t.commission.reverseChargeVatCents - t.commission.deductibleVatCents : 0) + (t.paymentFee ? t.paymentFee.reverseChargeVatCents - t.paymentFee.deductibleVatCents : 0);
    if (t.kind === 'short_stay' || t.kind === 'long_stay') row.cleaningStays += 1;
    units.set(key, row);
  }
  const perCleaning = cleaningStays > 0 ? cleaning.cents / cleaningStays : 0;
  const byUnit = Array.from(units.values())
    .map((u) => {
      const cleaningCents = Math.round(perCleaning * u.cleaningStays);
      return { unitId: u.unitId, name: u.name, stays: u.stays, netCents: u.netCents, platformCents: u.platformCents, cleaningCents, incomeCents: u.netCents - u.platformCents - cleaningCents };
    })
    .sort((a, b) => b.netCents - a.netCents);

  const gaps: string[] = [];
  if (unknown > 0) gaps.push(`Booking.com's commission is not known yet for ${unknown} ${unknown === 1 ? 'stay' : 'stays'} — import the Booking.com statement. Until then income is shown too high by that commission.`);
  if (cleaningState === 'unknown') gaps.push(`Cleaning has no cost recorded for ${cleaningStays} ${cleaningStays === 1 ? 'stay' : 'stays'}: set the cost per stay in Settings, or book the cleaning invoices under Costs. Until then income is shown too high by the cleaning.`);
  if (cleaningState === 'expected') gaps.push('Cleaning is your expected cost per stay; once the cleaning invoices are booked under Costs, the real amount replaces it.');
  if (input.minibarItems === 0 && input.minibarNetCents === 0) gaps.push('No minibar sale is recorded in this period.');
  if (running > 0) gaps.push(`${running} ${running === 1 ? 'stay is' : 'stays are'} still running; their income counts once they end.`);

  return {
    rulesVersion: INCOME_RULES_VERSION,
    stays: { count: sold.length, running, grossCents: sum((t) => t.revenue!.grossCents), vatCents: sum((t) => t.revenue!.vatCents), netCents: staysNet },
    minibar: { netCents: input.minibarNetCents, cogsCents: input.minibarCogsCents, items: input.minibarItems, state: input.minibarItems > 0 || input.minibarNetCents !== 0 ? 'known' : 'none' },
    platform: { commissionCents: commission + rcCost, feeCents: fees, staysKnown: platformStays.length - unknown, staysUnknown: unknown, state: platformState },
    cleaning: { cents: cleaning.cents, stays: cleaningStays, perStayCents: input.cleaningPerStayCents, source: cleaning.source, state: cleaningState },
    incomeCents: income,
    final: running === 0 && platformState !== 'partial' && platformState !== 'unknown' && cleaningState !== 'unknown',
    byUnit,
    gaps,
  };
}
