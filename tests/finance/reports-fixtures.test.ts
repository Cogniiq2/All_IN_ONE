import { describe, expect, it } from 'vitest';
import { buildPl } from '@/lib/finance/reports/pl';
import { buildCashFlow, cashNow, paymentsNet, projectCash } from '@/lib/finance/reports/cash-flow';
import { buildChannelEconomics, buildProfitability } from '@/lib/finance/reports/profitability';
import { FIXTURE_UNITS, fixtureFinanceSource, fixtureLedger } from '@/lib/finance/fixtures';
import { requireTaxCode } from '@/lib/finance/tax-codes';
import { can } from '@/lib/admin/permissions';
import { previewAllows } from '@/lib/admin/preview';
import { present } from '@/lib/finance/presentation';
import { EXPORT_LABEL, ledgerCsv, vatReportCsv, type ExportKind } from '@/lib/finance/export/builders';
import { computeVatPosition } from '@/lib/finance/tax/vat';
import type { AccountRow, CashMonthlyRow, PlMonthlyRow, StayRow, UnitMonthlyRow } from '@/lib/finance/rows';
import { line, pay, tx } from './factories';

const plRow = (over: Partial<PlMonthlyRow>): PlMonthlyRow => ({ period_key: '2026-03', pl_group: 'revenue', category: 'accommodation_revenue', unit_id: 'u-1', channel: 'direct', revenue_net_cents: 0, expense_net_cents: 0, net_cents: 0, gross_cents: 0, transactions: 1, ...over });

describe('management P&L', () => {
  const rows = [
    plRow({ net_cents: 100000 }),
    plRow({ category: 'minibar_sales', net_cents: 5000 }),
    plRow({ pl_group: 'direct_cost', category: 'cleaning', net_cents: 20000 }),
    plRow({ pl_group: 'direct_cost', category: 'ota_commission', net_cents: 15000, channel: 'booking_com' }),
    plRow({ pl_group: 'property_cost', category: 'electricity', net_cents: 8000 }),
    plRow({ pl_group: 'company_cost', category: 'software', net_cents: 3000, unit_id: null }),
    plRow({ period_key: '2026-04', net_cents: 50000 }),
    plRow({ pl_group: 'balance', category: 'vat_payable', net_cents: 99999 }),
  ];

  it('rolls categories into the subtotal ladder and excludes balance-sheet categories', () => {
    const pl = buildPl(rows, '2026-03-01', '2026-05-01');
    expect(pl.revenueCents).toBe(155000);
    expect(pl.directCostsCents).toBe(35000);
    expect(pl.contributionCents).toBe(120000);
    expect(pl.propertyResultCents).toBe(112000);
    expect(pl.operatingResultCents).toBe(109000);
    expect(pl.resultBeforeTaxCents).toBe(109000);
    expect(pl.resultAfterTaxCents).toBeNull();
    expect(pl.months).toEqual(['2026-03', '2026-04']);
    expect(pl.sections.flatMap((s) => s.lines.map((l) => l.category))).not.toContain('vat_payable');
    expect(pl.subtotals.map((s) => s.key)).toEqual(['revenue', 'contribution', 'property_result', 'operating_result', 'result_before_tax']);
  });

  it('marks the after-tax line as an estimate and filters by unit and channel', () => {
    const pl = buildPl(rows, '2026-03-01', '2026-05-01', 30000);
    expect(pl.resultAfterTaxCents).toBe(79000);
    expect(pl.subtotals.find((s) => s.key === 'result_after_tax')?.provenance).toBe('estimate');
    expect(buildPl(rows, '2026-03-01', '2026-05-01', null, { channel: 'booking_com' }).directCostsCents).toBe(15000);
    expect(buildPl(rows, '2026-03-01', '2026-05-01', null, { unitId: 'u-1' }).companyCostsCents).toBe(0);
    expect(pl.byMonth.map((m) => m.operatingResultCents)).toEqual([59000, 50000]);
  });
});

