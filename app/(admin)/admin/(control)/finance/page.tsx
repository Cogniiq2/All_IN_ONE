import type { Metadata } from 'next';
import Link from 'next/link';
import { loadFinanceOverview, loadImports } from '@/lib/finance/queries';
import { loadFinanceHealth } from '@/lib/finance/queries';
import { loadBookingFreshness, loadPerformance } from '@/lib/admin/queries';
import { payoutFreshness } from '@/lib/admin/freshness';
import { formatCents } from '@/lib/finance/money';
import { addMonths, monthRange, periodLabel, ytd } from '@/lib/finance/periods';
import { compactUnitName, percent, propertyTodayIso } from '@/lib/admin/format';
import { sourcePresentation } from '@/lib/admin/presentation';
import { PageHeader, Section, ErrorNotice, Notice, HealthBadge, Metric } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { FigureTile, PlainFigure, Money, Pct, Bars, Gauge, Provenance, LedgerRow } from '@/components/admin/finance/primitives';
import { InboxRow } from '@/components/admin/finance/inbox-row';

export const metadata: Metadata = { title: 'Finance' };

/**
 * The finance command centre. Attention first; then the four questions —
 * what did we earn, what did we spend, what do we owe, what is free to use;
 * then the trend, the reserve and the calendar. Every figure carries its
 * provenance and links to the ledger that explains it.
 */
