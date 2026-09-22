import type { Metadata } from 'next';
import Link from 'next/link';
import { loadPerformance } from '@/lib/admin/queries';
import { rangeOf, presetsFor, type Params } from '@/lib/finance/params';
import { CHANNEL_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, EmptyState, Metric, Notice, Dash } from '@/components/admin/primitives';
import { Money, Pct, RangeForm } from '@/components/admin/finance/primitives';

export const metadata: Metadata = { title: 'Performance' };

/**
 * Operational performance — how full the rooms were and what a sold night
 * fetched, from the reservations Beds24 reports.
 *
 * ── Why this is not in /admin/finance ────────────────────────────────────
 * Because it is a different kind of truth and the distinction is the whole
 * point. Finance is the accounting layer: net of VAT, reconciled against
 * documents and cash, defensible to an accountant. This is the OPERATING
 * layer: gross booking value as the channel manager reports it, available the
 * moment a booking lands and never waiting for a settlement.
 *
 * Both are useful. Adding them together would produce a number that is
 * neither, which is why they live on separate screens and why every figure
 * here says "gross" out loud.
 *
 * What Booking.com will actually deduct and pay out is NOT in this data —
 * see the notice rendered below, and docs/beds24-financial-debug.md §5.
 */
export default async function PerformancePage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'ytd');
  const result = await loadPerformance(range);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Performance"
        description="Occupancy, ADR and RevPAR from what is actually booked at the channel manager. Gross booking value — not net revenue, and not cash received."
      />
      <RangeForm action="/admin/performance" from={range.from} to={range.to} presets={presetsFor()} />

      {!result.ok ? (
        <ErrorNotice title="Performance could not be loaded.">{result.error}</ErrorNotice>
      ) : result.data.availableNights === 0 ? (
        <EmptyState title="No units are mapped to the channel manager.">
          Occupancy needs at least one unit with an enabled Beds24 mapping. <Link href="/admin/properties">Properties →</Link>
        </EmptyState>
      ) : (
        <>
          {/* The honesty notice. It is first, and it is not dismissible. */}
          <Notice tone="muted" title="What these figures are, and are not" icon="info">
            Every amount here is the <strong>gross booking value</strong> Beds24 reports for the stay.
            Booking.com&rsquo;s commission, the net payout, the payout date and the settlement are{' '}
            <strong>not available</strong> through the current integration — Beds24 reports a commission of
            zero on these reservations, and that is evidence that Beds24 was not told, not evidence that
            Booking.com charged nothing. Nothing on this page has been netted off.
            For reconciled, VAT-correct figures see <Link href="/admin/finance/revenue">Finance → Revenue</Link>.
          </Notice>

          {result.data.currencies.length > 1 && (
            <Notice tone="caution" title="Mixed currencies in this range" icon="warn">
              Reservations in {result.data.currencies.join(', ')} appear in this window. The totals below add
              them as if they were one currency, which they are not. Narrow the range or read the per-channel
              rows instead.
            </Notice>
          )}

          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <Metric label="Occupancy" value={<Pct ratio={result.data.occupancy.value} digits={1} />} note={`${result.data.occupiedNights} of ${result.data.availableNights} room nights`} unavailable={result.data.occupancy.value === null} />
            <Metric label="ADR" value={<Money cents={result.data.adr.value === null ? null : Math.round(result.data.adr.value)} />} note="gross, per occupied night" unavailable={result.data.adr.value === null} />
            <Metric label="RevPAR" value={<Money cents={result.data.revpar.value === null ? null : Math.round(result.data.revpar.value)} />} note="gross, per available night" unavailable={result.data.revpar.value === null} />
            <Metric label="Average stay" value={result.data.alos.value === null ? <Dash /> : `${result.data.alos.value.toFixed(1)} nights`} note={`${result.data.activeStays} arriving stays`} unavailable={result.data.alos.value === null} />
          </div>

          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <Metric label="Earned in range" value={<Money cents={result.data.stayGrossCents} />} note="allocated per night of stay" />
            <Metric label="Booked in range" value={<Money cents={result.data.bookedGrossCents} />} note={`${result.data.bookedStays} stays sold, whenever they are taken`} />
            <Metric label="Arriving in range" value={<Money cents={result.data.arrivingGrossCents} />} note={`${result.data.arrivingStays} stays, whenever they were sold`} />
            <Metric label="Cancellation rate" value={<Pct ratio={result.data.cancellationRate.value} digits={1} />} note={`${result.data.cancelledStays} cancelled of ${result.data.activeStays + result.data.cancelledStays} by arrival`} unavailable={result.data.cancellationRate.value === null} />
          </div>

          {result.data.nightsWithoutAmount > 0 && (
            <Notice tone="neutral" title="Some occupied nights carry no amount" icon="info">
              {result.data.nightsWithoutAmount} of {result.data.occupiedNights} occupied nights come from a
              reservation Beds24 reported without a price — an owner block, or a booking entered by hand.
              They count towards occupancy and are excluded from ADR, RevPAR and every total, so a blocked
              night cannot read as a night sold for nothing.
            </Notice>
          )}

          <div className="grid gap-8 lg:grid-cols-2 mt-2">
            <Section title="By apartment" meta="each measured against its own available nights">
              <div className="bc-ledger">
                {result.data.byUnit.map((u) => (
                  <div key={u.slug}>
                    <div className="bc-ledger-row"><span style={{ fontWeight: 600 }}>{u.displayName} <span className="bc-meta">· {u.stays} stays · {u.nights} nights</span></span><Money cents={u.grossCents} /></div>
                    <div className="bc-ledger-row" data-level="1">
                      <span>Occupancy <Pct ratio={u.occupancy.value} digits={1} /> · ADR {u.adr.value === null ? <Dash /> : <Money cents={Math.round(u.adr.value)} />} · RevPAR {u.revpar.value === null ? <Dash /> : <Money cents={Math.round(u.revpar.value)} />}</span>
                      <span className="bc-meta">{u.availableNights} available</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="By channel" meta="the OTA dependency, measured">
              <div className="bc-ledger">
                {result.data.byChannel.length === 0 && <p className="bc-meta">No occupied nights in this range.</p>}
                {result.data.byChannel.map((c) => (
                  <Link key={c.source} href={`/admin/bookings?source=${c.source}`} className="bc-ledger-row link-quiet">
                    <span>{CHANNEL_LABEL[c.source] ?? c.source} <span className="bc-meta">· {c.stays} stays · {c.nights} nights · <Pct ratio={c.share} digits={0} /></span></span>
                    <Money cents={c.grossCents} />
                  </Link>
                ))}
              </div>
              {result.data.byChannel.some((c) => c.source === 'booking_com') && !result.data.byChannel.some((c) => c.source === 'direct') && (
                <p className="bc-meta mt-3">
                  Every occupied night in this range came through an OTA. Direct booking is the lever;
                  it is currently behind its launch gate.
                </p>
              )}
            </Section>
          </div>

          <Section title="By month" meta="nights allocated to the month they fall in, so the months add up">
            <div className="bc-ledger">
              {result.data.byMonth.map((m) => (
                <div key={m.month} className="bc-ledger-row">
                  <span>{m.month} <span className="bc-meta">· {m.nights} nights · occupancy <Pct ratio={m.occupancy.value} digits={0} /> · ADR {m.adr.value === null ? <Dash /> : <Money cents={Math.round(m.adr.value)} />}</span></span>
                  <Money cents={m.grossCents} />
                </div>
              ))}
              {result.data.byMonth.length === 0 && <p className="bc-meta">No occupied nights in this range.</p>}
            </div>
          </Section>

          <Section title="Not available from this source" meta="shown so it is never mistaken for zero">
            <div className="bc-ledger">
              {([
                ['Booking.com commission', 'The provider does not report it. Beds24 says 0, which means "not told".'],
                ['Net payout', 'Requires the Booking.com payout statement, not the reservation.'],
                ['Payout status and date', 'Same source. Not modelled yet.'],
                ['VAT and tax', 'Computed in Finance from reconciled sources, never from a channel read.'],
              ] as const).map(([label, why]) => (
                <div key={label} className="bc-ledger-row">
                  <span>{label} <span className="bc-meta">· {why}</span></span>
                  <span className="bc-metric-value unavailable">Not yet reconciled</span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
