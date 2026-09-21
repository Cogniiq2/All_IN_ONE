import Link from 'next/link';
import type { CalendarDto } from '@/lib/admin/dto';
import { datesIn, relationOn, windowOf } from '@/lib/admin/calendar';
import { formatIsoDate, weekdayShort } from '@/lib/admin/format';
import { BookingStateBadge } from '@/components/admin/primitives';
import { reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';

/**
 * The phone's calendar: a day-by-day agenda of arrivals, departures and who
 * is in house, built from the same data as the grid. A grid at 390px wide is
 * a scroll trap; a list is what a person on the doorstep needs.
 */
export function Agenda({ data, days, unitFilter }: { data: CalendarDto; days: number; unitFilter: string | null }) {
  const window = windowOf(data.windowStart, days);
  const dates = datesIn(window);
  const reservations = data.reservations.filter((r) => !unitFilter || r.unitSlug === unitFilter);
  const unitName = (slug: string) => data.units.find((u) => u.slug === slug)?.displayName ?? slug;

  return (
    <div className="bc-rows bc-panel" style={{ padding: '0 16px' }}>
      {dates.map((d) => {
        const arrivals = reservations.filter((r) => relationOn(r, d) === 'arrival');
        const departures = reservations.filter((r) => relationOn(r, d) === 'departure');
        const inHouse = reservations.filter((r) => relationOn(r, d) === 'in_house');
        const closed = data.closures.filter((c) => (!unitFilter || c.unitSlug === unitFilter) && d >= c.from && d < c.to);
        const quiet = arrivals.length === 0 && departures.length === 0 && inHouse.length === 0 && closed.length === 0;
        return (
          <div key={d} className="bc-agenda-day" data-today={d === data.today ? 'true' : undefined}>
            <div className="bc-agenda-date">
              <b>{d.slice(8).replace(/^0/, '')}</b>
              <span>{weekdayShort(d)}</span>
              {d.endsWith('-01') && <span>{formatIsoDate(d).split(' ')[1]}</span>}
            </div>
            <div className="min-w-0 grid gap-2">
              {quiet && <span className="bc-meta">—</span>}
              {arrivals.map((r) => (
                <Line key={`a-${r.kind}-${r.reference}`} label="Arrival" r={r} unit={unitName(r.unitSlug)} />
              ))}
              {departures.map((r) => (
                <Line key={`d-${r.kind}-${r.reference}`} label="Departure" r={r} unit={unitName(r.unitSlug)} />
              ))}
              {inHouse.length > 0 && (
                <span className="bc-meta">
                  In house: {inHouse.map((r) => `${r.guestLabel ?? r.reference} (${unitName(r.unitSlug)})`).join(', ')}
                </span>
              )}
              {closed.length > 0 && <span className="bc-meta">Closed at channel: {closed.map((c) => unitName(c.unitSlug)).join(', ')}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Line({ label, r, unit }: { label: string; r: CalendarDto['reservations'][number]; unit: string }) {
  const channel = r.kind === 'reservation';
  const state = channel ? reservationClassPresentation(r.status) : null;
  const body = (
    <>
      <span className="bc-label">{label}</span>
      <span className="min-w-0">
        <span className="truncate" style={{ fontWeight: 500 }}>
          {r.guestLabel ?? r.reference}
        </span>
        <span className="bc-meta truncate">
          {unit}
          {channel ? ` · ${sourcePresentation(r.source).label}` : ''}
        </span>
      </span>
      {state ? (
        <span className="bc-badge" data-tone={state.tone}>
          <i className="bc-glyph" data-glyph={state.glyph} aria-hidden="true" />
          {state.label}
        </span>
      ) : (
        <BookingStateBadge state={r.status} />
      )}
    </>
  );
  // A channel reservation is not a BoLaGio record; there is nowhere to go.
  return r.href ? (
    <Link href={r.href} className="bc-agenda-line">
      {body}
    </Link>
  ) : (
    <span className="bc-agenda-line">{body}</span>
  );
}
