import type { Metadata } from 'next';
import { loadBookingFreshness } from '@/lib/admin/queries';
import { FreshnessBanner } from '@/components/admin/freshness-banner';
import { effectiveShow, hasActiveReservationFilter, parseReservationFilter } from '@/lib/admin/reservation-filters';
import { loadReservationExplorer } from '@/lib/admin/reservation-explorer';
import { PageHeader, ErrorNotice, EmptyState } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { ReservationExplorer } from '@/components/admin/reservations/reservation-explorer';
import { ReservationOverview } from '@/components/admin/reservations/reservation-overview';
import { ReservationTimeline } from '@/components/admin/reservations/reservation-timeline';

export const metadata: Metadata = { title: 'Reservations' };

/**
 * Every reservation Beds24 holds — Booking.com, Airbnb, direct, manual —
 * imported read-only. The explorer asks four plain questions (staying when,
 * booked when, which apartment, what to show), answers with a sentence and
 * five figures, and saves exactly that view as a PDF.
 */
export default async function ReservationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const filter = parseReservationFilter(searchParams);
  const [view, freshness] = await Promise.all([loadReservationExplorer(filter), loadBookingFreshness()]);
  const { result } = view;

  const empty =
    filter.q
      ? `Nothing matches “${filter.q}”. Check the spelling, or search by the Booking.com number.`
      : filter.when === 'current' && effectiveShow(filter) === 'booked'
        ? 'Nobody is staying tonight.'
        : effectiveShow(filter) === 'cancelled'
          ? 'No cancelled booking for this selection.'
          : hasActiveReservationFilter(filter)
            ? 'No booking for this selection. Choose a wider period, or start over.'
            : 'No booked stay from today on.';

  return (
    <>
      <PageHeader
        eyebrow="Daily"
        title="Reservations"
        description="Every booking from Booking.com, Airbnb and the website. Choose a period, an apartment or a booking date — the list, the figures and the PDF follow."
        actions={<RefreshControl loadedAt={result.loadedAt} />}
      />

      <FreshnessBanner freshness={freshness} />

      <ReservationExplorer filter={filter} units={view.units} description={view.description} count={result.ok ? result.data.total : null}>
        {!result.ok || !view.summary ? (
          <ErrorNotice title="Reservations could not be loaded.">{result.ok ? null : result.error}</ErrorNotice>
        ) : (
          <>
            <ReservationOverview
              description={view.description}
              summary={view.summary}
              total={result.data.total}
              shown={result.data.items.length}
              currency={result.data.items.find((r) => r.currency)?.currency ?? 'EUR'}
            />
            {result.data.items.length === 0 ? (
              <div className="bx-empty">
                <EmptyState title={empty} />
              </div>
            ) : (
              <ReservationTimeline items={result.data.items} today={view.today} order={filter.order} />
            )}
            <p className="bc-meta mt-3" style={{ fontSize: 12 }}>
              Amounts are gross as Beds24 states them — not payout, not net of commission, not accounting revenue. Payouts and commission are in
              Finance, from the channel statements.
            </p>
          </>
        )}
      </ReservationExplorer>
    </>
  );
}
