import { describe, expect, it } from 'vitest';
import type { ReservationDto } from '@/lib/admin/dto';
import {
  berlinDayStartUtc,
  bookedWindow,
  describeReservationFilter,
  effectiveShow,
  parseReservationFilter,
  reservationFilterToParams,
  reservationQueryOf,
  stayWindow,
} from '@/lib/admin/reservation-filters';
import { summariseReservations } from '@/lib/admin/reservation-summary';
import { PdfDocument, encodeWinAnsi, fitText, textWidth } from '@/lib/admin/pdf/document';
import { buildReservationsReport, reportFileName } from '@/lib/admin/pdf/reservations-report';

const TODAY = '2026-10-18';

function res(over: Partial<ReservationDto> = {}): ReservationDto {
  return {
    id: 'r1',
    externalBookingId: '7001',
    provider: 'beds24',
    unitSlug: 'schulstrasse-i',
    unitName: 'Design - Apartment I · Premium Penthouse mit Dachterrasse',
    source: 'booking_com',
    sourceRaw: null,
    sourceApiId: null,
    channelReference: '5512345678',
    providerStatus: 'confirmed',
    statusClass: 'active',
    occupies: true,
    checkIn: '2026-11-02',
    checkOut: '2026-11-05',
    nights: 3,
    guestLabel: 'Jörg Müller',
    guestCountry: 'DE',
    adults: 2,
    children: 0,
    guests: 2,
    currency: 'EUR',
    totalCents: 45000,
    bookedAt: '2026-10-03T21:30:00Z',
    modifiedAt: null,
    cancelledAt: null,
    directReference: null,
    lastSyncedAt: '2026-10-18T08:00:00Z',
    bedroomPackage: null,
    offerId: 0,
    ...over,
  };
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

describe('reservation explorer filters', () => {
  it('parses booked presets, custom booking dates, show and order; custom dates win', () => {
    expect(parseReservationFilter({ booked: 'last_7' }).booked).toBe('last_7');
    expect(parseReservationFilter({ booked: 'nonsense' }).booked).toBe('any');
    const custom = parseReservationFilter({ booked: 'today', bookedFrom: '2026-10-01', bookedTo: 'x' });
    expect(custom).toMatchObject({ booked: 'custom', bookedFrom: '2026-10-01', bookedTo: null });
    expect(parseReservationFilter({ show: 'cancelled', order: 'booked' })).toMatchObject({ show: 'cancelled', order: 'booked' });
    expect(parseReservationFilter({ show: 'bogus', order: 'bogus' })).toMatchObject({ show: null, order: 'arrival' });
  });

  it('round-trips through the URL, writing only what differs from the default', () => {
    const f = parseReservationFilter({ when: 'next_month', unit: 'schulstrasse-i', bookedFrom: '2026-10-01', bookedTo: '2026-10-10', show: 'all', order: 'booked' });
    const params = reservationFilterToParams(f);
    expect(params.toString()).toBe('unit=schulstrasse-i&show=all&when=next_month&bookedFrom=2026-10-01&bookedTo=2026-10-10&order=booked');
    expect(parseReservationFilter(Object.fromEntries(params))).toEqual(f);
    expect(reservationFilterToParams(parseReservationFilter({})).toString()).toBe('');
  });

  it('stay presets are half-open windows', () => {
    expect(stayWindow('this_month', TODAY)).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(stayWindow('next_month', '2026-12-18')).toEqual({ from: '2027-01-01', to: '2027-02-01' });
    expect(stayWindow('next_30', TODAY)).toEqual({ from: TODAY, to: '2026-11-17' });
    expect(stayWindow('this_year', TODAY)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
    expect(stayWindow('upcoming', TODAY)).toBeNull();
  });

  it('booked presets are inclusive property days', () => {
    expect(bookedWindow({ booked: 'today', bookedFrom: null, bookedTo: null }, TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(bookedWindow({ booked: 'last_7', bookedFrom: null, bookedTo: null }, TODAY)).toEqual({ from: '2026-10-12', to: TODAY });
    expect(bookedWindow({ booked: 'last_30', bookedFrom: null, bookedTo: null }, TODAY)).toEqual({ from: '2026-09-19', to: TODAY });
    expect(bookedWindow({ booked: 'any', bookedFrom: null, bookedTo: null }, TODAY)).toBeNull();
  });

  it('a Berlin day starts at 22:00 or 23:00 UTC the evening before', () => {
    expect(berlinDayStartUtc('2026-10-03')).toBe('2026-10-02T22:00:00.000Z'); // summer time
    expect(berlinDayStartUtc('2026-12-01')).toBe('2026-11-30T23:00:00.000Z'); // winter time
  });

  it('turns booking dates into an instant range on booked_at, end exclusive', () => {
    const q = reservationQueryOf(parseReservationFilter({ bookedFrom: '2026-10-01', bookedTo: '2026-10-03', order: 'booked' }), TODAY, null);
    expect(q).toMatchObject({ bookedFrom: '2026-09-30T22:00:00.000Z', bookedTo: '2026-10-03T22:00:00.000Z', sort: 'booked_at', dir: 'desc' });
    const month = reservationQueryOf(parseReservationFilter({ when: 'next_month' }), TODAY, null);
    expect(month).toMatchObject({ overlaps: { from: '2026-11-01', to: '2026-12-01' }, statusClasses: ['active'], sort: 'check_in', dir: 'asc' });
  });

  it('show overrides what the period implies; an explicit status still wins', () => {
    expect(reservationQueryOf(parseReservationFilter({ show: 'all' }), TODAY, null).statusClasses).toBeNull();
    expect(reservationQueryOf(parseReservationFilter({ when: 'past', show: 'booked' }), TODAY, null).statusClasses).toEqual(['active']);
    expect(reservationQueryOf(parseReservationFilter({ show: 'cancelled' }), TODAY, null)).toMatchObject({ statusClasses: ['cancelled'], dir: 'desc' });
    expect(reservationQueryOf(parseReservationFilter({ show: 'all', status: 'blocked' }), TODAY, null).statusClasses).toEqual(['blocked']);
    expect(effectiveShow({ show: null, when: 'cancelled' })).toBe('cancelled');
    expect(effectiveShow({ show: null, when: 'past' })).toBe('all');
  });

  it('describes the selection as one plain sentence', () => {
    expect(describeReservationFilter(parseReservationFilter({}), null, TODAY)).toBe('Booked stays, in every apartment, from today on.');
    expect(describeReservationFilter(parseReservationFilter({ when: 'next_month', booked: 'last_30', source: 'airbnb' }), 'Apartment I', TODAY)).toBe(
      'Booked stays, in Apartment I, staying in November 2026, booked in the last 30 days, via Airbnb.'
    );
    expect(describeReservationFilter(parseReservationFilter({ show: 'all', from: '2026-11-01', to: '2026-12-01' }), null, TODAY)).toBe(
      'All bookings, cancelled included, in every apartment, staying between 1 November 2026 and 30 November 2026.'
    );
    expect(describeReservationFilter(parseReservationFilter({ show: 'cancelled', bookedFrom: '2026-10-01' }), null, TODAY)).toContain('booked since 1 October 2026');
  });
});

describe('reservation summary', () => {
  it('counts value and nights from booked stays only, split by apartment and channel', () => {
    const s = summariseReservations([
      res(),
      res({ id: 'r2', unitSlug: 'schulstrasse-ii', unitName: 'Design - Apartment II', nights: 2, guests: 3, totalCents: null, source: 'airbnb' }),
      res({ id: 'r3', statusClass: 'cancelled', occupies: false, totalCents: 99900 }),
    ]);
    expect(s).toMatchObject({ listed: 3, booked: 2, cancelled: 1, nights: 5, guests: 5, valueCents: 45000, withoutAmount: 1 });
    expect(s.byUnit.map((u) => [u.slug, u.stays, u.nights])).toEqual([
      ['schulstrasse-i', 1, 3],
      ['schulstrasse-ii', 1, 2],
    ]);
    expect(s.bySource).toEqual([
      { source: 'booking_com', stays: 1 },
      { source: 'airbnb', stays: 1 },
    ]);
  });
});

describe('pdf writer', () => {
  it('encodes German text and the euro sign as WinAnsi, escaping delimiters', () => {
    expect(encodeWinAnsi('Müller € – (a\\b)')).toBe('M\xfcller \x80 \x96 \\(a\\\\b\\)');
    expect(encodeWinAnsi('漢')).toBe('?');
  });

  it('measures and truncates with an ellipsis', () => {
    expect(textWidth('A', 'sans', 10)).toBeCloseTo(6.67, 1);
    const fitted = fitText('Premium Penthouse mit Dachterrasse', 'sans', 10, 60);
    expect(fitted.endsWith('…')).toBe(true);
    expect(textWidth(fitted, 'sans', 10)).toBeLessThanOrEqual(60);
  });

  it('writes a structurally valid file: header, objects at their xref offsets, trailer', () => {
    const doc = new PdfDocument({ title: 'Test', created: new Date('2026-10-18T10:00:00Z') });
    doc.addPage().text(40, 40, 'Hallo Bayreuth');
    doc.addPage();
    const raw = latin1(doc.toBytes());
    expect(raw.startsWith('%PDF-1.4\n')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(raw)?.[1]);
    expect(raw.slice(startxref, startxref + 4)).toBe('xref');
    const entries = raw.slice(startxref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(raw.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(raw).toContain('/Count 2');
    expect(raw).toContain('(Hallo Bayreuth) Tj');
  });
});

describe('reservations report', () => {
  const generatedAt = new Date('2026-10-18T10:15:00Z');

  it('prints the sentence, the figures and every row, with no contact details', () => {
    const items = [res(), res({ id: 'r2', guestLabel: 'Anna Schäfer', statusClass: 'cancelled', occupies: false })];
    const raw = latin1(
      buildReservationsReport({ description: 'Booked stays, in every apartment, from today on.', items, total: 2, summary: summariseReservations(items), generatedAt })
    );
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw).toContain('(Booked stays, in every apartment, from today on.)');
    expect(raw).toContain('J\xf6rg M\xfcller');
    expect(raw).toContain('Anna Sch\xe4fer');
    expect(raw).toContain('(Apartment I)');
    expect(raw).toContain('(3 Oct 2026)'); // booked 21:30 UTC on 3 Oct = 23:30 in Bayreuth
    expect(raw).toContain('450,00\x20\x80');
    expect(raw).toContain('Page 1 of 1');
    expect(raw).not.toMatch(/@|\+49/);
  });

  it('paginates long lists and repeats the header', () => {
    const items = Array.from({ length: 70 }, (_, i) => res({ id: `r${i}`, externalBookingId: String(8000 + i) }));
    const raw = latin1(buildReservationsReport({ description: 'All.', items, total: 70, summary: summariseReservations(items), generatedAt }));
    const pages = Number(/\/Count (\d+)/.exec(raw)?.[1]);
    expect(pages).toBeGreaterThan(2);
    expect(raw).toContain(`Page ${pages} of ${pages}`);
    expect(raw.match(/\(RESERVATIONS · CONTINUED\)|\(RESERVATIONS \xb7 CONTINUED\)/g)?.length).toBe(pages - 1);
  });

  it('says so when the selection is empty, and names the file by the Bayreuth date', () => {
    const raw = latin1(buildReservationsReport({ description: 'Nothing.', items: [], total: 0, summary: summariseReservations([]), generatedAt }));
    expect(raw).toContain('No reservation matches this selection.');
    expect(reportFileName(new Date('2026-10-18T22:30:00Z'))).toBe('bolagio-reservations-2026-10-19.pdf');
  });
});
