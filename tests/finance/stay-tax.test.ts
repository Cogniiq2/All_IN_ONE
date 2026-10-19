import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAY_TAX_POLICY,
  buildVatReturn,
  computeStayTax,
  isLongTermLetting,
  periodMonths,
  periodOf,
  type StayTaxInput,
} from '@/lib/finance/tax/stay-tax';

const TODAY = '2026-10-19';
const NO_OTHER = { kz66VatCents: 0, kz81BaseCents: 0, kz81VatCents: 0, otherKz86BaseCents: 0, otherKz86VatCents: 0 };

function stay(over: Partial<StayTaxInput> = {}): StayTaxInput {
  return {
    reservationId: 'r1',
    reference: '5512345678',
    unitName: 'Apartment I',
    source: 'booking_com',
    statusClass: 'active',
    checkIn: '2026-10-11',
    checkOut: '2026-10-16',
    nights: 5,
    currency: 'EUR',
    beds24GrossCents: 162000,
    beds24CommissionCents: null,
    settlement: null,
    ...over,
  };
}

describe('short stays: 7 % taken out of the full price', () => {
  it('splits the guest price into net and VAT to the cent, gross preserved', () => {
    const t = computeStayTax(stay(), TODAY);
    expect(t.kind).toBe('short_stay');
    expect(t.revenue).toEqual({ grossCents: 162000, netCents: 151402, vatCents: 10598, rateBp: 700, source: 'beds24' });
    expect(t.ustva.kz86BaseCents + t.ustva.kz86VatCents).toBe(162000);
    expect(t.vatMonth).toBe('2026-10');
    expect(t.completed).toBe(true);
  });

  it('puts the VAT in the month the stay ENDED, not when it began or was booked', () => {
    const t = computeStayTax(stay({ checkIn: '2026-10-29', checkOut: '2026-11-02', nights: 4 }), TODAY);
    expect(t.vatMonth).toBe('2026-11');
    expect(t.completed).toBe(false);
  });

  it('never lets the commission reduce the taxable amount', () => {
    const t = computeStayTax(stay({ beds24CommissionCents: 26568 }), TODAY);
    expect(t.revenue?.netCents).toBe(151402);
    expect(t.ustva.kz86BaseCents).toBe(151402);
  });

  it('uses the Booking.com statement over Beds24 and flags a difference', () => {
    const t = computeStayTax(
      stay({ settlement: { payoutId: 'P1', payoutDate: '2026-10-20', grossCents: 160000, commissionCents: 24000, paymentFeeCents: 2240, netCents: 133760, reservationStatus: 'ok' } }),
      TODAY
    );
    expect(t.revenue?.source).toBe('statement');
    expect(t.revenue?.grossCents).toBe(160000);
    expect(t.questions.map((q) => q.code)).toContain('gross_mismatch');
    expect(t.payout).toEqual({ netCents: 133760, date: '2026-10-20', payoutId: 'P1', state: 'paid_out' });
  });
});

