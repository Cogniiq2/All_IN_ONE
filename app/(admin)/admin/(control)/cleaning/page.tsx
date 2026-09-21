import type { Metadata } from 'next';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadCleaningBoard } from '@/lib/admin/queries';
import { formatLongDay } from '@/lib/admin/format';
import { PageHeader, Section, ErrorNotice, Metric } from '@/components/admin/primitives';
import { ReservationList } from '@/components/admin/reservations/reservation-rows';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { TurnoverGroup } from '@/components/admin/cleaning/turnover-list';

export const metadata: Metadata = { title: 'Cleaning' };

/**
 * The turnover board. Every row is derived by the booking core from a
 * confirmed departure; the board never invents a cleaning and never hides
 * one. Overdue first, today second, then what is coming.
 */
export default async function CleaningPage() {
  const [board, operator] = await Promise.all([loadCleaningBoard(), currentOperator()]);
  const mayManage = can(operator?.role, 'manage_cleaning') && !operator?.preview;

  if (!board.ok) {
    return (
      <>
        <PageHeader eyebrow="Operations" title="Cleaning" />
        <ErrorNotice title="The turnover board could not be loaded.">{board.error}</ErrorNotice>
      </>
    );
  }
  const b = board.data;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Cleaning"
        description={`${formatLongDay(b.today)} · turnovers from confirmed direct departures, and channel departures from the reservation import, inside the sixty-day horizon.`}
        actions={<RefreshControl loadedAt={board.loadedAt} every={120} />}
      />

      <div className="bc-metrics" style={{ ['--cols' as string]: 4 }}>
        <Metric label="Open" value={b.counts.open} />
        <Metric label="Overdue" value={b.counts.overdue} note={b.counts.overdue > 0 ? 'window closed, not done' : undefined} />
        <Metric label="Same-day changeovers" value={b.counts.sameDay} />
        <Metric label="Unassigned" value={b.counts.unassigned} />
      </div>

      {!mayManage && (
        <p className="bc-meta mb-6">
          {operator?.preview ? 'Preview data is read-only.' : 'Your role can read the board; status and assignment are changed by operators.'}
        </p>
      )}

      <Section title="Overdue" meta={<span>window closed and still open</span>} id="overdue">
        <TurnoverGroup items={b.overdue} empty="Nothing is overdue." mayManage={mayManage} />
      </Section>

      <Section title="Today" id="today">
        <TurnoverGroup items={b.dueToday} empty="No departure to turn over today." mayManage={mayManage} />
      </Section>

      <Section title="Upcoming" meta={<span>{b.upcoming.length} in the horizon</span>} id="upcoming">
        <TurnoverGroup items={b.upcoming} empty="No upcoming turnover. Confirmed departures create one automatically." mayManage={mayManage} />
      </Section>

      <Section title="Recently closed" id="recent">
        <TurnoverGroup items={b.recent} empty="Nothing closed in the last two weeks." mayManage={mayManage} />
      </Section>

      {/*
        The channel side of the work.

        Every departure here leaves a room to clean, exactly as a direct
        booking's does. They are listed rather than turned into turnover
        records because a turnover emits a cleaning event the automation
        platform acts on, and manufacturing one for every Booking.com stay
        already in the account would fire real messages for cleanings long
        since done. Planning first; work orders when the derivation is
        extended deliberately.
      */}
      <Section
        title="Channel departures"
        meta={<span>from imported reservations · no work order, no automation</span>}
        id="channel-departures"
      >
        <div className="mt-4">
          <ReservationList
            items={b.channelDepartures}
            empty="No channel departure in the next sixty days."
          />
          <p className="bc-meta mt-3" style={{ fontSize: 12 }}>
            These come from the read-only reservation import. They do not create turnover records and trigger nothing; assign them
            the way you do today until turnovers are derived from channel stays as well.
          </p>
        </div>
      </Section>

      <p className="bc-meta mt-10" style={{ fontSize: 12 }}>
        A turnover is voided only when the departure it came from no longer exists; a moved departure reopens it. Cleaning routing to a person or a calendar happens in the automation platform from the cleaning events, not from this screen.
      </p>
    </>
  );
}
