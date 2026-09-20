import type { Metadata } from 'next';
import Link from 'next/link';
import { loadProperties } from '@/lib/finance/queries';
import { presetsFor, rangeOf, type Params } from '@/lib/finance/params';
import { ALLOCATION_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, Notice } from '@/components/admin/primitives';
import { Money, Pct, RangeForm, LedgerRow, Provenance } from '@/components/admin/finance/primitives';
import { ExportButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Property profitability' };

export default async function PropertiesPage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'ytd');
  const result = await loadProperties(range);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Properties" /><ErrorNotice title="Property profitability could not be built.">{result.error}</ErrorNotice></>;
  const { report, channels } = result.data;
  return (
    <>
      <PageHeader eyebrow="Finance" title="Property profitability" description="Per unit: revenue, nights, occupancy, ADR, the costs allocated to it and how, contribution. Shared costs that nobody allocated stay visibly unallocated — never spread silently." actions={<ExportButton kind="property_profitability" from={range.from} to={range.to} label="Export" />} />
      <RangeForm action="/admin/finance/properties" from={range.from} to={range.to} presets={presetsFor()} />
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {report.units.map((u) => (
          <article key={u.unitId} className="bc-panel" style={{ padding: '16px 18px' }} aria-labelledby={`unit-${u.slug}`}>
            <div className="flex items-start justify-between gap-3"><h2 id={`unit-${u.slug}`} className="bc-h2">{u.name}</h2><span className="bc-badge ghost" data-tone={u.isBookable ? 'positive' : 'muted'}>{u.isBookable ? 'Bookable' : 'In preparation'}</span></div>
            <p className="bc-figure-value mt-2" style={{ fontSize: 26 }}><Money cents={u.contributionCents} /></p>
            <p className="bc-meta">contribution · margin <Pct ratio={u.contributionMargin} /> · <Provenance value="calculated" /></p>
            <dl className="mt-3 grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: '1fr 1fr', fontSize: 12.5 }}>
              <dt className="bc-label">Nights sold</dt><dd className="bc-num">{u.nightsSold} / {u.nightsAvailable} · <Pct ratio={u.occupancy} /></dd>
              <dt className="bc-label">ADR</dt><dd className="bc-num"><Money cents={u.adrCents} /></dd>
              <dt className="bc-label">Stays</dt><dd className="bc-num">{u.stays}</dd>
              <dt className="bc-label">Cost / occupied night</dt><dd className="bc-num"><Money cents={u.costPerOccupiedNightCents} /></dd>
              <dt className="bc-label">Cleaning / stay</dt><dd className="bc-num"><Money cents={u.cleaningPerStayCents} /></dd>
              <dt className="bc-label">OTA commission</dt><dd className="bc-num"><Pct ratio={u.otaCommissionShare} digits={1} /></dd>
            </dl>
            <div className="bc-ledger mt-3">
              <LedgerRow label="Accommodation" cents={u.accommodationCents} href={`/admin/finance/transactions?unit=${u.unitId}&category=accommodation_revenue&from=${range.from}&to=${range.to}`} />
              {u.minibarCents !== 0 && <LedgerRow label="Minibar" cents={u.minibarCents} href={`/admin/finance/transactions?unit=${u.unitId}&category=minibar_sales&from=${range.from}&to=${range.to}`} />}
              {u.otherRevenueCents !== 0 && <LedgerRow label="Other revenue" cents={u.otherRevenueCents} />}
              <div className="bc-ledger-row" data-total="true"><span>Revenue</span><Money cents={u.revenueCents} /></div>
              {u.costs.map((c) => <LedgerRow key={c.category} label={c.label} cents={-c.cents} level={1} href={`/admin/finance/transactions?unit=${u.unitId}&category=${c.category}&from=${range.from}&to=${range.to}`} />)}
              <div className="bc-ledger-row" data-total="true"><span>Contribution</span><Money cents={u.contributionCents} /></div>
            </div>
            {u.allocationMethods.length > 0 && <p className="bc-meta mt-2" style={{ fontSize: 11.5 }}>Allocation: {u.allocationMethods.map((m) => `${ALLOCATION_LABEL[m.method] ?? m.method} ${(m.cents / 100).toFixed(0)} €`).join(' · ')}</p>}
          </article>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Not allocated to any unit" meta={<Money cents={report.unallocatedCostsCents} />} id="unallocated">
          {report.unallocatedByCategory.length === 0 ? <p className="bc-meta mt-3">Every cost in the range is attributed to a unit.</p> : (
            <>
              <div className="bc-ledger mt-2">{report.unallocatedByCategory.map((c) => <LedgerRow key={c.category} label={c.label} cents={c.cents} href={`/admin/finance/transactions?category=${c.category}&from=${range.from}&to=${range.to}`} />)}</div>
              <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Company-level costs (software, adviser, bank) belong here. Cleaning, laundry or utilities listed here understate every unit: allocate them on the transaction with a method (revenue share, occupied nights, equal, manual).</p>
            </>
          )}
        </Section>
        <Section title="Channel economics" meta="gross − refunds − commission − fees − cleaning" id="channels">
          <table className="bc-mini-table mt-2">
            <thead><tr><th>Channel</th><th className="num">Gross</th><th className="num">Commission</th><th className="num">Fees</th><th className="num">Refunds</th><th className="num">Contribution</th><th className="num">Margin</th></tr></thead>
            <tbody>{channels.map((c) => <tr key={c.channel}><td>{c.label}<div className="bc-meta">{c.stays} stays</div></td><td className="num"><Money cents={c.grossRevenueCents} /></td><td className="num"><Money cents={-c.commissionCents} /></td><td className="num"><Money cents={-c.paymentFeesCents} /></td><td className="num"><Money cents={-c.refundsCents} /></td><td className="num" style={{ fontWeight: 600 }}><Money cents={c.contributionCents} /></td><td className="num"><Pct ratio={c.contributionMargin} /></td></tr>)}</tbody>
          </table>
          <div className="mt-3"><Notice tone="neutral">Marketing is not assigned to a channel unless a line was allocated to one. Reducing OTA dependency shows up here as the gap between the Booking.com and Direct margins. <Link href="/admin/finance/revenue">Revenue →</Link></Notice></div>
        </Section>
      </div>
      <p className="bc-meta" style={{ fontSize: 12 }}>Totals: revenue <Money cents={report.totals.revenueCents} /> · direct costs <Money cents={report.totals.directCostsCents} /> · property costs <Money cents={report.totals.propertyCostsCents} /> · contribution <Money cents={report.totals.contributionCents} /> · {report.totals.nightsSold} nights.</p>
    </>
  );
}
