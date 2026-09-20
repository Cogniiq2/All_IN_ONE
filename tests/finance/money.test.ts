import { describe, expect, it } from 'vitest';
import { allocate, formatCents, fromNet, parseDecimalToCents, roundHalfUp, splitGross, vatFromNet } from '@/lib/finance/money';

describe('money — integer cents and the rounding policy', () => {
  it('rounds half away from zero, symmetrically', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(2.4999)).toBe(2);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  it('computes VAT from net at 7 % and 19 %', () => {
    expect(vatFromNet(10000, 700)).toBe(700);
    expect(vatFromNet(10000, 1900)).toBe(1900);
    expect(vatFromNet(999, 1900)).toBe(190); // 189.81 → 190
    expect(vatFromNet(1, 1900)).toBe(0);
    expect(vatFromNet(3, 1900)).toBe(1); // 0.57 → 1
  });

  it('splits gross preserving the gross to the cent', () => {
    for (const gross of [1, 2, 3, 99, 100, 10700, 11900, 58000, 4350, 123456789]) {
      for (const rate of [0, 700, 1900]) {
        const s = splitGross(gross, rate);
        expect(s.net + s.vat).toBe(gross);
        expect(Math.abs(s.vat - vatFromNet(s.net, rate))).toBeLessThanOrEqual(1);
      }
    }
    expect(splitGross(10700, 700)).toEqual({ net: 10000, vat: 700, gross: 10700 });
    expect(splitGross(500, 1900)).toEqual({ net: 420, vat: 80, gross: 500 });
    expect(splitGross(-10700, 700)).toEqual({ net: -10000, vat: -700, gross: -10700 });
  });

  it('fromNet and splitGross round-trip on whole euros', () => {
    const f = fromNet(58000, 700);
    expect(f).toEqual({ net: 58000, vat: 4060, gross: 62060 });
    expect(splitGross(f.gross, 700)).toEqual(f);
  });

  it('allocates by largest remainder, summing exactly', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(75000, [400, 250, 100])).toEqual([40000, 25000, 10000]);
    expect(allocate(1001, [3, 7])).toEqual([300, 701]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(5, [0, 0])).toEqual([5, 0]);
    expect(allocate(7, [1, 0, 2])).toEqual([2, 0, 5]);
    for (const total of [1, 17, 999, 123457]) {
      const parts = allocate(total, [13, 29, 7, 41, 3]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('refuses non-integer money', () => {
    expect(() => vatFromNet(10.5, 700)).toThrow(TypeError);
    expect(() => splitGross(Number.NaN, 700)).toThrow(TypeError);
    expect(() => vatFromNet(100, 10001)).toThrow(TypeError);
  });

  it('formats in de-DE and parses both decimal conventions', () => {
    expect(formatCents(1234567)).toContain('12.345,67');
    expect(formatCents(-500, 'EUR', { signed: true })).toContain('-5,00');
    expect(parseDecimalToCents('1.234,56')).toBe(123456);
    expect(parseDecimalToCents('1,234.56')).toBe(123456);
    expect(parseDecimalToCents('1234.56')).toBe(123456);
    expect(parseDecimalToCents('-12,5')).toBe(-1250);
    expect(parseDecimalToCents('€ 99')).toBe(9900);
    expect(parseDecimalToCents('abc')).toBeNull();
    expect(parseDecimalToCents('')).toBeNull();
  });
});
