import Link from 'next/link';
import type { TurnoverAttention, TurnoverDto } from '@/lib/admin/dto';
import { formatClock, formatIsoDate, weekdayShort } from '@/lib/admin/format';
import { Notice, When } from '@/components/admin/primitives';
import { TurnoverControls } from '@/components/admin/cleaning/turnover-controls';

const ATTENTION: Record<Exclude<TurnoverAttention, null>, { label: string; tone: string }> = {
  overdue: { label: 'Overdue', tone: 'critical' },
  due_today: { label: 'Today', tone: 'caution' },
  same_day: { label: 'Same-day changeover', tone: 'caution' },
  unassigned: { label: 'Unassigned', tone: 'neutral' },
};

const STATUS: Record<string, { label: string; tone: string }> = {
  required: { label: 'Required', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'progress' },
  done: { label: 'Done', tone: 'positive' },
  void: { label: 'Void', tone: 'muted' },
};

export function TurnoverRow({ turnover, mayManage }: { turnover: TurnoverDto; mayManage: boolean }) {
  const status = STATUS[turnover.status] ?? { label: turnover.status, tone: 'neutral' };
  const attention = turnover.attention ? ATTENTION[turnover.attention] : null;
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
        <span style={{ fontWeight: 600 }}>{turnover.unitName}</span>
        <span className="bc-meta">
          departs {weekdayShort(turnover.departure)} {formatIsoDate(turnover.departure)} · window {formatClock(turnover.windowStart)}–{formatClock(turnover.windowEnd)}
          {turnover.nextArrival ? ` · next arrival ${turnover.nextArrival === turnover.departure ? 'same day' : formatIsoDate(turnover.nextArrival)}` : ' · no arrival scheduled'}
        </span>
        {turnover.reference && (
          <Link href={`/admin/bookings/${turnover.reference}`} className="bc-ref">
            {turnover.reference}
          </Link>
        )}
      </div>
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
