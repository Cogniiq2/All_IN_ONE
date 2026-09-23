/**
 * A small, strict CSV parser: RFC 4180 quoting, configurable delimiter with
 * auto-detection among `;`, `,` and tab, BOM tolerant, CRLF tolerant. No
 * dependency. Returns rows as objects keyed by the (trimmed) header.
 */

export interface ParsedCsv {
  delimiter: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  /** For each entry of `rows`, its 1-based record number in the file (the header is 1). */
  rowNumbers: number[];
  /** 1-based record numbers of rows whose field count did not match. */
  malformed: number[];
}

export function detectDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ';';
}

export function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const src = text.replace(/^﻿/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const firstLineEnd = src.indexOf('\n');
  const delim = delimiter ?? detectDelimiter(firstLineEnd === -1 ? src : src.slice(0, firstLineEnd));
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { record.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { record.push(field); records.push(record); record = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }
  const nonEmpty = records.filter((r) => r.some((f) => f.trim() !== ''));
  if (nonEmpty.length === 0) return { delimiter: delim, headers: [], rows: [], rowNumbers: [], malformed: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  const rowNumbers: number[] = [];
  const malformed: number[] = [];
  nonEmpty.slice(1).forEach((r, idx) => {
    if (r.length !== headers.length) { malformed.push(idx + 2); return; }
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i].trim(); });
    rows.push(obj);
    // The record's own number, not its index among the well-formed rows: a
    // malformed row earlier in the file must not shift every later number
    // onto one already reported (row_no is unique per batch).
    rowNumbers.push(idx + 2);
  });
  return { delimiter: delim, headers, rows, rowNumbers, malformed };
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build CSV text with `;` (what German Excel opens correctly) and CRLF. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(';'), ...rows.map((r) => r.map(csvEscape).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * English month names and the abbreviations real statements use. "Sept" is
 * what Booking.com's finance export prints ("11 Sept 2026"); "Sep" is the
 * three-letter form. Matched case-insensitively, with an optional trailing dot.
 */
const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** A calendar DATE as ISO, or null when the day does not exist (31 Sept, 29 Feb in a common year). */
function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  // Pure calendar arithmetic in UTC: a date has no time zone and no DST.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a date in ISO, DD.MM.YYYY, DD/MM/YYYY, "11 Sept 2026" or
 * "Sept 11, 2026"; null otherwise, and null for a day that does not exist.
 *
 * The result is a calendar date. No `Date` object is ever built from the
 * input text, so nothing can shift it by a time-zone offset: "15 Sept 2026"
 * is 2026-09-15 on every server.
 */
export function parseDateLoose(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(t);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[\s-]+([A-Za-z]+)\.?[\s-]+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    return month ? isoDate(Number(m[3]), month, Number(m[1])) : null;
  }
  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    return month ? isoDate(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}
