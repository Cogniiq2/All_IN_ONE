/**
 * ══════════════════════════════════════════════════════════════════════════
 * MONEY — integer minor units, and nothing else.
 *
 * Every amount in the finance domain is an integer number of cents (bigint
 * in Postgres, `number` here — safe far beyond any figure this company will
 * see: 2^53 cents is ninety trillion euros). Rates are basis points
 * (700 = 7.00 %). No float ever represents money; a float appears only as
 * the transient inside `Math.round`.
 *
 * ── Rounding policy (docs/finance/vat.md §rounding) ──────────────────────
 *   • VAT from a NET amount:   vat = round_half_up(net × rate / 10000)
 *   • NET from a GROSS amount: net = round_half_up(gross / (1 + rate/10000)),
 *                              vat = gross − net  (the gross is preserved to
 *                              the cent, because the gross is what the guest
 *                              paid and what the payment must match)
 *   • half-up on the absolute value, sign restored, so a refund of −10.70
 *     splits exactly as the +10.70 it reverses
 *   • splitting one amount over several parts: largest-remainder method; the
 *     parts always sum to the whole, never off by a cent
 *
 * `round_half_up` rather than banker's rounding: it is what § 14 UStG
 * invoices, DATEV and the tax office expect (kaufmännisches Runden).
 * ══════════════════════════════════════════════════════════════════════════
 */

export type Cents = number;
export type BasisPoints = number;

export function assertCents(value: unknown, what = 'amount'): Cents {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new TypeError(`${what} must be an integer number of cents, got ${String(value)}`);
  }
  return value;
}

export function assertBasisPoints(value: unknown): BasisPoints {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000) {
    throw new TypeError(`rate must be integer basis points 0..10000, got ${String(value)}`);
  }
  return value;
}

/** Kaufmännisches Runden: half away from zero. */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) + Number.EPSILON);
}

/** VAT on a net amount at a rate. */
export function vatFromNet(netCents: Cents, rateBp: BasisPoints): Cents {
  assertCents(netCents, 'net');
  assertBasisPoints(rateBp);
  return roundHalfUp((netCents * rateBp) / 10000);
}

/** Split a gross amount into net and VAT; the gross is preserved exactly. */
export function splitGross(grossCents: Cents, rateBp: BasisPoints): { net: Cents; vat: Cents; gross: Cents } {
  assertCents(grossCents, 'gross');
  assertBasisPoints(rateBp);
  if (rateBp === 0) return { net: grossCents, vat: 0, gross: grossCents };
  const net = roundHalfUp(grossCents / (1 + rateBp / 10000));
  return { net, vat: grossCents - net, gross: grossCents };
}

/** Build the three figures from a net amount. */
export function fromNet(netCents: Cents, rateBp: BasisPoints): { net: Cents; vat: Cents; gross: Cents } {
  const vat = vatFromNet(netCents, rateBp);
  return { net: netCents, vat, gross: netCents + vat };
}

/**
 * Largest-remainder allocation: split `total` in proportion to `weights`,
 * every share an integer, shares summing to `total` exactly. Zero weights
 * receive zero. Equal weights give an equal split with the remainder
 * distributed to the earliest parts.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  assertCents(total, 'total');
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new TypeError('weights must be finite and non-negative');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const out = new Array<number>(weights.length).fill(0);
    out[0] = total;
    return out;
  }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors.map((v) => sign * v);
}

/** Percentage (two decimals) of a part in a whole, for display; null when the whole is zero. */
export function ratio(part: Cents, whole: Cents): number | null {
  if (whole === 0) return null;
  return part / whole;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return total;
}

/** `1234567` → `12.345,67 €` (de-DE). Negative amounts keep the sign. */
export function formatCents(cents: Cents | null | undefined, currency = 'EUR', opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (cents === null || cents === undefined) return '—';
  const f = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact ? 0 : 2,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  });
  return f.format(cents / 100);
}

/** `700` → `7 %`, `1900` → `19 %`, `550` → `5,5 %`. */
export function formatRate(rateBp: BasisPoints): string {
  const pct = rateBp / 100;
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(pct)} %`;
}

/** Parse a German or English decimal string ("1.234,56", "1234.56", "-12,5") to cents. Null when it is not a number. */
export function parseDecimalToCents(text: string): Cents | null {
  const t = text.trim().replace(/\s|€|EUR/g, '');
  if (!t) return null;
  let normalized: string;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) normalized = t.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) normalized = t.replace(/,/g, '');
  else normalized = t;
  if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
  const negative = normalized.startsWith('-');
  const [whole, frac = ''] = normalized.replace(/^[-+]/, '').split('.');
  const cents = Number(whole) * 100 + Math.round(Number(`0.${frac || '0'}`) * 100);
  return negative ? -cents : cents;
}
