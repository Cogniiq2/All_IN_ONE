/**
 * ══════════════════════════════════════════════════════════════════════════
 * OPERATIONAL PERFORMANCE — the definitions, pinned.
 *
 * ADR, RevPAR and occupancy are easy to compute and easy to compute WRONG,
 * and a wrong one is worse than none: it reads like a fact and it drives
 * pricing. So each definition is pinned to a worked example small enough to
 * check by hand.
 *
 * The other thing proven here is the honesty contract: an unknown is null and
 * says why, never a zero — and the commission Beds24 does not report is never
 * subtracted from anything.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { buildPerformance, nightsInWindow, stayNights, type PerformanceReservation, type PerformanceUnit } from '@/lib/admin/performance';

const UNITS: PerformanceUnit[] = [
  { slug: 'schulstrasse-i', display_name: 'Schulstraße I' },
  { slug: 'schulstrasse-ii', display_name: 'Schulstraße II' },
];

/** April 2026: 30 days, two units → 60 available room nights. */
const APRIL = { from: '2026-04-01', to: '2026-05-01' };

function stay(over: Partial<PerformanceReservation> = {}): PerformanceReservation {
  return {
    unit_slug: 'schulstrasse-i',
    source: 'booking_com',
    status_class: 'active',
    check_in: '2026-04-02',
    check_out: '2026-04-06',
    total_amount_cents: 48000,
    currency: 'EUR',
    booked_at: '2026-03-01T10:00:00Z',
    ...over,
  };
}

describe('night arithmetic', () => {
  it('is half-open: the departure day is not an occupied night', () => {
    expect(stayNights('2026-04-02', '2026-04-06')).toBe(4);
    expect(nightsInWindow('2026-04-02', '2026-04-06', '2026-04-01', '2026-05-01')).toBe(4);
  });

  it('clips a stay to the window at both ends', () => {
    // Arrives in March, leaves in April: only the April nights count.
    expect(nightsInWindow('2026-03-30', '2026-04-03', APRIL.from, APRIL.to)).toBe(2);
    // Arrives in April, leaves in May.
    expect(nightsInWindow('2026-04-29', '2026-05-04', APRIL.from, APRIL.to)).toBe(2);
  });

  it('counts nothing for a stay that departs on the first day of the window', () => {
    expect(nightsInWindow('2026-03-28', '2026-04-01', APRIL.from, APRIL.to)).toBe(0);
  });

  it('counts nothing for a stay entirely outside the window', () => {
    expect(nightsInWindow('2026-06-01', '2026-06-05', APRIL.from, APRIL.to)).toBe(0);
    expect(stayNights('2026-04-06', '2026-04-02')).toBe(0);
  });
});

describe('the definitions', () => {
  it('occupancy is occupied room nights over AVAILABLE room nights', () => {
    // One 4-night stay, two units, 30 days → 4 / 60.
    const report = buildPerformance([stay()], UNITS, APRIL);
    expect(report.availableNights).toBe(60);
    expect(report.occupiedNights).toBe(4);
    expect(report.occupancy.value).toBeCloseTo(4 / 60, 10);
  });

  it('ADR is revenue over OCCUPIED nights', () => {
    // €480.00 over 4 nights → €120.00.
    const report = buildPerformance([stay()], UNITS, APRIL);
    expect(report.adr.value).toBeCloseTo(12000, 6);
  });

  it('RevPAR is revenue over AVAILABLE nights, and is not ADR', () => {
    // €480.00 over 60 available nights → €8.00. Emphatically not €120.
    const report = buildPerformance([stay()], UNITS, APRIL);
    expect(report.revpar.value).toBeCloseTo(48000 / 60, 6);
    expect(report.revpar.value).not.toBeCloseTo(report.adr.value as number, 2);
  });

  it('RevPAR equals ADR × occupancy, which is the identity that proves both', () => {
    const report = buildPerformance([stay(), stay({ unit_slug: 'schulstrasse-ii', check_in: '2026-04-10', check_out: '2026-04-17', total_amount_cents: 91000 })], UNITS, APRIL);
    expect(report.revpar.value).toBeCloseTo((report.adr.value as number) * (report.occupancy.value as number), 6);
  });

  it('ALOS is the whole stay length, not the part inside the window', () => {
    // A ten-night stay with two nights in April is still a ten-night stay.
    const report = buildPerformance([stay({ check_in: '2026-04-29', check_out: '2026-05-09' })], UNITS, APRIL);
    expect(report.alos.value).toBe(10);
    expect(report.occupiedNights).toBe(2);
  });

  it('allocates a straddling stay to the window in proportion', () => {
    // €1000 over 10 nights = €100/night; 2 nights land in April → €200.
    const report = buildPerformance(
      [stay({ check_in: '2026-04-29', check_out: '2026-05-09', total_amount_cents: 100000 })],
      UNITS,
      APRIL
    );
    expect(report.stayGrossCents).toBe(20000);
    // …while the arrival convention counts the WHOLE stay, undivided.
    expect(report.arrivingGrossCents).toBe(100000);
  });
});

