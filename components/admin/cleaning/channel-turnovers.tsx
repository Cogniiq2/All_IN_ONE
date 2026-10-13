import Link from 'next/link';
import type { ChannelTurnover } from '@/lib/admin/cleaning';
import type { ReservationDto } from '@/lib/admin/dto';
import { formatIsoDate, pluralNights } from '@/lib/admin/format';
import { bedroomPackageLabel, sourcePresentation } from '@/lib/admin/presentation';
import { EmptyState } from '@/components/admin/primitives';

function party(r: ReservationDto): string {
  if (r.adults !== null || r.children !== null) {
    const a = r.adults ?? 0;
    const c = r.children ?? 0;
    return `${a} ${a === 1 ? 'adult' : 'adults'}${c > 0 ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`;
  }
  return r.guests === null ? 'party not stated' : `${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}`;
}

/**
 * Channel departures as turnovers: who leaves, who comes next, how much time
 * there is, and what to prepare. A same-day changeover is marked; a bedroom
 * setup Beds24 does not state is said to be unknown rather than guessed.
 */
export function ChannelTurnoverList({ items }: { items: ChannelTurnover[] }) {
  if (items.length === 0) return <EmptyState title="No channel departure in the next sixty days." />;
  return (
    <div className="bc-rows bc-panel" style={{ padding: '0 4px' }}>
      {items.map(({ departure: d, next, sameDay, gapNights }) => {
        const setup = next ? bedroomPackageLabel(next.bedroomPackage) : null;
        return (
          <div key={d.id} className="bc-row-link" style={{ cursor: 'default' }}>
            <div className="grid gap-2 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6">
              <div className="min-w-0">
                <p className="truncate" style={{ fontWeight: 500 }}>
                  {formatIsoDate(d.checkOut, 'long')} · {d.unitName}
                </p>
                <p className="bc-meta truncate">
                  Out: <Link href={`/admin/reservations/${d.id}`}>{d.guestLabel ?? d.channelReference ?? d.externalBookingId}</Link> · {party(d)} · {sourcePresentation(d.source).label}
                </p>
              </div>
              <div className="min-w-0">
                {next ? (
                  <>
                    <p className="flex flex-wrap items-center gap-2">
                      {sameDay ? (
                        <span className="bc-badge" data-tone="caution">
                          <i className="bc-glyph" data-glyph="alert" aria-hidden="true" />
                          Same-day changeover
                        </span>
                      ) : (
                        <span className="bc-meta">{pluralNights(gapNights ?? 0)} free before</span>
                      )}
                      <span>
                        Next in: <Link href={`/admin/reservations/${next.id}`}>{formatIsoDate(next.checkIn, 'long')}</Link>
                      </span>
                    </p>
                    <p className="bc-meta truncate">
                      Prepare for {party(next)} · {setup ?? 'bedroom setup not stated by the channel'}
                    </p>
                  </>
                ) : (
                  <p className="bc-meta">No next arrival booked yet</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
