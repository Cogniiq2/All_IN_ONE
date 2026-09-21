import Link from 'next/link';
import type { CalendarDto, CalendarReservationDto } from '@/lib/admin/dto';
import { datesIn, isWeekend, place, windowOf } from '@/lib/admin/calendar';
import { formatIsoDate, formatRelative, formatStay, pluralNights, weekdayShort } from '@/lib/admin/format';
import { bookingStatePresentation, paymentStatePresentation, reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';

type BarKind = 'confirmed' | 'paid_unfinalized' | 'held' | 'caution' | 'critical' | 'unknown' | 'channel_stay' | 'channel_cancelled';

/**
 * The visual vocabulary of a stay on the grid, derived from the canonical
 * presentation. Confirmed is solid ink; a paid-but-unfinalized stay is the
 * one thing that must never look like a confirmed one, so it is dashed and
 * red; everything in progress is quiet; exceptions are loud and bordered.
 */
export function barKind(r: Pick<CalendarReservationDto, 'status' | 'kind' | 'occupies'>): BarKind {
  /*
   * A channel reservation is NOT a booking state. Booking.com stays occupy
   * the unit exactly as a confirmed direct booking does, so they read as
   * solid; but they carry no payment of ours, so they get their own kind
   * rather than borrowing `confirmed`, and a cancelled one is visibly spent
   * rather than quietly absent.
   */
  if (r.kind === 'reservation') return r.occupies ? 'channel_stay' : 'channel_cancelled';
  const p = bookingStatePresentation(r.status);
  if (r.status === 'confirmed') return 'confirmed';
  if (r.status === 'paid_unfinalized' || r.status === 'finalization_failed') return 'paid_unfinalized';
  if (p.tone === 'critical') return 'critical';
  if (p.tone === 'caution') return 'caution';
  if (p.tone === 'progress' || p.tone === 'positive') return 'held';
  return 'unknown';
}

export function CalendarGrid({ data, density, unitFilter }: { data: CalendarDto; density: 14 | 31 | 62; unitFilter: string | null }) {
  const window = windowOf(data.windowStart, density);
  const dates = datesIn(window);
  const units = data.units.filter((u) => !unitFilter || u.slug === unitFilter);

  return (
    <div className="bc-cal" data-density={String(density)} role="region" aria-label="Reservation calendar" tabIndex={0}>
      <div className="bc-cal-grid" style={{ ['--days' as string]: window.days }}>
        <div className="bc-cal-corner">
          <span className="bc-label">Property</span>
        </div>
        {dates.map((d, i) => {
          const monthStart = d.endsWith('-01') && i > 0;
          return (
            <div key={d} className="bc-cal-day" data-weekend={isWeekend(d) ? 'true' : undefined} data-today={d === data.today ? 'true' : undefined} data-month-start={monthStart ? 'true' : undefined} aria-label={formatIsoDate(d, 'long')}>
              <span>{density === 62 ? weekdayShort(d).charAt(0) : weekdayShort(d)}</span>
              <b>{d.slice(8).replace(/^0/, '')}</b>
              {(i === 0 || d.endsWith('-01')) && density !== 62 && <span style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{formatIsoDate(d).split(' ')[1]}</span>}
            </div>
          );
        })}

        {units.map((unit) => {
          const reservations = data.reservations.filter((r) => r.unitSlug === unit.slug);
          const closures = data.closures.filter((c) => c.unitSlug === unit.slug);
          const inactive = !unit.isBookable && unit.contentStatus !== 'available';
          return (
            <UnitLane key={unit.slug} unit={unit} reservations={reservations} closures={closures} dates={dates} window={window} today={data.today} inactive={inactive} />
          );
        })}
      </div>
    </div>
  );
}

function UnitLane({
  unit,
  reservations,
  closures,
  dates,
  window,
  today,
  inactive,
}: {
  unit: CalendarDto['units'][number];
  reservations: CalendarReservationDto[];
  closures: CalendarDto['closures'];
  dates: string[];
  window: ReturnType<typeof windowOf>;
  today: string;
  inactive: boolean;
}) {
  const col = (n: number) => `calc(var(--col) * ${n})`;
  // A stay begins at the middle of its arrival day and ends at the middle of
  // its departure day: back-to-back stays meet at noon, as they do at the door.
  const left = (startCol: number, clipped: boolean) => (clipped ? col(startCol) : `calc(${col(startCol)} + var(--col) / 2)`);
  const width = (startCol: number, endCol: number, clippedStart: boolean, clippedEnd: boolean) =>
    `calc(${col(endCol - startCol)} ${clippedStart ? '' : '- var(--col) / 2'} ${clippedEnd ? '' : '- var(--col) / 2'} - 2px)`;

  return (
    <>
      <div className="bc-cal-unit">
        <strong>{unit.displayName}</strong>
        <span>{inactive ? 'In preparation' : unit.isBookable ? 'Bookable' : 'Not bookable'}</span>
      </div>
      <div className="bc-cal-lane" data-inactive={inactive ? 'true' : undefined}>
        {dates.map((d, i) =>
          isWeekend(d) ? <span key={d} className="bc-cal-weekend" style={{ left: col(i), width: 'var(--col)' }} aria-hidden="true" /> : null
        )}
        {dates.includes(today) && <span className="bc-cal-today" style={{ left: `calc(${col(dates.indexOf(today))} + var(--col) / 2)` }} aria-hidden="true" />}

        {closures.map((c) => {
          const p = place({ checkIn: c.from, checkOut: c.to }, window);
          if (!p) return null;
          const nights = p.endCol - p.startCol;
          return (
            <span
              key={`${c.from}-${c.to}`}
              className="bc-bar"
              data-kind="channel"
              style={{ left: col(p.startCol), width: `calc(${col(nights)} - 2px)`, top: 16, height: 'calc(var(--row) - 32px)' }}
              title={`Closed at the channel manager: ${formatStay(c.from, c.to)} (cached ${c.syncedAt ? formatRelative(c.syncedAt) : 'unknown'})`}
            >
              <span className="bc-bar-text">{nights >= 2 ? 'Channel' : ''}</span>
            </span>
          );
        })}

        {reservations.map((r) => {
          const p = place(r, window);
          if (!p) return null;
          const kind = barKind(r);
          // Two vocabularies, chosen by which record this stay came from.
          const state = r.kind === 'reservation' ? reservationClassPresentation(r.status) : bookingStatePresentation(r.status);
          const payment = paymentStatePresentation(r.paymentStatus);
          const label = r.guestLabel ?? r.reference;
          const barWidth = width(p.startCol, p.endCol, p.clippedStart, p.clippedEnd);
          const ariaLabel =
            r.kind === 'reservation'
              ? `${label}, ${sourcePresentation(r.source).label} booking ${r.reference}, ${unit.displayName}, ${formatStay(r.checkIn, r.checkOut)}, ${state.label}`
              : `${label}, ${r.reference}, ${unit.displayName}, ${formatStay(r.checkIn, r.checkOut)}, ${state.label}, payment ${payment.label}`;
          const inner = (
            <>
              <i className="bc-glyph" data-glyph={state.glyph} aria-hidden="true" />
              <span className="bc-bar-text">{label}</span>
              {p.endCol - p.startCol >= 3 && <span className="bc-bar-src">{sourcePresentation(r.source).short}</span>}
            </>
          );
          return (
            <span key={`${r.kind}-${r.reference}`} className="bc-bar-host" style={{ left: left(p.startCol, p.clippedStart), width: barWidth }}>
              {/* A channel reservation has no BoLaGio record page, so it is not a link. */}
              {r.href ? (
                <Link
                  href={r.href}
                  className="bc-bar"
                  data-kind={kind}
                  data-clipped-start={p.clippedStart ? 'true' : undefined}
                  data-clipped-end={p.clippedEnd ? 'true' : undefined}
                  style={{ left: 0, width: '100%' }}
                  aria-label={ariaLabel}
                >
                  {inner}
                </Link>
              ) : (
                <span
                  className="bc-bar"
                  data-kind={kind}
                  data-clipped-start={p.clippedStart ? 'true' : undefined}
                  data-clipped-end={p.clippedEnd ? 'true' : undefined}
                  style={{ left: 0, width: '100%' }}
                  role="img"
                  aria-label={ariaLabel}
                >
                  {inner}
                </span>
              )}
              <span className="bc-bar-pop" style={{ top: 'calc(var(--row) - 6px)', left: 0 }} aria-hidden="true">
                <span className="flex items-center justify-between gap-3">
                  <span className="bc-ref">{r.reference}</span>
                  <span className="bc-badge" data-tone={state.tone}>
                    <i className="bc-glyph" data-glyph={state.glyph} />
                    {state.label}
                  </span>
                </span>
                <span className="block mt-1.5" style={{ fontWeight: 500 }}>
                  {label}
                </span>
                <span className="block bc-meta">
                  {formatStay(r.checkIn, r.checkOut)} · {pluralNights(r.nights)} · {r.adults + r.children} {r.adults + r.children === 1 ? 'guest' : 'guests'}
                </span>
                <span className="block bc-meta mt-1">
                  {r.kind === 'reservation'
                    ? `${sourcePresentation(r.source).label} · status ${r.providerStatus ?? r.status}${r.channelReference ? ` · ${r.channelReference}` : ''}`
                    : `Payment: ${payment.label} · ${sourcePresentation(r.source).label}`}
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </>
  );
}

export function CalendarLegend() {
  return (
    <div className="bc-legend" aria-label="Legend">
      <span>
        <i style={{ background: 'hsl(var(--bc-ink))' }} />
        Confirmed
      </span>
      <span>
        <i style={{ background: 'hsl(var(--bc-progress-soft))', borderColor: 'hsl(var(--bc-progress) / 0.45)' }} />
        Held / in payment
      </span>
      <span>
        <i style={{ background: 'hsl(var(--bc-caution-soft))', borderColor: 'hsl(var(--bc-caution) / 0.4)' }} />
        Unpaid, still held
      </span>
      <span>
        <i style={{ background: 'hsl(var(--bc-critical-soft))', borderColor: 'hsl(var(--bc-critical) / 0.55)', borderStyle: 'dashed' }} />
        Paid, not finalized
      </span>
      <span>
        <i style={{ background: 'hsl(var(--bc-critical-soft))', borderColor: 'hsl(var(--bc-critical) / 0.55)' }} />
        Needs a person
      </span>
      <span>
        <i style={{ background: 'hsl(var(--bc-accent-wash))', borderColor: 'hsl(var(--bc-accent) / 0.5)' }} />
        Channel reservation
      </span>
      <span>
        <i style={{ background: 'hsl(var(--bc-surface-2))', borderColor: 'hsl(var(--bc-line-strong))', borderStyle: 'dashed', opacity: 0.62 }} />
        Channel reservation, cancelled
      </span>
      <span>
        <i style={{ background: 'repeating-linear-gradient(135deg, hsl(var(--bc-surface-2)) 0 4px, hsl(var(--bc-line)) 4px 5px)', borderColor: 'hsl(var(--bc-line-strong))' }} />
        Closed at channel, no reservation
      </span>
    </div>
  );
}
