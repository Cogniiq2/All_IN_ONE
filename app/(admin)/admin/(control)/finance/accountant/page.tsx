import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadAccountant } from '@/lib/finance/queries';
import { periodLabel } from '@/lib/finance/periods';
import { EXPORT_LABEL, type ExportKind } from '@/lib/finance/export/builders';
import { DATEV_STATUS } from '@/lib/finance/export/datev';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, StateBadge } from '@/components/admin/finance/primitives';
import { ExportButton } from '@/components/admin/finance/controls';
import { PeriodControls } from '@/components/admin/finance/period-controls';

export const metadata: Metadata = { title: 'Accountant' };

const READINESS: Record<string, { label: string; tone: string }> = {
  not_ready: { label: 'NOT READY', tone: 'caution' }, ready_for_review: { label: 'READY FOR REVIEW', tone: 'progress' }, accountant_reviewed: { label: 'ACCOUNTANT REVIEWED', tone: 'positive' }, locked: { label: 'LOCKED', tone: 'positive' },
};

const EXPORT_KINDS: ExportKind[] = ['transaction_ledger', 'revenue_ledger', 'expense_ledger', 'payments_ledger', 'vat_report', 'reverse_charge_report', 'booking_com_commission', 'profit_loss', 'cash_flow', 'property_profitability', 'tax_estimate', 'tax_adjustments', 'missing_documents', 'asset_candidates', 'accountant_review'];

