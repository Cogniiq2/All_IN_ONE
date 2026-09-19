import Link from 'next/link';
import type { BookingSummaryDto } from '@/lib/admin/dto';
import { assessBooking } from '@/lib/admin/attention';
import { formatIsoDate, formatMoney, formatStay, pluralNights } from '@/lib/admin/format';
import { sourcePresentation } from '@/lib/admin/presentation';
import { BookingStateBadge, PaymentStateBadge, When } from '@/components/admin/primitives';

function href(reference: string) {
  return `/admin/bookings/${encodeURIComponent(reference)}`;
}

/**
 * The booking index as a semantic table. Whole rows are targets through a
 * covering link in the reference cell; nothing is a link inside a link.
 */
export function BookingTable({ items, sort, dir, buildHref }: { items: BookingSummaryDto[]; sort: string; dir: 'asc' | 'desc'; buildHref: (sort: string, dir: 'asc' | 'desc') => string }) {
  const sortLink = (key: string, label: string, cls?: string) => {
    const active = sort === key;
    const nextDir: 'asc' | 'desc' = active ? (dir === 'asc' ? 'desc' : 'asc') : key === 'arrival' || key === 'departure' ? 'asc' : 'desc';
    return (
      <th scope="col" className={cls} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <Link href={buildHref(key, nextDir)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
          {label}
        </Link>
      </th>
    );
  };

  return (
    <div className="bc-table-wrap">
      <table className="bc-table">
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Guest</th>
            <th scope="col">Property</th>
            {sortLink('arrival', 'Arrival')}
            {sortLink('departure', 'Departure')}
            <th scope="col" className="num">
              Nights
            </th>
            <th scope="col">Source</th>
            <th scope="col">State</th>
            <th scope="col">Payment</th>
            {sortLink('amount', 'Amount', 'num')}
            {sortLink('updated', 'Updated')}
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const attention = assessBooking(b);
            return (
              <tr key={b.reference} data-href={href(b.reference)}>
                <td className="bc-cover">
                  <Link href={href(b.reference)} className="bc-ref inline-flex items-center gap-2">
                    {attention && <i className="bc-glyph" data-glyph="dot" data-level={attention.level} style={{ color: 'hsl(var(--tone))' }} aria-label={`${attention.level} attention`} />}
                    {b.reference}
                  </Link>
                </td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.guestLabel ?? <span className="dim">—</span>}</td>
                <td>{b.unitName}</td>
                <td className="bc-num">{formatIsoDate(b.checkIn, 'long')}</td>
                <td className="bc-num">{formatIsoDate(b.checkOut, 'long')}</td>
                <td className="num">{b.nights}</td>
                <td className="dim">{sourcePresentation(b.source).label}</td>
                <td>
                  <BookingStateBadge state={b.status} />
                </td>
                <td>
                  <PaymentStateBadge state={b.paymentStatus} ghost />
                </td>
                <td className="num">{formatMoney(b.quotedTotalCents, b.currency)}</td>
                <td className="dim">
                  <When value={b.updatedAt} relative />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same rows for a phone: one card per booking, built for a thumb. */
export function BookingCards({ items }: { items: BookingSummaryDto[] }) {
  return (
    <div className="bc-cards">
      {items.map((b) => {
        const attention = assessBooking(b);
        return (
          <Link key={b.reference} href={href(b.reference)} className="bc-card">
            <div className="flex items-center justify-between gap-3">
              <span className="bc-ref inline-flex items-center gap-2">
                {attention && <i className="bc-glyph" data-glyph="dot" data-level={attention.level} style={{ color: 'hsl(var(--tone))' }} aria-hidden="true" />}
                {b.reference}
              </span>
              <BookingStateBadge state={b.status} />
            </div>
            <div className="mt-2 truncate" style={{ fontSize: 14, fontWeight: 500 }}>
              {b.guestLabel ?? '—'}
            </div>
            <div className="bc-meta mt-1">
              {b.unitName} · {formatStay(b.checkIn, b.checkOut)} · {pluralNights(b.nights)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <PaymentStateBadge state={b.paymentStatus} ghost />
              <span className="bc-num" style={{ fontSize: 13 }}>
                {formatMoney(b.quotedTotalCents, b.currency)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** A compact, hairline-separated list for the overview. */
export function BookingList({ items, emphasis = 'guest' }: { items: BookingSummaryDto[]; emphasis?: 'guest' | 'dates' }) {
  return (
    <div className="bc-rows">
      {items.map((b) => {
        const attention = assessBooking(b);
        return (
          <Link key={b.reference} href={href(b.reference)} className="bc-row-link">
            <div className="grid items-center gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {attention && <i className="bc-glyph" data-glyph="dot" data-level={attention.level} style={{ color: 'hsl(var(--tone))' }} aria-label={`${attention.level} attention`} />}
                  <span className="truncate" style={{ fontWeight: 500 }}>
                    {emphasis === 'guest' ? b.guestLabel ?? b.reference : formatStay(b.checkIn, b.checkOut)}
                  </span>
                  <span className="bc-ref" style={{ color: 'hsl(var(--bc-text-3))', fontWeight: 500 }}>
                    {b.reference}
                  </span>
                </div>
                <div className="bc-meta mt-0.5 truncate">
                  {b.unitName} · {emphasis === 'guest' ? formatStay(b.checkIn, b.checkOut) : b.guestLabel ?? '—'} · {pluralNights(b.nights)}
                </div>
              </div>
              <BookingStateBadge state={b.status} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
