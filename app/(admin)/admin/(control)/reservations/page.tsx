import type { Metadata } from 'next';
import { loadReservations } from '@/lib/admin/queries';
import { cachedUnits } from '@/lib/admin/request-cache';
import { hasActiveReservationFilter, parseReservationFilter, reservationQueryOf } from '@/lib/admin/reservation-filters';
import { sourcePresentation } from '@/lib/admin/presentation';
import { propertyTodayIso } from '@/lib/admin/format';
import { PageHeader, ErrorNotice, Metric } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { ReservationFilterBar } from '@/components/admin/reservations/reservation-filter-bar';
import { ReservationList } from '@/components/admin/reservations/reservation-rows';

export const metadata: Metadata = { title: 'Reservations' };

/**
 * Every reservation Beds24 holds — Booking.com, Airbnb, direct, manual —
 * imported read-only, searchable, history included. Beds24 is the source of
 * truth; this page is its normalised copy and says how fresh it is.
 */
export default async function ReservationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const filter = parseReservationFilter(searchParams);
  const today = propertyTodayIso();
  const [units, result] = await Promise.all([cachedUnits(), loadReservations(reservationQueryOf(filter, today, null), filter.unit)]);
  const unitOptions = units.ok ? units.data.map((u) => ({ slug: u.slug, name: u.displayName })) : [];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Reservations"
        description="What is booked at the channel manager, from every channel. Imported from Beds24 within seconds by webhook, and re-checked by the scheduled import."
        actions={<RefreshControl loadedAt={result.loadedAt} />}
      />

      <ReservationFilterBar filter={filter} units={unitOptions} />

      {!result.ok ? (
        <div className="mt-5">
          <ErrorNotice title="Reservations could not be loaded.">{result.error}</ErrorNotice>
        </div>
      ) : (
        <>
          <div className="bc-metrics mt-5" style={{ ['--cols' as string]: 3 }}>
            <Metric label="Matching" value={result.data.total} note={result.data.total > result.data.items.length ? `first ${result.data.items.length} shown` : undefined} />
            <Metric label="Booked" value={result.data.counts.active} />
            <Metric label="Cancelled" value={result.data.counts.cancelled} />
          </div>
          {Object.keys(result.data.counts.bySource).length > 0 && (
            <p className="bc-meta mt-3" style={{ fontSize: 12.5 }}>
              By channel:{' '}
              {Object.entries(result.data.counts.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, n]) => `${sourcePresentation(source).label} ${n}`)
                .join(' · ')}
            </p>
          )}
          <div className="mt-5">
            <ReservationList
              items={result.data.items}
              empty={hasActiveReservationFilter(filter) ? 'No reservation matches. Widen the filter, or clear it.' : 'No reservation ends today or later.'}
            />
          </div>
          <p className="bc-meta mt-3" style={{ fontSize: 12 }}>
            Amounts are gross as Beds24 states them — not payout, not net of commission, not accounting revenue. Payouts and
            commission are in Finance, from the channel statements.
          </p>
        </>
      )}
    </>
  );
}