describe('cash flow and projection', () => {
  const accounts: AccountRow[] = [{ id: 'a-1', code: 'BANK', label: 'Bank', kind: 'bank', currency: 'EUR', iban_masked: null, opening_balance_cents: 1000000, opening_balance_on: '2026-01-01', active: true }];
  const cash = (over: Partial<CashMonthlyRow>): CashMonthlyRow => ({ period_key: '2026-03', source: 'paypal', kind: 'receipt', direction: 'in', account_id: 'a-1', net_cents: 0, gross_cents: 0, fee_cents: 0, payments: 1, ...over });

  it('runs opening → closing per month, rolling earlier months into the opening balance', () => {
    const rows = [cash({ period_key: '2026-02', gross_cents: 50000, net_cents: 50000 }), cash({ gross_cents: 30000, net_cents: 30000 }), cash({ direction: 'out', kind: 'disbursement', source: 'bank', gross_cents: 12000, net_cents: -12000 })];
    const r = buildCashFlow(rows, accounts, ['2026-03', '2026-04']);
    expect(r.openingKnown).toBe(true);
    expect(r.months[0]).toMatchObject({ openingCents: 1050000, inflowCents: 30000, outflowCents: 12000, netCents: 18000, closingCents: 1068000 });
    expect(r.months[1]).toMatchObject({ openingCents: 1068000, closingCents: 1068000 });
  });

  it('shows no balances at all when no opening balance was ever recorded (never a fabricated figure)', () => {
    const r = buildCashFlow([cash({ gross_cents: 100 })], [{ ...accounts[0], opening_balance_on: null, opening_balance_cents: 0 }], ['2026-03']);
    expect(r.openingKnown).toBe(false);
    expect(r.months[0].openingCents).toBeNull();
    expect(r.months[0].closingCents).toBeNull();
    expect(cashNow(accounts, 500, false)).toBeNull();
    expect(cashNow(accounts, 500, true)).toBe(1000500);
    expect(paymentsNet([pay({ amount_cents: 300 }), pay({ amount_cents: 100, direction: 'out' }), pay({ amount_cents: 999, reconciliation_state: 'ignored' })])).toBe(200);
  });

  it('projects committed direct payments, expected OTA payouts, open liabilities and tax deadlines by certainty', () => {
    const stay = (o: Partial<StayRow>): StayRow => ({ intent_id: 'i', reference: 'BLG-X', unit_id: 'u-1', unit_slug: 's', check_in: '2026-04-10', check_out: '2026-04-13', status: 'confirmed', payment_status: 'unpaid', source: 'direct', currency: 'EUR', quoted_total_cents: 30000, paid_amount_cents: null, refunded_amount_cents: 0, confirmed_at: null, paid_at: null, guest_label: null, ...o });
    const p = projectCash({
      today: '2026-04-01', cashNowCents: 100000,
      stays: [stay({}), stay({ intent_id: 'paid', status: 'paid' }), stay({ intent_id: 'ota', source: 'booking_com', quoted_total_cents: 10000 }), stay({ intent_id: 'far', check_in: '2026-09-01', check_out: '2026-09-03' })],
      paidStayIntentIds: new Set(['paid']),
      openLiabilities: [tx({ kind: 'expense', gross_cents: 11900, due_on: '2026-04-20', payment_state: 'unpaid', booking_intent_id: null, booking_reference: null, counterparty_label: 'Cleaning GmbH' }), tx({ kind: 'expense', gross_cents: 500, payment_state: 'paid' })],
      deadlines: [{ kind: 'vat_advance_return', taxType: 'vat', periodKey: '2026-03', label: 'UStVA 03/2026', dueOn: '2026-05-11', nominalOn: '2026-05-10', origin: 'calculated', legalReference: '§ 18 UStG', amountCents: 4000 }],
    });
    expect(p.lines.map((l) => l.certainty)).toEqual(['committed', 'committed', 'expected', 'estimated']);
    expect(p.lines.find((l) => l.certainty === 'expected')?.cents).toBe(8500);
    const h30 = p.horizons[0];
    expect(h30).toMatchObject({ days: 30, committedInCents: 30000, expectedInCents: 8500, liabilitiesCents: 11900, estimatedTaxCents: 0, projectedCents: 100000 + 30000 + 8500 - 11900 });
    expect(p.horizons[1].estimatedTaxCents).toBe(4000);
    expect(projectCash({ today: '2026-04-01', cashNowCents: null, stays: [], paidStayIntentIds: new Set(), openLiabilities: [], deadlines: [] }).horizons.every((h) => h.projectedCents === null)).toBe(true);
  });
});

