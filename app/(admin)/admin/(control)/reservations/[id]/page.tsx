import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadReservation } from '@/lib/admin/queries';
import { formatIsoDate, formatMoney, formatStay, pluralNights, propertyTodayIso } from '@/lib/admin/format';
import { bedroomPackageLabel, reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';
import { relationOn } from '@/lib/admin/calendar';
import { BackLink, Badge, Dash, ErrorNotice, KeyValue, Notice, Section, When } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { CopyButton } from '@/components/admin/copy-button';

export const metadata: Metadata = { title: 'Reservation' };

const STALE_MS = 24 * 60 * 60_000;

/**
 * One reservation as Beds24 holds it. Read-only: Beds24 is the source of
 * truth, and a change is made there — this page shows it within seconds.
 */
export default async function ReservationDetailPage({ params }: { params: { id: string } }) {
  const result = await loadReservation(decodeURIComponent(params.id));
  if (!result.ok) {
    return (
      <>
        <BackLink href="/admin/reservations">Reservations</BackLink>
        <div className="mt-6">
          <ErrorNotice title="This reservation could not be loaded.">{result.error}</ErrorNotice>
        </div>
      </>
    );
  }
  const r = result.data;
  if (!r) notFound();

  const state = reservationClassPresentation(r.statusClass);
  const name = [r.guestFirstName, r.guestLastName].filter(Boolean).join(' ') || null;
  const relation = r.occupies ? relationOn({ checkIn: r.checkIn, checkOut: r.checkOut }, propertyTodayIso()) : null;
  const stale = Date.now() - new Date(r.lastSeenAt).getTime() > STALE_MS;
  const setup = bedroomPackageLabel(r.bedroomPackage);
  const party = r.adults !== null || r.children !== null
    ? `${r.adults ?? 0} ${r.adults === 1 ? 'adult' : 'adults'}${(r.children ?? 0) > 0 ? `, ${r.children} ${r.children === 1 ? 'child' : 'children'}` : ''}`
    : r.guests !== null ? `${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}` : null;

  return (
    <>
      <BackLink href="/admin/reservations">Reservations</BackLink>

      <header className="bc-page-head mt-4">
        <div className="min-w-0">
          <p className="bc-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <CopyButton value={r.channelReference ?? r.externalBookingId} className="bc-ref">
              <span style={{ letterSpacing: '0.02em', fontSize: 12, fontWeight: 600 }}>{r.channelReference ?? r.externalBookingId}</span>
            </CopyButton>
            <span>·</span>
            <span>{sourcePresentation(r.source).label}</span>
          </p>
          <h1 className="bc-h1 mt-2 truncate">{name ?? 'No guest name from the channel'}</h1>
          <p style={{ marginTop: 6 }}>
            {r.unitName} · {formatStay(r.checkIn, r.checkOut)} · {pluralNights(r.nights)}
            {party ? ` · ${party}` : ''}
            {relation === 'arrival' && ' · arriving today'}
            {relation === 'departure' && ' · departing today'}
            {relation === 'in_house' && ' · in house'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Badge p={state} size="lg" title={`Channel manager status: ${r.providerStatus}`} />
          <RefreshControl loadedAt={result.loadedAt} />
        </div>
      </header>

      {stale && (
        <div className="mb-6">
          <Notice tone="caution" title="Not refreshed for over a day">
            No Beds24 sync has seen this reservation since <When value={r.lastSeenAt} />. A change made at Beds24 since then may not be shown here.
          </Notice>
        </div>
      )}

      <div className="grid gap-x-10 lg:grid-cols-2">
        <div className="min-w-0">
          <Section title="Stay" id="stay">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Apartment', r.unitName],
                  ['Check-in', formatIsoDate(r.checkIn, 'long')],
                  ['Check-out', formatIsoDate(r.checkOut, 'long')],
                  ['Nights', String(r.nights)],
                  ['Adults', r.adults === null ? <Dash key="a" /> : String(r.adults)],
                  ['Children', r.children === null ? <Dash key="c" /> : String(r.children)],
                  ['Guests in total', r.guests === null ? <Dash key="g" /> : String(r.guests)],
                  ['Bedroom setup', setup ?? <span key="s" className="dim">Not stated by the channel</span>],
                  ['Status', `${state.label} (Beds24: ${r.providerStatus})`],
                ]}
              />
            </div>
          </Section>

          <Section title="Guest" meta={<span>as the channel passed it to Beds24</span>} id="guest">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Name', name ?? <Dash key="n" />],
                  ['Email', r.guestEmail ? <a key="e" href={`mailto:${r.guestEmail}`}>{r.guestEmail}</a> : <span key="e" className="dim">Not provided by the channel</span>],
                  ['Phone', r.guestPhone ? <a key="p" href={`tel:${r.guestPhone.replace(/\s+/g, '')}`}>{r.guestPhone}</a> : <span key="p" className="dim">Not provided by the channel</span>],
                  ['Country', r.guestCountry ?? <Dash key="co" />],
                ]}
              />
            </div>
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="Booking value" meta={<span>gross, as Beds24 states it</span>} id="value">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Total (gross)', r.totalCents === null ? <Dash key="t" /> : formatMoney(r.totalCents, r.currency ?? 'EUR')],
                  ['Currency', r.currency ?? 'EUR (Beds24 does not state one; the property currency)'],
                  ['Payment', r.directReference ? <Link key="pay" href={`/admin/bookings/${r.directReference}`}>See booking {r.directReference}</Link> : 'Collected by the channel'],
                ]}
              />
              <p className="bc-meta mt-3" style={{ fontSize: 12 }}>
                Not payout and not net of commission. Payouts and commission come from the channel statements, in Finance.
              </p>
            </div>
          </Section>

          <Section title="Channel manager" id="channel">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Channel', sourcePresentation(r.source).label + (r.source === 'unknown' && r.sourceRaw ? ` (“${r.sourceRaw}”)` : '')],
                  ['Channel reference', r.channelReference ?? <Dash key="cr" />],
                  ['Beds24 booking id', r.externalBookingId],
                  ['Beds24 offer', r.offerId === null ? <Dash key="o" /> : r.offerId === 0 ? '0 (channel booking — no offer)' : String(r.offerId)],
                  ['Beds24 property / room', `${r.externalPropertyId ?? '—'} / ${r.externalRoomId ?? '—'}`],
                  r.directReference ? ['BoLaGio booking', <Link key="d" href={`/admin/bookings/${r.directReference}`}>{r.directReference}</Link>] : null,
                ]}
              />
            </div>
          </Section>

          <Section title="Record" id="record">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Booked', r.bookedAt ? <When key="b" value={r.bookedAt} /> : <Dash key="b" />],
                  ['Modified at Beds24', r.modifiedAt ? <When key="m" value={r.modifiedAt} /> : <Dash key="m" />],
                  r.cancelledAt ? ['Cancelled at Beds24', <When key="x" value={r.cancelledAt} />] : null,
                  ['First imported', <When key="i" value={r.importedAt} />],
                  ['Last synced', <When key="s" value={r.lastSyncedAt} relative />],
                  ['Last seen by a sync', <When key="l" value={r.lastSeenAt} relative />],
                ]}
              />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
