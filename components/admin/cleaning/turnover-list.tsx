import Link from 'next/link';
import type { TurnoverAttention, TurnoverDto, TurnoverStayDto } from '@/lib/admin/dto';
import { compactUnitName, formatClock, formatIsoDate, weekdayShort } from '@/lib/admin/format';
import { bedroomPackageLabel, sourcePresentation } from '@/lib/admin/presentation';
import { Notice, When } from '@/components/admin/primitives';
import { TurnoverControls } from '@/components/admin/cleaning/turnover-controls';

const ATTENTION: Record<Exclude<TurnoverAttention, null>, { label: string; tone: string }> = {
  overdue: { label: 'Overdue', tone: 'critical' },
  due_today: { label: 'Today', tone: 'caution' },
  same_day: { label: 'Same-day changeover', tone: 'caution' },
  unassigned: { label: 'Nobody assigned', tone: 'neutral' },
};

/** Owner wording: a turnover is pending, being done, done, or no longer needed. */
const STATUS: Record<string, { label: string; tone: string }> = {
  required: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'progress' },
  done: { label: 'Done', tone: 'positive' },
  void: { label: 'No longer needed', tone: 'muted' },
};

function party(s: TurnoverStayDto): string {
  if (s.adults !== null || s.children !== null) {
    const a = s.adults ?? 0;
    const c = s.children ?? 0;
    return `${a} ${a === 1 ? 'adult' : 'adults'}${c > 0 ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`;
  }
  return s.guests === null ? 'party not stated' : `${s.guests} ${s.guests === 1 ? 'guest' : 'guests'}`;
}

function StayLine({ label, stay }: { label: string; stay: TurnoverStayDto }) {
  return (
    <span>
      {label}: <Link href={`/admin/reservations/${stay.reservationId}`}>{stay.guestLabel ?? 'Guest name not provided'}</Link> · {party(stay)} ·{' '}
      {sourcePresentation(stay.source).label}
    </span>
  );
}

export function TurnoverRow({ turnover, mayManage }: { turnover: TurnoverDto; mayManage: boolean }) {
  const status = STATUS[turnover.status] ?? { label: turnover.status, tone: 'neutral' };
  const attention = turnover.attention ? ATTENTION[turnover.attention] : null;
  const setup = turnover.arriving ? bedroomPackageLabel(turnover.arriving.bedroomPackage) : null;
  return (
    <div className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr)', padding: '12px 0' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="bc-badge" data-tone={status.tone}>
          {status.label}
        </span>
        {attention && (
          <span className="bc-badge ghost" data-tone={attention.tone}>
            {attention.label}
          </span>
        )}
        <span style={{ fontWeight: 600 }}>{compactUnitName(turnover.unitName)}</span>
        <span className="bc-meta">
          check-out {weekdayShort(turnover.departure)} {formatIsoDate(turnover.departure)} · clean {formatClock(turnover.windowStart)}–{formatClock(turnover.windowEnd)}
          {turnover.nextArrival
            ? ` · next check-in ${turnover.nextArrival === turnover.departure ? 'the same day' : formatIsoDate(turnover.nextArrival)}`
            : ' · no next check-in booked yet'}
        </span>
        {turnover.reference && (
          <Link href={`/admin/bookings/${turnover.reference}`} className="bc-ref">
            {turnover.reference}
          </Link>
        )}
      </div>
      {(turnover.departing || turnover.arriving) && (
        <div className="bc-meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {turnover.departing && <StayLine label="Leaving" stay={turnover.departing} />}
          {turnover.arriving && (
            <>
              <StayLine label="Arriving" stay={turnover.arriving} />
              <span>prepare {setup ?? 'bedroom setup not stated by the channel'}</span>
            </>
          )}
        </div>
      )}
      <div className="bc-meta mt-1 flex flex-wrap items-center gap-x-3">
        <span>{turnover.assignedTo ? `Assigned to ${turnover.assignedTo}` : 'Nobody assigned'}</span>
        {turnover.startedAt && (
          <span>
            started <When value={turnover.startedAt} relative />
          </span>
        )}
        {turnover.doneAt && (
          <span>
            done <When value={turnover.doneAt} relative />
            {turnover.doneBy ? ` by ${turnover.doneBy}` : ''}
          </span>
        )}
        {turnover.note && <span>· {turnover.note}</span>}
      </div>
      {mayManage && turnover.status !== 'void' && (
        <div className="mt-2">
          <TurnoverControls turnover={turnover} />
        </div>
      )}
    </div>
  );
}

export function TurnoverGroup({ items, empty, mayManage }: { items: TurnoverDto[]; empty: string; mayManage: boolean }) {
  if (items.length === 0) {
    return (
      <div className="pt-3">
        <Notice tone="neutral">{empty}</Notice>
      </div>
    );
  }
  return (
    <div className="bc-rows">
      {items.map((t) => (
        <TurnoverRow key={t.id} turnover={t} mayManage={mayManage} />
      ))}
    </div>
  );
}
