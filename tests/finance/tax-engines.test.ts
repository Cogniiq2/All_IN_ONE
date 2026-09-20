import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '@/lib/finance/categories';
import { TAX_CODES, contributes, effectiveTaxCodes, isEffective, requireTaxCode } from '@/lib/finance/tax-codes';
import { BAYREUTH, TAX_RATE_SEED, resolveRate } from '@/lib/finance/tax/rates';
import { computeVatPosition, type VatMonthlyRow } from '@/lib/finance/tax/vat';
import { estimateCompanyTaxes, roundDownToHundredEuros } from '@/lib/finance/tax/company';
import { computeFreeCash, computeReserve, governingStage } from '@/lib/finance/tax/reserve';

const MIGRATION = readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260922120000_finance_foundation.sql'), 'utf8');

describe('tax codes — the mirror agrees with the migration seed', () => {
  it('every code in the module is seeded with the same rate and treatment', () => {
    for (const c of TAX_CODES) {
      const re = new RegExp(`\\('${c.code}', '[^']*', '(?:[^']|'')*', '(output|input|both)', '(\\w+)', (\\d+), (true|false), (true|false), '(\\d{4}-\\d{2}-\\d{2})'`);
      const m = re.exec(MIGRATION);
      expect(m, c.code).not.toBeNull();
      expect(m![1]).toBe(c.side);
      expect(m![2]).toBe(c.treatment);
      expect(Number(m![3])).toBe(c.rateBp);
      expect(m![4] === 'true').toBe(c.reverseCharge);
      expect(m![5] === 'true').toBe(c.reviewRequired);
      expect(m![6]).toBe(c.effectiveFrom);
    }
  });

  it('every category in the module is seeded with the same P&L group and default code', () => {
    for (const c of CATEGORIES) {
      const re = new RegExp(`\\('${c.code}', '[^']*', '(\\w+)', '(\\w+)', (null|'\\w+'), (true|false), (true|false)`);
      const m = re.exec(MIGRATION);
      expect(m, c.code).not.toBeNull();
      expect(m![1]).toBe(c.plGroup);
      expect(m![2]).toBe(c.kind);
      expect(m![3] === 'null' ? null : m![3].slice(1, -1)).toBe(c.defaultTaxCode);
      expect(m![4] === 'true').toBe(c.assetCandidate);
      expect(m![5] === 'true').toBe(c.requiresUnit);
    }
  });

  it('review-required codes never contribute to VAT; reverse charge contributes both ways', () => {
    expect(contributes(requireTaxCode('DE_REVIEW_REQUIRED'))).toEqual({ output: false, input: false, reverseCharge: false });
    expect(contributes(requireTaxCode('DE_ANCILLARY_REVIEW')).output).toBe(false);
    expect(contributes(requireTaxCode('DE_REVERSE_CHARGE'))).toEqual({ output: true, input: true, reverseCharge: true });
    expect(contributes(requireTaxCode('DE_ACCOMMODATION_REDUCED'))).toEqual({ output: true, input: false, reverseCharge: false });
    expect(contributes(requireTaxCode('DE_EXEMPT'))).toEqual({ output: false, input: false, reverseCharge: false });
  });

  it('effective dating', () => {
    expect(isEffective(requireTaxCode('DE_ACCOMMODATION_REDUCED'), '2009-12-31')).toBe(false);
    expect(isEffective(requireTaxCode('DE_ACCOMMODATION_REDUCED'), '2026-09-20')).toBe(true);
    expect(effectiveTaxCodes('2026-09-20', 'output').map((c) => c.code)).toContain('DE_ANCILLARY_STANDARD');
    expect(effectiveTaxCodes('2026-09-20', 'output').map((c) => c.code)).not.toContain('DE_REVERSE_CHARGE');
  });
});

