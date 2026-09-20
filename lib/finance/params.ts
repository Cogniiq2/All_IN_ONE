/**
 * Search-param parsing for finance screens. Pure. Everything is bounded
 * and validated; a bad value falls back rather than throwing, and nothing
 * here accepts a guest identifier.
 */

import { addDays, berlinToday, isIsoDate, mtd, quarterKey, quarterRange, yearRange, ytd, type DateRange, type IsoDate } from '@/lib/finance/periods';

export type Params = Record<string, string | string[] | undefined>;

export function one(p: Params, key: string, max = 80): string | null {
  const v = p[key];
  const s = Array.isArray(v) ? v[0] : v;
  const t = (s ?? '').trim().slice(0, max);
  return t || null;
}

export function pageOf(p: Params): number {
  const n = Number.parseInt(one(p, 'page', 6) ?? '1', 10);
  return Number.isFinite(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export function rangeOf(p: Params, fallback: 'mtd' | 'ytd' | 'quarter' | 'last90' = 'mtd', today: IsoDate = berlinToday()): DateRange {
  const from = one(p, 'from', 10);
  const to = one(p, 'to', 10);
  if (from && to && isIsoDate(from) && isIsoDate(to) && to > from && addDays(from, 366 * 3) >= to) return { from, to };
  if (fallback === 'ytd') return ytd(today);
  if (fallback === 'quarter') return quarterRange(quarterKey(today));
  if (fallback === 'last90') return { from: addDays(today, -90), to: addDays(today, 1) };
  return mtd(today);
}

export function presetsFor(today: IsoDate = berlinToday()): Array<{ label: string; from: string; to: string }> {
  const m = mtd(today);
  const y = ytd(today);
  const q = quarterRange(quarterKey(today));
  const prevMonthFrom = `${addDays(m.from, -1).slice(0, 7)}-01`;
  const lastYear = yearRange(Number(today.slice(0, 4)) - 1);
  return [
    { label: 'This month', from: m.from, to: m.to },
    { label: 'Last month', from: prevMonthFrom, to: m.from },
    { label: 'Quarter', from: q.from, to: q.to },
    { label: 'Year to date', from: y.from, to: y.to },
    { label: 'Last year', from: lastYear.from, to: lastYear.to },
  ];
}

export function yearOfParams(p: Params, today: IsoDate = berlinToday()): number {
  const y = Number.parseInt(one(p, 'year', 4) ?? '', 10);
  return Number.isFinite(y) && y >= 2020 && y <= 2100 ? y : Number(today.slice(0, 4));
}

export function isUuid(v: string | null): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
