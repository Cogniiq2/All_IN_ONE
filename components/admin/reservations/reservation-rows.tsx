import type { ReservationDto } from '@/lib/admin/dto';
import { formatIsoDate, formatMoney, formatStay, pluralNights } from '@/lib/admin/format';
import { reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';
import { Badge, Dash, EmptyState, When } from '@/components/admin/primitives';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CHANNEL RESERVATIONS — what is actually booked, from Booking.com, Airbnb,
 * by hand in Beds24, or from a channel the provider did not identify.
 *
 * ── Why these are not booking rows ───────────────────────────────────────
 * A row here has no BoLaGio reference, no payment state and no detail page,
 * because the reservation was never made through this website. What it has is
 * a provider booking id, a channel, and a status the channel manager owns.
 * Showing it in the booking table would mean printing an empty payment column
 * beside every Booking.com stay and inviting the reading that something is
 * unpaid.
 *
 * ── Money ────────────────────────────────────────────────────────────────
 * The amount is GROSS AS THE PROVIDER STATES IT and is labelled as such. It
 * is not payout, not net of commission, and it is not accounting revenue —
 * the finance subledger does not read this table.
 *
 * ── Personal data ────────────────────────────────────────────────────────
 * A name, a country and the stay. No email, no phone: the row source does not
 * select them.
 * ══════════════════════════════════════════════════════════════════════════
 */

function guestCount(r: ReservationDto): string | null {
  if (r.guests === null) return null;
  return `${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}`;
}

/**
 * The channel — and, when it could not be identified, exactly what the
 * provider said instead.
 *
 * That detail is the point: an operator who sees `Channel not identified ·
 * “expedia” (id 71)` can report one line back and the mapping gains a channel.
 * Hiding it would turn a fixable gap into a permanent mystery. Neither value
 * is personal data: they are the provider's own channel name and number.
 */
function channelLabel(r: ReservationDto): string {
  const presentation = sourcePresentation(r.source).label;
  if (r.source !== 'unknown') return presentation;
  const evidence = [r.sourceRaw ? `“${r.sourceRaw}”` : null, r.sourceApiId !== null ? `id ${r.sourceApiId}` : null]
    .filter(Boolean)
    .join(', ');
  return evidence ? `${presentation} · ${evidence}` : presentation;
}

export function ReservationTable({ items }: { items: ReservationDto[] }) {
  return (
    <div className="bc-table-wrap">
      <table className="bc-table">
        <thead>
          <tr>
            <th scope="col">Booking</th>
            <th scope="col">Guest</th>
            <th scope="col">Property</th>
            <th scope="col">Arrival</th>
            <th scope="col">Departure</th>
            <th scope="col" className="num">
              Nights
            </th>
            <th scope="col">Channel</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Gross (provider)
            </th>
            <th scope="col">Synced</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const state = reservationClassPresentation(r.statusClass);
            return (
              <tr key={`${r.provider}-${r.externalBookingId}`} data-cancelled={r.statusClass === 'cancelled' ? 'true' : undefined}>
                <td>
                  <span className="bc-ref">{r.channelReference ?? r.externalBookingId}</span>
                  {r.directReference && <span className="bc-meta block">BoLaGio {r.directReference}</span>}
                </td>
                <td className="truncate">{r.guestLabel ?? <Dash />}</td>
                <td className="truncate">{r.unitName}</td>
                <td>{formatIsoDate(r.checkIn)}</td>
                <td>{formatIsoDate(r.checkOut)}</td>
                <td className="num">{r.nights}</td>
                <td className="truncate">{channelLabel(r)}</td>
                <td>
                  <Badge p={state} title={`Channel manager status: ${r.providerStatus}`} />
                </td>
                <td className="num">{r.totalCents === null ? <Dash /> : formatMoney(r.totalCents, r.currency ?? 'EUR')}</td>
                <td>
                  <When value={r.lastSyncedAt} relative />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same rows on a phone, where a ten-column table is unreadable. */
export function ReservationCards({ items }: { items: ReservationDto[] }) {
  return (
    <div className="bc-rows">
      {items.map((r) => {
        const state = reservationClassPresentation(r.statusClass);
        const guests = guestCount(r);
        return (
          <div key={`${r.provider}-${r.externalBookingId}`} className="bc-row-link" style={{ cursor: 'default' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate" style={{ fontWeight: 500 }}>
                  {r.guestLabel ?? r.channelReference ?? r.externalBookingId}
                </div>
                <div className="bc-meta truncate">
                  {r.unitName} · {formatStay(r.checkIn, r.checkOut)} · {pluralNights(r.nights)}
                  {guests ? ` · ${guests}` : ''}
                </div>
                <div className="bc-meta truncate">
                  {channelLabel(r)}
                  {r.totalCents === null ? '' : ` · ${formatMoney(r.totalCents, r.currency ?? 'EUR')} gross (provider)`}
                </div>
              </div>
              <Badge p={state} title={`Channel manager status: ${r.providerStatus}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ReservationList({ items, empty }: { items: ReservationDto[]; empty: string }) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <>
      <div className="hidden md:block">
        <ReservationTable items={items} />
      </div>
      <div className="md:hidden">
        <ReservationCards items={items} />
      </div>
    </>
  );
}
