import type { Metadata } from 'next';
import Link from 'next/link';
import { loadCalendar, loadPerformance } from '@/lib/admin/queries';
import { cachedAttention, cachedUnits } from '@/lib/admin/request-cache';
import { addDays, relationOn } from '@/lib/admin/calendar';
import { windowStats } from '@/lib/admin/overview';
import { formatIsoDate, formatRelative, percent, propertyTodayIso } from '@/lib/admin/format';
import { isBookingState, sourcePresentation } from '@/lib/admin/presentation';
import { monthRange, periodLabel, ytd } from '@/lib/finance/periods';
import { isPaidSide } from '@/lib/booking/states';
import { PageHeader, ErrorNotice, KeyValue, Notice, When, Dash, Metric } from '@/components/admin/primitives';
import { Money } from '@/components/admin/finance/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { CopyButton } from '@/components/admin/copy-button';
import { PageTabs } from '@/components/admin/shell/page-tabs';
import { APARTMENT_TABS } from '@/components/admin/shell/nav-items';

export const metadata: Metadata = { title: 'Properties' };

/**
 * One card per apartment: who is in it, who comes next, how it is booking
 * this month and this year, and whether its booking-system link is fresh.
 * The mapping ids and configuration are kept, folded away: they change by
 * reviewed migration, never by a click.
 */
