import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadReconciliation, unitNamer } from '@/lib/finance/queries';
import { one, type Params } from '@/lib/finance/params';
import { KIND_LABEL } from '@/lib/finance/presentation';
import { RECONCILIATION_RULES_VERSION } from '@/lib/finance/reconciliation';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, StateBadge, PlainFigure, DateCell } from '@/components/admin/finance/primitives';
import { ConfirmMatchButtons, RunReconciliationButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Reconciliation' };

/**
 * Booking ↔ revenue ↔ payment ↔ payout ↔ document, made explicit. Left:
 * what has no cash fact; right: cash with no explanation; middle: what the
 * rules propose, each with its rule, confidence and reason.
 */
export default async function ReconciliationPage({ searchParams }: { searchParams: Params }) {
  const focusPayment = one(searchParams, 'payment', 60);
  const [result, operator] = await Promise.all([loadReconciliation(), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Reconciliation" /><ErrorNotice title="Reconciliation could not be loaded.">{result.error}</ErrorNotice></>;
  const r = result.data;
  const mayReview = can(operator?.role, 'finance.review') && !operator?.preview;
  const name = unitNamer(r.units);
  const forReview = r.proposals.filter((p) => !p.autoApply);
  const auto = r.proposals.filter((p) => p.autoApply);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Reconciliation" description={`Deterministic rules ${RECONCILIATION_RULES_VERSION}. Exact and high-confidence matches are recorded automatically on every run; medium ones wait here. Nothing fuzzy is ever recorded silently.`} actions={mayReview ? <RunReconciliationButton /> : undefined} />
      <div className="bc-figures" style={{ ['--cols' as string]: 4 }}>
        <PlainFigure label="Open facts (no cash)" value={String(r.open.length)} provenance="actual" note={<Money cents={r.open.reduce((s, t) => s + Math.abs(t.gross_cents), 0)} />} />
        <PlainFigure label="Unmatched money" value={String(r.payments.length)} provenance="actual" note={<Money cents={r.payments.reduce((s, p) => s + p.amount_cents, 0)} />} />
        <PlainFigure label="Mismatches" value={String(r.counts.mismatches)} provenance="actual" href="/admin/finance/transactions?reconciliation=mismatch" />
        <PlainFigure label="Ready to auto-match on next run" value={String(auto.length)} provenance="calculated" />
      </div>

      {(forReview.length > 0 || r.pending.length > 0) && (
        <Section title="Proposed — confirm or reject" meta="medium confidence: same amount and date, or a payout bundle" id="proposals">
          <div className="bc-rows">
            {forReview.map((p) => {
              const t = r.open.find((x) => x.id === p.transactionId);
              const pay = r.payments.find((x) => x.id === p.paymentId);
              return (
                <div key={`${p.transactionId}${p.paymentId}`} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="bc-mono bc-meta">{p.rule}</span><span className="bc-badge ghost" data-tone="caution">{p.confidence}</span>{t && <Link href={`/admin/finance/transactions/${t.id}`} className="bc-ref">{t.booking_reference ?? t.description}</Link>}{pay && <span className="bc-meta">↔ {pay.source} {pay.provider_reference} · <When value={pay.occurred_at} /></span>}</div>
                    <p className="bc-prose mt-1" style={{ fontSize: 13 }}>{p.reason}</p>
                    {mayReview && <div className="mt-2"><ConfirmMatchButtons transactionId={p.transactionId} paymentId={p.paymentId} amountCents={p.amountCents} /></div>}
                  </div>
                  <Money cents={p.amountCents} />
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Facts without money" meta={`${r.open.length} · revenue waiting for a capture or payout, expenses waiting for a bank line`} id="open">
          <div className="bc-rows">
            {r.open.slice(0, 60).map((t) => (
              <Link key={t.id} href={`/admin/finance/transactions/${t.id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                <span className="bc-num" style={{ minWidth: 88 }}><DateCell iso={t.booked_on} /></span>
                <span className="min-w-0 truncate">{KIND_LABEL[t.kind] ?? t.kind} · {t.booking_reference ?? t.counterparty_label ?? t.description} <span className="bc-meta">· {name(t.unit_id)}</span> <StateBadge table="reconciliation" value={t.reconciliation_state} ghost /></span>
                <Money cents={t.gross_cents} />
              </Link>
            ))}
            {r.open.length === 0 && <p className="bc-meta">Every posted fact has its money.</p>}
          </div>
        </Section>
        <Section title="Money without a fact" meta={`${r.payments.length} · receipts and payments nothing explains yet`} id="payments">
          <div className="bc-rows">
            {r.payments.slice(0, 60).map((p) => (
              <div key={p.id} id={`payment-${p.id}`} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto', background: focusPayment === p.id ? 'hsl(var(--bc-accent-wash))' : undefined }}>
                <span className="bc-num" style={{ minWidth: 88 }}><When value={p.occurred_at} /></span>
                <span className="min-w-0 truncate">{p.direction === 'in' ? '↓' : '↑'} {p.source} · {p.counterparty_label ?? '—'} <span className="bc-meta">· {p.reference_text ?? p.provider_reference}</span> <StateBadge table="reconciliation" value={p.reconciliation_state} ghost /></span>
                <Money cents={p.direction === 'in' ? p.amount_cents : -p.amount_cents} signed />
              </div>
            ))}
            {r.payments.length === 0 && <p className="bc-meta">Every recorded movement is explained.</p>}
          </div>
          <div className="mt-3"><Notice tone="neutral">An unexplained receipt is usually a stay whose facts are not yet ingested, or a payout for a statement not yet imported. Post the expense (with its invoice) for an unexplained payment; never adjust the payment.</Notice></div>
        </Section>
      </div>

      <Section title="How matching works" id="rules">
        <table className="bc-mini-table mt-2">
          <thead><tr><th>Rule</th><th>Condition</th><th>Confidence</th><th>Recorded as</th></tr></thead>
          <tbody>
            <tr><td>R1 booking-key exact</td><td>same booking, same currency, payment = gross (or several payments summing to it)</td><td>exact</td><td>matched, automatically</td></tr>
            <tr><td>R2 booking-key partial</td><td>same booking, payment &lt; gross</td><td>high</td><td>partially matched, automatically</td></tr>
            <tr><td>R3 booking-key mismatch</td><td>same booking, payment &gt; gross</td><td>high</td><td>mismatch — a person decides</td></tr>
            <tr><td>R4 reference-text</td><td>bank text names the reference or invoice number, same amount, ≤ 45 days</td><td>high</td><td>matched, automatically</td></tr>
            <tr><td>R5 amount-date</td><td>same amount within 10 days, unique on both sides</td><td>medium</td><td>proposed — confirm here</td></tr>
            <tr><td>R6 payout-bundle</td><td>a Booking.com payout equals the sum of 2–40 open stays in 45 days</td><td>medium</td><td>proposed — confirm against the statement</td></tr>
          </tbody>
        </table>
        <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Recent automatic matches: {r.recentMatches.filter((m) => m.matched_by.startsWith('system')).length} on the open facts shown. Every match row keeps rule, version, confidence, reason and actor.</p>
      </Section>
    </>
  );
}
