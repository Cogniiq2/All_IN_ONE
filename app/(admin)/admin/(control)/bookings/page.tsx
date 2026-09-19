import type { Metadata } from 'next';
import { listBookings } from '@/lib/admin/queries';
import { cachedUnits } from '@/lib/admin/request-cache';
import { filterToParams, hasActiveFilter, parseBookingFilter, type BookingSort } from '@/lib/admin/filters';
import { PageHeader, ErrorNotice, EmptyState } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { FilterBar } from '@/components/admin/bookings/filter-bar';
import { BookingCards, BookingTable } from '@/components/admin/bookings/booking-rows';
import { Pagination } from '@/components/admin/bookings/pagination';

export const metadata: Metadata = { title: 'Bookings' };

export default async function BookingsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const filter = parseBookingFilter(searchParams);
  const [result, units] = await Promise.all([listBookings(filter), cachedUnits()]);
  const unitOptions = units.ok ? units.data.map((u) => ({ slug: u.slug, name: u.displayName })) : [];

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
    </>
  );
}
