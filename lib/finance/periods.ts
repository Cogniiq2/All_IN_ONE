/**
 * ══════════════════════════════════════════════════════════════════════════
 * PERIODS AND DATES — Europe/Berlin, and which date means what.
 *
 *   transaction time   when a row was written (never used for bucketing)
 *   service date       when the supply was performed; for a stay, the
 *                      check-out date ends the accommodation service
 *   invoice date       what the supplier printed
 *   payment date       when money moved (cash flow, not P&L)
 *   booked_on          the accounting date a fact is bucketed by; for revenue
 *                      the service end, for an expense the service date or,
 *                      failing that, the invoice date
 *   accounting period  a calendar month, `YYYY-MM`
 *   tax period         VAT: month or quarter per policy; KSt/GewSt: the year
 *
 * Everything here is pure and works on ISO date strings; the only clock
 * conversion is `berlinToday`, which asks Intl for the civil date in the
 * property's zone rather than the runner's.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type IsoDate = string;
export type PeriodKey = string;

export const BERLIN = 'Europe/Berlin';

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** The civil date in Berlin for an instant. */
export function berlinDate(instant: Date | string): IsoDate {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function berlinToday(now: Date = new Date()): IsoDate {
  return berlinDate(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function yearOf(iso: IsoDate): number {
  return Number(iso.slice(0, 4));
}

export function monthKey(iso: IsoDate): PeriodKey {
  return iso.slice(0, 7);
}

export function quarterOf(iso: IsoDate): 1 | 2 | 3 | 4 {
  return (Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

export function quarterKey(iso: IsoDate): PeriodKey {
  return `${iso.slice(0, 4)}-Q${quarterOf(iso)}`;
}

export function yearKey(iso: IsoDate): PeriodKey {
  return iso.slice(0, 4);
}

export interface DateRange {
  from: IsoDate;
  /** Exclusive. */
  to: IsoDate;
}

export function monthRange(key: PeriodKey): DateRange {
  const from = `${key}-01`;
  return { from, to: addMonths(from, 1) };
}

export function quarterRange(key: PeriodKey): DateRange {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!m) throw new Error(`not a quarter key: ${key}`);
  const from = `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
  return { from, to: addMonths(from, 3) };
}

export function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

/** Month / quarter / year range from any period key. */
export function periodRange(key: PeriodKey): DateRange {
  if (/^\d{4}$/.test(key)) return yearRange(Number(key));
  if (/^\d{4}-Q[1-4]$/.test(key)) return quarterRange(key);
  if (/^\d{4}-\d{2}$/.test(key)) return monthRange(key);
  throw new Error(`not a period key: ${key}`);
}

export function periodLabel(key: PeriodKey): string {
  if (/^\d{4}$/.test(key)) return key;
  if (/^\d{4}-Q[1-4]$/.test(key)) return `Q${key.slice(6)} ${key.slice(0, 4)}`;
  const d = new Date(`${key}-15T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Month keys covering [from, to). */
export function monthKeysBetween(from: IsoDate, to: IsoDate): PeriodKey[] {
  const out: PeriodKey[] = [];
  let cursor = `${monthKey(from)}-01`;
  while (cursor < to) {
    out.push(monthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export function inRange(iso: IsoDate, range: DateRange): boolean {
  return iso >= range.from && iso < range.to;
}

/** Month-to-date and year-to-date windows for a given "today". */
export function mtd(today: IsoDate): DateRange {
  return { from: `${monthKey(today)}-01`, to: addDays(today, 1) };
}

export function ytd(today: IsoDate, fiscalYearStartMonth = 1): DateRange {
  const y = yearOf(today);
  const startThisYear = `${y}-${String(fiscalYearStartMonth).padStart(2, '0')}-01`;
  const from = today >= startThisYear ? startThisYear : `${y - 1}-${String(fiscalYearStartMonth).padStart(2, '0')}-01`;
  return { from, to: addDays(today, 1) };
}

/** Nights of a stay [checkIn, checkOut) that fall inside a range — for per-period occupancy. */
export function nightsInRange(checkIn: IsoDate, checkOut: IsoDate, range: DateRange): number {
  const from = checkIn > range.from ? checkIn : range.from;
  const to = checkOut < range.to ? checkOut : range.to;
  return Math.max(0, daysBetween(from, to));
}

/* ── Working days: § 108 Abs. 3 AO shifts a deadline on a Saturday, Sunday or
   public holiday to the next working day. Bavaria-wide public holidays only;
   local ones (Augsburger Friedensfest) and the Bayreuth-relevant Catholic set
   are included as the city observes them. ───────────────────────────────── */

function easterSunday(year: number): IsoDate {
  // Anonymous Gregorian algorithm.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Public holidays in Bavaria (Bayreuth) for a year. */
export function bavarianHolidays(year: number): Set<IsoDate> {
  const easter = easterSunday(year);
  return new Set<IsoDate>([
    `${year}-01-01`, // Neujahr
    `${year}-01-06`, // Heilige Drei Könige
    addDays(easter, -2), // Karfreitag
    addDays(easter, 1), // Ostermontag
    `${year}-05-01`, // Tag der Arbeit
    addDays(easter, 39), // Christi Himmelfahrt
    addDays(easter, 50), // Pfingstmontag
    addDays(easter, 60), // Fronleichnam
    `${year}-08-15`, // Mariä Himmelfahrt (Catholic municipalities incl. Bayreuth city — NEEDS CONFIRMATION for the tax office)
    `${year}-10-03`, // Tag der Deutschen Einheit
    `${year}-11-01`, // Allerheiligen
    `${year}-12-25`,
    `${year}-12-26`,
  ]);
}

export function isWorkingDay(iso: IsoDate): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !bavarianHolidays(yearOf(iso)).has(iso);
}

/** § 108 Abs. 3 AO: a deadline that falls on a weekend or holiday ends on the next working day. */
export function nextWorkingDay(iso: IsoDate): IsoDate {
  let d = iso;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

export function lastDayOfMonth(key: PeriodKey): IsoDate {
  return addDays(monthRange(key).to, -1);
}
