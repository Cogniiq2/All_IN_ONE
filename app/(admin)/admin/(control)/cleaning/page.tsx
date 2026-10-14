import type { Metadata } from 'next';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadCleaningBoard } from '@/lib/admin/queries';
import { formatIsoDate, formatLongDay } from '@/lib/admin/format';
import { PageHeader, Section, ErrorNotice, Metric, Notice } from '@/components/admin/primitives';
import { ChannelTurnoverList } from '@/components/admin/cleaning/channel-turnovers';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { TurnoverGroup } from '@/components/admin/cleaning/turnover-list';

export const metadata: Metadata = { title: 'Cleaning' };

/**
 * The turnover board. Every row is derived by the booking core from a
 * departure — a confirmed direct booking or an active imported reservation;
 * the board never invents a cleaning and never hides one. Overdue first,
 * today second, then what is coming.
 */
export default async function CleaningPage() {
  const [board, operator] = await Promise.all([loadCleaningBoard(), currentOperator()]);
  const mayManage = can(operator?.role, 'manage_cleaning') && !operator?.preview;

  if (!board.ok) {
    return (
      <>
        <PageHeader eyebrow="Daily" title="Cleaning" />
        <ErrorNotice title="The cleaning board could not be loaded.">{board.error}</ErrorNotice>
      </>
    );
  }
  const b = board.data;
  const next = b.overdue[0] ?? b.dueToday[0] ?? b.upcoming[0] ?? null;
  const nextDate = next?.departure ?? b.channelTurnovers[0]?.departure.checkOut ?? null;
  const toClean = b.counts.open + b.channelTurnovers.length;

  return (
    <>
      <PageHeader
        eyebrow="Daily"
        title="Cleaning"
        description={`${formatLongDay(b.today)} · one turnover per departure, from every channel, for the next sixty days. Mark each one done when the apartment is ready.`}
        actions={<RefreshControl loadedAt={board.loadedAt} every={120} />}
      />

      <div className="bc-metrics" style={{ ['--cols' as string]: 4 }}>
        <Metric label="To clean" value={toClean} note={nextDate ? `next check-out ${nextDate === b.today ? 'today' : formatIsoDate(nextDate)}` : 'nothing open in sixty days'} />
        <Metric label="Overdue" value={b.counts.overdue} note={b.counts.overdue > 0 ? 'past the cleaning window, not done' : undefined} />
        <Metric label="Same-day changeovers" value={b.counts.sameDay + b.channelTurnovers.filter((t) => t.sameDay).length} note="guests arrive the day others leave" />
        <Metric label="Nobody assigned" value={b.counts.unassigned} />
      </div>

      {!mayManage && (
        <p className="bc-meta mb-6">
          {operator?.preview ? 'Preview data is read-only.' : 'Your role can read the board; status and assignment are changed by operators.'}
        </p>
      )}

      <Section title="Overdue" meta={<span>the cleaning window has passed and nobody marked it done</span>} id="overdue">
        <TurnoverGroup items={b.overdue} empty="Nothing is overdue." mayManage={mayManage} />
      </Section>

      <Section title="Today" id="today">
        <TurnoverGroup items={b.dueToday} empty="No check-out to clean after today." mayManage={mayManage} />
      </Section>

      <Section title="Upcoming" meta={<span>{b.upcoming.length} in the next sixty days</span>} id="upcoming">
        <TurnoverGroup items={b.upcoming} empty="No upcoming check-out. Every booked departure creates a turnover automatically." mayManage={mayManage} />
      </Section>

      <Section title="Recently done" id="recent">
        <TurnoverGroup items={b.recent} empty="Nothing finished in the last two weeks." mayManage={mayManage} />
      </Section>

      {/*
        Departures the derivation has not reached yet. Empty once migration
        20261014 is applied and the operations pass has run; until then this
        is the planning list the board always showed for channel stays, so
        nothing disappears from the owner's view in between.
      */}
      {b.channelTurnovers.length > 0 && (
        <Section
          title="Check-outs not yet on the board"
          meta={<span>{b.channelTurnovers.length} booked departure{b.channelTurnovers.length === 1 ? '' : 's'} without a turnover record</span>}
          id="channel-departures"
        >
          <div className="mt-4">
            <Notice tone="caution" title="These cannot be marked done yet">
              They come from the reservation import and will appear above, with a Pending / Done status, once the cleaning derivation for
              imported stays is enabled on the database (migration 20261014) and the next scheduled pass has run — about three minutes later.
            </Notice>
            <div className="mt-4">
              <ChannelTurnoverList items={b.channelTurnovers} />
            </div>
          </div>
        </Section>
      )}

      <p className="bc-meta mt-10" style={{ fontSize: 12 }}>
        A turnover disappears only when the stay it came from is cancelled; a moved check-out reopens it. The cleaning window is
        check-out time to check-in time on the departure day; when the next guests arrive later, the room is needed by that date.
      </p>
    </>
  );
}
