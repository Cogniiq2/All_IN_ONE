import { describe, expect, it } from 'vitest';
import { addMonths, bavarianHolidays, berlinDate, isWorkingDay, monthKeysBetween, mtd, nextWorkingDay, nightsInRange, periodRange, quarterKey, ytd } from '@/lib/finance/periods';
import { DEFAULT_TAX_CALENDAR_POLICY, calculatedDeadlines, gewstAdvanceDeadlines, kstAdvanceDeadlines, mergeDeadlines, urgencyOf, vatDeadlinesForYear, vatPeriodKeyFor } from '@/lib/finance/tax/calendar';

describe('periods — Berlin civil dates and buckets', () => {
  it('buckets an instant by the Berlin date, across DST and year end', () => {
    expect(berlinDate('2026-03-28T23:30:00Z')).toBe('2026-03-29'); // CET +1
    expect(berlinDate('2026-03-29T22:30:00Z')).toBe('2026-03-30'); // CEST +2 after the switch
    expect(berlinDate('2026-10-25T22:30:00Z')).toBe('2026-10-25'); // back to CET: 23:30 local
    expect(berlinDate('2026-12-31T23:10:00Z')).toBe('2027-01-01'); // year end
    expect(berlinDate('2027-01-01T00:10:00+01:00')).toBe('2027-01-01');
  });

  it('adds months clamping to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('quarter keys and ranges', () => {
    expect(quarterKey('2026-09-30')).toBe('2026-Q3');
    expect(periodRange('2026-Q4')).toEqual({ from: '2026-10-01', to: '2027-01-01' });
    expect(periodRange('2026')).toEqual({ from: '2026-01-01', to: '2027-01-01' });
    expect(periodRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-03-01' });
    expect(monthKeysBetween('2026-11-15', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('MTD/YTD windows and nights within a range', () => {
    expect(mtd('2026-09-20')).toEqual({ from: '2026-09-01', to: '2026-09-21' });
    expect(ytd('2026-09-20')).toEqual({ from: '2026-01-01', to: '2026-09-21' });
    expect(ytd('2026-03-20', 4)).toEqual({ from: '2025-04-01', to: '2026-03-21' });
    expect(nightsInRange('2026-09-28', '2026-10-03', periodRange('2026-09'))).toBe(3);
    expect(nightsInRange('2026-09-28', '2026-10-03', periodRange('2026-10'))).toBe(2);
    expect(nightsInRange('2026-08-01', '2026-08-05', periodRange('2026-09'))).toBe(0);
  });

  it('knows Bavarian holidays and shifts to the next working day (§ 108 Abs. 3 AO)', () => {
    const h = bavarianHolidays(2026);
    expect(h.has('2026-04-03')).toBe(true); // Karfreitag 2026
    expect(h.has('2026-06-04')).toBe(true); // Fronleichnam 2026
    expect(isWorkingDay('2026-10-10')).toBe(false); // Saturday
    expect(nextWorkingDay('2026-10-10')).toBe('2026-10-12');
    expect(nextWorkingDay('2027-01-01')).toBe('2027-01-04'); // Fri holiday → Mon
    expect(nextWorkingDay('2026-09-21')).toBe('2026-09-21');
  });
});

describe('tax calendar — planning dates from policy and statute', () => {
  it('quarterly UStVA is due on the 10th after the quarter, shifted to a working day', () => {
    const q = vatDeadlinesForYear(2026, DEFAULT_TAX_CALENDAR_POLICY).filter((d) => d.kind === 'vat_advance_return');
    expect(q.map((d) => [d.periodKey, d.nominalOn, d.dueOn])).toEqual([
      ['2026-Q1', '2026-04-10', '2026-04-10'],
      ['2026-Q2', '2026-07-10', '2026-07-10'],
      ['2026-Q3', '2026-10-10', '2026-10-12'],
      ['2026-Q4', '2027-01-10', '2027-01-11'],
    ]);
  });

  it('monthly with Dauerfristverlängerung moves each deadline a month and adds the 1/11 prepayment', () => {
    const d = vatDeadlinesForYear(2026, { ...DEFAULT_TAX_CALENDAR_POLICY, vatFilingFrequency: 'monthly', dauerfristverlaengerung: true });
    const jan = d.find((x) => x.periodKey === '2026-01')!;
    expect(jan.nominalOn).toBe('2026-03-10');
    expect(d.find((x) => x.kind === 'vat_special_prepayment')!.nominalOn).toBe('2026-02-10');
    expect(d.filter((x) => x.kind === 'vat_advance_return')).toHaveLength(12);
  });

  it('annual return, KSt and GewSt advance dates', () => {
    const annual = vatDeadlinesForYear(2025, DEFAULT_TAX_CALENDAR_POLICY).find((d) => d.kind === 'vat_annual_return')!;
    expect(annual.nominalOn).toBe('2026-07-31');
    expect(kstAdvanceDeadlines(2026).map((d) => d.nominalOn)).toEqual(['2026-03-10', '2026-06-10', '2026-09-10', '2026-12-10']);
    expect(gewstAdvanceDeadlines(2026).map((d) => d.nominalOn)).toEqual(['2026-02-15', '2026-05-15', '2026-08-15', '2026-11-15']);
    // 15 Aug 2026 is Mariä Himmelfahrt (Saturday anyway) → Monday 17 Aug
    expect(gewstAdvanceDeadlines(2026)[2].dueOn).toBe('2026-08-17');
    expect(gewstAdvanceDeadlines(2026)[3].dueOn).toBe('2026-11-16'); // 15 Nov 2026 is a Sunday
  });

  it('official dates override calculated ones and custom ones append; urgency is by days', () => {
    const merged = mergeDeadlines(calculatedDeadlines(2026, DEFAULT_TAX_CALENDAR_POLICY), [{ taxType: 'vat', periodKey: '2026-Q3', dueOn: '2026-10-20', label: 'Q3 per tax office', kind: 'vat_advance_return' }], [{ taxType: 'other', periodKey: '2026', dueOn: '2026-11-30', label: 'Adviser: send Q3 documents' }]);
    const q3 = merged.filter((d) => d.periodKey === '2026-Q3');
    expect(q3).toHaveLength(1);
    expect(q3[0].origin).toBe('official');
    expect(q3[0].dueOn).toBe('2026-10-20');
    expect(merged.some((d) => d.origin === 'custom')).toBe(true);
    expect(merged.map((d) => d.dueOn)).toEqual([...merged.map((d) => d.dueOn)].sort());
    expect(urgencyOf(q3[0], '2026-10-25')).toBe('overdue');
    expect(urgencyOf(q3[0], '2026-10-10')).toBe('due_soon');
    expect(urgencyOf(q3[0], '2026-09-01')).toBe('upcoming');
    expect(urgencyOf(q3[0], '2026-01-01')).toBe('later');
  });

  it('maps a booked date to the VAT period under each policy', () => {
    expect(vatPeriodKeyFor('2026-08-31', DEFAULT_TAX_CALENDAR_POLICY)).toBe('2026-Q3');
    expect(vatPeriodKeyFor('2026-08-31', { ...DEFAULT_TAX_CALENDAR_POLICY, vatFilingFrequency: 'monthly' })).toBe('2026-08');
    expect(vatPeriodKeyFor('2026-08-31', { ...DEFAULT_TAX_CALENDAR_POLICY, vatFilingFrequency: 'annual_only' })).toBe('2026');
  });
});
