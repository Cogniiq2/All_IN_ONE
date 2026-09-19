/**
 * Formatting for operators. Pure, import-safe from client components.
 *
 * Everything renders in the property's own timezone (Europe/Berlin), because
 * an arrival "today" is today at the door, not in the reader's browser. The
 * operations interface is English-language, so the number and date locale is
 * `de-DE` for shape (day-month order, thin separators) with English labels.
 */

export const PROPERTY_TIME_ZONE = 'Europe/Berlin';

const money = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const code = (currency ?? 'EUR').toUpperCase();
  let f = money.get(code);
  if (!f) {
    f = new Intl.NumberFormat('de-DE', { style: 'currency', currency: code, minimumFractionDigits: 2 });
    money.set(code, f);
  }
  return f.format(cents / 100);
}

/** `2026-09-19` → `19 Sep 2026`. */
export function formatIsoDate(iso: string | null | undefined, style: 'short' | 'long' | 'day' = 'short'): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  if (style === 'day') return new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' }).format(d);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(d);
}

/** `19 Sep – 23 Sep 2026`, collapsing the year when both ends share it. */
export function formatStay(checkIn: string, checkOut: string): string {
  const sameYear = checkIn.slice(0, 4) === checkOut.slice(0, 4);
  return `${formatIsoDate(checkIn, sameYear ? 'short' : 'long')} – ${formatIsoDate(checkOut, 'long')}`;
}

export function weekdayShort(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

export function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`)
  );
}

/** An instant, in property time: `19 Sep 2026, 14:32`. */
export function formatInstant(value: string | null | undefined, withSeconds = false): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    timeZone: PROPERTY_TIME_ZONE,
  }).format(d);
}

export function formatClock(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: PROPERTY_TIME_ZONE }).format(d);
}

/** `3 min ago`, `2 h ago`, `4 d ago`. For an instant in the future, `in 12 min`. */
export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = t - now.getTime();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  let text: string;
  if (minutes < 1) text = 'just now';
  else if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 60 * 48) text = `${Math.round(minutes / 60)} h`;
  else text = `${Math.round(minutes / (60 * 24))} d`;
  if (text === 'just now') return text;
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

/** Age in whole milliseconds, never negative. */
export function ageMs(value: string | null | undefined, now: Date = new Date()): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, now.getTime() - t);
}

/** Today's date at the property, ISO. */
export function propertyTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** `Friday, 19 September 2026`. */
export function formatLongDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function pluralNights(n: number): string {
  return `${n} ${n === 1 ? 'night' : 'nights'}`;
}

export function percent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${Math.round(ratio * 100)} %`;
}

/**
 * A guest label for lists: surname plus initial. Enough to recognise a
 * reservation on a working screen, not enough to be a directory. The full
 * name lives on the protected detail page.
 */
export function guestListLabel(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const last = (lastName ?? '').trim();
  const first = (firstName ?? '').trim();
  if (!last && !first) return null;
  if (!first) return last;
  if (!last) return first;
  return `${last}, ${first.charAt(0).toUpperCase()}.`;
}

/** `a…@example.com` — the shape of an address without the address. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email.charAt(0)}•••${email.slice(at)}`;
}

/** Keeps the country code and the last two digits. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length <= 4) return '•••';
  return `${digits.slice(0, 3)} ••• ${digits.slice(-2)}`;
}