export default async function FinanceOverviewPage() {
  const today = propertyTodayIso();
  const thisMonth = today.slice(0, 7);
  const nextMonth = addMonths(today, 1).slice(0, 7);
  const [result, health, month, next, year, imports, freshness] = await Promise.all([
    loadFinanceOverview(),
    loadFinanceHealth(),
    loadPerformance(monthRange(thisMonth)),
    loadPerformance(monthRange(nextMonth)),
    loadPerformance(ytd(today)),
    loadImports(),
    loadBookingFreshness(),
  ]);
  const awaiting = imports.ok ? imports.data.batches.filter((b) => b.status === 'validated') : [];
  const awaitingRows = awaiting.reduce((n, b) => n + b.valid_rows, 0);
  const lastStatement = imports.ok ? imports.data.batches.filter((b) => b.source_type === 'booking_com_finance_statement' && b.status === 'imported').map((b) => b.imported_at ?? b.created_at).sort().at(-1) ?? null : null;
  const payouts = payoutFreshness(lastStatement, awaiting.length, new Date());
  const ledgerEmpty = result.ok && result.data.revenueYtd.cents === 0 && result.data.expensesYtd.cents === 0 && result.data.trend.every((m) => m.revenueCents === 0 && m.costsCents === 0);

  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Money" title="Money" description="Income, costs and tax." />
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
        eyebrow="Money"
        // "Everything reconciled" used to show whenever the to-do list was
        // empty — even with nothing imported. The title now only names money;
        // what needs a person is said in the line below.
        title="Money"
        description={<span className="inline-flex flex-wrap items-center gap-1.5"><span>{allClear ? 'Nothing in Money is waiting for you.' : `${o.inbox.length} item${o.inbox.length === 1 ? ' needs' : 's need'} you — see To do.`}</span>{chips.map((c) => <span key={c.label} className="bc-badge ghost" data-tone={c.tone}>{c.label}</span>)}<span className="bc-meta">· {o.inboxCounts.critical} critical · {o.inboxCounts.high} high · {o.inboxCounts.elevated + o.inboxCounts.watch} lower</span></span>}
        actions={<RefreshControl loadedAt={result.loadedAt} every={120} />}
      />

      {/* Stale or incomplete figures are announced before any figure is read. */}
      {(health.status === 'degraded' || health.status === 'unavailable') && (
        <ErrorNotice title="The figures below may be incomplete or out of date.">
          {health.summary} <Link href="#health" className="link-quiet">Finance health →</Link>
        </ErrorNotice>
      )}

      {/* ── Attention ────────────────────────────────────────────── */}
      <section aria-labelledby="fin-attn">
        <div className="bc-section-head" style={{ borderBottom: 'none', marginBottom: 12, paddingBottom: 0 }}>
          <h2 id="fin-attn" className="bc-h2">Needs a person</h2>
          {o.inbox.length > 0 && <Link href="/admin/finance/inbox" className="bc-meta link-quiet">Open To do · {o.inbox.length} →</Link>}
        </div>
        {allClear ? (
          <Notice tone="positive" icon="check">No missing documents, no unmatched money, no classification waiting. The next filing is {o.nextDeadlines[0] ? `${o.nextDeadlines[0].label} in ${o.nextDeadlines[0].daysLeft} days` : 'not within the calendar horizon'}.</Notice>
        ) : (
          <div className="bc-rows bc-panel" style={{ padding: '0 4px' }}>
            {(urgent.length > 0 ? urgent : o.inbox).slice(0, 5).map((item) => <InboxRow key={item.id} item={item} compact />)}
          </div>
        )}
      </section>

      {/* ── How current each layer is ─────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-2" role="status" style={{ fontSize: 12.5 }}>
        <span className="bc-badge ghost" data-tone={freshness.state === 'current' ? 'positive' : freshness.state === 'delayed' ? 'caution' : 'critical'}>
          <i className="bc-glyph" data-glyph={freshness.state === 'current' ? 'check' : 'alert'} aria-hidden="true" />
          {freshness.state === 'current' ? 'Booking performance current' : 'Booking performance may be out of date'} · {freshness.headline.replace('Bookings updated', 'updated')}
        </span>
        <span className="bc-badge ghost" data-tone={payouts.updatedAt ? 'neutral' : 'caution'}>
          <i className="bc-glyph" data-glyph={payouts.updatedAt ? 'clock' : 'dash'} aria-hidden="true" />
          {payouts.headline}
        </span>
        <span className="bc-badge ghost" data-tone="muted">Bank: not connected</span>
      </div>
      {freshness.warning && (
        <div className="mb-5">
          <Notice tone="caution" title="Booked figures may be out of date">{freshness.warning}</Notice>
        </div>
      )}

      {/* ── Statements waiting for a decision ────────────────────── */}
      {awaiting.length > 0 && (
        <Notice tone="caution" title={`${awaiting.length} statement ${awaiting.length === 1 ? 'file is' : 'files are'} checked but not yet imported`}>
          {awaitingRows} Booking.com settlement {awaitingRows === 1 ? 'line' : 'lines'} (gross, commission and payout per reservation) {awaitingRows === 1 ? 'is' : 'are'} parsed and valid, but nothing from{' '}
          {awaiting.length === 1 ? 'it' : 'them'} is in any figure until an operator reviews the preview and presses “Import valid rows”. Importing is deliberate — it posts money to the
          ledger — and can be reviewed line by line first.{' '}
          {awaiting.map((b) => (
            <Link key={b.id} href={`/admin/finance/imports/${b.id}`} className="link-quiet" style={{ marginRight: 10 }}>
              Review and import {b.filename} →
            </Link>
          ))}
        </Notice>
      )}

      {/* ── Booked, from reservations ────────────────────────────── */}
      <Section
        title="Booked revenue"
        meta={<span>gross booking value from the synchronised reservations · every channel · cancelled stays excluded · not payout, not cash, not profit</span>}
        id="booked"
      >
        <div className="bc-metrics mt-4" style={{ ['--cols' as string]: 3 }}>
          <Metric label={`Booked · ${periodLabel(thisMonth)}`} value={month.ok ? <Money cents={month.data.stayGrossCents} /> : ''} unavailable={!month.ok} note={month.ok ? `${month.data.occupiedNights} booked nights` : undefined} />
          <Metric label={`Booked · ${periodLabel(nextMonth)}`} value={next.ok ? <Money cents={next.data.stayGrossCents} /> : ''} unavailable={!next.ok} note={next.ok ? `${next.data.occupiedNights} booked nights so far` : undefined} />
          <Metric label={`Booked · ${today.slice(0, 4)} to date`} value={year.ok ? <Money cents={year.data.stayGrossCents} /> : ''} unavailable={!year.ok} note={year.ok ? `${year.data.occupiedNights} booked nights since 1 January` : undefined} />
        </div>
        {month.ok && year.ok && (
          <div className="bc-metrics mt-3" style={{ ['--cols' as string]: 4 }}>
            <Metric label="ADR this month" value={<Money cents={month.data.adr.value === null ? null : Math.round(month.data.adr.value)} />} note="gross ÷ booked nights" unavailable={month.data.adr.value === null} />
            <Metric label="Occupancy this month" value={<Pct ratio={month.data.occupancy.value} digits={0} />} note={`${month.data.occupiedNights} of ${month.data.availableNights} apartment nights`} unavailable={month.data.occupancy.value === null} />
            <Metric label="ADR year to date" value={<Money cents={year.data.adr.value === null ? null : Math.round(year.data.adr.value)} />} note="gross ÷ booked nights" unavailable={year.data.adr.value === null} />
            <Metric label="Occupancy year to date" value={<Pct ratio={year.data.occupancy.value} digits={0} />} note={`${year.data.occupiedNights} of ${year.data.availableNights} apartment nights`} unavailable={year.data.occupancy.value === null} />
          </div>
        )}
        {year.ok && (
          <div className="mt-3 grid gap-x-10 gap-y-1 md:grid-cols-2">
            <p className="bc-meta" style={{ fontSize: 12.5 }}>
              By apartment, year to date: {year.data.byUnit.map((u) => `${compactUnitName(u.displayName)} ${formatCents(u.grossCents)} · ${u.nights} nights · ${percent(u.occupancy.value)}`).join(' — ') || 'no booked night yet'}
            </p>
            <p className="bc-meta" style={{ fontSize: 12.5 }}>
              By channel, year to date: {year.data.byChannel.filter((c) => c.nights > 0).map((c) => `${sourcePresentation(c.source).label} ${formatCents(c.grossCents)} (${c.share === null ? `${c.nights} nights` : percent(c.share)})`).join(' · ') || 'no booked night yet'}
            </p>
          </div>
        )}
        <p className="bc-meta mt-3" style={{ fontSize: 12 }}>
          Definitions: booked revenue is the gross stay value Beds24 reports, allocated to the nights of each stay inside the period; ADR is that gross divided by booked nights; occupancy is booked nights divided by
          the bookable apartments × nights in the period (two apartments, counted separately). Booked ≠ settled: what Booking.com actually pays out, after commission, is in the settlements below once the
          statements are imported; what reaches the bank is in Transactions; profit needs the expenses too.
        </p>
      </Section>

      {ledgerEmpty && (
        <Notice tone="neutral" title="The accounting figures below are empty because no money has been posted yet">
          Posted revenue, expenses, cash and the twelve-month trend come from imported Booking.com statements, bank statements and recorded expenses — none has been imported so far. They are not
          wrong; they are waiting for their sources. The booked revenue above is live.
        </Notice>
      )}

      {/* ── Position ─────────────────────────────────────────────── */}
      <Section title="Settled and posted" meta={<span>from imported statements and recorded expenses · profit is not cash, and the rows are kept apart on purpose</span>} id="position">
        <div className="grid gap-4 mt-4">
          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <FigureTile label="Posted revenue · month to date" figure={o.revenueMtd} note="net, from imported settlements" />
            <FigureTile label="Expenses · month to date" figure={o.expensesMtd} note="net, excl. company taxes" />
            <FigureTile label="Operating result · MTD" figure={o.operatingMtd} note="revenue − expenses" />
            <FigureTile label="Committed · next 30 days" figure={o.committedRevenueNext30} />
          </div>
          <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
            <FigureTile label="Posted revenue · year to date" figure={o.revenueYtd} note="net, from imported settlements" />
            <FigureTile label="Expenses · year to date" figure={o.expensesYtd} note="net" />
            <FigureTile label="Operating result · YTD" figure={o.operatingYtd} note="before depreciation and taxes" />
            <PlainFigure label="Estimated tax reserve required" cents={o.taxReserve.requiredCents} provenance={o.taxReserve.containsEstimates ? 'estimated' : 'reviewed'} note="by tax type →" href="/admin/finance/taxes#reserve" />
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