describe('property and channel profitability', () => {
  const unitRow = (o: Partial<UnitMonthlyRow>): UnitMonthlyRow => ({ period_key: '2026-03', unit_id: 'u-1', category: 'accommodation_revenue', pl_group: 'revenue', net_cents: 0, transactions: 1, ...o });
  const range = { from: '2026-03-01', to: '2026-04-01' };
  const units = [{ id: 'u-1', slug: 'studio-1', display_name: 'Studio 1', is_bookable: true }, { id: 'u-2', slug: 'studio-2', display_name: 'Studio 2', is_bookable: true }];
  const stays: StayRow[] = [
    { intent_id: 'i1', reference: 'BLG-1', unit_id: 'u-1', unit_slug: 'studio-1', check_in: '2026-02-27', check_out: '2026-03-03', status: 'paid', payment_status: 'paid', source: 'direct', currency: 'EUR', quoted_total_cents: 40000, paid_amount_cents: 40000, refunded_amount_cents: 0, confirmed_at: null, paid_at: null, guest_label: null },
    { intent_id: 'i2', reference: 'BLG-2', unit_id: 'u-1', unit_slug: 'studio-1', check_in: '2026-03-10', check_out: '2026-03-14', status: 'paid', payment_status: 'paid', source: 'booking_com', currency: 'EUR', quoted_total_cents: 50000, paid_amount_cents: null, refunded_amount_cents: 0, confirmed_at: null, paid_at: null, guest_label: null },
    { intent_id: 'i3', reference: 'BLG-3', unit_id: 'u-1', unit_slug: 'studio-1', check_in: '2026-03-20', check_out: '2026-03-22', status: 'cancelled', payment_status: 'refunded', source: 'direct', currency: 'EUR', quoted_total_cents: 1, paid_amount_cents: null, refunded_amount_cents: 0, confirmed_at: null, paid_at: null, guest_label: null },
  ];

  it('computes nights clipped to the range, ADR, occupancy, cost per night and cleaning per stay; unallocated costs are reported apart', () => {
    const r = buildProfitability({
      range, units, stays,
      unitRows: [unitRow({ net_cents: 84000 }), unitRow({ category: 'cleaning', pl_group: 'direct_cost', net_cents: 9000 }), unitRow({ category: 'ota_commission', pl_group: 'direct_cost', net_cents: 7000 }), unitRow({ category: 'electricity', pl_group: 'property_cost', net_cents: 3100 })],
      lines: [{ ...line({ category: 'laundry', net_cents: 4000, unit_id: null }), transaction: tx({ kind: 'expense', unit_id: null }) }, { ...line({ category: 'cleaning', net_cents: 9000, allocation_method: 'direct', unit_id: 'u-1' }), transaction: tx({ kind: 'expense', unit_id: 'u-1' }) }],
    });
    const u1 = r.units[0];
    expect(u1.nightsSold).toBe(2 + 4);
    expect(u1.nightsAvailable).toBe(31);
    expect(u1.stays).toBe(2);
    expect(u1.adrCents).toBe(14000);
    expect(u1.occupancy).toBeCloseTo(6 / 31, 5);
    expect(u1.contributionCents).toBe(84000 - 16000 - 3100);
    expect(u1.costPerOccupiedNightCents).toBe(Math.round(19100 / 6));
    expect(u1.cleaningPerStayCents).toBe(4500);
    expect(u1.otaCommissionShare).toBeCloseTo(7000 / 84000, 5);
    expect(u1.allocationMethods).toEqual([{ method: 'direct', cents: 9000 }]);
    expect(r.units[1]).toMatchObject({ revenueCents: 0, nightsSold: 0, adrCents: null, contributionMargin: null });
    expect(r.unallocatedCostsCents).toBe(4000);
    expect(r.unallocatedByCategory[0]).toMatchObject({ category: 'laundry', cents: 4000 });
    expect(r.totals.nightsSold).toBe(6);
  });

  it('channel economics net commission and fees against the channel that caused them', () => {
    const rev = tx({ channel: 'booking_com', gross_cents: 50000 });
    const com = tx({ kind: 'commission', channel: 'booking_com', gross_cents: 7500, booking_reference: 'BLG-2' });
    const direct = tx({ channel: 'direct' });
    const fee = tx({ kind: 'fee', channel: 'direct', gross_cents: 850 });
    const lines = [
      { ...line({ transaction_id: rev.id, net_cents: 46729 }), transaction: rev },
      { ...line({ transaction_id: com.id, category: 'ota_commission', net_cents: 7500 }), transaction: com },
      { ...line({ transaction_id: direct.id, net_cents: 28037 }), transaction: direct },
      { ...line({ transaction_id: fee.id, category: 'payment_fees', net_cents: 850 }), transaction: fee },
    ];
    const ch = buildChannelEconomics(lines, stays, range);
    const bcom = ch.find((c) => c.channel === 'booking_com')!;
    const dir = ch.find((c) => c.channel === 'direct')!;
    expect(bcom.grossRevenueCents).toBe(46729);
    expect(bcom.commissionCents).toBe(7500);
    expect(bcom.commissionShare).toBeCloseTo(7500 / 46729, 5);
    expect(bcom.contributionCents).toBe(46729 - 7500);
    expect(dir.paymentFeesCents).toBe(850);
    expect(dir.contributionCents).toBe(28037 - 850);
  });
});