describe('the three date conventions stay apart', () => {
  const rows = [
    // Booked in April, arrives in June. Commercial pace only.
    stay({ booked_at: '2026-04-15T09:00:00Z', check_in: '2026-06-01', check_out: '2026-06-05', total_amount_cents: 60000 }),
    // Booked in March, stays in April. The operating result.
    stay({ booked_at: '2026-03-01T09:00:00Z', check_in: '2026-04-10', check_out: '2026-04-14', total_amount_cents: 40000 }),
  ];

  it('separates what was sold, what arrives and what was earned', () => {
    const report = buildPerformance(rows, UNITS, APRIL);
    expect(report.bookedGrossCents).toBe(60000);
    expect(report.bookedStays).toBe(1);
    expect(report.arrivingGrossCents).toBe(40000);
    expect(report.arrivingStays).toBe(1);
    expect(report.stayGrossCents).toBe(40000);
  });

  it('never adds the three together into one "revenue"', () => {
    const report = buildPerformance(rows, UNITS, APRIL);
    // ADR is driven by the STAY figure alone; the June booking cannot inflate it.
    expect(report.adr.value).toBeCloseTo(10000, 6);
  });
});

describe('honesty about what is unknown', () => {
  it('reports an uncomputable figure as null with a reason, never as zero', () => {
    const empty = buildPerformance([], UNITS, APRIL);
    expect(empty.adr).toEqual({ value: null, unavailable: 'no_amounts' });
    expect(empty.revpar).toEqual({ value: null, unavailable: 'no_nights' });
    expect(empty.alos).toEqual({ value: null, unavailable: 'no_stays' });
    expect(empty.cancellationRate).toEqual({ value: null, unavailable: 'no_stays' });
    // Occupancy of a real window with no stays IS zero, and that is a fact.
    expect(empty.occupancy.value).toBe(0);
  });

  it('excludes an amount-less stay from money and counts its nights separately', () => {
    // An owner block would otherwise drag ADR from €120 to €60.
    const report = buildPerformance(
      [stay(), stay({ unit_slug: 'schulstrasse-ii', total_amount_cents: null, source: 'manual' })],
      UNITS,
      APRIL
    );
    expect(report.occupiedNights).toBe(8);
    expect(report.nightsWithoutAmount).toBe(4);
    expect(report.stayGrossCents).toBe(48000);
    // ADR divides by the nights that carried money: 48000 / 4, not / 8.
    expect(report.adr.value).toBeCloseTo(12000, 6);
  });

  it('never reports a commission or a payout it does not have', () => {
    const report = buildPerformance([stay()], UNITS, APRIL);
    expect(report.unavailable).toEqual({
      commission: 'provider_data_unavailable',
      netPayout: 'provider_data_unavailable',
      payoutStatus: 'provider_data_unavailable',
      tax: 'not_computed_here',
    });
    // And the gross is the gross: nothing was netted off it.
    expect(report.stayGrossCents).toBe(48000);
    expect(report).not.toHaveProperty('netCents');
    expect(report).not.toHaveProperty('commissionCents');
  });

  it('surfaces a mixed-currency window rather than adding the totals up silently', () => {
    const report = buildPerformance(
      [stay(), stay({ unit_slug: 'schulstrasse-ii', currency: 'CHF' })],
      UNITS,
      APRIL
    );
    expect(report.currencies).toEqual(['CHF', 'EUR']);
  });
});

