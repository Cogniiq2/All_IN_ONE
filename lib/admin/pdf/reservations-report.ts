/**
 * The reservations report: what is on /admin/reservations, as an A4 PDF.
 *
 * It is built from the same filter sentence, the same summary function and
 * the same rows as the screen, so the saved file can never say something the
 * page did not. Guest names are printed (the report is for the owners); no
 * email address or phone number is ever selected for the list, so none can
 * reach the file.
 */

import type { ReservationDto } from '@/lib/admin/dto';
import { compactUnitName, formatInstant, formatIsoDate, formatMoney, formatStay, propertyTodayIso } from '@/lib/admin/format';
import { reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';
import type { ReservationSummary } from '@/lib/admin/reservation-summary';
import { PdfDocument, fitText, type FontKey, type PdfPage, type Rgb } from '@/lib/admin/pdf/document';

const INK: Rgb = [24, 27, 33];
const TEXT_2: Rgb = [88, 93, 104];
const TEXT_3: Rgb = [124, 128, 138];
const LINE: Rgb = [222, 216, 207];
const ACCENT: Rgb = [140, 107, 54];
const WASH: Rgb = [246, 242, 234];

const MARGIN = 40;
const ROW = 19;
const FOOTER_Y = 570;
const LAST_ROW_Y = 540;

interface Column {
  title: string;
  width: number;
  align?: 'right';
  value: (r: ReservationDto) => string;
  font?: FontKey;
}

/** The Berlin calendar day a booking was made on. */
function bookedDay(r: ReservationDto): string {
  if (!r.bookedAt) return '—';
  const d = new Date(r.bookedAt);
  return Number.isNaN(d.getTime()) ? '—' : formatIsoDate(propertyTodayIso(d), 'long');
}

function party(r: ReservationDto): string {
  if (r.adults !== null || r.children !== null) return r.children ? `${r.adults ?? 0} + ${r.children}` : String(r.adults ?? 0);
  return r.guests === null ? '—' : String(r.guests);
}

const COLUMNS: Column[] = [
  { title: 'Stay', width: 122, value: (r) => formatStay(r.checkIn, r.checkOut), font: 'sansBold' },
  { title: 'Nights', width: 38, align: 'right', value: (r) => String(r.nights) },
  { title: 'Apartment', width: 86, value: (r) => compactUnitName(r.unitName) },
  { title: 'Guest', width: 122, value: (r) => r.guestLabel ?? '—' },
  { title: 'Guests', width: 40, align: 'right', value: party },
  { title: 'Channel', width: 74, value: (r) => sourcePresentation(r.source).label },
  { title: 'Booked on', width: 70, value: bookedDay },
  { title: 'Reference', width: 82, value: (r) => r.channelReference ?? r.externalBookingId },
  { title: 'Status', width: 56, value: (r) => reservationClassPresentation(r.statusClass).label },
  { title: 'Gross', width: 70, align: 'right', value: (r) => (r.totalCents === null ? '—' : formatMoney(r.totalCents, r.currency ?? 'EUR')) },
];

export interface ReservationsReportInput {
  /** The filter as one sentence — `describeReservationFilter`. */
  description: string;
  items: ReservationDto[];
  /** Everything matching, when more than `items` exist. */
  total: number;
  summary: ReservationSummary;
  generatedAt: Date;
}

export function reportFileName(generatedAt: Date): string {
  return `bolagio-reservations-${propertyTodayIso(generatedAt)}.pdf`;
}

export function buildReservationsReport(input: ReservationsReportInput): Uint8Array {
  const doc = new PdfDocument({ title: 'BoLaGio — Reservations', author: 'BoLaGio GmbH', created: input.generatedAt });
  const generated = `${formatInstant(input.generatedAt.toISOString())} (Bayreuth time)`;
  const width = 841.89;
  const right = width - MARGIN;

  const masthead = (page: PdfPage, continued: boolean) => {
    page.text(MARGIN, 52, 'BoLaGio', { font: 'serif', size: continued ? 16 : 24, color: INK });
    page.text(MARGIN + (continued ? 66 : 96), 52, continued ? 'RESERVATIONS · CONTINUED' : 'RESERVATIONS', { size: 7.5, color: ACCENT, tracking: 1.6, font: 'sansBold' });
    page.text(right, 52, generated, { size: 8, color: TEXT_3, align: 'right' });
    page.line(MARGIN, 64, right, 64, { color: LINE, width: 0.6 });
  };

  const tableHeader = (page: PdfPage, y: number) => {
    page.rect(MARGIN, y, right - MARGIN, ROW + 1, WASH);
    let x = MARGIN;
    for (const c of COLUMNS) {
      const pad = 6;
      page.text(c.align === 'right' ? x + c.width - pad : x + pad, y + 13, c.title.toUpperCase(), { size: 6.6, color: TEXT_2, font: 'sansBold', tracking: 0.7, align: c.align === 'right' ? 'right' : 'left' });
      x += c.width;
    }
    return y + ROW + 1;
  };

  // ── First page: the question, the answer in figures, then the rows ───
  let page = doc.addPage();
  masthead(page, false);

  page.text(MARGIN, 92, fitText(input.description, 'serifItalic', 13, right - MARGIN), { font: 'serifItalic', size: 13, color: INK });
  const shownNote =
    input.total > input.items.length ? `The first ${input.items.length} of ${input.total} matching bookings are listed. Narrow the selection to include the rest.` : null;
  if (shownNote) page.text(MARGIN, 108, shownNote, { size: 8, color: TEXT_2 });

  const s = input.summary;
  const currency = input.items.find((r) => r.currency)?.currency ?? 'EUR';
  const figures: Array<[string, string]> = [
    ['Bookings', String(s.booked)],
    ['Nights', String(s.nights)],
    ['Guests', String(s.guests)],
    ['Booked value (gross)', formatMoney(s.valueCents, currency)],
    ['Cancelled', String(s.cancelled)],
  ];
  const figY = shownNote ? 124 : 116;
  const figW = (right - MARGIN) / figures.length;
  page.line(MARGIN, figY, right, figY, { color: LINE });
  figures.forEach(([label, value], i) => {
    const x = MARGIN + i * figW;
    if (i > 0) page.line(x, figY, x, figY + 52, { color: LINE });
    page.text(x + (i === 0 ? 0 : 14), figY + 18, label.toUpperCase(), { size: 6.8, color: TEXT_3, font: 'sansBold', tracking: 0.9 });
    page.text(x + (i === 0 ? 0 : 14), figY + 42, value, { font: 'serif', size: 20, color: INK });
  });
  page.line(MARGIN, figY + 52, right, figY + 52, { color: LINE });

  let y = figY + 70;
  if (s.byUnit.length > 0) {
    const perUnit = s.byUnit.map((u) => `${compactUnitName(u.name)}: ${u.stays} ${u.stays === 1 ? 'stay' : 'stays'}, ${u.nights} ${u.nights === 1 ? 'night' : 'nights'}, ${formatMoney(u.valueCents, currency)}`).join('   ·   ');
    page.text(MARGIN, y, fitText(`By apartment   ${perUnit}`, 'sans', 8.5, right - MARGIN), { size: 8.5, color: TEXT_2 });
    y += 14;
  }
  if (s.bySource.length > 0) {
    const perChannel = s.bySource.map((c) => `${sourcePresentation(c.source).label} ${c.stays}`).join('   ·   ');
    page.text(MARGIN, y, fitText(`By channel   ${perChannel}`, 'sans', 8.5, right - MARGIN), { size: 8.5, color: TEXT_2 });
    y += 14;
  }
  y += 10;

  if (input.items.length === 0) {
    page.text(MARGIN, y + 20, 'No reservation matches this selection.', { font: 'serifItalic', size: 13, color: TEXT_2 });
  } else {
    y = tableHeader(page, y);
    for (const r of input.items) {
      if (y + ROW > LAST_ROW_Y) {
        page = doc.addPage();
        masthead(page, true);
        y = tableHeader(page, 84);
      }
      const cancelled = r.statusClass === 'cancelled';
      let x = MARGIN;
      for (const c of COLUMNS) {
        const pad = 6;
        const font = c.font ?? 'sans';
        const value = fitText(c.value(r), font, 8, c.width - pad * 2);
        page.text(c.align === 'right' ? x + c.width - pad : x + pad, y + 13, value, { font, size: 8, color: cancelled ? TEXT_3 : INK, align: c.align === 'right' ? 'right' : 'left' });
        x += c.width;
      }
      y += ROW;
      page.line(MARGIN, y, right, y, { color: LINE, width: 0.4 });
    }
  }

  // ── Footers, now that the page count is known ─────────────────────────
  const count = doc.pages.length;
  doc.pages.forEach((p, i) => {
    p.text(MARGIN, FOOTER_Y, 'Amounts are gross as the booking system states them — not payout, not net of commission. Cancelled bookings are listed but never counted as value.', { size: 6.8, color: TEXT_3 });
    p.text(right, FOOTER_Y, `BoLaGio GmbH · Bayreuth · Page ${i + 1} of ${count}`, { size: 6.8, color: TEXT_3, align: 'right' });
  });

  return doc.toBytes();
}