export default async function AccountantPage() {
  const [result, operator] = await Promise.all([loadAccountant(), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Accountant" /><ErrorNotice title="The accountant view could not be loaded.">{result.error}</ErrorNotice></>;
  const a = result.data;
  const mayReview = can(operator?.role, 'finance.review') && !operator?.preview;
  const mayTax = can(operator?.role, 'finance.tax_review') && !operator?.preview;
  const mayExport = can(operator?.role, 'finance.export') && !operator?.preview;
  return (
    <>
      <PageHeader eyebrow="Finance · accounting preparation" title="Accountant" description="Per month: what is complete, what is not, and whether the period may be handed over. A period cannot become ready while lines are unclassified, documents are missing or money mismatches. Locking is the accountant path." />
      <Section title="Periods" meta="last twelve months" id="periods">
        <div className="bc-table-wrap mt-2">
          <table className="bc-table">
            <thead><tr><th scope="col">Period</th><th scope="col">Status</th><th scope="col" className="num">Transactions</th><th scope="col" className="num">Revenue net</th><th scope="col" className="num">Expenses net</th><th scope="col">Documents</th><th scope="col" className="num">Unclassified</th><th scope="col" className="num">VAT / RC review</th><th scope="col" className="num">Unreconciled</th><th scope="col" className="num">Assets</th><th scope="col">Readiness</th></tr></thead>
            <tbody>
              {a.periods.map((p) => (
                <tr key={p.period.period_key}>
                  <td style={{ fontWeight: 600 }}>{periodLabel(p.period.period_key)}</td>
                  <td><StateBadge table="period" value={p.period.status} ghost /></td>
                  <td className="num">{p.transactions}</td>
                  <td className="num"><Money cents={p.revenueNetCents} /></td>
                  <td className="num"><Money cents={p.expenseNetCents} /></td>
                  <td>{p.documentsComplete} complete{p.documentsMissing > 0 && <span style={{ color: 'hsl(var(--bc-critical))' }}> · {p.documentsMissing} missing</span>}</td>
                  <td className="num">{p.unclassified > 0 ? <Link href={`/admin/finance/transactions?review=needs_review&from=${p.period.starts_on}&to=${p.period.ends_on}`} style={{ color: 'hsl(var(--bc-caution))' }}>{p.unclassified}</Link> : 0}</td>
                  <td className="num">{p.vatReview} / {p.reverseChargeReview}</td>
                  <td className="num">{p.unreconciled}{p.mismatches > 0 && <span style={{ color: 'hsl(var(--bc-critical))' }}> · {p.mismatches} mismatch</span>}</td>
                  <td className="num">{p.assetCandidates}</td>
                  <td><span className="bc-badge" data-tone={READINESS[p.readiness].tone}>{READINESS[p.readiness].label}</span>{p.blockers.length > 0 && <div className="bc-meta mt-1">{p.blockers.join(' · ')}</div>}{(mayReview || mayTax) && <div className="mt-1"><PeriodControls periodKey={p.period.period_key} status={p.period.status} readiness={p.readiness} mayReview={mayReview} mayTax={mayTax} /></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Ready for review: no unclassified line, no mismatch, no missing document. Operators move a period to review; the accountant path (administrator) marks it reviewed, locks it, or reopens it with a note. After a lock nothing changes; corrections are posted into the open period.</p>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Exports" meta="each file carries period, timestamp, generator version; each export is recorded with its hash" id="exports">
          {mayExport ? (
            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {EXPORT_KINDS.map((k) => <ExportButton key={k} kind={k} from={a.periods[a.periods.length - 1]?.period.starts_on ?? '2026-01-01'} to={a.periods[0]?.period.ends_on ?? '2027-01-01'} label={EXPORT_LABEL[k]} />)}
            </div>
          ) : <p className="bc-meta mt-3">Exports are generated by operators.</p>}
          <p className="bc-meta mt-3" style={{ fontSize: 12 }}>Range: the twelve months shown above. Use the Revenue / Expenses / VAT / Taxes screens for a specific range.</p>
          {a.exports.length > 0 && (
            <div className="bc-rows mt-3">{a.exports.slice(0, 10).map((e) => <div key={e.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span className="min-w-0 truncate">{EXPORT_LABEL[e.export_kind as ExportKind] ?? e.export_kind} · {e.period_from} – {e.period_to} · {e.row_count} rows · <span className="bc-mono">{e.sha256.slice(0, 10)}…</span> · {e.generated_by}</span><When value={e.generated_at} relative /></div>)}</div>
          )}
        </Section>
        <div>
          <Section title="DATEV" meta={<span className="bc-badge" data-tone={a.datev.enabled ? 'positive' : 'caution'}>{a.datev.enabled ? 'export enabled' : 'gated'}</span>} id="datev">
            <p className="bc-prose mt-2" style={{ fontSize: 13 }}>{DATEV_STATUS}.</p>
            <ul className="bc-prose mt-2 grid gap-1" style={{ fontSize: 12.5 }}>{a.datev.reasons.map((r) => <li key={r}>· {r}</li>)}</ul>
            <details className="bc-details mt-3"><summary>Account mapping preview (proposals, not a file)</summary>
              <table className="bc-mini-table"><thead><tr><th>Beleg</th><th>Konto</th><th>BU</th><th>Text</th><th className="num">Umsatz</th><th>Blockers</th></tr></thead><tbody>{a.datevPreview.slice(0, 12).map((r, i) => <tr key={i}><td>{r.belegdatum} {r.belegfeld1}</td><td>{r.konto || <span className="dim">—</span>}</td><td>{r.buSchluessel || <span className="dim">—</span>}</td><td className="truncate" style={{ maxWidth: 200 }}>{r.buchungstext}</td><td className="num">{r.sollHaben} {r.umsatz}</td><td className="bc-meta">{r.blockers.join(', ') || 'none'}</td></tr>)}</tbody></table>
            </details>
            <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Categories with a confirmed account: {a.categories.filter((c) => c.datev_confirmed).length} of {a.categories.filter((c) => c.active).length}. The adviser confirms accounts on the category list (Settings) before any export can be validated.</p>
          </Section>
          <Section title="E-invoice" meta={<span className="bc-badge" data-tone={a.eInvoice.enabled ? 'positive' : 'caution'}>{a.eInvoice.enabled ? 'generation enabled' : 'receipt only'}</span>} id="einvoice">
            <p className="bc-prose mt-2" style={{ fontSize: 13 }}>XRechnung and ZUGFeRD files are accepted and kept as the original; the registry records the format. Generation is behind a validator gate.</p>
            <ul className="bc-prose mt-2 grid gap-1" style={{ fontSize: 12.5 }}>{a.eInvoice.reasons.map((r) => <li key={r}>· {r}</li>)}</ul>
          </Section>
        </div>
      </div>
      <Notice tone="neutral">BoLaGio Control is finance operations and accounting preparation. It is not the statutory general ledger and files nothing; the exports and this readiness view are what the Steuerberater receives. docs/finance/accountant.md describes the hand-over.</Notice>
    </>
  );
}
