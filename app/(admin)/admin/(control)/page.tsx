import type { Metadata } from 'next';
import Link from 'next/link';
import { adminPosture } from '@/lib/admin/config';
import { loadCalendar, loadSystemHealth, loadToday, loadUpcoming } from '@/lib/admin/queries';
import { cachedAttention } from '@/lib/admin/request-cache';
import { countByLevel } from '@/lib/admin/attention';
import { addDays, occupancyRatio, relationOn, windowOf } from '@/lib/admin/calendar';
import { formatIsoDate, formatLongDay, formatRelative, formatStay, percent, pluralNights, propertyTodayIso } from '@/lib/admin/format';
import { isBookingState } from '@/lib/admin/presentation';
import { isPaidSide } from '@/lib/booking/states';
import { PageHeader, Section, Metric, DegradedNotice, ErrorNotice, EmptyState, HealthBadge, BookingStateBadge } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { AttentionRow, AllClear } from '@/components/admin/attention/attention-list';
import { BookingList } from '@/components/admin/bookings/booking-rows';

export const metadata: Metadata = { title: 'Today' };

/**
 * The command centre. The first thing on it is what needs a person; then
 * today at the door; then where each residence stands; then what is coming.
 * Every number is derived from records. Nothing is estimated.
 */
export default async function OverviewPage() {
  const today = propertyTodayIso();
  const posture = adminPosture();
  const horizon = windowOf(today, 7);
  const [attention, board, upcoming, calendar, health] = await Promise.all([
    cachedAttention(),
    loadToday(today),
    loadUpcoming(today, 8),
    loadCalendar(addDays(today, -1), addDays(today, 31), today),
    loadSystemHealth(),
  ]);
  const loadedAt = board.loadedAt;

  const chips: { label: string; tone: string }[] = [];
  if (posture.mode === 'fixture') chips.push({ label: 'Development fixtures', tone: 'caution' });
  chips.push({ label: posture.directBookingEnabled ? 'Direct booking enabled' : 'Direct booking disabled', tone: posture.directBookingEnabled ? 'positive' : 'neutral' });
  if (posture.paypalMode !== 'live') chips.push({ label: posture.paypalMode === 'sandbox' ? 'PayPal sandbox' : 'PayPal unconfigured', tone: posture.paypalMode === 'sandbox' ? 'caution' : 'critical' });
  if (posture.beds24Mode !== 'live') chips.push({ label: 'Beds24 mock', tone: 'caution' });

  const items = attention.ok ? attention.data.items : [];
  const counts = countByLevel(items);
  const urgent = items.filter((i) => i.level === 'critical' || i.level === 'high');

  const bookableUnits = calendar.ok ? calendar.data.units.filter((u) => u.isBookable) : [];
  const occupancy =
    calendar.ok && bookableUnits.length > 0
      ? occupancyRatio(
          calendar.data.reservations.filter((r) => isBookingState(r.status) && isPaidSide(r.status) && bookableUnits.some((u) => u.slug === r.unitSlug)),
          horizon,
          bookableUnits.length
        )
      : null;
  const upcomingCount = calendar.ok ? calendar.data.reservations.filter((r) => r.status === 'confirmed' && r.checkIn > today).length : null;

  return (
    <>
      <PageHeader
        eyebrow={`Today · Bayreuth`}
        title={formatLongDay(today)}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span key={c.label} className="bc-badge ghost" data-tone={c.tone}>
                {c.label}
              </span>
            ))}
          </span>
        }
        actions={<RefreshControl loadedAt={loadedAt} every={60} />}
      />

      {/* ── Attention ────────────────────────────────────────────── */}
      <section aria-labelledby="attention-title">
        <div className="bc-section-head" style={{ borderBottom: 'none', marginBottom: 12, paddingBottom: 0 }}>
          <h2 id="attention-title" className="bc-h2">
            Needs attention
            {items.length > 0 && (
              <span className="bc-meta" style={{ fontWeight: 400, marginLeft: 10 }}>
                {counts.critical} critical · {counts.high} high · {counts.elevated + counts.watch} lower
              </span>
            )}
          </h2>
          {items.length > 0 && (
            <Link href="/admin/operations" className="bc-meta link-quiet" style={{ borderBottomColor: 'hsl(var(--bc-accent) / 0.4)' }}>
              All {items.length} →
            </Link>
          )}
        </div>
        {!attention.ok ? (
          <ErrorNotice title="The attention inbox could not be loaded.">{attention.error}</ErrorNotice>
        ) : items.length === 0 ? (
          <AllClear />
        ) : (
          <>
            {attention.data.degraded.length > 0 && (
              <div className="mb-3">
                <DegradedNotice what={`Could not read: ${attention.data.degraded.join(', ')}.`} />
              </div>
            )}
            <div className="bc-rows bc-panel" style={{ padding: '0 4px' }}>
              {(urgent.length > 0 ? urgent : items).slice(0, 5).map((item) => (
                <AttentionRow key={item.id} item={item} compact />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Key figures ──────────────────────────────────────────── */}
      <Section title="Key figures" meta="Derived from records only">
        <div className="bc-metrics mt-4" style={{ ['--cols' as string]: 5 }}>
          <Metric label="Arrivals today" value={board.ok ? board.data.arrivals.length : ''} unavailable={!board.ok} />
          <Metric label="Departures today" value={board.ok ? board.data.departures.length : ''} unavailable={!board.ok} />
          <Metric label="In house" value={board.ok ? board.data.inHouse.length : ''} unavailable={!board.ok} note={board.ok ? 'Paid stays covering tonight' : undefined} />
          <Metric label="Occupancy · 7 nights" value={percent(occupancy)} unavailable={!calendar.ok || bookableUnits.length === 0} note={bookableUnits.length > 0 ? `${bookableUnits.length} bookable ${bookableUnits.length === 1 ? 'unit' : 'units'}, paid stays` : 'No bookable units'} />
          <Metric label="Confirmed ahead" value={upcomingCount ?? ''} unavailable={upcomingCount === null} note="Next 31 days" />
        </div>
      </Section>

      {/* ── Today ────────────────────────────────────────────────── */}
      <Section title="At the door today" meta={<span>Paid stays only — a held, unpaid attempt is not an arrival</span>} id="today">
        {!board.ok ? (
          <div className="mt-4">
            <ErrorNotice title="Today’s board could not be loaded.">{board.error}</ErrorNotice>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3 mt-2">
            <Column title="Arrivals" items={board.data.arrivals} empty="No arrivals today." />
            <Column title="Departures" items={board.data.departures} empty="No departures today." />
            <Column title="In house" items={board.data.inHouse} empty="Nobody in house tonight." />
          </div>
        )}
      </Section>

      {/* ── Portfolio ────────────────────────────────────────────── */}
      <Section title="Residences" meta={calendar.ok && calendar.data.inventorySyncedAt ? <span>Channel cache synced {formatRelative(calendar.data.inventorySyncedAt)}</span> : undefined} id="portfolio">
        {!calendar.ok ? (
          <div className="mt-4">
            <ErrorNotice title="Residence status could not be loaded.">{calendar.error}</ErrorNotice>
          </div>
        ) : (
          <div className="bc-rows">
            {calendar.data.units.map((unit) => {
              const stays = calendar.data.reservations.filter((r) => r.unitSlug === unit.slug && isBookingState(r.status) && isPaidSide(r.status));
              const current = stays.find((r) => relationOn(r, today) === 'in_house');
              const arriving = stays.find((r) => relationOn(r, today) === 'arrival');
              const departing = stays.find((r) => relationOn(r, today) === 'departure');
              const next = stays.filter((r) => r.checkIn > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
              const closed = calendar.data.closures.find((c) => c.unitSlug === unit.slug && today >= c.from && today < c.to);
              const preparing = !unit.isBookable && unit.contentStatus !== 'available';
              const exceptions = calendar.data.reservations.filter((r) => r.unitSlug === unit.slug && r.status !== 'confirmed' && r.checkOut >= today);
              let state: { label: string; tone: string; detail: string };
              if (preparing) state = { label: 'In preparation', tone: 'muted', detail: 'Not offered for booking.' };
              else if (arriving && departing) state = { label: 'Turnover today', tone: 'progress', detail: `${departing.guestLabel ?? departing.reference} leaves · ${arriving.guestLabel ?? arriving.reference} arrives, ${pluralNights(arriving.nights)}` };
              else if (arriving) state = { label: 'Arrival today', tone: 'progress', detail: `${arriving.guestLabel ?? arriving.reference}, ${pluralNights(arriving.nights)} until ${formatIsoDate(arriving.checkOut)}` };
              else if (departing) state = { label: 'Departure today', tone: 'neutral', detail: `${departing.guestLabel ?? departing.reference} leaves${next ? ` · next ${formatIsoDate(next.checkIn)}` : ''}` };
              else if (current) state = { label: 'Occupied', tone: 'positive', detail: `${current.guestLabel ?? current.reference} until ${formatIsoDate(current.checkOut)}` };
              else if (closed) state = { label: 'Closed at channel', tone: 'neutral', detail: `Cached availability closed until ${formatIsoDate(closed.to)} — an OTA reservation or a closed night` };
              else state = { label: 'Available tonight', tone: 'muted', detail: next ? `Next arrival ${formatIsoDate(next.checkIn)} — ${next.guestLabel ?? next.reference}` : 'No confirmed stay in the next 31 days' };
              return (
                <div key={unit.slug} className="bc-row" style={{ gridTemplateColumns: 'minmax(140px, 200px) auto minmax(0,1fr) auto' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{unit.displayName}</div>
                    <div className="bc-meta">{unit.isBookable ? 'Bookable' : preparing ? 'In preparation' : 'Not bookable'}</div>
                  </div>
                  <span className="bc-badge" data-tone={state.tone}>
                    {state.label}
                  </span>
                  <span className="bc-meta truncate">{state.detail}</span>
                  <span className="bc-meta whitespace-nowrap">
                    {exceptions.length > 0 ? (
                      <Link href={`/admin/bookings?unit=${unit.slug}&attention=1`} style={{ color: 'hsl(var(--bc-caution))' }}>
                        {exceptions.length} {exceptions.length === 1 ? 'exception' : 'exceptions'}
                      </Link>
                    ) : (
                      <Link href={`/admin/calendar?unit=${unit.slug}`}>Calendar →</Link>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Upcoming ─────────────────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Upcoming" meta={<Link href="/admin/bookings?group=confirmed">All confirmed →</Link>} id="upcoming">
          {!upcoming.ok ? (
            <div className="mt-4">
              <ErrorNotice title="Upcoming stays could not be loaded.">{upcoming.error}</ErrorNotice>
            </div>
          ) : upcoming.data.length === 0 ? (
            <EmptyState title="Nothing on the books yet.">Paid and confirmed stays from today onward appear here.</EmptyState>
          ) : (
            <BookingList items={upcoming.data} emphasis="dates" />
          )}
        </Section>

        <Section title="System" meta={<Link href="/admin/system">Detail →</Link>} id="health">
          {!health.ok ? (
            <div className="mt-4">
              <ErrorNotice title="System health could not be loaded.">{health.error}</ErrorNotice>
            </div>
          ) : (
            <div className="bc-rows">
              {health.data
                .filter((s) => ['database', 'beds24', 'paypal', 'payment_inbox', 'outbox', 'reconciliation'].includes(s.key))
                .map((s) => (
                  <div key={s.key} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '11px 0' }}>
                    <span className="truncate">{s.title}</span>
                    <HealthBadge status={s.status} />
                  </div>
                ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

function Column({ title, items, empty }: { title: string; items: import('@/lib/admin/dto').BookingSummaryDto[]; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="bc-label" style={{ padding: '14px 0 6px' }}>
        {title} <span className="bc-num" style={{ marginLeft: 6, color: 'hsl(var(--bc-text))' }}>{items.length}</span>
      </p>
      {items.length === 0 ? (
        <p className="bc-meta" style={{ padding: '10px 0' }}>
          {empty}
        </p>
      ) : (
        <div className="bc-rows">
          {items.map((b) => (
            <Link key={b.reference} href={`/admin/bookings/${b.reference}`} className="bc-row-link">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate" style={{ fontWeight: 500 }}>
                    {b.guestLabel ?? b.reference}
                  </div>
                  <div className="bc-meta truncate">
                    {b.unitName} · {formatStay(b.checkIn, b.checkOut)} · {b.adults + b.children} {b.adults + b.children === 1 ? 'guest' : 'guests'}
                  </div>
                </div>
                <BookingStateBadge state={b.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
