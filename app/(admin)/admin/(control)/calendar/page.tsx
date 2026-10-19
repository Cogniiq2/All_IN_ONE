import type { Metadata } from 'next';
import Link from 'next/link';
import { loadBookingFreshness, loadCalendar } from '@/lib/admin/queries';
import { FreshnessBanner } from '@/components/admin/freshness-banner';
import { addDays, startOfWeek } from '@/lib/admin/calendar';
import { compactUnitName, formatIsoDate, formatRelative, propertyTodayIso } from '@/lib/admin/format';
import { isIsoDate } from '@/lib/booking/stay-rules';
import { PageHeader, ErrorNotice } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { CalendarGrid, CalendarLegend, stayKey } from '@/components/admin/calendar/calendar-grid';
import { Agenda } from '@/components/admin/calendar/agenda';
import { CalendarBoard, type StayRef } from '@/components/admin/calendar/stay-sheet';
import { Segmented } from '@/components/admin/bookings/filter-bar';
import type { CalendarDto } from '@/lib/admin/dto';

export const metadata: Metadata = { title: 'Calendar' };

const DENSITIES = [14, 31, 62] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026", or "October – November 2026" when the window spans months. */
function windowTitle(start: string, endExclusive: string): string {
  const last = addDays(endExclusive, -1);
  const [y1, m1] = [start.slice(0, 4), Number(start.slice(5, 7))];
  const [y2, m2] = [last.slice(0, 4), Number(last.slice(5, 7))];
  if (y1 === y2 && m1 === m2) return `${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${MONTHS[m1 - 1]} – ${MONTHS[m2 - 1]} ${y1}`;
  return `${MONTHS[m1 - 1]} ${y1} – ${MONTHS[m2 - 1]} ${y2}`;
}

/** The window in five numbers: how full, how many nights, who comes, who goes, what is free. */
function windowStats(data: CalendarDto, start: string, end: string, unitFilter: string | null) {
  const units = data.units.filter((u) => (!unitFilter || u.slug === unitFilter) && (u.isBookable || u.contentStatus === 'available'));
  const slugs = new Set(units.map((u) => u.slug));
  const stays = data.reservations.filter((r) => r.occupies && slugs.has(r.unitSlug));
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  let nights = 0;
  for (const r of stays) {
    const from = r.checkIn > start ? r.checkIn : start;
    const to = r.checkOut < end ? r.checkOut : end;
    nights += Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
  }
  const capacity = units.length * days;
  return {
    occupancy: capacity > 0 ? nights / capacity : null,
    nights,
    free: Math.max(0, capacity - nights),
    arrivals: stays.filter((r) => r.checkIn >= start && r.checkIn < end).length,
    departures: stays.filter((r) => r.checkOut >= start && r.checkOut < end).length,
    inHouse: stays.filter((r) => r.checkIn <= data.today && r.checkOut > data.today).length,
  };
}

