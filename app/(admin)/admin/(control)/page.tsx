import type { Metadata } from 'next';
import Link from 'next/link';
import { adminPosture } from '@/lib/admin/config';
import { loadCalendar, loadCleaningBoard, loadPerformance, loadReservationFreshness, loadSystemHealth, loadToday } from '@/lib/admin/queries';
import { addMonths, monthRange, periodLabel, ytd } from '@/lib/finance/periods';
import { Money, Pct } from '@/components/admin/finance/primitives';
import { HealthSectionCard } from '@/components/admin/health-section-card';
import { cachedAttention } from '@/lib/admin/request-cache';
import { countByLevel } from '@/lib/admin/attention';
import { addDays, relationOn } from '@/lib/admin/calendar';
import { tonightSnapshot, upcomingStays, windowStats } from '@/lib/admin/overview';
import { compactUnitName, formatIsoDate, formatLongDay, formatRelative, formatStay, percent, pluralNights, propertyTodayIso } from '@/lib/admin/format';
import { isBookingState, reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';
import { isPaidSide } from '@/lib/booking/states';
import { PageHeader, Section, Metric, DegradedNotice, ErrorNotice, EmptyState, HealthBadge, BookingStateBadge } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { AttentionRow, AllClear } from '@/components/admin/attention/attention-list';

export const metadata: Metadata = { title: 'Overview' };

/**
 * The owner's first screen. What needs a person; then today at the door and
 * where each apartment stands; then what is coming; then how the month is
 * going; then whether the records behind all of it are current. Every number
 * is derived from synchronised reservations. Nothing is estimated.
 */
export default async function OverviewPage() {
  const today = propertyTodayIso();
  const posture = adminPosture();
  const thisMonth = today.slice(0, 7);
  const nextMonth = addMonths(today, 1).slice(0, 7);
  const [attention, board, calendar, health, month, next, year, sync, cleaning] = await Promise.all([
    cachedAttention(),
    loadToday(today),
    loadCalendar(addDays(today, -1), addDays(today, 31), today),
    loadSystemHealth(),
    loadPerformance(monthRange(thisMonth)),
    loadPerformance(monthRange(nextMonth)),
    loadPerformance(ytd(today)),
    loadReservationFreshness(),
    loadCleaningBoard(),
  ]);
  const loadedAt = board.loadedAt;

  const chips: { label: string; tone: string }[] = [];
  if (posture.mode === 'preview') chips.push({ label: 'Preview data', tone: 'caution' });
  if (posture.mode === 'fixture') chips.push({ label: 'Development fixtures', tone: 'caution' });
  if (posture.directBookingEnabled && !posture.directBookingPermitted) chips.push({ label: 'Direct booking refused by configuration', tone: 'critical' });
  else if (posture.directBookingPermitted) chips.push({ label: 'Direct booking enabled', tone: 'positive' });
  // Online payment matters only while the website itself takes bookings.
  if (posture.directBookingPermitted && posture.paypalMode !== 'live') chips.push({ label: posture.paypalMode === 'sandbox' ? 'PayPal sandbox' : 'Online payment not set up', tone: 'critical' });
  if (posture.beds24Mode !== 'live') chips.push({ label: 'Booking system: test data', tone: 'caution' });
  if (posture.environment !== 'production') chips.push({ label: `${posture.environment} deployment`, tone: 'muted' });

  const items = attention.ok ? attention.data.items : [];
  const counts = countByLevel(items);
  const urgent = items.filter((i) => i.level === 'critical' || i.level === 'high');

  const bookableUnits = calendar.ok ? calendar.data.units.filter((u) => u.isBookable) : [];
  const bookableSlugs = bookableUnits.map((u) => u.slug);
  /*
   * Only stays that ACTUALLY OCCUPY a unit count, from either record: a
   * paid-side direct booking, and a channel reservation the import
   * classified as a real stay. Cancelled and merely requested reservations
   * are excluded by `occupies`, so a cancellation lowers every figure the
   * moment it is imported rather than flattering the number.
   */
  const occupying = calendar.ok
    ? calendar.data.reservations.filter(
        (r) => bookableSlugs.includes(r.unitSlug) && (r.kind === 'reservation' ? r.occupies : isBookingState(r.status) && isPaidSide(r.status))
      )
    : [];
  const tonight = tonightSnapshot(bookableSlugs, occupying, today);
  const week = windowStats(occupying, today, 7, bookableUnits.length);
  const month30 = windowStats(occupying, today, 30, bookableUnits.length);
  const upcoming = upcomingStays(occupying, today, 8);
  const arrivalsToday = board.ok ? board.data.arrivals.length + board.data.channelArrivals.length : null;
  const departuresToday = board.ok ? board.data.departures.length + board.data.channelDepartures.length : null;
  const inHouse = board.ok ? board.data.inHouse.length + board.data.channelInHouse.length : null;
  const nextCleaning = cleaning.ok ? cleaning.data.overdue[0] ?? cleaning.data.dueToday[0] ?? cleaning.data.upcoming[0] ?? null : null;

  return (
    <>
      <PageHeader
        eyebrow="Overview · Bayreuth"
        title={formatLongDay(today)}
        description={
          chips.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span key={c.label} className="bc-badge ghost" data-tone={c.tone}>
                  {c.label}
                </span>
              ))}
            </span>
          ) : undefined
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
          <ErrorNotice title="The attention list could not be loaded.">{attention.error}</ErrorNotice>
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

      {/* ── Today ────────────────────────────────────────────────── */}
      <Section title="Today" meta="Booked stays from every channel · a cancelled reservation is never an arrival" id="today">
        <div className="bc-metrics mt-4" style={{ ['--cols' as string]: 5 }}>
          <Metric label="Arrivals today" value={arrivalsToday ?? ''} unavailable={arrivalsToday === null} />
          <Metric label="Departures today" value={departuresToday ?? ''} unavailable={departuresToday === null} />
          <Metric label="Occupied tonight" value={calendar.ok ? tonight.occupiedUnits : ''} unavailable={!calendar.ok} note={inHouse !== null ? `${inHouse} ${inHouse === 1 ? 'stay' : 'stays'} in house` : undefined} />
          <Metric label="Vacant tonight" value={calendar.ok ? tonight.vacantUnits : ''} unavailable={!calendar.ok} note={`of ${bookableUnits.length} bookable ${bookableUnits.length === 1 ? 'apartment' : 'apartments'}`} />
          <Metric label="Same-day turnovers" value={calendar.ok ? tonight.sameDayTurnovers : ''} unavailable={!calendar.ok} note="one guest leaves, the next arrives" />
        </div>

        {!calendar.ok ? (
          <div className="mt-4">
            <ErrorNotice title="Apartment status could not be loaded.">{calendar.error}</ErrorNotice>
          </div>
        ) : (
          <div className="bc-rows mt-4">
            {calendar.data.units.map((unit) => {
              const stays = occupying.filter((r) => r.unitSlug === unit.slug);
              const current = stays.find((r) => relationOn(r, today) === 'in_house');
              const arriving = stays.find((r) => relationOn(r, today) === 'arrival');
              const departing = stays.find((r) => relationOn(r, today) === 'departure');
              const nextStay = stays.filter((r) => r.checkIn > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
              const closed = calendar.data.closures.find((c) => c.unitSlug === unit.slug && today >= c.from && today < c.to);
              const preparing = !unit.isBookable && unit.contentStatus !== 'available';
              if (!unit.isBookable && preparing) return null;
              let state: { label: string; tone: string; detail: string };
              if (arriving && departing) state = { label: 'Turnover today', tone: 'progress', detail: `${departing.guestLabel ?? departing.reference} leaves · ${arriving.guestLabel ?? arriving.reference} arrives, ${pluralNights(arriving.nights)}` };
              else if (arriving) state = { label: 'Arrival today', tone: 'progress', detail: `${arriving.guestLabel ?? arriving.reference}, ${pluralNights(arriving.nights)} until ${formatIsoDate(arriving.checkOut)}` };
              else if (departing) state = { label: 'Departure today', tone: 'neutral', detail: `${departing.guestLabel ?? departing.reference} leaves${nextStay ? ` · next arrival ${formatIsoDate(nextStay.checkIn)}` : ' · nothing booked next'}` };
              else if (current) state = { label: 'Occupied', tone: 'positive', detail: `${current.guestLabel ?? current.reference} until ${formatIsoDate(current.checkOut)}` };
              else if (closed) state = { label: 'Closed at the channel', tone: 'neutral', detail: `Not for sale until ${formatIsoDate(closed.to)} — a closed night at Beds24` };
              else state = { label: 'Vacant tonight', tone: 'muted', detail: nextStay ? `Next arrival ${formatIsoDate(nextStay.checkIn)} — ${nextStay.guestLabel ?? nextStay.reference}` : 'No booked stay in the next 31 days' };
              return (
                <div key={unit.slug} className="bc-row" style={{ gridTemplateColumns: 'minmax(120px, 180px) auto minmax(0,1fr) auto' }}>
                  <div>
                    <div style={{ fontWeight: 600 }} title={unit.displayName}>{compactUnitName(unit.displayName)}</div>
                    <div className="bc-meta">{nextStay ? `Next: ${formatIsoDate(nextStay.checkIn)}` : 'No next arrival'}</div>
                  </div>
                  <span className="bc-badge" data-tone={state.tone}>
                    {state.label}
                  </span>
                  <span className="bc-meta truncate">{state.detail}</span>
                  <span className="bc-meta whitespace-nowrap">
                    <Link href={`/admin/calendar?unit=${unit.slug}`}>Calendar →</Link>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {board.ok ? (
          <div className="grid gap-6 lg:grid-cols-3 mt-2">
            <Column title="Arriving" items={board.data.arrivals} channel={board.data.channelArrivals} empty="No arrivals today." />
            <Column title="Leaving" items={board.data.departures} channel={board.data.channelDepartures} empty="No departures today." />
            <Column title="Staying" items={board.data.inHouse} channel={board.data.channelInHouse} empty="Nobody in house tonight." />
          </div>
        ) : (
          <div className="mt-4">
            <ErrorNotice title="Today’s arrivals and departures could not be loaded.">{board.error}</ErrorNotice>
          </div>
        )}
      </Section>

      {/* ── Cleaning and sync, side by side ───────────────────────── */}
      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Cleaning" meta={<Link href="/admin/cleaning">Cleaning →</Link>} id="cleaning">
          {!cleaning.ok ? (
            <div className="mt-4">
              <ErrorNotice title="The cleaning board could not be read." tone="caution">{cleaning.error}</ErrorNotice>
            </div>
          ) : (
            <>
              <div className="bc-metrics mt-4" style={{ ['--cols' as string]: 3 }}>
                <Metric label="To clean" value={cleaning.data.counts.open + cleaning.data.channelTurnovers.length} note="open turnovers, 60 days" />
                <Metric label="Overdue" value={cleaning.data.counts.overdue} note={cleaning.data.counts.overdue > 0 ? 'not done in time' : undefined} />
                <Metric label="Same-day" value={cleaning.data.counts.sameDay + cleaning.data.channelTurnovers.filter((t) => t.sameDay).length} note="changeovers ahead" />
              </div>
              <p className="bc-meta mt-3" style={{ fontSize: 12.5 }}>
                {nextCleaning
                  ? `Next: ${compactUnitName(nextCleaning.unitName)}, check-out ${nextCleaning.departure === today ? 'today' : formatIsoDate(nextCleaning.departure)}${nextCleaning.nextArrival ? `, next guests ${nextCleaning.nextArrival === nextCleaning.departure ? 'the same day' : formatIsoDate(nextCleaning.nextArrival)}` : ''}.`
                  : cleaning.data.channelTurnovers[0]
                    ? `Next: ${compactUnitName(cleaning.data.channelTurnovers[0].departure.unitName)}, check-out ${formatIsoDate(cleaning.data.channelTurnovers[0].departure.checkOut)}.`
                    : 'Nothing to clean in the next sixty days.'}
              </p>
            </>
          )}
        </Section>
        <Section title="Booking sync" meta={<Link href="/admin/system">System →</Link>} id="sync">
          <div className="mt-4">
            {sync.ok ? (
              <HealthSectionCard section={{ ...sync.data, title: 'Reservations from the booking system' }} />
            ) : (
              <ErrorNotice title="Sync state could not be read." tone="caution">{sync.error}</ErrorNotice>
            )}
          </div>
        </Section>
      </div>

      {/* ── Coming up ────────────────────────────────────────────── */}
      <Section title="Coming up" meta={<Link href="/admin/reservations">All reservations →</Link>} id="upcoming">
        <div className="bc-metrics mt-4" style={{ ['--cols' as string]: 6 }}>
          <Metric label="Arrivals · 7 days" value={calendar.ok ? week.arrivals : ''} unavailable={!calendar.ok} />
          <Metric label="Nights · 7 days" value={calendar.ok ? week.nights : ''} unavailable={!calendar.ok} />
          <Metric label="Occupancy · 7 days" value={percent(week.occupancy)} unavailable={!calendar.ok || week.occupancy === null} />
          <Metric label="Arrivals · 30 days" value={calendar.ok ? month30.arrivals : ''} unavailable={!calendar.ok} />
          <Metric label="Nights · 30 days" value={calendar.ok ? month30.nights : ''} unavailable={!calendar.ok} />
          <Metric label="Occupancy · 30 days" value={percent(month30.occupancy)} unavailable={!calendar.ok || month30.occupancy === null} />
        </div>
        {!calendar.ok ? null : upcoming.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nothing booked in the next 31 days.">Booked stays from Booking.com, Airbnb and the website appear here as they are imported.</EmptyState>
          </div>
        ) : (
          <div className="bc-rows mt-4">
            {upcoming.map((r) => {
              const state = r.kind === 'reservation' ? reservationClassPresentation(r.status) : null;
              const body = (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontWeight: 500 }}>
                      {formatIsoDate(r.checkIn, 'long')} · {r.guestLabel ?? r.reference}
                    </div>
                    <div className="bc-meta truncate">
                      {compactUnitName(calendar.data.units.find((u) => u.slug === r.unitSlug)?.displayName ?? r.unitSlug)} · {formatStay(r.checkIn, r.checkOut)} · {pluralNights(r.nights)} · {sourcePresentation(r.source).label}
                    </div>
                  </div>
                  {state ? (
                    <span className="bc-badge" data-tone={state.tone}>
                      {state.label}
                    </span>
                  ) : (
                    <BookingStateBadge state={r.status} />
                  )}
                </div>
              );
              const href = r.href ?? `/admin/reservations?q=${encodeURIComponent(r.reference)}&when=all`;
              return (
                <Link key={`${r.kind}-${r.reference}`} href={href} className="bc-row-link">
                  {body}
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Performance ──────────────────────────────────────────── */}
      <Section title="Performance" meta={<Link href="/admin/performance">Performance →</Link>} id="month">
        <div className="bc-metrics mt-4" style={{ ['--cols' as string]: 3 }}>
          <Metric label={`Booked · ${periodLabel(thisMonth)}`} value={month.ok ? <Money cents={month.data.stayGrossCents} /> : ''} unavailable={!month.ok} note={month.ok ? `${month.data.occupiedNights} nights · gross booking value` : undefined} />
          <Metric label={`Booked · ${periodLabel(nextMonth)}`} value={next.ok ? <Money cents={next.data.stayGrossCents} /> : ''} unavailable={!next.ok} note={next.ok ? `${next.data.occupiedNights} nights so far` : undefined} />
          <Metric label={`Booked · ${today.slice(0, 4)} to date`} value={year.ok ? <Money cents={year.data.stayGrossCents} /> : ''} unavailable={!year.ok} note={year.ok ? `${year.data.occupiedNights} nights since 1 January` : undefined} />
        </div>
        {month.ok && (
          <>
            <div className="bc-metrics mt-3" style={{ ['--cols' as string]: 3 }}>
              <Metric label="Occupancy this month" value={<Pct ratio={month.data.occupancy.value} digits={0} />} note={`${month.data.occupiedNights} of ${month.data.availableNights} apartment nights`} unavailable={month.data.occupancy.value === null} />
              <Metric label="ADR this month" value={<Money cents={month.data.adr.value === null ? null : Math.round(month.data.adr.value)} />} note="gross per booked night" unavailable={month.data.adr.value === null} />
              <Metric label="ADR this year" value={<Money cents={year.ok && year.data.adr.value !== null ? Math.round(year.data.adr.value) : null} />} note={year.ok && year.data.occupancy.value !== null ? `occupancy ${percent(year.data.occupancy.value)} year to date` : undefined} unavailable={!year.ok || year.data.adr.value === null} />
            </div>
            <div className="mt-3 grid gap-x-10 gap-y-1 md:grid-cols-2">
              {month.data.byUnit.length > 0 && (
                <p className="bc-meta" style={{ fontSize: 12.5 }}>
                  By apartment: {month.data.byUnit.map((u) => `${compactUnitName(u.displayName)} ${formatEur(u.grossCents)} (${u.nights} nights)`).join(' · ')}
                </p>
              )}
              {month.data.byChannel.filter((c) => c.nights > 0).length > 0 && (
                <p className="bc-meta" style={{ fontSize: 12.5 }}>
                  By channel: {month.data.byChannel.filter((c) => c.nights > 0).map((c) => `${sourcePresentation(c.source).label} ${c.share === null ? `${c.nights} nights` : percent(c.share)}`).join(' · ')}
                </p>
              )}
            </div>
          </>
        )}
        <p className="bc-meta mt-2" style={{ fontSize: 12 }}>
          Booked gross value as the booking system states it, allocated to the nights of each stay — not payout, not net of commission, not profit. Money received is in Finance.
        </p>
      </Section>

      {/* ── Systems, quietly ─────────────────────────────────────── */}
      <Section title="Systems" meta={<Link href="/admin/system">Detail →</Link>} id="health">
        {!health.ok ? (
          <div className="mt-4">
            <ErrorNotice title="System health could not be loaded.">{health.error}</ErrorNotice>
          </div>
        ) : (
          <div className="bc-rows">
            {health.data
              .filter((s) => ['database', 'beds24', 'reservations', 'schedulers', 'cleaning'].includes(s.key))
              .map((s) => (
                <div key={s.key} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '11px 0' }}>
                  <span className="truncate">{SYSTEM_LABEL[s.key] ?? s.title}</span>
                  <HealthBadge status={s.status} />
                </div>
              ))}
          </div>
        )}
        {calendar.ok && calendar.data.inventorySyncedAt && (
          <p className="bc-meta mt-2" style={{ fontSize: 12 }}>
            Availability last synchronised {formatRelative(calendar.data.inventorySyncedAt)}.
          </p>
        )}
      </Section>
    </>
  );
}

const SYSTEM_LABEL: Record<string, string> = {
  database: 'Database',
  beds24: 'Booking system (Beds24)',
  reservations: 'Reservation import',
  schedulers: 'Scheduled jobs',
  cleaning: 'Cleaning derivation',
};

function formatEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function Column({
  title,
  items,
  channel,
  empty,
}: {
  title: string;
  items: import('@/lib/admin/dto').BookingSummaryDto[];
  /** Channel reservations, each with its own detail page. */
  channel: import('@/lib/admin/dto').ReservationDto[];
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <p className="bc-label" style={{ padding: '14px 0 6px' }}>
        {title} <span className="bc-num" style={{ marginLeft: 6, color: 'hsl(var(--bc-text))' }}>{items.length + channel.length}</span>
      </p>
      {items.length + channel.length === 0 ? (
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
                    {compactUnitName(b.unitName)} · {formatStay(b.checkIn, b.checkOut)} · {b.adults + b.children} {b.adults + b.children === 1 ? 'guest' : 'guests'}
                  </div>
                </div>
                <BookingStateBadge state={b.status} />
              </div>
            </Link>
          ))}
          {channel.map((r) => {
            const state = reservationClassPresentation(r.statusClass);
            return (
              <Link key={`${r.provider}-${r.externalBookingId}`} href={`/admin/reservations/${r.id}`} className="bc-row-link">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontWeight: 500 }}>
                      {r.guestLabel ?? r.channelReference ?? r.externalBookingId}
                    </div>
                    <div className="bc-meta truncate">
                      {compactUnitName(r.unitName)} · {formatStay(r.checkIn, r.checkOut)} · {r.guests !== null ? `${r.guests} ${r.guests === 1 ? 'guest' : 'guests'} · ` : ''}{sourcePresentation(r.source).label}
                    </div>
                  </div>
                  <span className="bc-badge" data-tone={state.tone}>
                    <i className="bc-glyph" data-glyph={state.glyph} aria-hidden="true" />
                    {state.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
