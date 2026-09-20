import type { Metadata } from 'next';
import Link from 'next/link';
import { loadFinanceOverview } from '@/lib/finance/queries';
import { loadFinanceHealth } from '@/lib/finance/queries';
import { formatCents } from '@/lib/finance/money';
import { periodLabel } from '@/lib/finance/periods';
import { PageHeader, Section, ErrorNotice, Notice, HealthBadge } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { FigureTile, PlainFigure, Money, Bars, Gauge, Provenance, LedgerRow } from '@/components/admin/finance/primitives';
import { InboxRow } from '@/components/admin/finance/inbox-row';

export const metadata: Metadata = { title: 'Finance' };

/**
 * The finance command centre. Attention first; then the four questions —
 * what did we earn, what did we spend, what do we owe, what is free to use;
 * then the trend, the reserve and the calendar. Every figure carries its
 * provenance and links to the ledger that explains it.
 */
export default async function FinanceOverviewPage() {
  const [result, health] = await Promise.all([loadFinanceOverview(), loadFinanceHealth()]);

  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Finance" description="Finance operations, management accounting and tax estimation." />
        <ErrorNotice title="Finance could not be loaded.">{result.error}</ErrorNotice>
      </>
    );
  }
  const o = result.data;
  const urgent = o.inbox.filter((i) => i.level === 'critical' || i.level === 'high');
  const allClear = o.inbox.length === 0;
  const chips: Array<{ label: string; tone: string }> = [];
  if (o.mode === 'preview') chips.push({ label: 'Preview data', tone: 'caution' });
  if (o.mode === 'fixture') chips.push({ label: 'Development fixtures', tone: 'caution' });
  chips.push({ label: `VAT ${o.config.calendar.vatFilingFrequency}${o.config.calendar.dauerfristverlaengerung ? ' · Dauerfrist' : ''}`, tone: 'neutral' });
  chips.push({ label: o.config.issuerTaxIdConfigured ? 'Issuer configured' : 'Issuer identity missing', tone: o.config.issuerTaxIdConfigured ? 'positive' : 'caution' });

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title={allClear ? 'Everything reconciled' : `${o.inbox.length} item${o.inbox.length === 1 ? '' : 's'} require attention`}
        description={<span className="inline-flex flex-wrap items-center gap-1.5">{chips.map((c) => <span key={c.label} className="bc-badge ghost" data-tone={c.tone}>{c.label}</span>)}<span className="bc-meta">· {o.inboxCounts.critical} critical · {o.inboxCounts.high} high · {o.inboxCounts.elevated + o.inboxCounts.watch} lower</span></span>}
        actions={<RefreshControl loadedAt={result.loadedAt} every={120} />}
      />

      {/* ── Attention ────────────────────────────────────────────── */}
      <section aria-labelledby="fin-attn">
        <div className="bc-section-head" style={{ borderBottom: 'none', marginBottom: 12, paddingBottom: 0 }}>
          <h2 id="fin-attn" className="bc-h2">Needs a person</h2>
          {o.inbox.length > 0 && <Link href="/admin/finance/inbox" className="bc-meta link-quiet">Open the Finance Inbox · {o.inbox.length} →</Link>}
        </div>
        {allClear ? (
          <Notice tone="positive" icon="check">No missing documents, no unmatched money, no classification waiting. The next filing is {o.nextDeadlines[0] ? `${o.nextDeadlines[0].label} in ${o.nextDeadlines[0].daysLeft} days` : 'not within the calendar horizon'}.</Notice>
        ) : (
          <div className="bc-rows bc-panel" style={{ padding: '0 4px' }}>
            {(urgent.length > 0 ? urgent : o.inbox).slice(0, 5).map((item) => <InboxRow key={item.id} item={item} compact />)}
          </div>
        )}
      </section>

      {/* ── Position ─────────────────────────────────────────────── */}
      <Section title="Financial position" meta={<span>Profit is not cash. The four rows below are kept apart on purpose.</span>} id="position">
        <div className="grid gap-4 mt-4">
          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <FigureTile label="Revenue · month to date" figure={o.revenueMtd} note="net, posted facts" />
            <FigureTile label="Expenses · month to date" figure={o.expensesMtd} note="net, excl. company taxes" />
            <FigureTile label="Operating result · MTD" figure={o.operatingMtd} note="revenue − expenses" />
            <FigureTile label="Committed · next 30 days" figure={o.committedRevenueNext30} />
          </div>
          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <FigureTile label="Revenue · year to date" figure={o.revenueYtd} note="net" />
            <FigureTile label="Expenses · year to date" figure={o.expensesYtd} note="net" />
            <FigureTile label="Operating result · YTD" figure={o.operatingYtd} note="before depreciation and taxes" />
            <PlainFigure label="Estimated tax reserve required" cents={o.taxReserve.requiredCents} provenance={o.taxReserve.containsEstimates ? 'estimated' : 'reviewed'} note={<Link href="/admin/finance/taxes#reserve" className="link-quiet">by tax type →</Link>} href="/admin/finance/taxes#reserve" />
          </div>
          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <FigureTile label="Cash" figure={o.cash} />
            <FigureTile label="Open receivables" figure={o.receivables} />
            <FigureTile label="Open liabilities" figure={o.liabilities} />
            <PlainFigure label="Free cash after reserves" cents={o.freeCash.freeCashCents} provenance={o.freeCash.freeCashCents === null ? 'unknown' : 'estimated'} note={o.freeCash.freeCashCents === null ? 'Record an account opening balance' : 'cash − tax reserve − liabilities − other reserves'} href="/admin/finance/cash-flow" />
          </div>
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── Trend ──────────────────────────────────────────────── */}
        <Section title="Twelve months" meta={<span>revenue (champagne) against costs (stone), net by month</span>} id="trend">
          <div className="bc-panel mt-3" style={{ padding: '12px 16px 10px' }}>
            <Bars points={o.trend.slice(-12)} />
          </div>
          <div className="mt-3 bc-ledger">
            {o.trend.slice(-3).reverse().map((m) => (
              <LedgerRow key={m.month} label={periodLabel(m.month)} cents={m.operatingResultCents} meta={`${formatCents(m.revenueCents)} − ${formatCents(m.costsCents)}`} href={`/admin/finance/profit-loss?from=${m.month}-01&to=${m.month.slice(0, 4)}-${String(Number(m.month.slice(5, 7)) % 12 + 1).padStart(2, '0')}-01`} />
            ))}
          </div>
        </Section>

        {/* ── Reserve and calendar ────────────────────────────────── */}
        <div>
          <Section title="Tax reserve" meta={<Link href="/admin/finance/taxes#reserve">Detail →</Link>} id="reserve">
            <div className="bc-panel mt-3" style={{ padding: '14px 16px' }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="bc-label">Coverage</span>
                <span className="bc-display" style={{ fontSize: 24 }}>{o.taxReserve.coverage === null ? '—' : `${Math.round(o.taxReserve.coverage * 100)} %`}</span>
              </div>
              <div className="mt-2"><Gauge ratio={o.taxReserve.coverage} /></div>
              <dl className="bc-kv mt-3">
                <div className="contents"><dt>Required</dt><dd><Money cents={o.taxReserve.requiredCents} /> <Provenance value={o.taxReserve.containsEstimates ? 'estimated' : 'reviewed'} /></dd></div>
                <div className="contents"><dt>Declared as held</dt><dd><Money cents={o.taxReserve.heldCents} /> <Provenance value="actual" /></dd></div>
                <div className="contents"><dt>Gap</dt><dd><Money cents={o.taxReserve.gapCents} /></dd></div>
              </dl>
              {o.taxReserve.byTaxType.length > 0 && (
                <div className="bc-ledger mt-3">
                  {o.taxReserve.byTaxType.map((t) => <LedgerRow key={t.taxType} label={t.taxType.toUpperCase()} cents={t.requiredCents} level={1} href={`/admin/finance/${t.taxType === 'vat' ? 'vat' : 'taxes'}`} />)}
                </div>
              )}
            </div>
          </Section>

          <Section title="Upcoming" meta={<Link href="/admin/finance/taxes#calendar">Calendar →</Link>} id="upcoming">
            {o.nextDeadlines.length === 0 ? <p className="bc-meta mt-3">No deadline in the horizon.</p> : (
              <div className="bc-rows mt-1">
                {o.nextDeadlines.map((d) => (
                  <div key={`${d.taxType}${d.periodKey}${d.kind}`} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                    <span className="bc-num" style={{ minWidth: 64 }}>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.dueOn}T12:00:00Z`))}</span>
                    <span className="min-w-0 truncate">{d.label}{d.origin === 'official' && <span className="bc-badge ghost ml-2" data-tone="positive">official</span>}</span>
                    <span className="bc-badge" data-tone={d.urgency === 'overdue' ? 'critical' : d.urgency === 'due_soon' ? 'caution' : 'neutral'}>{d.daysLeft < 0 ? `${-d.daysLeft} d overdue` : `${d.daysLeft} d`}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* ── Documents and health ─────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Documents and readiness" meta={<Link href="/admin/finance/accountant">Accountant view →</Link>} id="docs">
          <div className="bc-figures mt-3" style={{ ['--cols' as string]: 3 }}>
            <PlainFigure label="Expenses this year" value={String(o.documents.total)} provenance="actual" />
            <PlainFigure label="Documents complete" value={String(o.documents.complete)} provenance="actual" href="/admin/finance/documents" />
            <PlainFigure label="Missing documents" value={String(o.documents.missing)} provenance="actual" href="/admin/finance/transactions?document=missing" note={o.documents.missing === 0 ? 'No overdue documents' : undefined} />
          </div>
          <dl className="bc-kv mt-4" style={{ fontSize: 13 }}>
            <div className="contents"><dt>Lines needing review</dt><dd><Link href="/admin/finance/transactions?review=needs_review">{o.exceptionCounts.lines_needing_review}</Link></dd></div>
            <div className="contents"><dt>Reverse-charge / input-VAT review</dt><dd><Link href="/admin/finance/vat">{o.exceptionCounts.input_vat_review + o.exceptionCounts.tax_code_review}</Link></dd></div>
            <div className="contents"><dt>Unmatched payments</dt><dd><Link href="/admin/finance/reconciliation">{o.exceptionCounts.unmatched_payments}</Link></dd></div>
            <div className="contents"><dt>Asset candidates</dt><dd><Link href="/admin/finance/transactions?asset=candidate">{o.exceptionCounts.asset_candidates}</Link></dd></div>
          </dl>
        </Section>
        <Section title="Finance health" meta={<HealthBadge status={health.status} />} id="health">
          <p className="bc-prose mt-3" style={{ fontSize: 13 }}>{health.summary}</p>
          {health.facts.length > 0 && (
            <dl className="mt-4 grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', fontSize: 12.5 }}>
              {health.facts.map((f) => (
                <div key={f.label}>
                  <dt className="bc-label" style={{ letterSpacing: '0.1em' }}>{f.label}</dt>
                  <dd className="mt-1 bc-num" style={{ color: f.tone ? `hsl(var(--bc-${f.tone === 'muted' ? 'text-3' : f.tone}))` : undefined, fontWeight: f.tone === 'critical' || f.tone === 'caution' ? 600 : 500 }}>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      </div>
    </>
  );
}
