import Link from 'next/link';
import type { ReservationDto } from '@/lib/admin/dto';
import { formatIsoDate, formatMoney, formatStay, pluralNights } from '@/lib/admin/format';
import { bedroomPackageLabel, reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';
import { Badge, Dash, EmptyState, When } from '@/components/admin/primitives';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CHANNEL RESERVATIONS — what is actually booked, from Booking.com, Airbnb,
 * by hand in Beds24, or from a channel the provider did not identify.
 *
 * ── Why these are not booking rows ───────────────────────────────────────
 * A row here has no BoLaGio reference and no payment state, because the
 * reservation was never made through this website; its detail page is
 * /admin/reservations/[id]. What it has is
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
 * A name, a country and the stay. No email, no phone: the list query does not
 * select them. They are read for one reservation at a time, on its detail page.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const reservationHref = (r: ReservationDto) => `/admin/reservations/${r.id}`;

/** "2 + 1" — adults and children apart, as housekeeping needs them; the total when that is all Beds24 gave. */
function partyLabel(r: ReservationDto): string | null {
  if (r.adults !== null || r.children !== null) return `${r.adults ?? 0} + ${r.children ?? 0}`;
  return r.guests === null ? null : String(r.guests);
}

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
            <th scope="col">Stay</th>
            <th scope="col" className="num">
              Nights
            </th>
            <th scope="col" title="Adults + children">Guests</th>
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
              <tr key={`${r.provider}-${r.externalBookingId}`} data-href={reservationHref(r)} data-cancelled={r.statusClass === 'cancelled' ? 'true' : undefined}>
                <td className="bc-cover">
                  <Link href={reservationHref(r)} className="bc-ref">
                    {r.channelReference ?? r.externalBookingId}
                  </Link>
                  {r.directReference && <span className="bc-meta block">BoLaGio {r.directReference}</span>}
                </td>
                <td className="truncate" style={{ maxWidth: 160 }}>{r.guestLabel ?? <Dash />}</td>
                <td className="truncate" style={{ maxWidth: 200 }} title={r.unitName}>{r.unitName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatStay(r.checkIn, r.checkOut)}</td>
                <td className="num">{r.nights}</td>
                <td>
                  {partyLabel(r) ?? <Dash />}
                  {bedroomPackageLabel(r.bedroomPackage) && <span className="bc-meta block">{bedroomPackageLabel(r.bedroomPackage)}</span>}
                </td>
                <td className="truncate" style={{ maxWidth: 170 }} title={channelLabel(r)}>{channelLabel(r)}</td>
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
          <Link key={`${r.provider}-${r.externalBookingId}`} href={reservationHref(r)} className="bc-row-link">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate" style={{ fontWeight: 500 }}>
                  {r.guestLabel ?? r.channelReference ?? r.externalBookingId}
                </div>
                <div className="bc-meta truncate">
                  {r.unitName} · {formatStay(r.checkIn, r.checkOut)} · {pluralNights(r.nights)}
                  {guests ? ` · ${guests}` : ''}
                  {bedroomPackageLabel(r.bedroomPackage) ? ` · ${bedroomPackageLabel(r.bedroomPackage)}` : ''}
                </div>
                <div className="bc-meta truncate">
                  {channelLabel(r)}
                  {r.totalCents === null ? '' : ` · ${formatMoney(r.totalCents, r.currency ?? 'EUR')} gross (provider)`}
                </div>
              </div>
              <Badge p={state} title={`Channel manager status: ${r.providerStatus}`} />
            </div>
          </Link>
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
