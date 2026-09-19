import type { Metadata } from 'next';
import Link from 'next/link';
import { loadCalendar } from '@/lib/admin/queries';
import { addDays, startOfWeek } from '@/lib/admin/calendar';
import { formatIsoDate, formatRelative, propertyTodayIso } from '@/lib/admin/format';
import { isIsoDate } from '@/lib/booking/stay-rules';
import { PageHeader, ErrorNotice, Notice } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { CalendarGrid, CalendarLegend } from '@/components/admin/calendar/calendar-grid';
import { Agenda } from '@/components/admin/calendar/agenda';
import { Segmented } from '@/components/admin/bookings/filter-bar';

export const metadata: Metadata = { title: 'Calendar' };

const DENSITIES = [14, 31, 62] as const;

/**
 * The multi-property calendar. Read-only by design in this version: no drag
 * to move, no drag to resize, no date edits. Nights are local reservations
 * from the booking core; hatched bands are what the cached channel
 * availability says is closed beyond them. Everything is a link to the
 * booking it represents.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const today = propertyTodayIso();
  const first = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : (searchParams[k] as string | undefined));
  const densityRaw = Number.parseInt(first('days') ?? '31', 10);
  const density = (DENSITIES as readonly number[]).includes(densityRaw) ? (densityRaw as 14 | 31 | 62) : 31;
  const startParam = first('start');
  const start = isIsoDate(startParam) ? startParam : density === 14 ? startOfWeek(today) : addDays(today, -3);
  const end = addDays(start, density);
  const unit = (first('unit') ?? '').slice(0, 60) || null;

  const data = await loadCalendar(start, end, today);

  const href = (patch: { start?: string; days?: number; unit?: string | null }) => {
    const p = new URLSearchParams();
    const s = patch.start ?? start;
    const d = patch.days ?? density;
    const u = patch.unit === undefined ? unit : patch.unit;
    if (s !== (d === 14 ? startOfWeek(today) : addDays(today, -3))) p.set('start', s);
    if (d !== 31) p.set('days', String(d));
    if (u) p.set('unit', u);
    return `/admin/calendar${p.size ? `?${p}` : ''}`;
  };

  const units = data.ok ? data.data.units : [];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Calendar"
        description={`${formatIsoDate(start, 'long')} – ${formatIsoDate(addDays(end, -1), 'long')} · nights, half-open: a departure day is the next arrival’s.`}
        actions={<RefreshControl loadedAt={data.loadedAt} />}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href={href({ start: density === 14 ? startOfWeek(today) : addDays(today, -3) })} className="bc-btn sm">
          Today
        </Link>
        <div className="inline-flex">
          <Link href={href({ start: addDays(start, -density) })} className="bc-btn sm" aria-label="Earlier" style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
            ←
          </Link>
          <Link href={href({ start: addDays(start, density) })} className="bc-btn sm" aria-label="Later" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}>
            →
          </Link>
        </div>
        <Segmented options={DENSITIES.map((d) => ({ key: String(d), label: d === 14 ? '2 weeks' : d === 31 ? 'Month' : '2 months', href: href({ days: d }) }))} value={String(density)} />
        {units.length > 1 && (
          <Segmented options={[{ key: '', label: 'All', href: href({ unit: null }) }, ...units.map((u) => ({ key: u.slug, label: u.displayName, href: href({ unit: u.slug }) }))]} value={unit ?? ''} />
        )}
      </div>

      {!data.ok ? (
        <ErrorNotice title="The calendar could not be loaded.">{data.error}</ErrorNotice>
      ) : (
        <>
          <div className="hidden md:block">
            <CalendarGrid data={data.data} density={density} unitFilter={unit} />
          </div>
          <div className="md:hidden">
            <Agenda data={data.data} days={Math.min(density, 31)} unitFilter={unit} />
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <CalendarLegend />
            <span className="bc-meta">
              {data.data.inventorySyncedAt ? `Channel cache synced ${formatRelative(data.data.inventorySyncedAt)}` : 'No channel cache in this window'}
            </span>
          </div>
          {data.data.reservations.length === 0 && data.data.closures.length === 0 && (
            <div className="mt-6">
              <Notice tone="neutral">No reservations or channel closures fall in this window.</Notice>
            </div>
          )}
        </>
      )}
    </>
  );
}