describe('preview fixtures', () => {
  const L = fixtureLedger();

  it('every line and every header satisfies gross = net + vat, and headers equal the sum of their lines', () => {
    for (const l of L.lines) expect(l.net_cents + l.vat_cents, l.id).toBe(l.gross_cents);
    for (const t of L.transactions) {
      const mine = L.lines.filter((l) => l.transaction_id === t.id);
      expect(mine.length, t.id).toBeGreaterThan(0);
      expect(mine.reduce((s, l) => s + l.gross_cents, 0), t.id).toBe(t.gross_cents);
      expect(mine.reduce((s, l) => s + l.net_cents, 0), t.id).toBe(t.net_cents);
      expect(t.net_cents + t.vat_cents, t.id).toBe(t.gross_cents);
    }
  });

  it('a review-required tax code is never auto-verified, and every line VAT equals the code rate on its net (except reverse-charge and review lines)', () => {
    for (const l of L.lines) {
      const code = requireTaxCode(l.tax_code);
      if (code.reviewRequired) expect(l.classification, l.id).not.toBe('auto_verified');
      if (!code.reviewRequired && l.tax_code !== 'DE_REVERSE_CHARGE') expect(Math.abs(l.vat_cents - Math.round((l.net_cents * code.rateBp) / 10000)), `${l.id} ${l.tax_code}`).toBeLessThanOrEqual(1);
    }
  });

  it('covers the required scenarios: OTA commission, payout mismatch, refund, fees, missing document, reverse charge, asset candidate, minibar', () => {
    const kinds = new Set(L.transactions.map((t) => t.kind));
    expect(Array.from(kinds)).toEqual(expect.arrayContaining(['revenue', 'commission', 'refund', 'fee', 'expense', 'tax_payment']));
    expect(L.transactions.some((t) => t.reconciliation_state === 'mismatch' && t.channel === 'booking_com')).toBe(true);
    expect(L.transactions.some((t) => t.document_state === 'missing' && t.kind === 'expense')).toBe(true);
    expect(L.lines.some((l) => l.tax_code === 'DE_REVERSE_CHARGE' && l.classification === 'suggested')).toBe(true);
    expect(L.lines.some((l) => l.asset_state === 'candidate')).toBe(true);
    expect(L.lines.some((l) => l.allocation_method === 'occupied_nights')).toBe(true);
    expect(L.movements.map((m) => m.movement)).toEqual(expect.arrayContaining(['purchase', 'sale', 'waste', 'adjustment']));
    expect(L.payments.some((p) => p.reconciliation_state === 'unmatched' && p.source === 'bank')).toBe(true);
  });

  it('carries no guest PII: no e-mail addresses and no free-text guest names in descriptions or labels', () => {
    const text = JSON.stringify(L);
    // The only e-mail-shaped strings are the synthetic operator identities (posted_by / recorded_by); never a guest.
    const emails = text.match(/[\w.+-]+@[\w-]+\.[\w]+/g) ?? [];
    expect(emails.every((e) => e.endsWith('@example.com')), emails.join(' ')).toBe(true);
    for (const t of L.transactions) expect(t.description, t.id).not.toMatch(/@/);
    // Stays carry the booking desk's minimal label ("Last, F."), never a full name, and it never leaks into ledger text.
    for (const s of L.stays) expect(s.guest_label === null || /^[^,]+, [A-Z]\.$/.test(s.guest_label), s.reference).toBe(true);
    const surnames = L.stays.map((s) => s.guest_label?.split(',')[0]).filter((x): x is string => Boolean(x));
    for (const t of L.transactions) for (const n of surnames) expect(t.description, t.id).not.toContain(n);
  });

  it('the fixture source pages, filters and searches deterministically and every unit id resolves', async () => {
    const src = fixtureFinanceSource();
    const all = await src.transactions({ page: 1, pageSize: 500 });
    expect(all.total).toBe(L.transactions.length);
    const page = await src.transactions({ page: 1, pageSize: 5 });
    expect(page.rows).toHaveLength(5);
    const mism = await src.transactions({ page: 1, pageSize: 50, reconciliationState: 'mismatch' });
    expect(mism.rows.every((t) => t.reconciliation_state === 'mismatch')).toBe(true);
    const search = await src.transactions({ page: 1, pageSize: 50, search: 'booking.com' });
    expect(search.total).toBeGreaterThan(0);
    const ids = new Set(FIXTURE_UNITS.map((u) => u.id));
    for (const t of L.transactions) if (t.unit_id) expect(ids.has(t.unit_id), t.id).toBe(true);
    const counts = await src.exceptionCounts();
    expect(counts.mismatches).toBeGreaterThan(0);
    expect(counts.missing_documents).toBeGreaterThan(0);
    const vat = computeVatPosition('2000', await src.vatMonthly('2000-01-01', '2100-01-01'));
    expect(vat.outputVatCents).toBeGreaterThan(0);
  });
});

