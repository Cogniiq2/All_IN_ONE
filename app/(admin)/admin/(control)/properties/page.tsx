import type { Metadata } from 'next';
import Link from 'next/link';
import { loadCalendar } from '@/lib/admin/queries';
import { cachedAttention, cachedUnits } from '@/lib/admin/request-cache';
import { addDays, relationOn } from '@/lib/admin/calendar';
import { formatIsoDate, formatRelative, propertyTodayIso } from '@/lib/admin/format';
import { isBookingState } from '@/lib/admin/presentation';
import { isPaidSide } from '@/lib/booking/states';
import { PageHeader, ErrorNotice, KeyValue, Notice, When, Dash } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { CopyButton } from '@/components/admin/copy-button';

export const metadata: Metadata = { title: 'Properties' };

/**
 * The operational registry: what each unit is called, whether it may be
 * sold, where it lives at the channel manager, how fresh its availability
 * cache is, and what is happening in it today. Read-only: mapping ids and
 * bookability are data changed by migration or SQL with a review, not by a
 * click.
 */
export default async function PropertiesPage() {
  const today = propertyTodayIso();
  const [units, calendar, attention] = await Promise.all([cachedUnits(), loadCalendar(addDays(today, -1), addDays(today, 60), today), cachedAttention()]);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Properties"
        description="Every lettable unit the booking core knows. Configuration is read-only here; it changes by reviewed migration, never by a click."
        actions={<RefreshControl loadedAt={units.loadedAt} />}
      />

      {!units.ok ? (
        <ErrorNotice title="Units could not be loaded.">{units.error}</ErrorNotice>
      ) : units.data.length === 0 ? (
        <Notice tone="neutral">No units are registered. The booking registry seed has not been applied.</Notice>
      ) : (
        <div className="grid gap-4">
          {units.data.map((u) => {
            const stays = calendar.ok ? calendar.data.reservations.filter((r) => r.unitSlug === u.slug && isBookingState(r.status) && isPaidSide(r.status)) : [];
            const current = stays.find((r) => relationOn(r, today) === 'in_house' || relationOn(r, today) === 'arrival');
            const next = stays.filter((r) => r.checkIn > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
            const issues = attention.ok ? attention.data.items.filter((i) => i.unitSlug === u.slug) : [];
            const preparing = !u.isBookable && u.contentStatus !== 'available';
            const stale = u.inventory.syncedAt ? Date.now() - new Date(u.inventory.syncedAt).getTime() > 6 * 60 * 60_000 : false;
            return (
              <article key={u.slug} className="bc-panel" style={{ padding: '18px 20px' }} aria-labelledby={`unit-${u.slug}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id={`unit-${u.slug}`} className="bc-display" style={{ fontSize: 22 }}>
                      {u.displayName}
                    </h2>
                    <p className="bc-meta mt-1">
                      {u.street ?? '—'} · <span className="bc-mono">{u.slug}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="bc-badge" data-tone={u.isBookable ? 'positive' : 'muted'}>
                      <i className="bc-glyph" data-glyph={u.isBookable ? 'check' : 'dash'} aria-hidden="true" />
                      {u.isBookable ? 'Bookable' : 'Not bookable'}
                    </span>
                    <span className="bc-badge ghost" data-tone={preparing ? 'muted' : u.contentStatus === 'available' ? 'positive' : 'neutral'}>
                      {preparing ? 'In preparation' : u.contentStatus === 'available' ? 'Offered publicly' : 'Not in content'}
                    </span>
                    {issues.length > 0 && (
                      <Link href={`/admin/bookings?unit=${u.slug}&attention=1`} className="bc-badge" data-tone="caution">
                        <i className="bc-glyph" data-glyph="alert" aria-hidden="true" />
                        {issues.length} {issues.length === 1 ? 'item needs' : 'items need'} attention
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-6 md:grid-cols-3">
                  <div>
                    <p className="bc-label" style={{ marginBottom: 8 }}>
                      Today
                    </p>
                    <KeyValue
                      rows={[
                        ['Status', preparing ? 'In preparation' : current ? (relationOn(current, today) === 'arrival' ? 'Arrival today' : 'Occupied') : 'Available tonight'],
                        current ? ['Guest', `${current.guestLabel ?? current.reference} until ${formatIsoDate(current.checkOut)}`] : null,
                        ['Next stay', next ? <Link key="n" href={`/admin/bookings/${next.reference}`}>{formatIsoDate(next.checkIn, 'long')} — {next.guestLabel ?? next.reference}</Link> : preparing ? <Dash /> : 'None in 60 days'],
                      ]}
                    />
                  </div>
                  <div>
                    <p className="bc-label" style={{ marginBottom: 8 }}>
                      Channel manager
                    </p>
                    {u.integration ? (
                      <KeyValue
                        rows={[
                          ['Provider', u.integration.provider === 'beds24' ? 'Beds24' : u.integration.provider],
                          ['Property id', <CopyButton key="p" value={u.integration.externalPropertyId} className="bc-mono" />],
                          ['Room id', <CopyButton key="r" value={u.integration.externalRoomId} className="bc-mono" />],
                          ['Mapping', u.integration.enabled ? 'Enabled' : 'Disabled'],
                          ['Cache', u.inventory.daysCached > 0 ? <span key="c" style={{ color: stale ? 'hsl(var(--bc-caution))' : undefined }}>{u.inventory.daysCached} days · synced {formatRelative(u.inventory.syncedAt)}{stale ? ' — stale' : ''}</span> : <span key="nc" className="bc-meta">Never synced</span>],
                        ]}
                      />
                    ) : (
                      <p className="bc-meta">No mapping. This unit is not connected to a channel manager and cannot be booked online.</p>
                    )}
                  </div>
                  <div>
                    <p className="bc-label" style={{ marginBottom: 8 }}>
                      Configuration
                    </p>
                    <KeyValue
                      rows={[
                        ['Currency', u.currency],
                        ['Max guests', u.maxGuests !== null ? String(u.maxGuests) : <span key="mg" className="bc-meta">Not verified</span>],
                        ['Min nights', u.minNights !== null ? String(u.minNights) : <span key="mn" className="bc-meta">Not verified</span>],
                        ['Check-in / out', <span key="ci" className="bc-meta">Not recorded</span>],
                        ['Updated', <When key="u" value={u.updatedAt} />],
                      ]}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