describe('company tax rates — effective-dated resolution', () => {
  it('KSt is 15 % through 2027 and the step-down rows are review-flagged', () => {
    expect(resolveRate('kst', '2026-12-31')!.rateBp).toBe(1500);
    expect(resolveRate('kst', '2026-12-31')!.reviewRequired).toBe(false);
    expect(resolveRate('kst', '2028-06-01')!.rateBp).toBe(1400);
    expect(resolveRate('kst', '2028-06-01')!.reviewRequired).toBe(true);
    expect(resolveRate('kst', '2032-01-01')!.rateBp).toBe(1000);
    expect(resolveRate('kst', '2007-01-01')).toBeNull();
  });

  it('a database row for the same effective date overrides the seed; the Bayreuth placeholder is flagged', () => {
    expect(resolveRate('gewst_hebesatz', '2026-01-01')!.reviewRequired).toBe(true);
    const confirmed = resolveRate('gewst_hebesatz', '2026-05-01', [{ taxType: 'gewst_hebesatz', jurisdiction: BAYREUTH, rateBp: 41000, effectiveFrom: '2026-01-01', effectiveTo: null, legalReference: 'Haushaltssatzung 2026', sourceUrl: null, reviewRequired: false, note: null }]);
    expect(confirmed).toMatchObject({ rateBp: 41000, reviewRequired: false, origin: 'database' });
    expect(resolveRate('gewst_hebesatz', '2025-05-01', [{ taxType: 'gewst_hebesatz', jurisdiction: BAYREUTH, rateBp: 41000, effectiveFrom: '2026-01-01', effectiveTo: null, legalReference: '', sourceUrl: null, reviewRequired: false, note: null }])!.rateBp).toBe(39000);
  });

  it('the seed mirrors the migration', () => {
    for (const r of TAX_RATE_SEED) {
      expect(MIGRATION).toContain(`('${r.taxType}', '${r.jurisdiction}', ${r.rateBp}, '${r.effectiveFrom}'`);
    }
  });
});

function row(p: Partial<VatMonthlyRow> & { tax_code: string; period_key?: string }): VatMonthlyRow {
  return { period_key: '2026-07', treatment: 'standard', rate_bp: 1900, output_basis_cents: 0, output_vat_cents: 0, input_basis_cents: 0, input_vat_cents: 0, non_deductible_vat_cents: 0, review_vat_cents: 0, rc_basis_cents: 0, rc_output_vat_cents: 0, rc_input_vat_cents: 0, lines_needing_review: 0, ...p };
}

describe('VAT position', () => {
  it('sums output by code, deducts input and nets reverse charge to zero when fully deductible', () => {
    const p = computeVatPosition('2026-Q3', [
      row({ tax_code: 'DE_ACCOMMODATION_REDUCED', treatment: 'reduced', rate_bp: 700, output_basis_cents: 2_000_000, output_vat_cents: 140_000 }),
      row({ tax_code: 'DE_ACCOMMODATION_REDUCED', period_key: '2026-08', treatment: 'reduced', rate_bp: 700, output_basis_cents: 1_000_000, output_vat_cents: 70_000 }),
      row({ tax_code: 'DE_BEVERAGE_STANDARD', output_basis_cents: 20_000, output_vat_cents: 3_800 }),
      row({ tax_code: 'DE_STANDARD', input_basis_cents: 500_000, input_vat_cents: 95_000, non_deductible_vat_cents: 1_900 }),
      row({ tax_code: 'DE_REVERSE_CHARGE', treatment: 'reverse_charge', rc_basis_cents: 100_000, rc_output_vat_cents: 19_000, rc_input_vat_cents: 19_000 }),
      row({ tax_code: 'DE_REVIEW_REQUIRED', treatment: 'review_required', rate_bp: 0, review_vat_cents: 0, lines_needing_review: 2 }),
    ]);
    expect(p.outputVatCents).toBe(213_800);
    expect(p.output.map((l) => l.taxCode)).toEqual(['DE_BEVERAGE_STANDARD', 'DE_ACCOMMODATION_REDUCED']);
    expect(p.output[1].basisCents).toBe(3_000_000);
    expect(p.inputVatCents).toBe(95_000);
    expect(p.reverseCharge).toEqual({ basisCents: 100_000, outputVatCents: 19_000, inputVatCents: 19_000 });
    expect(p.estimateCents).toBe(213_800 - 95_000);
    expect(p.linesNeedingReview).toBe(2);
    expect(p.caveats[0]).toMatch(/2 lines still need/);
    expect(p.months).toEqual(['2026-07', '2026-08']);
  });

  it('a refund position is negative and adjustments apply', () => {
    const p = computeVatPosition('2026-Q1', [row({ tax_code: 'DE_STANDARD', input_basis_cents: 1_000_000, input_vat_cents: 190_000 })], 5_000);
    expect(p.estimateCents).toBe(-185_000);
  });
});

