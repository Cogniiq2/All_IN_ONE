/**
 * PROPERTY AND CHANNEL PROFITABILITY — no code assumes two units.
 *
 * Per unit: revenue by category, direct and property costs as allocated on
 * the lines (the allocation method is on each line and summarised here),
 * nights sold and occupancy from the booking core's paid stays, ADR,
 * contribution and margin, cost per occupied night, cleaning cost per stay.
 * Shared costs that were NOT allocated appear as a separate "unallocated"
 * figure — never spread silently.
 *
 * Per channel: gross revenue, OTA commission, payment fees, refunds,
 * cleaning where the stay is known, contribution. Marketing is not assigned
 * to a channel unless the line was allocated to one.
 */

import { CATEGORIES } from '@/lib/finance/categories';
import type { Cents } from '@/lib/finance/money';
import { daysBetween, nightsInRange, type DateRange } from '@/lib/finance/periods';
import type { LineRow, StayRow, TransactionRow, UnitMonthlyRow } from '@/lib/finance/rows';

export interface UnitEconomics {
  unitId: string;
  slug: string;
  name: string;
  isBookable: boolean;
  accommodationCents: Cents;
  minibarCents: Cents;
  otherRevenueCents: Cents;
  revenueCents: Cents;
  nightsSold: number;
  nightsAvailable: number;
  occupancy: number | null;
  adrCents: Cents | null;
  stays: number;
  costs: Array<{ category: string; label: string; cents: Cents }>;
  directCostsCents: Cents;
  propertyCostsCents: Cents;
  contributionCents: Cents;
  contributionMargin: number | null;
  costPerOccupiedNightCents: Cents | null;
  cleaningPerStayCents: Cents | null;
  otaCommissionShare: number | null;
  allocationMethods: Array<{ method: string; cents: Cents }>;
}

export interface ProfitabilityReport {
  range: DateRange;
  units: UnitEconomics[];
  unallocatedCostsCents: Cents;
  unallocatedByCategory: Array<{ category: string; label: string; cents: Cents }>;
  totals: { revenueCents: Cents; directCostsCents: Cents; propertyCostsCents: Cents; contributionCents: Cents; nightsSold: number };
}

export function buildProfitability(input: {
  range: DateRange;
  units: Array<{ id: string; slug: string; display_name: string; is_bookable: boolean }>;
  unitRows: readonly UnitMonthlyRow[];
  lines: readonly (LineRow & { transaction: TransactionRow })[];
  stays: readonly StayRow[];
}): ProfitabilityReport {
  const days = Math.max(1, daysBetween(input.range.from, input.range.to));
  const units: UnitEconomics[] = input.units.map((u) => {
    const rows = input.unitRows.filter((r) => r.unit_id === u.id);
    const cat = (code: string) => rows.filter((r) => r.category === code).reduce((s, r) => s + Number(r.net_cents), 0);
    const group = (g: string) => rows.filter((r) => r.pl_group === g).reduce((s, r) => s + Number(r.net_cents), 0);
    const accommodation = cat('accommodation_revenue') + cat('accommodation_ancillary');
    const minibar = cat('minibar_sales');
    const revenue = group('revenue');
    const other = revenue - accommodation - minibar;
    const direct = group('direct_cost');
    const property = group('property_cost');
    const stays = input.stays.filter((s) => s.unit_id === u.id && ['confirmed', 'paid', 'paid_unfinalized'].includes(s.status));
    const nights = stays.reduce((s, st) => s + nightsInRange(st.check_in, st.check_out, input.range), 0);
    const stayCount = stays.filter((st) => st.check_out > input.range.from && st.check_out <= input.range.to).length;
    const costs = CATEGORIES.filter((c) => c.kind === 'expense' && (c.plGroup === 'direct_cost' || c.plGroup === 'property_cost'))
      .map((c) => ({ category: c.code, label: c.label, cents: cat(c.code) })).filter((c) => c.cents !== 0);
    const unitLines = input.lines.filter((l) => (l.unit_id ?? l.transaction.unit_id) === u.id && l.transaction.kind !== 'revenue');
    const methods = new Map<string, Cents>();
    for (const l of unitLines) methods.set(l.allocation_method, (methods.get(l.allocation_method) ?? 0) + l.net_cents);
    const cleaning = cat('cleaning');
    const commission = cat('ota_commission');
    const contribution = revenue - direct - property;
    return {
      unitId: u.id, slug: u.slug, name: u.display_name, isBookable: u.is_bookable,
      accommodationCents: accommodation, minibarCents: minibar, otherRevenueCents: other, revenueCents: revenue,
      nightsSold: nights, nightsAvailable: days, occupancy: days > 0 ? nights / days : null,
      adrCents: nights > 0 ? Math.round(accommodation / nights) : null, stays: stayCount,
      costs, directCostsCents: direct, propertyCostsCents: property, contributionCents: contribution,
      contributionMargin: revenue > 0 ? contribution / revenue : null,
      costPerOccupiedNightCents: nights > 0 ? Math.round((direct + property) / nights) : null,
      cleaningPerStayCents: stayCount > 0 ? Math.round(cleaning / stayCount) : null,
      otaCommissionShare: accommodation > 0 ? commission / accommodation : null,
      allocationMethods: Array.from(methods.entries()).map(([method, cents]) => ({ method, cents })).sort((a, b) => b.cents - a.cents),
    };
  });
  const unallocated = input.lines.filter((l) => !(l.unit_id ?? l.transaction.unit_id) && l.transaction.kind !== 'revenue');
  const byCat = new Map<string, Cents>();
  for (const l of unallocated) {
    const meta = CATEGORIES.find((c) => c.code === l.category);
    if (!meta || meta.plGroup === 'balance') continue;
    byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.net_cents);
  }
  return {
    range: input.range, units,
    unallocatedCostsCents: Array.from(byCat.values()).reduce((s, c) => s + c, 0),
    unallocatedByCategory: Array.from(byCat.entries()).map(([category, cents]) => ({ category, label: CATEGORIES.find((c) => c.code === category)?.label ?? category, cents })).sort((a, b) => b.cents - a.cents),
    totals: {
      revenueCents: units.reduce((s, u) => s + u.revenueCents, 0), directCostsCents: units.reduce((s, u) => s + u.directCostsCents, 0),
      propertyCostsCents: units.reduce((s, u) => s + u.propertyCostsCents, 0), contributionCents: units.reduce((s, u) => s + u.contributionCents, 0), nightsSold: units.reduce((s, u) => s + u.nightsSold, 0),
    },
  };
}