describe('Booking.com commission: reverse charge, owed and deducted', () => {
  it('reports 19 % on the commission in boxes 46/47 and deducts it in 67 — net zero', () => {
    const t = computeStayTax(stay({ beds24CommissionCents: 4166 }), TODAY);
    expect(t.commission).toEqual({ netCents: 4166, reverseChargeVatCents: 792, deductibleVatCents: 792, source: 'beds24' });
    expect(t.ustva).toMatchObject({ kz46BaseCents: 4166, kz47VatCents: 792, kz67VatCents: 792 });
    expect(t.vatPayableCents).toBe(10598);
    expect(t.keptCents).toBe(162000 - 10598 - 4166);
    expect(t.payout.state).toBe('expected');
  });

  it('treats the payment fee per the company setting; either way it costs no VAT on a taxable stay', () => {
    const settlement = { payoutId: 'P1', payoutDate: '2026-10-20', grossCents: 162000, commissionCents: 24300, paymentFeeCents: 2268, netCents: 135432, reservationStatus: 'ok' };
    const rc = computeStayTax(stay({ settlement }), TODAY);
    const ex = computeStayTax(stay({ settlement }), TODAY, { ...DEFAULT_STAY_TAX_POLICY, paymentFee: 'exempt' });
    expect(rc.ustva.kz46BaseCents).toBe(24300 + 2268);
    expect(ex.ustva.kz46BaseCents).toBe(24300);
    expect(rc.vatPayableCents).toBe(ex.vatPayableCents);
    expect(rc.steps.find((s) => s.key === 'fee')?.certainty).toBe('adviser');
  });

  it('says so when the commission is not known, and blocks the return only once the stay has ended', () => {
    const past = computeStayTax(stay(), TODAY);
    expect(past.commission).toBeNull();
    expect(past.questions.find((q) => q.code === 'commission_unknown')?.blocksReturn).toBe(true);
    expect(past.keptCents).toBeNull();
    const future = computeStayTax(stay({ checkIn: '2027-05-07', checkOut: '2027-05-10', nights: 3 }), TODAY);
    expect(future.questions.find((q) => q.code === 'commission_unknown')?.blocksReturn).toBe(false);
  });

  it('has no commission on a direct booking', () => {
    const t = computeStayTax(stay({ source: 'direct' }), TODAY);
    expect(t.commission).toBeNull();
    expect(t.questions).toEqual([]);
    expect(t.keptCents).toBe(162000 - 10598);
  });
});

describe('long-term letting: exempt, and its costs lose the deduction', () => {
  it('draws the line at six months', () => {
    expect(isLongTermLetting('2026-01-15', '2026-07-15')).toBe(false);
    expect(isLongTermLetting('2026-01-15', '2026-07-16')).toBe(true);
    expect(isLongTermLetting('2026-08-31', '2027-02-28')).toBe(false);
  });

  it('charges no VAT, reports box 48, and makes the commission VAT a cost', () => {
    const t = computeStayTax(stay({ checkIn: '2026-01-01', checkOut: '2026-08-01', nights: 212, beds24GrossCents: 1000000, beds24CommissionCents: 100000 }), TODAY);
    expect(t.kind).toBe('long_stay');
    expect(t.revenue).toMatchObject({ netCents: 1000000, vatCents: 0, rateBp: 0 });
    expect(t.ustva).toMatchObject({ kz86BaseCents: 0, kz48BaseCents: 1000000, kz47VatCents: 19000, kz67VatCents: 0 });
    expect(t.vatPayableCents).toBe(19000);
    expect(t.keptCents).toBe(1000000 - 100000 - 19000);
  });
});

describe('cancellations', () => {
  it('taxes nothing on a cancellation with no charge', () => {
    const t = computeStayTax(stay({ statusClass: 'cancelled' }), TODAY);
    expect(t.kind).toBe('cancelled');
    expect(t.vatMonth).toBeNull();
    expect(t.vatPayableCents).toBe(0);
  });

  it('lists a kept cancellation charge as an adviser question and keeps it out of the return', () => {
    const settlement = { payoutId: 'P2', payoutDate: '2026-10-20', grossCents: 10700, commissionCents: 1605, paymentFeeCents: 0, netCents: 9095, reservationStatus: 'cancelled' };
    const t = computeStayTax(stay({ statusClass: 'cancelled', settlement }), TODAY);
    expect(t.kind).toBe('cancellation_charge');
    expect(t.ustva.kz86BaseCents).toBe(0);
    expect(t.questions.find((q) => q.code === 'cancellation_charge')).toMatchObject({ amountCents: 700, blocksReturn: true });
    const taxed = computeStayTax(stay({ statusClass: 'cancelled', settlement }), TODAY, { ...DEFAULT_STAY_TAX_POLICY, cancellationCharge: 'taxable' });
    expect(taxed.ustva).toMatchObject({ kz86BaseCents: 10000, kz86VatCents: 700 });
  });
});

