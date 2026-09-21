import type { Metadata } from 'next';
import { listBookings, loadReservations } from '@/lib/admin/queries';
import { cachedUnits } from '@/lib/admin/request-cache';
import { filterToParams, hasActiveFilter, parseBookingFilter, type BookingSort } from '@/lib/admin/filters';
import { PageHeader, Section, ErrorNotice, EmptyState } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { FilterBar } from '@/components/admin/bookings/filter-bar';
import { BookingCards, BookingTable } from '@/components/admin/bookings/booking-rows';
import { Pagination } from '@/components/admin/bookings/pagination';
import { ReservationList } from '@/components/admin/reservations/reservation-rows';
import { propertyTodayIso } from '@/lib/admin/format';

export const metadata: Metadata = { title: 'Bookings' };

export default async function BookingsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const filter = parseBookingFilter(searchParams);
  const today = propertyTodayIso();
  /*
   * Two records, side by side and never merged.
   *
   * The table above is every DIRECT booking attempt with its own state
   * machine. The section below is what is actually booked at the channel
   * manager — Booking.com, Airbnb, manual — imported read-only. A unit filter
   * on this page applies to both; the other filters are booking-state filters
   * and have no meaning for a channel reservation, so they are not applied to
   * it.
   */
  const [result, units, reservations] = await Promise.all([
    listBookings(filter),
    cachedUnits(),
    // From today onwards: the history lives in the calendar, this page is
    // about what is still ahead.
    loadReservations({ checkOutFrom: today, sort: 'check_in', limit: 100 }),
  ]);
  const unitOptions = units.ok ? units.data.map((u) => ({ slug: u.slug, name: u.displayName })) : [];
  const channelItems = reservations.ok
    ? reservations.data.items.filter((r) => !filter.unit || r.unitSlug === filter.unit)
    : [];

  const hrefWith = (patch: Partial<typeof filter>) => {
    const p = filterToParams({ ...filter, ...patch });
    return `/admin/bookings${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Bookings"
        description="Every booking attempt the core has recorded, with its reservation state and its payment state kept apart."
        actions={<RefreshControl loadedAt={result.loadedAt} />}
      />

      <FilterBar filter={filter} units={unitOptions} />

      <div className="mt-5">
        {!result.ok ? (
          <ErrorNotice title="Bookings could not be loaded.">{result.error}</ErrorNotice>
        ) : result.data.items.length === 0 ? (
          <div className="bc-panel">
            <EmptyState title={hasActiveFilter(filter) ? 'No bookings match.' : 'No bookings yet.'}>
              {hasActiveFilter(filter) ? 'Widen the filter, or clear it.' : 'When a guest starts a direct booking, it appears here from its first state.'}
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <BookingTable items={result.data.items} sort={filter.sort} dir={filter.dir} buildHref={(sort, dir) => hrefWith({ sort: sort as BookingSort, dir, page: 1 })} />
            </div>
            <div className="md:hidden">
              <BookingCards items={result.data.items} />
            </div>
            <Pagination page={result.data.page} pageSize={result.data.pageSize} total={result.data.total} hrefFor={(page) => hrefWith({ page })} />
          </>
        )}
      </div>

      <Section
        title="Channel reservations"
        meta={
          <span>
            Imported read-only from the channel manager · cancellations are kept and marked, never removed
          </span>
        }
        id="channel"
      >
        {!reservations.ok ? (
          <div className="mt-4">
            <ErrorNotice title="Channel reservations could not be loaded." tone="caution">
              {reservations.error}
            </ErrorNotice>
          </div>
        ) : (
          <div className="mt-4">
            <ReservationList
              items={channelItems}
              empty="No channel reservation ends today or later. If Booking.com shows stays that are missing here, run the reservation import."
            />
            <p className="bc-meta mt-3" style={{ fontSize: 12 }}>
              Amounts are gross as the channel manager states them. They are not payout, not net of commission and not accounting
              revenue; nothing in Finance reads them.
            </p>
          </div>
        )}
      </Section>
    </>
  );
}