describe('company taxes — KSt, Soli, GewSt', () => {
  it('a clean 2026 estimate: 15 % KSt, 5.5 % Soli of the KSt, 3.5 % × 390 % GewSt on the rounded Gewerbeertrag', () => {
    const e = estimateCompanyTaxes({ fiscalYear: 2026, resultBeforeTaxCents: 12_345_678, adjustments: [], managementTaxesExcluded: true });
    expect(e.taxableIncomeCents).toBe(12_345_678);
    expect(e.kst.estimateCents).toBe(1_851_852); // 15 %
    expect(e.soli.estimateCents).toBe(101_852); // 5.5 % of KSt (1851852 × 0.055 = 101851.86)
    expect(e.gewerbeertragCents).toBe(12_340_000); // rounded down to € 100
    expect(e.gewst.intermediateCents).toBe(431_900); // 3.5 %
    expect(e.gewst.estimateCents).toBe(1_684_410); // × 390 %
    expect(e.totalEstimateCents).toBe(1_851_852 + 101_852 + 1_684_410);
    expect(e.effectiveRate!).toBeCloseTo(0.2947, 3);
    expect(e.gewst.caveats.join(' ')).toMatch(/placeholder/);
    expect(e.kst.caveats.join(' ')).toMatch(/No tax adjustments/);
  });

  it('no Freibetrag for a GmbH; a loss yields zero, not negative tax', () => {
    const small = estimateCompanyTaxes({ fiscalYear: 2026, resultBeforeTaxCents: 2_000_000, adjustments: [], managementTaxesExcluded: true });
    expect(small.gewst.estimateCents).toBe(Math.round(2_000_000 * 0.035 * 3.9));
    const loss = estimateCompanyTaxes({ fiscalYear: 2026, resultBeforeTaxCents: -500_000, adjustments: [], managementTaxesExcluded: true });
    expect(loss.totalEstimateCents).toBe(0);
    expect(loss.taxableIncomeCents).toBe(0);
  });

  it('adjustments flow into the right bases; loss carry-forward is capped at the income', () => {
    const e = estimateCompanyTaxes({
      fiscalYear: 2026, resultBeforeTaxCents: 10_000_000, managementTaxesExcluded: true,
      adjustments: [
        { taxType: 'kst', fiscalYear: 2026, kind: 'non_deductible_expense', amountCents: 200_000, reason: 'gifts' },
        { taxType: 'kst', fiscalYear: 2026, kind: 'loss_carryforward', amountCents: 50_000_000, reason: 'prior losses' },
        { taxType: 'gewst', fiscalYear: 2026, kind: 'gewst_addition', amountCents: 300_000, reason: 'rents' },
        { taxType: 'gewst', fiscalYear: 2025, kind: 'gewst_addition', amountCents: 999_999, reason: 'other year' },
      ],
    });
    expect(e.taxableIncomeCents).toBe(0);
    expect(e.kst.estimateCents).toBe(0);
    // GewSt uses the profit before § 10d, plus the addition, rounded down.
    expect(e.gewerbeertragCents).toBe(10_500_000);
    expect(e.gewst.estimateCents).toBe(Math.round(10_500_000 * 0.035 * 3.9));
  });

  it('uses the effective-dated KSt rate of the fiscal year and flags an unconfirmed one', () => {
    const e = estimateCompanyTaxes({ fiscalYear: 2028, resultBeforeTaxCents: 10_000_000, adjustments: [], managementTaxesExcluded: true });
    expect(e.kst.estimateCents).toBe(1_400_000);
    expect(e.kst.caveats.join(' ')).toMatch(/not yet confirmed/);
  });

  it('advance payments reduce the remaining amount, not the estimate', () => {
    const e = estimateCompanyTaxes({ fiscalYear: 2026, resultBeforeTaxCents: 10_000_000, adjustments: [], managementTaxesExcluded: true, advancePaymentsCents: { kst: 1_000_000, gewst: 500_000 } });
    expect(e.kst.estimateCents).toBe(1_500_000);
    expect(e.kst.remainingCents).toBe(500_000);
    expect(e.gewst.remainingCents).toBe(e.gewst.estimateCents - 500_000);
  });

  it('rounds the Gewerbeertrag down to full hundreds of euros', () => {
    expect(roundDownToHundredEuros(12_345_678)).toBe(12_340_000);
    expect(roundDownToHundredEuros(9_999)).toBe(0);
    expect(roundDownToHundredEuros(-5)).toBe(0);
  });
});