export interface ChannelEconomics {
  channel: string;
  label: string;
  grossRevenueCents: Cents;
  refundsCents: Cents;
  commissionCents: Cents;
  paymentFeesCents: Cents;
  cleaningCents: Cents;
  contributionCents: Cents;
  contributionMargin: number | null;
  commissionShare: number | null;
  stays: number;
}

const CHANNEL_LABEL: Record<string, string> = { booking_com: 'Booking.com', direct: 'Direct', airbnb: 'Airbnb', manual: 'Manual / corporate', other: 'Other' };

export function buildChannelEconomics(lines: readonly (LineRow & { transaction: TransactionRow })[], stays: readonly StayRow[], range: DateRange): ChannelEconomics[] {
  const channels = new Map<string, ChannelEconomics>();
  const get = (ch: string) => {
    let c = channels.get(ch);
    if (!c) {
      c = { channel: ch, label: CHANNEL_LABEL[ch] ?? ch, grossRevenueCents: 0, refundsCents: 0, commissionCents: 0, paymentFeesCents: 0, cleaningCents: 0, contributionCents: 0, contributionMargin: null, commissionShare: null, stays: 0 };
      channels.set(ch, c);
    }
    return c;
  };
  for (const l of lines) {
    const ch = l.transaction.channel;
    if (!ch) continue;
    const c = get(ch);
    const meta = CATEGORIES.find((x) => x.code === l.category);
    if (!meta) continue;
    if (meta.kind === 'revenue') {
      if (l.net_cents < 0 || l.transaction.kind === 'refund' || l.transaction.kind === 'credit_note') c.refundsCents += -l.net_cents; else c.grossRevenueCents += l.net_cents;
    } else if (l.category === 'ota_commission' || l.category === 'ota_fees') c.commissionCents += l.net_cents;
    else if (l.category === 'payment_fees') c.paymentFeesCents += l.net_cents;
    else if (l.category === 'cleaning') c.cleaningCents += l.net_cents;
  }
  for (const s of stays) {
    if (s.check_out <= range.from || s.check_out > range.to) continue;
    const ch = s.source === 'direct' ? 'direct' : s.source === 'manual' ? 'manual' : s.source;
    get(ch).stays += 1;
  }
  for (const c of Array.from(channels.values())) {
    c.contributionCents = c.grossRevenueCents - c.refundsCents - c.commissionCents - c.paymentFeesCents - c.cleaningCents;
    c.contributionMargin = c.grossRevenueCents > 0 ? c.contributionCents / c.grossRevenueCents : null;
    c.commissionShare = c.grossRevenueCents > 0 ? c.commissionCents / c.grossRevenueCents : null;
  }
  return Array.from(channels.values()).sort((a, b) => b.grossRevenueCents - a.grossRevenueCents);
}
