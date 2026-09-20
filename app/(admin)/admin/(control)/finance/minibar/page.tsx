import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadMinibar, unitNamer } from '@/lib/finance/queries';
import { presetsFor, rangeOf, type Params } from '@/lib/finance/params';
import { taxCode as taxCodeOf } from '@/lib/finance/tax-codes';
import { PageHeader, Section, ErrorNotice, Notice } from '@/components/admin/primitives';
import { Money, Pct, RangeForm, PlainFigure, StateBadge, DateCell } from '@/components/admin/finance/primitives';
import { MinibarForms } from '@/components/admin/finance/minibar-forms';

export const metadata: Metadata = { title: 'Minibar' };

export default async function MinibarPage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'mtd');
  const [result, operator] = await Promise.all([loadMinibar(range), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Minibar" /><ErrorNotice title="Minibar could not be loaded.">{result.error}</ErrorNotice></>;
  const m = result.data;
  const name = unitNamer(m.units);
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  const mayConfigure = can(operator?.role, 'finance.configure') && !operator?.preview;
  return (
    <>
      <PageHeader eyebrow="Finance · revenue and stock" title="Minibar" description="A real revenue and cost domain: each product has its own tax code (beverages 19 %, food items 7 % — never assumed), a sale posts revenue and COGS and reduces stock, and a mistake is corrected by a movement, never an edit." />
      <RangeForm action="/admin/finance/minibar" from={range.from} to={range.to} presets={presetsFor()} />
      <div className="bc-figures" style={{ ['--cols' as string]: 6 }}>
        <PlainFigure label="Minibar revenue net" cents={m.metrics.revenueNetCents} provenance="actual" href={`/admin/finance/transactions?category=minibar_sales&from=${range.from}&to=${range.to}`} />
        <PlainFigure label="COGS" cents={m.metrics.cogsCents} provenance="actual" />
        <PlainFigure label="Gross contribution" cents={m.metrics.contributionCents} provenance="calculated" note={<Pct ratio={m.metrics.margin} />} />
        <PlainFigure label="Units sold" value={String(m.metrics.unitsSold)} provenance="actual" />
        <PlainFigure label="Stock value (cost)" cents={m.metrics.stockValueCents} provenance="calculated" />
        <PlainFigure label="Open charges" value={String(m.metrics.openCharges)} provenance="actual" note={m.metrics.shrinkageUnits ? `${m.metrics.shrinkageUnits} units shrinkage` : undefined} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] mt-2">
        <div>
          <Section title="Stock" meta="on hand = Σ signed movements" id="stock">
            <div className="bc-table-wrap mt-2">
              <table className="bc-table">
                <thead><tr><th scope="col">Product</th><th scope="col">Tax code</th><th scope="col" className="num">Price</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Margin</th><th scope="col" className="num">On hand</th><th scope="col" className="num">Sold</th><th scope="col" className="num">Comp.</th><th scope="col" className="num">Shrink</th></tr></thead>
                <tbody>
                  {m.stock.map((s) => {
                    const code = taxCodeOf(s.tax_code);
                    const net = code ? Math.round(s.selling_price_cents / (1 + code.rateBp / 10000)) : s.selling_price_cents;
                    return (
                      <tr key={s.product_id} style={s.on_hand <= s.reorder_threshold ? { background: 'hsl(var(--bc-caution-soft) / 0.5)' } : undefined}>
                        <td><div style={{ fontWeight: 500 }}>{s.name}</div><div className="bc-meta bc-mono">{s.sku}</div></td>
                        <td><div>{code?.label ?? s.tax_code}</div>{code?.reviewRequired && <div className="bc-meta" style={{ color: 'hsl(var(--bc-caution))' }}>review required</div>}</td>
                        <td className="num"><Money cents={s.selling_price_cents} /><div className="bc-meta">net {(net / 100).toFixed(2)}</div></td>
                        <td className="num"><Money cents={s.purchase_cost_cents} /></td>
                        <td className="num"><Pct ratio={net > 0 ? (net - s.purchase_cost_cents) / net : null} /></td>
                        <td className="num" style={{ fontWeight: 600 }}>{s.on_hand}{s.on_hand <= s.reorder_threshold && <span className="bc-badge ghost ml-2" data-tone="caution">reorder</span>}</td>
                        <td className="num">{s.units_sold}</td>
                        <td className="num">{s.complimentary_units}</td>
                        <td className="num">{s.shrinkage_units}</td>
                      </tr>
                    );
                  })}
                  {m.stock.length === 0 && <tr><td colSpan={9} className="bc-meta">No product yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Movements" meta="append-only" id="movements">
            <div className="bc-rows">
              {m.movements.slice(0, 60).map((mv) => {
                const p = m.products.find((x) => x.id === mv.product_id);
                return (
                  <div key={mv.id} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto' }}>
                    <span className="bc-num" style={{ minWidth: 88 }}><DateCell iso={mv.occurred_on} /></span>
                    <span className="min-w-0 truncate"><span className="bc-badge ghost" data-tone={mv.movement === 'sale' ? 'positive' : mv.movement === 'purchase' ? 'progress' : 'neutral'}>{mv.movement}</span> {p?.name ?? mv.product_id} <span className="bc-meta">· {name(mv.unit_id)}{mv.booking_reference ? ` · ${mv.booking_reference}` : ''}{mv.note ? ` · ${mv.note}` : ''}{mv.transaction_id ? <> · <Link href={`/admin/finance/transactions/${mv.transaction_id}`}>revenue →</Link></> : null}</span></span>
                    <StateBadge table="charge" value={mv.charge_state} ghost />
                    <span className="bc-num" style={{ fontWeight: 600 }}>{mv.quantity > 0 ? `+${mv.quantity}` : mv.quantity}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
        <div>
          {mayEdit ? <MinibarForms products={m.products} units={m.units} stays={m.stays} taxCodes={m.taxCodes} counterparties={m.counterparties} mayConfigure={mayConfigure} /> : <Notice tone="neutral">Movements are recorded by operators. Your session is read-only here.</Notice>}
          <Section title="Rules" id="rules">
            <ul className="bc-prose grid gap-1" style={{ fontSize: 13 }}>
              <li>· A sale posts revenue at the product&apos;s tax code plus a COGS line at purchase cost; stock falls by the quantity.</li>
              <li>· Consumption is recorded whether or not money was taken: <em>unpaid</em>, <em>paid</em>, <em>included</em>, <em>written off</em>, <em>needs review</em>. No automatic guest charge exists — no authorised payment mechanism does.</li>
              <li>· Beverages are 19 %; food items in Anlage 2 UStG are 7 %; milk-based drinks and anything unclear get a review-required code until the adviser decides.</li>
              <li>· A stock count difference is an adjustment movement with a note; shrinkage stays visible.</li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
