/**
 * ══════════════════════════════════════════════════════════════════════════
 * A small, dependency-free PDF writer.
 *
 * Enough for a clean business report — text in the three standard PDF font
 * families (no font files, nothing to embed or license), hairlines, filled
 * rectangles, multiple pages — and nothing else. It runs anywhere the app
 * runs (Node, the Cloudflare worker) because it only builds bytes.
 *
 * Text is encoded as WinAnsi (Windows-1252), which every PDF reader
 * supports for the standard fonts: German umlauts, ß, €, the en dash and
 * the middle dot all survive. A character outside it prints as "?".
 * ══════════════════════════════════════════════════════════════════════════
 */

export type FontKey = 'sans' | 'sansBold' | 'serif' | 'serifItalic';

const FONT_NAME: Record<FontKey, { res: string; base: string }> = {
  sans: { res: 'F1', base: 'Helvetica' },
  sansBold: { res: 'F2', base: 'Helvetica-Bold' },
  serif: { res: 'F3', base: 'Times-Roman' },
  serifItalic: { res: 'F4', base: 'Times-Italic' },
};

/** Characters above U+00FF that Windows-1252 places in 0x80–0x9F. */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** One byte per character, as a binary string: what goes between ( and ) in a PDF text operator. */
export function encodeWinAnsi(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 63;
    let byte: number;
    if (code === 0x2009 || code === 0x202f || code === 0x00a0) byte = 0x20;
    else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) byte = code;
    else byte = CP1252[code] ?? 0x3f;
    if (byte === 0x5c || byte === 0x28 || byte === 0x29) out += '\\' + String.fromCharCode(byte);
    else if (byte < 0x20) out += ' ';
    else out += String.fromCharCode(byte);
  }
  return out;
}

/* ── Glyph widths (AFM, 1/1000 em) for measuring and truncating text ───── */

// prettier-ignore
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const HELVETICA_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function glyphWidth(font: FontKey, ch: string): number {
  const code = ch.codePointAt(0) ?? 63;
  const table = font === 'sansBold' ? HELVETICA_BOLD : HELVETICA;
  if (font === 'serif' || font === 'serifItalic') return code >= 0x41 && code <= 0x5a ? 667 : code >= 0x30 && code <= 0x39 ? 500 : code === 0x20 ? 250 : 444;
  if (code >= 32 && code <= 126) return table[code - 32];
  // Accented Latin letters share their base letter's width closely enough.
  const base = ch.normalize('NFD').charAt(0);
  const baseCode = base.codePointAt(0) ?? 0;
  if (baseCode >= 32 && baseCode <= 126 && base !== ch) return table[baseCode - 32];
  if (code === 0x20ac) return 556; // €
  if (code === 0x2013) return 556; // –
  if (code === 0x2014) return 1000; // —
  if (code === 0xb7) return 278; // ·
  if (code === 0xdf) return font === 'sansBold' ? 611 : 611; // ß
  return 556;
}

export function textWidth(text: string, font: FontKey, size: number): number {
  let w = 0;
  for (const ch of text) w += glyphWidth(font, ch);
  return (w * size) / 1000;
}

/** Shorten text with an ellipsis so it fits `max` points. */
export function fitText(text: string, font: FontKey, size: number, max: number): string {
  if (textWidth(text, font, size) <= max) return text;
  const ell = '…';
  let s = text;
  while (s.length > 1 && textWidth(s + ell, font, size) > max) s = s.slice(0, -1);
  return s.trimEnd() + ell;
}

/* ── The document ──────────────────────────────────────────────────────── */

export type Rgb = readonly [number, number, number];

function rgb(c: Rgb): string {
  return c.map((v) => (v / 255).toFixed(3)).join(' ');
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export class PdfPage {
  readonly ops: string[] = [];
  constructor(readonly width: number, readonly height: number) {}

  /** Text at (x, y) with y measured from the TOP of the page, baseline. */
  text(x: number, y: number, value: string, opts: { font?: FontKey; size?: number; color?: Rgb; align?: 'left' | 'right' | 'center'; tracking?: number } = {}): void {
    const font = opts.font ?? 'sans';
    const size = opts.size ?? 9;
    const width = textWidth(value, font, size) + (opts.tracking ?? 0) * Math.max(0, Array.from(value).length - 1);
    const left = opts.align === 'right' ? x - width : opts.align === 'center' ? x - width / 2 : x;
    this.ops.push(
      `BT /${FONT_NAME[font].res} ${num(size)} Tf ${rgb(opts.color ?? [24, 27, 33])} rg ${opts.tracking ? `${num(opts.tracking)} Tc ` : ''}${num(left)} ${num(this.height - y)} Td (${encodeWinAnsi(value)}) Tj${opts.tracking ? ' 0 Tc' : ''} ET`
    );
  }

  /** A straight line from (x1, y1) to (x2, y2), y from the top. */
  line(x1: number, y1: number, x2: number, y2: number, opts: { color?: Rgb; width?: number } = {}): void {
    this.ops.push(`${rgb(opts.color ?? [214, 208, 199])} RG ${num(opts.width ?? 0.5)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`);
  }

  /** A filled rectangle; (x, y) is its top-left corner. */
  rect(x: number, y: number, w: number, h: number, fill: Rgb): void {
    this.ops.push(`${rgb(fill)} rg ${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re f`);
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(readonly meta: { title: string; author?: string; created?: Date } = { title: 'Document' }) {}

  addPage(width = 841.89, height = 595.28): PdfPage {
    const page = new PdfPage(width, height);
    this.pages.push(page);
    return page;
  }

  /** The finished file as bytes. */
  toBytes(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length;
    };
    const fontIds = (Object.keys(FONT_NAME) as FontKey[]).map((k) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME[k].base} /Encoding /WinAnsiEncoding >>`));
    const fontRes = (Object.keys(FONT_NAME) as FontKey[]).map((k, i) => `/${FONT_NAME[k].res} ${fontIds[i]} 0 R`).join(' ');
    const pagesId = objects.length + 1;
    objects.push(''); // placeholder for the page tree
    const pageIds: number[] = [];
    for (const page of this.pages) {
      const content = page.ops.join('\n');
      const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fontRes} >> >> /Contents ${contentId} 0 R >>`));
    }
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const created = this.meta.created ?? new Date();
    const stamp = `D:${created.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
    const infoId = add(`<< /Title (${encodeWinAnsi(this.meta.title)}) /Author (${encodeWinAnsi(this.meta.author ?? '')}) /Producer (BoLaGio Control) /CreationDate (${stamp}) >>`);
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    // Every character of `out` is one byte (WinAnsi), so string offsets are byte offsets.
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