export default async function PropertiesPage() {
  const today = propertyTodayIso();
  const thisMonth = today.slice(0, 7);
  const [units, calendar, attention, month, year] = await Promise.all([
    cachedUnits(),
    loadCalendar(addDays(today, -1), addDays(today, 60), today),
    cachedAttention(),
    loadPerformance(monthRange(thisMonth)),
    loadPerformance(ytd(today)),
  ]);

  return (
    <>
      <PageTabs tabs={APARTMENT_TABS} label="Apartments" />
      <PageHeader
        eyebrow="Apartments"
        title="Apartments"
        description="Each apartment as it stands today, with its bookings for the next sixty days and its booked revenue. Booking-system ids are listed under each card for reference; they are changed by migration, not here."
        actions={<RefreshControl loadedAt={units.loadedAt} />}
      />

      {!units.ok ? (
        <ErrorNotice title="Units could not be loaded.">{units.error}</ErrorNotice>
      ) : units.data.length === 0 ? (
        <Notice tone="neutral">No units are registered. The booking registry seed has not been applied.</Notice>
      ) : (
        <div className="grid gap-4">
          {units.data.map((u) => {
            // Direct bookings count once paid; channel reservations (Booking.com,
            // Airbnb) by their own rule — a booked, not cancelled, stay.
            const stays = calendar.ok
              ? calendar.data.reservations.filter((r) => r.unitSlug === u.slug && (r.kind === 'reservation' ? r.occupies : isBookingState(r.status) && isPaidSide(r.status)))
              : [];
            const stayHref = (r: (typeof stays)[number]) => r.href ?? `/admin/reservations?q=${encodeURIComponent(r.reference)}&when=all`;
            const current = stays.find((r) => relationOn(r, today) === 'in_house' || relationOn(r, today) === 'arrival');
            const departing = stays.find((r) => relationOn(r, today) === 'departure');
            const next = stays.filter((r) => r.checkIn > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
            const nextOut = stays.filter((r) => r.checkOut > today).sort((a, b) => a.checkOut.localeCompare(b.checkOut))[0];
            const upcoming = stays.filter((r) => r.checkIn > today);
            const sixty = windowStats(stays, today, 60, 1);
            const bySource = Object.entries(
              stays.filter((r) => r.checkOut > today).reduce<Record<string, number>>((m, r) => ((m[r.source] = (m[r.source] ?? 0) + 1), m), {})
            ).sort((a, b) => b[1] - a[1]);
            const monthUnit = month.ok ? month.data.byUnit.find((x) => x.slug === u.slug) ?? null : null;
            const yearUnit = year.ok ? year.data.byUnit.find((x) => x.slug === u.slug) ?? null : null;
            const issues = attention.ok ? attention.data.items.filter((i) => i.unitSlug === u.slug) : [];
            const preparing = !u.isBookable && u.contentStatus !== 'available';
            const stale = u.inventory.syncedAt ? Date.now() - new Date(u.inventory.syncedAt).getTime() > 6 * 60 * 60_000 : false;
            const status = preparing
              ? { label: 'In preparation', tone: 'muted' }
              : current
                ? { label: relationOn(current, today) === 'arrival' ? 'Arrival today' : 'Occupied', tone: 'positive' }
                : departing
                  ? { label: 'Departure today', tone: 'neutral' }
                  : { label: 'Vacant tonight', tone: 'muted' };
            return (
              <article key={u.slug} className="bc-panel" style={{ padding: '18px 20px' }} aria-labelledby={`unit-${u.slug}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id={`unit-${u.slug}`} className="bc-display" style={{ fontSize: 22 }}>
                      {u.displayName}
                    </h2>
                    <p className="bc-meta mt-1">{u.street ?? '—'} · Bayreuth</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="bc-badge" data-tone={status.tone}>
                      {status.label}
                    </span>
                    <span className="bc-badge ghost" data-tone={u.isBookable ? 'positive' : 'muted'}>
                      <i className="bc-glyph" data-glyph={u.isBookable ? 'check' : 'dash'} aria-hidden="true" />
                      {u.isBookable ? 'For sale on the channels' : preparing ? 'Not yet offered' : 'Not for sale'}
                    </span>
                    {issues.length > 0 && (
                      <Link href="/admin/operations" className="bc-badge" data-tone="caution">
                        <i className="bc-glyph" data-glyph="alert" aria-hidden="true" />
                        {issues.length} {issues.length === 1 ? 'item needs' : 'items need'} attention
                      </Link>
                    )}
                  </div>
                </div>

                {!preparing && (
                  <div className="bc-metrics mt-5" style={{ ['--cols' as string]: 5 }}>
                    <Metric label={`Booked · ${periodLabel(thisMonth)}`} value={monthUnit ? <Money cents={monthUnit.grossCents} /> : ''} unavailable={!monthUnit} note={monthUnit ? `${monthUnit.nights} nights · ${percent(monthUnit.occupancy.value)} occupied` : undefined} />
                    <Metric label={`Booked · ${today.slice(0, 4)} to date`} value={yearUnit ? <Money cents={yearUnit.grossCents} /> : ''} unavailable={!yearUnit} note={yearUnit ? `${yearUnit.nights} nights · ${percent(yearUnit.occupancy.value)} occupied` : undefined} />
                    <Metric label="ADR this year" value={yearUnit && yearUnit.adr.value !== null ? <Money cents={Math.round(yearUnit.adr.value)} /> : ''} unavailable={!yearUnit || yearUnit.adr.value === null} note="gross per booked night" />
                    <Metric label="Next 60 days" value={calendar.ok ? `${upcoming.length} ${upcoming.length === 1 ? 'booking' : 'bookings'}` : ''} unavailable={!calendar.ok} note={calendar.ok ? `${sixty.nights} nights · ${percent(sixty.occupancy)} occupied` : undefined} />
                    <Metric label="Booked via" value={bySource.length > 0 ? bySource.map(([s, n]) => `${sourcePresentation(s).short} ${n}`).join(' · ') : '—'} note={bySource.length > 0 ? bySource.map(([s]) => sourcePresentation(s).label).join(', ') : 'nothing booked ahead'} />
                  </div>
                )}

                <div className="mt-5 grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="bc-label" style={{ marginBottom: 8 }}>
                      Guests
                    </p>
                    <KeyValue
                      rows={[
                        current ? ['Current guest', <Link key="c" href={stayHref(current)}>{current.guestLabel ?? current.reference} · until {formatIsoDate(current.checkOut)} · {sourcePresentation(current.source).label}</Link>] : ['Current guest', preparing ? <Dash key="c" /> : departing ? `${departing.guestLabel ?? departing.reference} leaves today` : 'Nobody tonight'],
                        ['Next check-in', next ? <Link key="n" href={stayHref(next)}>{formatIsoDate(next.checkIn, 'long')} — {next.guestLabel ?? next.reference} · {sourcePresentation(next.source).label}</Link> : preparing ? <Dash key="n" /> : 'None in 60 days'],
                        ['Next check-out', nextOut ? `${formatIsoDate(nextOut.checkOut, 'long')} — ${nextOut.guestLabel ?? nextOut.reference}` : preparing ? <Dash key="o" /> : 'None in 60 days'],
                      ]}
                    />
                  </div>
                  <div>
                    <p className="bc-label" style={{ marginBottom: 8 }}>
                      Booking system
                    </p>
                    {u.integration ? (
                      <KeyValue
                        rows={[
                          ['Connected to', u.integration.provider === 'beds24' ? 'Beds24' : u.integration.provider],
                          ['Link', u.integration.enabled ? 'Enabled' : 'Disabled'],
                          ['Availability sync', u.inventory.daysCached > 0 ? <span key="c" style={{ color: stale ? 'hsl(var(--bc-caution))' : undefined }}>{formatRelative(u.inventory.syncedAt)}{stale ? ' — older than six hours' : ''} · {u.inventory.daysCached} days ahead</span> : <span key="nc" className="bc-meta">Never synced</span>],
                          ['Check-in / check-out', u.clock ? `${u.clock.checkInTime} / ${u.clock.checkOutTime}` : <span key="ci" className="bc-meta">Not recorded</span>],
                        ]}
                      />
                    ) : (
                      <p className="bc-meta">Not connected to the booking system: this apartment cannot be booked online.</p>
                    )}
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="bc-meta" style={{ cursor: 'pointer', fontSize: 12.5 }}>
                    Technical reference — ids and configuration
                  </summary>
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <KeyValue
                      rows={[
                        ['Internal name', <span key="s" className="bc-mono">{u.slug}</span>],
                        u.integration ? ['Beds24 property id', <CopyButton key="p" value={u.integration.externalPropertyId} className="bc-mono" />] : null,
                        u.integration ? ['Beds24 room id', <CopyButton key="r" value={u.integration.externalRoomId} className="bc-mono" />] : null,
                      ]}
                    />
                    <KeyValue
                      rows={[
                        ['Currency', u.currency],
                        ['Max guests', u.maxGuests !== null ? String(u.maxGuests) : <span key="mg" className="bc-meta">Not verified</span>],
                        ['Min nights', u.minNights !== null ? String(u.minNights) : <span key="mn" className="bc-meta">Not verified</span>],
                        ['Calendar', u.clock ? u.clock.timezone : <span key="tz" className="bc-meta">Not recorded</span>],
                        ['Updated', <When key="u" value={u.updatedAt} />],
                      ]}
                    />
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
