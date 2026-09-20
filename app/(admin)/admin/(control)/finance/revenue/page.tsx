import type { Metadata } from 'next';
import Link from 'next/link';
import { loadRevenue } from '@/lib/finance/queries';
import { presetsFor, rangeOf, type Params } from '@/lib/finance/params';
import { categoryLabel } from '@/lib/finance/categories';
import { CHANNEL_LABEL, KIND_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, EmptyState } from '@/components/admin/primitives';
import { Money, Pct, RangeForm, PlainFigure, StateBadge, DateCell } from '@/components/admin/finance/primitives';
import { ExportButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Revenue' };

/**
 * Source-driven revenue: gross guest revenue by category, channel and unit,
 * kept apart from commission and from cash receipts. Every line links to
 * the transaction it came from.
 */
export default async function RevenuePage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'mtd');
  const result = await loadRevenue(range);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Revenue" description="What was earned, net of VAT, by the service date (check-out). Commission and payouts are separate facts and never netted into this figure." actions={<ExportButton kind="revenue_ledger" from={range.from} to={range.to} label="Export revenue ledger" />} />
      <RangeForm action="/admin/finance/revenue" from={range.from} to={range.to} presets={presetsFor()} />
      {!result.ok ? <ErrorNotice title="Revenue could not be loaded.">{result.error}</ErrorNotice> : (
        <>
          <div className="bc-figures" style={{ ['--cols' as string]: 5 }}>
            <PlainFigure label="Revenue net" cents={result.data.totals.netCents} provenance="actual" note={`${result.data.lines.length} lines`} />
            <PlainFigure label="VAT collected" cents={result.data.totals.vatCents} provenance="calculated" note="output VAT on these lines" href="/admin/finance/vat" />
            <PlainFigure label="Gross" cents={result.data.totals.grossCents} provenance="actual" />
            <PlainFigure label="Refunds and credits" cents={-result.data.totals.refundsCents} provenance="actual" href={`/admin/finance/transactions?kind=refund&from=${range.from}&to=${range.to}`} />
            <PlainFigure label="OTA commission (separate)" cents={result.data.totals.commissionCents} provenance="actual" note={result.data.totals.netCents > 0 ? <Pct ratio={result.data.totals.commissionCents / result.data.totals.netCents} digits={1} /> : undefined} href={`/admin/finance/transactions?kind=commission&from=${range.from}&to=${range.to}`} />
          </div>

          <div className="grid gap-8 lg:grid-cols-3 mt-2">
            <Section title="By category" id="cat">
              <div className="bc-ledger">{result.data.byCategory.map((c) => <Link key={c.category} href={`/admin/finance/transactions?category=${c.category}&from=${range.from}&to=${range.to}`} className="bc-ledger-row link-quiet"><span>{categoryLabel(c.category)} <span className="bc-meta">· {c.count}</span></span><Money cents={c.netCents} /></Link>)}{result.data.byCategory.length === 0 && <p className="bc-meta">No revenue in the range.</p>}</div>
              {result.data.minibar.netCents !== 0 && <p className="bc-meta mt-3">Minibar contribution: <Money cents={result.data.minibar.netCents - result.data.minibar.cogsCents} /> on {result.data.minibar.units} items (COGS <Money cents={result.data.minibar.cogsCents} />). <Link href="/admin/finance/minibar">Minibar →</Link></p>}
            </Section>
            <Section title="By channel" meta="gross − refunds − commission − fees − cleaning" id="channel">
              <div className="bc-ledger">
                {result.data.byChannel.map((c) => (
                  <div key={c.channel}>
                    <Link href={`/admin/finance/transactions?channel=${c.channel}&kind=revenue&from=${range.from}&to=${range.to}`} className="bc-ledger-row link-quiet"><span style={{ fontWeight: 600 }}>{c.label} <span className="bc-meta">· {c.stays} stays</span></span><Money cents={c.grossRevenueCents} /></Link>
                    {c.commissionCents !== 0 && <div className="bc-ledger-row" data-level="1"><span>Commission <span className="bc-meta">(<Pct ratio={c.commissionShare} digits={1} />)</span></span><Money cents={-c.commissionCents} /></div>}
                    {c.paymentFeesCents !== 0 && <div className="bc-ledger-row" data-level="1"><span>Payment fees</span><Money cents={-c.paymentFeesCents} /></div>}
                    {c.refundsCents !== 0 && <div className="bc-ledger-row" data-level="1"><span>Refunds</span><Money cents={-c.refundsCents} /></div>}
                    {c.cleaningCents !== 0 && <div className="bc-ledger-row" data-level="1"><span>Cleaning</span><Money cents={-c.cleaningCents} /></div>}
                    <div className="bc-ledger-row" data-total="true"><span>Contribution <span className="bc-meta">(<Pct ratio={c.contributionMargin} />)</span></span><Money cents={c.contributionCents} /></div>
                  </div>
                ))}
                {result.data.byChannel.length === 0 && <p className="bc-meta">No channel data in the range.</p>}
              </div>
            </Section>
            <Section title="By unit" meta="accommodation net · nights · ADR" id="unit">
              <div className="bc-ledger">{result.data.byUnit.map((u) => <Link key={u.unitId ?? 'none'} href={`/admin/finance/transactions?kind=revenue${u.unitId ? `&unit=${u.unitId}` : ''}&from=${range.from}&to=${range.to}`} className="bc-ledger-row link-quiet"><span>{u.name} <span className="bc-meta">· {u.nights} nights{u.adrCents !== null ? ` · ADR ${(u.adrCents / 100).toFixed(0)} €` : ''}</span></span><Money cents={u.netCents} /></Link>)}</div>
              <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Nights and occupancy come from the booking core&rsquo;s paid-side stays; ADR = accommodation net ÷ nights. <Link href={`/admin/finance/properties?from=${range.from}&to=${range.to}`}>Property profitability →</Link></p>
            </Section>
          </div>

          <Section title="Revenue lines" meta={`${result.data.lines.length} in the range`} id="lines">
            {result.data.lines.length === 0 ? <div className="pt-3"><EmptyState title="No revenue in this range." /></div> : (
              <div className="bc-table-wrap">
                <table className="bc-table">
                  <thead><tr><th scope="col">Service end</th><th scope="col">Stay / description</th><th scope="col">Channel</th><th scope="col">Category · tax</th><th scope="col" className="num">Net</th><th scope="col" className="num">VAT</th><th scope="col" className="num">Gross</th><th scope="col">Money</th></tr></thead>
                  <tbody>
                    {result.data.lines.slice(0, 300).map((l) => (
                      <tr key={l.id} data-href={`/admin/finance/transactions/${l.transaction_id}`}>
                        <td className="bc-cover"><Link href={`/admin/finance/transactions/${l.transaction_id}`}><DateCell iso={l.transaction.booked_on} /></Link></td>
                        <td><div>{l.transaction.booking_reference ? <span className="bc-ref">{l.transaction.booking_reference}</span> : l.transaction.description}</div><div className="bc-meta">{l.description ?? KIND_LABEL[l.transaction.kind]}</div></td>
                        <td className="dim">{l.transaction.channel ? CHANNEL_LABEL[l.transaction.channel] ?? l.transaction.channel : '—'}</td>
                        <td><div>{categoryLabel(l.category)}</div><div className="bc-meta">{l.tax_code} · {l.rate_bp / 100} %</div></td>
                        <td className="num"><Money cents={l.net_cents} /></td>
                        <td className="num"><Money cents={l.vat_cents} /></td>
                        <td className="num" style={{ fontWeight: 600 }}><Money cents={l.gross_cents} /></td>
                        <td><StateBadge table="reconciliation" value={l.transaction.reconciliation_state} ghost /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.data.lines.length > 300 && <p className="bc-meta mt-2">Showing 300 of {result.data.lines.length}; use the Transactions filters or the export for the full list.</p>}
          </Section>
        </>
      )}
    </>
  );
}