describe('finance permissions and preview gate', () => {
  it('viewer reads finance only; operator works the desk; admin alone reviews tax and configures', () => {
    expect(can('viewer', 'finance.view')).toBe(true);
    expect(can('viewer', 'finance.edit')).toBe(false);
    expect(can('operator', 'finance.edit')).toBe(true);
    expect(can('operator', 'finance.review')).toBe(true);
    expect(can('operator', 'finance.export')).toBe(true);
    expect(can('operator', 'finance.tax_review')).toBe(false);
    expect(can('operator', 'finance.configure')).toBe(false);
    expect(can('admin', 'finance.tax_review')).toBe(true);
    expect(can('admin', 'finance.configure')).toBe(true);
    expect(can(null, 'finance.view')).toBe(false);
  });

  it('the preview demo allows reading finance and refuses every finance write', () => {
    expect(previewAllows('finance.view')).toBe(true);
    for (const c of ['finance.edit', 'finance.review', 'finance.tax_review', 'finance.export', 'finance.configure'] as const) expect(previewAllows(c), c).toBe(false);
  });
});

describe('presentation and exports', () => {
  it('presents every known state with a label and tone and degrades unknown values without throwing', () => {
    expect(present('reconciliation', 'matched').tone).toBe('positive');
    expect(present('reconciliation', 'mismatch').tone).toBe('critical');
    expect(present('period', 'locked').glyph).toBe('lock');
    expect(present('stage', 'system_estimate').label).toMatch(/estimate/i);
    expect(present('document', 'missing').tone).toBe('critical');
    const unknown = present('document', 'no_such_state');
    expect(unknown.label).toBe('no_such_state');
    expect(present('review', null).tone).toBe('neutral');
  });

  it('exports carry a metadata header naming the generator, the period and the estimate caveat; ledger rows follow', () => {
    const t = tx({ counterparty_label: 'Cleaning GmbH', kind: 'expense' });
    const csv = ledgerCsv({ kind: 'transaction_ledger', from: '2026-03-01', to: '2026-04-01', generatedAt: '2026-04-02T00:00:00Z', generatedBy: 'op' }, [{ ...line({ transaction_id: t.id }), transaction: t }], () => 'Studio 1');
    expect(csv).toContain('# generator;bolagio-control-finance');
    expect(csv).toContain('# period;2026-03-01;2026-04-01 (exclusive)');
    expect(csv).not.toContain('ESTIMATE');
    expect(csv.split('\r\n').filter((l) => l && !l.startsWith('#'))).toHaveLength(2);
    const vat = vatReportCsv({ kind: 'vat_report', from: '2026-03-01', to: '2026-04-01', generatedAt: 'x', generatedBy: 'op', estimate: true }, computeVatPosition('2026-03', []));
    expect(vat).toContain('system estimates');
    for (const k of Object.keys(EXPORT_LABEL) as ExportKind[]) expect(EXPORT_LABEL[k].length).toBeGreaterThan(3);
  });
});