describe('cancellations', () => {
  it('counts a cancelled stay by the arrival it would have had, and excludes its nights', () => {
    const report = buildPerformance(
      [stay(), stay({ status_class: 'cancelled', check_in: '2026-04-20', check_out: '2026-04-25' })],
      UNITS,
      APRIL
    );
    expect(report.activeStays).toBe(1);
    expect(report.cancelledStays).toBe(1);
    expect(report.cancellationRate.value).toBe(0.5);
    // A cancelled stay occupies nothing and earns nothing.
    expect(report.occupiedNights).toBe(4);
    expect(report.stayGrossCents).toBe(48000);
  });

  it('treats a provisional or blocked stay as not occupying', () => {
    const report = buildPerformance(
      [stay({ status_class: 'provisional' }), stay({ status_class: 'blocked', unit_slug: 'schulstrasse-ii' })],
      UNITS,
      APRIL
    );
    expect(report.occupiedNights).toBe(0);
    expect(report.stayGrossCents).toBe(0);
  });
});

describe('breakdowns', () => {
  const rows = [
    stay({ source: 'booking_com', total_amount_cents: 48000 }),
    stay({ source: 'direct', unit_slug: 'schulstrasse-ii', check_in: '2026-04-10', check_out: '2026-04-12', total_amount_cents: 24000 }),
  ];

  it('splits by channel with a share that sums to one', () => {
    const report = buildPerformance(rows, UNITS, APRIL);
    expect(report.byChannel.map((c) => c.source)).toEqual(['booking_com', 'direct']);
    expect(report.byChannel.reduce((n, c) => n + (c.share ?? 0), 0)).toBeCloseTo(1, 10);
    expect(report.byChannel[0]).toMatchObject({ stays: 1, nights: 4, grossCents: 48000 });
  });

  it('gives every unit a row even when it sold nothing', () => {
    const report = buildPerformance([stay()], UNITS, APRIL);
    expect(report.byUnit).toHaveLength(2);
    const idle = report.byUnit.find((u) => u.slug === 'schulstrasse-ii');
    expect(idle).toMatchObject({ stays: 0, nights: 0, grossCents: 0 });
    expect(idle?.occupancy.value).toBe(0);
    expect(idle?.adr.value).toBeNull();
  });

  it('measures a unit against its OWN available nights, not the estate total', () => {
    const report = buildPerformance([stay()], UNITS, APRIL);
    const sold = report.byUnit.find((u) => u.slug === 'schulstrasse-i');
    expect(sold?.availableNights).toBe(30);
    expect(sold?.occupancy.value).toBeCloseTo(4 / 30, 10);
  });

  it('splits by month so the months add up to the window', () => {
    const report = buildPerformance(
      [stay({ check_in: '2026-04-28', check_out: '2026-05-04', total_amount_cents: 60000 })],
      UNITS,
      { from: '2026-04-01', to: '2026-06-01' }
    );
    expect(report.byMonth.map((m) => m.month)).toEqual(['2026-04', '2026-05']);
    expect(report.byMonth.reduce((n, m) => n + m.nights, 0)).toBe(6);
    expect(report.byMonth.reduce((n, m) => n + m.grossCents, 0)).toBe(report.stayGrossCents);
  });

  it('measures a partial edge month against only its days inside the window', () => {
    // A window of 1–15 April: the month is 15 days available, not 30.
    const report = buildPerformance([stay()], UNITS, { from: '2026-04-01', to: '2026-04-16' });
    expect(report.byMonth[0].occupancy.value).toBeCloseTo(4 / (2 * 15), 10);
  });
});

describe('scale', () => {
  it('handles a year of stays without drifting off the cent', () => {
    const rows: PerformanceReservation[] = [];
    for (let i = 0; i < 300; i += 1) {
      const day = String((i % 27) + 1).padStart(2, '0');
      const month = String((i % 12) + 1).padStart(2, '0');
      rows.push(stay({ check_in: `2026-${month}-${day}`, check_out: `2026-${month}-${day}`.replace(/\d{2}$/, String((i % 27) + 2).padStart(2, '0')), total_amount_cents: 12000 }));
    }
    const report = buildPerformance(rows, UNITS, { from: '2026-01-01', to: '2027-01-01' });
    expect(report.occupiedNights).toBeGreaterThan(0);
    expect(report.byMonth.reduce((n, m) => n + m.grossCents, 0)).toBe(report.stayGrossCents);
  });
});
