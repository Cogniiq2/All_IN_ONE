/**
 * A small, strict CSV parser: RFC 4180 quoting, configurable delimiter with
 * auto-detection among `;`, `,` and tab, BOM tolerant, CRLF tolerant. No
 * dependency. Returns rows as objects keyed by the (trimmed) header.
 */

export interface ParsedCsv {
  delimiter: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  /** 1-based line numbers of rows whose field count did not match. */
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
  if (nonEmpty.length === 0) return { delimiter: delim, headers: [], rows: [], malformed: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  const malformed: number[] = [];
  nonEmpty.slice(1).forEach((r, idx) => {
    if (r.length !== headers.length) { malformed.push(idx + 2); return; }
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i].trim(); });
    rows.push(obj);
  });
  return { delimiter: delim, headers, rows, malformed };
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

/** Parse a date in ISO, DD.MM.YYYY or DD/MM/YYYY; null otherwise. */
export function parseDateLoose(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