describe('everything else', () => {
  it('owner blocks and unaccepted requests are not sales', () => {
    expect(computeStayTax(stay({ statusClass: 'blocked' }), TODAY).kind).toBe('not_a_stay');
    expect(computeStayTax(stay({ statusClass: 'provisional' }), TODAY).vatPayableCents).toBe(0);
  });

  it('refuses to convert currencies', () => {
    const t = computeStayTax(stay({ currency: 'USD' }), TODAY);
    expect(t.questions[0]).toMatchObject({ code: 'non_eur', blocksReturn: true });
    expect(t.ustva.kz86BaseCents).toBe(0);
  });

  it('small business: no VAT on the sale, reverse charge owed and not deductible', () => {
    const t = computeStayTax(stay({ beds24CommissionCents: 10000 }), TODAY, { ...DEFAULT_STAY_TAX_POLICY, smallBusinessScheme: true });
    expect(t.revenue?.vatCents).toBe(0);
    expect(t.ustva).toMatchObject({ kz86BaseCents: 0, kz47VatCents: 1900, kz67VatCents: 0 });
  });

  it('writes every step with a certainty, and legal basis on the rules', () => {
    const t = computeStayTax(stay({ beds24CommissionCents: 4166 }), TODAY);
    expect(t.steps.map((s) => s.key)).toEqual(['kind', 'amount', 'split', 'period', 'commission', 'commission-source', 'result']);
    for (const s of t.steps) expect(['law', 'policy', 'adviser']).toContain(s.certainty);
    expect(t.steps.find((s) => s.key === 'split')?.formula).toContain('1.514,02');
  });
});

describe('the VAT return', () => {
  it('maps periods to months', () => {
    expect(periodMonths('2026-Q4')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(periodOf('2026-11', 'quarter')).toBe('2026-Q4');
    expect(periodOf('2026-11', 'month')).toBe('2026-11');
  });

  it('sums the boxes of the stays ending in the period, exact and as the form computes them', () => {
    const a = computeStayTax(stay({ beds24CommissionCents: 4166 }), TODAY);
    const b = computeStayTax(stay({ reservationId: 'r2', reference: 'B', checkIn: '2026-10-01', checkOut: '2026-10-03', nights: 2, beds24GrossCents: 25399, beds24CommissionCents: 4166 }), TODAY);
    const later = computeStayTax(stay({ reservationId: 'r3', reference: 'C', checkIn: '2026-11-20', checkOut: '2026-11-22', beds24GrossCents: 30000 }), TODAY);
    const r = buildVatReturn('2026-10', [a, b, later], { ...NO_OTHER, kz66VatCents: 1500 });
    const box = (kz: string) => r.boxes.find((x) => x.kz === kz)!;
    expect(r.stays).toHaveLength(2);
    expect(box('86').baseCents).toBe(151402 + 23737);
    expect(box('86').vatCents).toBe(10598 + 1662);
    expect(box('86').formBaseEuros).toBe(1751);
    expect(box('86').formVatCents).toBe(12257);
    expect(box('46').baseCents).toBe(8332);
    expect(box('47').vatCents).toBe(box('67').vatCents);
    expect(r.exactPayableCents).toBe(10598 + 1662 - 1500);
    // The form drops the cents of the base and computes 7 % itself: 1.751 € × 7 % = 122,57 € vs exact 122,60 €.
    expect(box('86').vatCents! - box('86').formVatCents!).toBe(3);
    expect(r.formPayableCents).toBe(12257 - 1500);
    expect(box('83').vatCents).toBe(r.exactPayableCents);
    expect(r.complete).toBe(true);
  });

  it('is incomplete while a stay in it is still running or a blocking question is open', () => {
    const running = computeStayTax(stay({ checkIn: '2026-10-17', checkOut: '2026-10-24', beds24CommissionCents: 1000 }), TODAY);
    expect(buildVatReturn('2026-10', [running], NO_OTHER)).toMatchObject({ openStays: 1, complete: false });
    const unknownCommission = computeStayTax(stay(), TODAY);
    expect(buildVatReturn('2026-10', [unknownCommission], NO_OTHER).complete).toBe(false);
  });
});