describe('tax reserve and free cash', () => {
  it('required = Σ max(0, liability − paid); coverage and gap from the declared reserve', () => {
    const r = computeReserve([
      { taxType: 'vat', periodKey: '2026-Q3', amountCents: 1_248_000, stage: 'system_estimate', paidCents: 0, periodStatus: 'estimated' },
      { taxType: 'kst', periodKey: '2026', amountCents: 400_000, stage: 'system_estimate', paidCents: 250_000, periodStatus: 'estimated' },
      { taxType: 'gewst', periodKey: '2026', amountCents: 300_000, stage: 'assessed', paidCents: 300_000, periodStatus: 'paid' },
      { taxType: 'kst', periodKey: '2025', amountCents: 100_000, stage: 'paid', paidCents: 100_000, periodStatus: 'closed' },
    ], 800_000);
    expect(r.requiredCents).toBe(1_248_000 + 150_000);
    expect(r.heldCents).toBe(800_000);
    expect(r.gapCents).toBe(598_000);
    expect(r.coverage!).toBeCloseTo(0.572, 2);
    expect(r.containsEstimates).toBe(true);
    expect(r.byTaxType[0]).toEqual({ taxType: 'vat', requiredCents: 1_248_000 });
  });

  it('a system-estimated refund does not reduce the reserve; a reviewed one does', () => {
    const base = { taxType: 'kst' as const, periodKey: '2026', amountCents: 500_000, stage: 'system_estimate' as const, paidCents: 0, periodStatus: 'estimated' };
    expect(computeReserve([base, { taxType: 'vat', periodKey: '2026-Q2', amountCents: -100_000, stage: 'system_estimate', paidCents: 0, periodStatus: 'estimated' }], 0).requiredCents).toBe(500_000);
    expect(computeReserve([base, { taxType: 'vat', periodKey: '2026-Q2', amountCents: -100_000, stage: 'accountant_reviewed', paidCents: 0, periodStatus: 'reviewed' }], 0).requiredCents).toBe(400_000);
  });

  it('free cash subtracts reserve, liabilities and other reserves; unknown cash stays unknown', () => {
    expect(computeFreeCash({ cashCents: 4_120_000, taxReserveRequiredCents: 1_801_700, openLiabilitiesCents: 483_000, otherReservesCents: 0 }).freeCashCents).toBe(1_835_300);
    expect(computeFreeCash({ cashCents: null, taxReserveRequiredCents: 1, openLiabilitiesCents: 1, otherReservesCents: 1 }).freeCashCents).toBeNull();
  });

  it('the governing stage is the furthest along, then the latest', () => {
    const g = governingStage([
      { stage: 'system_estimate', computedAt: '2026-09-01', v: 1 },
      { stage: 'filed', computedAt: '2026-09-02', v: 2 },
      { stage: 'system_estimate', computedAt: '2026-09-09', v: 3 },
      { stage: 'filed', computedAt: '2026-09-03', v: 4 },
    ]);
    expect(g!.v).toBe(4);
  });
});
