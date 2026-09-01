/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATE PRESENTATION — one format, everywhere the site prints a date.
 *
 * Every user-facing date the UI renders itself goes through `formatDate`, so a
 * stay reads the same in the hero panel, in the detail modal, in the booking
 * summary and on the confirmation. The shape is the numeric day-first form:
 *
 *     DD/MM/YYYY
 *
 * German and English share it deliberately. `de-DE` would print 1.9.2026 and
 * `en-GB` 01/09/2026 — two different-looking dates for the same night, on a
 * site a visitor switches languages on. A fixed, zero-padded, day-first form is
 * unambiguous in both and matches the German reading order.
 *
 * ── What this file may NOT do ────────────────────────────────────────────
 * A native `<input type="date">` renders its own value according to the
 * visitor's browser and operating-system locale. That is not stylable, and
 * overlaying text on it or swapping it for a text field would break the native
 * picker, keyboard entry, autofill and assistive technology. So nothing here
 * tries to force the input's appearance — `DATE_FORMAT_HINT` is offered beside
 * the field as a written hint instead, which is honest about the convention
 * without fighting the platform.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Locale } from '@/lib/content/apartments';
import { toIsoDate } from '@/lib/booking/availability';

/**
 * The written form of the format, shown beside a date field.
 *
 * German uses the German placeholder letters (Tag/Monat/Jahr); English uses
 * the same shape in English letters.
 */
export const DATE_FORMAT_HINT: Record<Locale, string> = {
  de: 'TT/MM/JJJJ',
  en: 'DD/MM/YYYY',
};

/**
 * An ISO `YYYY-MM-DD` as `DD/MM/YYYY`, or `undefined` when there is no date.
 *
 * Parsed as UTC and printed from its own parts: `new Date(iso)` in a negative
 * timezone offset would land on the previous day and print the wrong date.
 */
export function formatDate(iso: string | undefined | null): string | undefined {
  const value = toIsoDate(iso);
  if (!value) return undefined;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** The same, with an em dash for an unset date, for table-like summaries. */
export function formatDateOrDash(iso: string | undefined | null): string {
  return formatDate(iso) ?? '—';
}

/**
 * A date and a time, for a confirmed appointment.
 *
 * Only reached once a real appointment datetime exists; nothing on the site
 * invents one. Time is printed in the visitor's own timezone, because that is
 * the clock they will keep the appointment by.
 */
export function formatDateTime(value: string | undefined | null, locale: Locale): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day}/${month}/${year}, ${time}`;
}