/**
 * The calendar: every apartment across the chosen window, every stay a bar.
 * Click a bar (or a line on a phone) for the stay sheet — guest, money,
 * booking — and walk from stay to stay with the arrow keys. Read-only by
 * design: dates and prices change in Beds24, and arrive here in seconds.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const today = propertyTodayIso();
  const first = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : (searchParams[k] as string | undefined));
  const densityRaw = Number.parseInt(first('days') ?? '31', 10);
  const density = (DENSITIES as readonly number[]).includes(densityRaw) ? (densityRaw as 14 | 31 | 62) : 31;
  const startParam = first('start');
  const defaultStart = density === 14 ? startOfWeek(today) : addDays(today, -3);
  const start = isIsoDate(startParam) ? startParam : defaultStart;
  const end = addDays(start, density);
  const unit = (first('unit') ?? '').slice(0, 60) || null;

  const [data, freshness] = await Promise.all([loadCalendar(start, end, today), loadBookingFreshness()]);

  const href = (patch: { start?: string; days?: number; unit?: string | null }) => {
    const p = new URLSearchParams();
    const d = patch.days ?? density;
    const s = patch.start ?? (patch.days !== undefined ? (d === 14 ? startOfWeek(today) : addDays(today, -3)) : start);
    const u = patch.unit === undefined ? unit : patch.unit;
    if (s !== (d === 14 ? startOfWeek(today) : addDays(today, -3))) p.set('start', s);
    if (d !== 31) p.set('days', String(d));
    if (u) p.set('unit', u);
    return `/admin/calendar${p.size ? `?${p}` : ''}`;
  };

  const units = data.ok ? data.data.units : [];
  const atToday = start === defaultStart;
  const stats = data.ok ? windowStats(data.data, start, end, unit) : null;
  const unitName = (slug: string) => compactUnitName(units.find((u) => u.slug === slug)?.displayName ?? slug);
  const stays: StayRef[] = data.ok
    ? data.data.reservations
        .filter((r) => !unit || r.unitSlug === unit)
        .map((r) => ({
          key: stayKey(r),
          kind: r.kind,
          reservationId: r.reservationId ?? null,
          href: r.href,
          reference: r.reference,
          label: r.guestLabel ?? r.reference,
          unitSlug: r.unitSlug,
          unitName: unitName(r.unitSlug),
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          nights: r.nights,
          status: r.status,
          source: r.source,
          adults: r.adults,
          children: r.children,
          occupies: r.occupies,
          channelReference: r.channelReference ?? null,
        }))
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title={windowTitle(start, end)}
        description="Every apartment, every stay. Click a stay for everything about it — guest, money, booking — and use the arrow keys to move from one stay to the next."
        actions={<RefreshControl loadedAt={data.loadedAt} />}
      />

      <FreshnessBanner freshness={freshness} />

      <div className="cal-toolbar">
        <div className="cal-move">
          <Link href={href({ start: defaultStart })} className="cal-today" aria-current={atToday ? 'true' : undefined}>
            Today
          </Link>
          <Link href={href({ start: addDays(start, -density) })} className="cal-arrow" aria-label="Earlier" scroll={false}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </Link>
          <Link href={href({ start: addDays(start, density) })} className="cal-arrow" aria-label="Later" scroll={false}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
          <span className="cal-range">
            {formatIsoDate(start)} – {formatIsoDate(addDays(end, -1), 'long')}
          </span>
        </div>
        <div className="cal-views">
          <Segmented options={DENSITIES.map((d) => ({ key: String(d), label: d === 14 ? '2 weeks' : d === 31 ? 'Month' : '2 months', href: href({ days: d }) }))} value={String(density)} />
          {units.length > 1 && (
            <Segmented
              options={[{ key: '', label: 'All apartments', href: href({ unit: null }) }, ...units.map((u) => ({ key: u.slug, label: compactUnitName(u.displayName), href: href({ unit: u.slug }) }))]}
              value={unit ?? ''}
            />
          )}
        </div>
      </div>

      {stats && (
        <dl className="cal-stats">
          <div style={{ ['--i' as string]: 0 }}>
            <dt>Occupancy</dt>
            <dd>{stats.occupancy === null ? '—' : `${Math.round(stats.occupancy * 100)} %`}</dd>
            <dd className="cal-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((stats.occupancy ?? 0) * 100)}%` }} />
            </dd>
          </div>
          <div style={{ ['--i' as string]: 1 }}>
            <dt>Nights booked</dt>
            <dd>{stats.nights}</dd>
            <dd className="cal-note">{stats.free} free</dd>
          </div>
          <div style={{ ['--i' as string]: 2 }}>
            <dt>Arrivals</dt>
            <dd>{stats.arrivals}</dd>
          </div>
          <div style={{ ['--i' as string]: 3 }}>
            <dt>Departures</dt>
            <dd>{stats.departures}</dd>
          </div>
          <div style={{ ['--i' as string]: 4 }}>
            <dt>In house tonight</dt>
            <dd>{stats.inHouse}</dd>
          </div>
        </dl>
      )}

      {!data.ok ? (
        <ErrorNotice title="The calendar could not be loaded.">{data.error}</ErrorNotice>
      ) : (
        <CalendarBoard stays={stays} today={today}>
          <div className="hidden md:block">
            <CalendarGrid data={data.data} density={density} unitFilter={unit} />
          </div>
          <div className="md:hidden">
            <Agenda data={data.data} days={Math.min(density, 31)} unitFilter={unit} />
          </div>
          <div className="cal-foot">
            <CalendarLegend data={data.data} />
            <span className="bc-meta">{data.data.inventorySyncedAt ? `Availability synced ${formatRelative(data.data.inventorySyncedAt)}` : 'No channel availability cached for this window'}</span>
          </div>
          {data.data.reservations.length === 0 && data.data.closures.length === 0 && <p className="cal-empty">Nothing is booked or closed in this window.</p>}
        </CalendarBoard>
      )}
    </>
  );
}
