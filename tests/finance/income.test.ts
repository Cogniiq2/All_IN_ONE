import { describe, expect, it } from 'vitest';
import { buildIncome, type IncomeInputs } from '@/lib/finance/income';
import { computeStayTax, type StayTaxInput } from '@/lib/finance/tax/stay-tax';

const TODAY = '2026-10-19';

function stay(over: Partial<StayTaxInput> = {}): StayTaxInput {
  return {
    reservationId: 'r1', reference: 'R1', unitName: 'Apartment I', source: 'booking_com', statusClass: 'active',
    checkIn: '2026-10-11', checkOut: '2026-10-16', nights: 5, currency: 'EUR', beds24GrossCents: 107000, beds24CommissionCents: 17500, settlement: null, ...over,
  };
}

function inputs(staysIn: StayTaxInput[], over: Partial<IncomeInputs> = {}): IncomeInputs {
  return {
    stays: staysIn.map((s) => computeStayTax(s, TODAY)),
    unitOf: (id) => (id === 'r2' ? { id: 'u2', name: 'Apartment II' } : { id: 'u1', name: 'Apartment I' }),
    minibarNetCents: 0, minibarCogsCents: 0, minibarItems: 0, cleaningActualNetCents: null, cleaningPerStayCents: null, ...over,
  };
}

describe('income = stays without VAT + minibar − platform − cleaning', () => {
  it('adds and subtracts every part, VAT left out', () => {
    const r = buildIncome(inputs([stay(), stay({ reservationId: 'r2', reference: 'R2', beds24GrossCents: 53500, beds24CommissionCents: 8750 })], { minibarNetCents: 2000, minibarItems: 4, cleaningPerStayCents: 4500 }));
    // 1.070,00 € → 1.000,00 € net; 535,00 € → 500,00 € net.
    expect(r.stays).toMatchObject({ count: 2, grossCents: 160500, vatCents: 10500, netCents: 150000 });
    expect(r.platform).toMatchObject({ commissionCents: 26250, staysUnknown: 0, state: 'known' });
    expect(r.cleaning).toMatchObject({ cents: 9000, source: 'setting', state: 'expected' });
    expect(r.incomeCents).toBe(150000 + 2000 - 26250 - 9000);
    expect(r.final).toBe(true);
    expect(r.byUnit.map((u) => [u.name, u.incomeCents])).toEqual([['Apartment I', 100000 - 17500 - 4500], ['Apartment II', 50000 - 8750 - 4500]]);
  });

  it('prefers booked cleaning invoices over the expected cost per stay', () => {
    const r = buildIncome(inputs([stay()], { cleaningActualNetCents: 3800, cleaningPerStayCents: 4500 }));
    expect(r.cleaning).toMatchObject({ cents: 3800, source: 'invoices', state: 'known' });
  });

  it('never treats an unknown part as zero without saying so', () => {
    const r = buildIncome(inputs([stay({ beds24CommissionCents: null })]));
    expect(r.platform.state).toBe('unknown');
    expect(r.cleaning.state).toBe('unknown');
    expect(r.final).toBe(false);
    expect(r.gaps.join(' ')).toMatch(/commission is not known yet for 1 stay/);
    expect(r.gaps.join(' ')).toMatch(/Cleaning has no cost recorded/);
  });

  it('earns nothing from a cancellation without a charge, and counts a running stay as provisional', () => {
    const r = buildIncome(inputs([stay({ statusClass: 'cancelled' }), stay({ reservationId: 'r3', checkIn: '2026-10-17', checkOut: '2026-10-24' })], { cleaningPerStayCents: 0 }));
    expect(r.stays.count).toBe(1);
    expect(r.stays.running).toBe(1);
    expect(r.final).toBe(false);
  });

  it('counts the non-deductible reverse-charge VAT of a long stay as a cost', () => {
    const r = buildIncome(inputs([stay({ checkIn: '2026-01-01', checkOut: '2026-08-01', nights: 212, beds24GrossCents: 1000000, beds24CommissionCents: 100000 })], { cleaningPerStayCents: 0 }));
    expect(r.stays.netCents).toBe(1000000);
    expect(r.platform.commissionCents).toBe(100000 + 19000);
    expect(r.incomeCents).toBe(1000000 - 119000);
  });
});
