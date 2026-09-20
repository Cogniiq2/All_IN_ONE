import type { Metadata } from 'next';
import Link from 'next/link';
import { loadPl } from '@/lib/finance/queries';
import { one, presetsFor, rangeOf, type Params } from '@/lib/finance/params';
import { CHANNEL_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, Notice } from '@/components/admin/primitives';
import { Money, RangeForm, LedgerRow, Bars, Provenance, Caveats } from '@/components/admin/finance/primitives';
import { ExportButton, PrintButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Profit & loss' };

export default async function ProfitLossPage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'ytd');
  const unitId = one(searchParams, 'unit', 60);
  const channel = one(searchParams, 'channel', 20);
  const result = await loadPl(range, { unitId, channel });
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Profit & loss" /><ErrorNotice title="The P&L could not be built.">{result.error}</ErrorNotice></>;
  const { pl, units, estimate } = result.data;
  const q = (extra: Record<string, string | null>) => `/admin/finance/transactions?from=${range.from}&to=${range.to}${unitId ? `&unit=${unitId}` : ''}${channel ? `&channel=${channel}` : ''}${Object.entries(extra).filter(([, v]) => v).map(([k, v]) => `&${k}=${v}`).join('')}`;
  return (
    <>
      <PageHeader eyebrow="Finance · management GuV" title="Profit & loss" description="Management view: net revenue by service date, costs by category group, subtotals down to the operating result. Estimated company taxes appear only for a whole fiscal year and are labelled." actions={<span className="flex flex-wrap gap-2"><ExportButton kind="profit_loss" from={range.from} to={range.to} label="Export P&L" /><PrintButton /></span>} />
      <RangeForm action="/admin/finance/profit-loss" from={range.from} to={range.to} presets={presetsFor()} extra={<>
        <label className="bc-field"><span className="bc-label">Unit</span><select name="unit" defaultValue={unitId ?? ''} className="bc-select"><option value="">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select></label>
        <label className="bc-field"><span className="bc-label">Channel</span><select name="channel" defaultValue={channel ?? ''} className="bc-select"><option value="">All channels</option>{Object.entries(CHANNEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </>} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={`${range.from} – ${range.to}`} meta={<span>{pl.months.length} month{pl.months.length === 1 ? '' : 's'} · net amounts · <Provenance value="actual" /></span>} id="pl">
          <div className="bc-ledger mt-2">
            {pl.sections.map((s) => (
              <div key={s.group}>
                <div className="bc-ledger-row" data-total="true"><span>{s.label.toUpperCase()}</span><Money cents={s.totalCents} /></div>
                {s.lines.map((l) => <LedgerRow key={l.category} label={l.label} cents={l.cents} level={1} meta={`${l.transactions}`} href={q({ category: l.category })} />)}
                {s.group === 'direct_cost' && <div className="bc-ledger-row" data-total="true" style={{ background: 'hsl(var(--bc-accent-wash))' }}><span>= CONTRIBUTION MARGIN</span><Money cents={pl.contributionCents} /></div>}
                {s.group === 'property_cost' && <div className="bc-ledger-row" data-total="true" style={{ background: 'hsl(var(--bc-accent-wash))' }}><span>= PROPERTY OPERATING RESULT</span><Money cents={pl.propertyResultCents} /></div>}
                {s.group === 'company_cost' && <div className="bc-ledger-row" data-total="true" style={{ background: 'hsl(var(--bc-accent-wash))' }}><span>= OPERATING RESULT</span><Money cents={pl.operatingResultCents} /></div>}
              </div>
            ))}
            <div className="bc-ledger-row" data-total="true" style={{ background: 'hsl(var(--bc-accent-wash))' }}><span>= RESULT BEFORE TAX</span><Money cents={pl.resultBeforeTaxCents} /></div>
            {pl.estimatedTaxesCents !== null && <>
              <LedgerRow label={<>Estimated company taxes (KSt + Soli + GewSt) <Provenance value="estimated" /></>} cents={-pl.estimatedTaxesCents} level={1} href="/admin/finance/taxes" />
              <div className="bc-ledger-row" data-total="estimate"><span>= ESTIMATED RESULT AFTER TAX <Provenance value="estimated" /></span><Money cents={pl.resultAfterTaxCents} /></div>
            </>}
          </div>
          {estimate && <Caveats items={estimate.caveats} />}
          {pl.estimatedTaxesCents === null && <p className="bc-meta mt-3" style={{ fontSize: 12 }}>Taxes are estimated only for a whole fiscal year without unit or channel filter — a partial-year tax figure would be a fiction. <Link href={`/admin/finance/profit-loss?from=${range.from.slice(0, 4)}-01-01&to=${Number(range.from.slice(0, 4)) + 1}-01-01`}>Whole year →</Link></p>}
        </Section>
        <div>
          <Section title="By month" meta="revenue vs costs" id="months">
            <div className="bc-panel mt-2" style={{ padding: '12px 16px 10px' }}><Bars points={pl.byMonth} /></div>
            <div className="bc-ledger mt-3">{pl.byMonth.map((m) => <LedgerRow key={m.month} label={m.month} cents={m.operatingResultCents} meta={`${(m.revenueCents / 100).toFixed(0)} − ${(m.costsCents / 100).toFixed(0)}`} href={`/admin/finance/profit-loss?from=${m.month}-01&to=${m.month.slice(0, 4)}-${String((Number(m.month.slice(5, 7)) % 12) + 1).padStart(2, '0')}-01${Number(m.month.slice(5, 7)) === 12 ? '' : ''}`} />)}</div>
          </Section>
          <Section title="Reading this" id="about">
            <Notice tone="neutral">Profit is not cash: a stay&rsquo;s revenue is recognised on its check-out date even when PayPal captured the money weeks earlier, and a Booking.com payout arriving next month changes nothing here. Balance items — furniture confirmed as fixed assets, VAT settlements — are excluded. Every line drills down to the transactions behind it.</Notice>
          </Section>
        </div>
      </div>
    </>
  );
}
