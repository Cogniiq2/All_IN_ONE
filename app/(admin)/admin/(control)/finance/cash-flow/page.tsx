import type { Metadata } from 'next';
import Link from 'next/link';
import { loadCashFlow } from '@/lib/finance/queries';
import { one, type Params } from '@/lib/finance/params';
import { periodLabel } from '@/lib/finance/periods';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, Provenance, LedgerRow, PlainFigure, DateCell } from '@/components/admin/finance/primitives';
import { ExportButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Cash flow' };

export default async function CashFlowPage({ searchParams }: { searchParams: Params }) {
  const months = Math.min(24, Math.max(3, Number.parseInt(one(searchParams, 'months', 3) ?? '6', 10) || 6));
  const result = await loadCashFlow(months);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Cash flow" /><ErrorNotice title="Cash flow could not be built.">{result.error}</ErrorNotice></>;
  const c = result.data;
  const p = c.projection;
  return (
    <>
      <PageHeader eyebrow="Finance" title="Cash flow" description="Money that actually moved, by month and source; then what is committed, expected and estimated for the next 30, 60 and 90 days. Projected revenue is not cash." actions={<ExportButton kind="cash_flow" from={`${c.months[0]?.month ?? '2026-01'}-01`} to={p.asOf} label="Export cash-flow report" />} />
      {!c.openingKnown && <div className="mb-5"><Notice tone="caution" title="No opening balance.">Record each account&apos;s opening balance and date under Settings → Accounts. Until then movements are shown but the running balance and free cash stay unknown rather than guessed.</Notice></div>}
      <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
        <PlainFigure label="Cash now" cents={p.cashNowCents} provenance={p.cashNowCents === null ? 'unknown' : 'calculated'} note="opening balances + recorded movements" />
        {p.horizons.map((h) => <PlainFigure key={h.days} label={`Projected · ${h.days} days`} cents={h.projectedCents} provenance="projected" note={`+${(h.committedInCents / 100).toFixed(0)} committed +${(h.expectedInCents / 100).toFixed(0)} expected −${(h.liabilitiesCents / 100).toFixed(0)} liabilities −${(h.estimatedTaxCents / 100).toFixed(0)} tax`} />)}
      </div>
      <div className="grid gap-8 lg:grid-cols-2 mt-2">
        <Section title="Actual movements" meta={<span className="bc-seg">{[3, 6, 12].map((m) => <Link key={m} href={`/admin/finance/cash-flow?months=${m}`} aria-current={m === months ? 'true' : undefined}>{m} months</Link>)}</span>} id="actual">
          <div className="bc-ledger mt-2">
            {c.months.map((m) => (
              <details key={m.month} className="bc-details" open={m === c.months[c.months.length - 1]}>
                <summary className="bc-ledger-row" data-total="true" style={{ cursor: 'pointer' }}><span>{periodLabel(m.month)} <span className="bc-meta">opening {m.openingCents === null ? '—' : (m.openingCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></span><Money cents={m.netCents} signed /></summary>
                {m.inflows.map((i) => <LedgerRow key={`in${i.label}`} label={i.label} cents={i.cents} level={1} />)}
                {m.outflows.map((o) => <LedgerRow key={`out${o.label}`} label={o.label} cents={-o.cents} level={1} />)}
                <div className="bc-ledger-row" data-level="1"><span>Closing</span><Money cents={m.closingCents} /></div>
              </details>
            ))}
          </div>
        </Section>
        <Section title="Next 90 days" meta="each line labelled by certainty" id="projection">
          <div className="bc-rows">
            {p.lines.slice(0, 40).map((l, i) => (
              <div key={`${l.dueOn}${i}`} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto' }}>
                <span className="bc-num" style={{ minWidth: 92 }}><DateCell iso={l.dueOn} /></span>
                <span className="min-w-0 truncate">{l.href ? <Link href={l.href}>{l.label}</Link> : l.label}</span>
                <Provenance value={l.certainty} />
                <Money cents={l.cents} signed />
              </div>
            ))}
            {p.lines.length === 0 && <p className="bc-meta">Nothing committed or expected in the horizon.</p>}
          </div>
          <p className="bc-meta mt-3" style={{ fontSize: 12 }}>Committed: confirmed stays not yet paid (direct) and unpaid invoices by due date. Expected: Booking.com payouts after commission, 14 days after check-out (estimate). Estimated: tax deadlines with an amount. Enquiries and unconfirmed bookings are not counted.</p>
        </Section>
      </div>
      <Section title="Accounts and recent movements" id="accounts">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] mt-2">
          <table className="bc-mini-table"><thead><tr><th>Account</th><th>Kind</th><th className="num">Opening</th></tr></thead><tbody>{c.accounts.map((a) => <tr key={a.id}><td>{a.label}<div className="bc-meta">{a.iban_masked ?? ''}</div></td><td>{a.kind}</td><td className="num">{a.opening_balance_on ? <><Money cents={a.opening_balance_cents} /><div className="bc-meta">{a.opening_balance_on}</div></> : <span className="dim">not set</span>}</td></tr>)}{c.accounts.length === 0 && <tr><td colSpan={3} className="bc-meta">No account registered. <Link href="/admin/finance/settings">Settings →</Link></td></tr>}</tbody></table>
          <div className="bc-rows">{c.recent.slice(0, 15).map((pm) => <div key={pm.id} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}><span className="bc-meta whitespace-nowrap"><When value={pm.occurred_at} /></span><span className="min-w-0 truncate">{pm.counterparty_label ?? pm.source} · {pm.reference_text ?? pm.provider_reference} <span className="bc-badge ghost" data-tone={pm.reconciliation_state === 'matched' ? 'positive' : 'caution'}>{pm.reconciliation_state.replace('_', ' ')}</span></span><Money cents={pm.direction === 'in' ? pm.amount_cents : -pm.amount_cents} signed /></div>)}</div>
        </div>
      </Section>
    </>
  );
}
