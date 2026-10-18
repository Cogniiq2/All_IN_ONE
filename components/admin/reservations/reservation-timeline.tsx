import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { ReservationDto } from '@/lib/admin/dto';
import { compactUnitName, formatIsoDate, formatMoney, weekdayShort } from '@/lib/admin/format';
import { bedroomPackageLabel, reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';
import { groupReservationsByMonth, stayMoment, type StayMoment } from '@/lib/admin/reservation-summary';
import { addDaysIso } from '@/lib/admin/reservation-filters';
import { bookedOnLabel, reservationHref } from '@/components/admin/reservations/reservation-rows';

/**
 * The explorer's list: chapters by month, one calm row per stay.
 *
 * A row leads with a date tile — the arrival, the thing an owner looks for
 * first — then who, where, how long, through which channel and for how much.
 * A one-word marker says where the stay is relative to today. The whole row
 * is the link to the reservation; nothing inside it is a second target.
 */

const MOMENT_LABEL: Record<Exclude<StayMoment, null>, string> = {
  in_house: 'In house',
  arrives_today: 'Arrives today',
  arrives_tomorrow: 'Arrives tomorrow',
  leaves_today: 'Leaves today',
};

const CHANNEL_TONE: Record<string, string> = {
  booking_com: 'booking',
  airbnb: 'airbnb',
  direct: 'direct',
  manual: 'manual',
};

function party(r: ReservationDto): string | null {
  const n = r.guests ?? (r.adults !== null || r.children !== null ? (r.adults ?? 0) + (r.children ?? 0) : null);
  if (n === null) return null;
  return `${n} ${n === 1 ? 'guest' : 'guests'}`;
}

function channelText(r: ReservationDto): string {
  if (r.source !== 'unknown') return sourcePresentation(r.source).label;
  return r.sourceRaw ? `Not identified · “${r.sourceRaw}”` : 'Channel not identified';
}

export function ReservationTimeline({ items, today, order }: { items: ReservationDto[]; today: string; order: 'arrival' | 'booked' }) {
  const tomorrow = addDaysIso(today, 1);
  const groups = groupReservationsByMonth(items, order);
  let index = 0;

  return (
    <div className="bx-list">
      {groups.map((g) => (
        <section key={g.key} className="bx-month" aria-label={g.label}>
          <header className="bx-month-head">
            <h2>{order === 'booked' ? `Booked in ${g.label}` : g.label}</h2>
            <span>
              {g.stays} {g.stays === 1 ? 'stay' : 'stays'}
              {g.nights > 0 ? ` · ${g.nights} ${g.nights === 1 ? 'night' : 'nights'}` : ''}
              {g.items.length > g.stays ? ` · ${g.items.length - g.stays} not booked` : ''}
            </span>
          </header>
          <ol className="bx-rows">
            {g.items.map((r) => {
              const i = index++;
              const moment = stayMoment(r, today, tomorrow);
              const state = reservationClassPresentation(r.statusClass);
              const booked = bookedOnLabel(r);
              const people = party(r);
              const room = bedroomPackageLabel(r.bedroomPackage);
              return (
                <li key={`${r.provider}-${r.externalBookingId}`} style={{ ['--i' as string]: Math.min(i, 14) } as CSSProperties}>
                  <Link href={reservationHref(r)} className="bx-item" data-state={r.statusClass} data-moment={moment ?? undefined}>
                    <span className="bx-tile" aria-hidden="true">
                      <span className="bx-tile-day">{formatIsoDate(r.checkIn, 'day')}</span>
                      <span className="bx-tile-month">{formatIsoDate(r.checkIn).split(' ')[1]}</span>
                    </span>

                    <span className="bx-item-main">
                      <span className="bx-item-guest">
                        {r.guestLabel ?? 'Guest name not stated'}
                        {moment && <span className="bx-moment" data-moment={moment}>{MOMENT_LABEL[moment]}</span>}
                      </span>
                      <span className="bx-item-stay">
                        {weekdayShort(r.checkIn)} {formatIsoDate(r.checkIn)} – {weekdayShort(r.checkOut)} {formatIsoDate(r.checkOut, 'long')}
                        <span className="bx-sep">·</span>
                        {r.nights} {r.nights === 1 ? 'night' : 'nights'}
                        {people && (
                          <>
                            <span className="bx-sep">·</span>
                            {people}
                          </>
                        )}
                        {room && (
                          <>
                            <span className="bx-sep">·</span>
                            {room}
                          </>
                        )}
                      </span>
                    </span>

                    <span className="bx-item-unit">
                      <span className="bx-item-unit-name">{compactUnitName(r.unitName)}</span>
                      <span className="bx-item-ref">{r.channelReference ?? r.externalBookingId}</span>
                    </span>

                    <span className="bx-item-channel">
                      <span className="bx-channel-dot" data-channel={CHANNEL_TONE[r.source] ?? 'other'} aria-hidden="true" />
                      <span className="bx-item-channel-text">
                        {channelText(r)}
                        {booked && <small>Booked {booked}</small>}
                      </span>
                    </span>

                    <span className="bx-item-money">
                      <span className="bx-item-amount">{r.totalCents === null ? '—' : formatMoney(r.totalCents, r.currency ?? 'EUR')}</span>
                      <span className="bx-item-status" data-tone={state.tone}>
                        {state.label}
                      </span>
                    </span>

                    <svg className="bx-item-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
