import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadTaxes } from '@/lib/finance/queries';
import { yearOfParams, type Params } from '@/lib/finance/params';
import { TAX_TYPE_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, StateBadge, Provenance, Gauge, Caveats, PlainFigure, DateCell } from '@/components/admin/finance/primitives';
import { ExportButton, RunTaxEstimatesButton, NoticeStatusButtons } from '@/components/admin/finance/controls';
import { TaxForms } from '@/components/admin/finance/tax-forms';

export const metadata: Metadata = { title: 'Taxes' };

/**
 * Company taxes for a fiscal year: KSt, Soli, GewSt with every step
 * visible, the reserve against the declared holding, free cash, notices
 * with their variance to the estimate, the calendar. Estimates say so.
 */
export default async function TaxesPage({ searchParams }: { searchParams: Params }) {
  const year = yearOfParams(searchParams);
  const [result, operator] = await Promise.all([loadTaxes(year), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Taxes" /><ErrorNotice title="Taxes could not be loaded.">{result.error}</ErrorNotice></>;
  const t = result.data;
  const e = t.estimate;
  const mayTax = can(operator?.role, 'finance.tax_review') && !operator?.preview;
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  const mayReview = can(operator?.role, 'finance.review') && !operator?.preview;
  return (
    <>
      <PageHeader
        eyebrow="Finance · Körperschaftsteuer · Solidaritätszuschlag · Gewerbesteuer"
        title={`Taxes ${year}`}
        description={<span className="inline-flex flex-wrap items-center gap-1.5"><Provenance value="estimated" /><span className="bc-meta">rules {e.rulesVersion} · Hebesatz {t.hebesatz ? `${t.hebesatz.rateBp / 100} %` : '—'}{t.hebesatz?.reviewRequired ? ' (unconfirmed placeholder)' : ''}</span></span>}
        actions={<span className="flex flex-wrap gap-2"><ExportButton kind="tax_estimate" from={`${year}-01-01`} to={`${year + 1}-01-01`} label="Export tax estimate" /><ExportButton kind="tax_adjustments" from={`${year}-01-01`} to={`${year + 1}-01-01`} label="Adjustments" /></span>}
      />
      <div className="mb-5 bc-seg" role="group" aria-label="Fiscal year">
        {[year - 2, year - 1, year, year + 1].map((y) => <Link key={y} href={`/admin/finance/taxes?year=${y}`} aria-current={y === year ? 'true' : undefined}>{y}</Link>)}
      </div>

      {/* ── Reserve ─────────────────────────────────────────────── */}
      <Section title="Tax reserve" meta="required is arithmetic over the latest stage per period; held is what management declared" id="reserve">
        <div className="grid gap-4 mt-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="bc-panel" style={{ padding: '16px 18px' }}>
            <div className="flex items-baseline justify-between"><span className="bc-label">Coverage</span><span className="bc-display" style={{ fontSize: 28 }}>{t.reserve.coverage === null ? '—' : `${Math.round(t.reserve.coverage * 100)} %`}</span></div>
            <div className="mt-2"><Gauge ratio={t.reserve.coverage} /></div>
            <dl className="bc-kv mt-3">
              <div className="contents"><dt>Reserve required</dt><dd><Money cents={t.reserve.requiredCents} /> <Provenance value={t.reserve.containsEstimates ? 'estimated' : 'reviewed'} /></dd></div>
              <div className="contents"><dt>Declared as held</dt><dd><Money cents={t.reserve.heldCents} /> <Provenance value="actual" /></dd></div>
              <div className="contents"><dt>Gap</dt><dd><Money cents={t.reserve.gapCents} /></dd></div>
            </dl>
            <div className="bc-steps mt-4">
              {t.freeCash.steps.map((s) => <div key={s.label}><span>{s.label}</span><Money cents={s.cents} /></div>)}
            </div>
            {t.freeCash.cashCents === null && <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Cash is unknown until an account opening balance is recorded (Settings → Accounts).</p>}
          </div>
          <div>
            <table className="bc-mini-table">
              <thead><tr><th>Tax · period</th><th>Stage</th><th className="num">Liability</th><th className="num">Paid</th><th className="num">Remaining</th></tr></thead>
              <tbody>
                {t.reserve.lines.map((l) => <tr key={`${l.taxType}${l.periodKey}`}><td>{TAX_TYPE_LABEL[l.taxType] ?? l.taxType} {l.periodKey}</td><td><StateBadge table="stage" value={l.stage} ghost /></td><td className="num"><Money cents={l.liabilityCents} /></td><td className="num"><Money cents={l.paidCents} /></td><td className="num" style={{ fontWeight: 600 }}><Money cents={l.remainingCents} /></td></tr>)}
                {t.reserve.lines.length === 0 && <tr><td colSpan={5} className="bc-meta">No open liability. Record system estimates to populate the reserve.</td></tr>}
              </tbody>
            </table>
            {t.reserves.length > 0 && <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Latest declarations: {Array.from(new Map(t.reserves.map((r) => [`${r.kind}:${r.label}`, r])).values()).map((r) => `${r.label} ${(r.amount_cents / 100).toLocaleString('de-DE')} € as of ${r.as_of} (${r.set_by})`).join(' · ')}</p>}
          </div>
        </div>
      </Section>

      {/* ── Company taxes ───────────────────────────────────────── */}
      <Section title={`Estimated company taxes ${year}`} meta={<span>basis: management result before taxes <Money cents={t.pl.resultBeforeTaxCents} /> · effective rate {e.effectiveRate === null ? '—' : `${(e.effectiveRate * 100).toFixed(1)} %`}</span>} id="company">
        <div className="grid gap-4 mt-3 lg:grid-cols-3">
          {[e.kst, e.soli, e.gewst].map((f) => (
            <article key={f.taxType} className="bc-panel" style={{ padding: '16px 18px' }}>
              <div className="flex items-start justify-between gap-3"><h3 className="bc-h2">{TAX_TYPE_LABEL[f.taxType]}</h3><Provenance value="estimated" /></div>
              <p className="bc-figure-value mt-2" style={{ fontSize: 26 }}><Money cents={f.estimateCents} /></p>
              <p className="bc-meta">advance paid <Money cents={f.advancePaidCents} /> · remaining <Money cents={f.remainingCents} /></p>
              <div className="bc-steps mt-3">{f.steps.map((s) => <div key={s.label} title={s.note}><span>{s.label}</span><Money cents={s.cents} /></div>)}</div>
              <Caveats items={f.caveats} />
              <p className="bc-meta mt-2" style={{ fontSize: 11.5 }}>{f.rate?.legalReference}{f.hebesatz ? ` · ${f.hebesatz.legalReference}` : ''}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4"><RunTaxEstimatesButton /><p className="bc-meta" style={{ fontSize: 12 }}>Recording writes a system_estimate stage per tax and period; filed or assessed periods are never overwritten.</p></div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Periods and stages ─────────────────────────────────── */}
        <Section title="Tax periods" meta="latest stage governs the reserve" id="periods">
          <table className="bc-mini-table mt-2">
            <thead><tr><th>Period</th><th>Status</th><th>Governing stage</th><th className="num">Amount</th><th className="num">Paid</th></tr></thead>
            <tbody>
              {t.governing.map((g) => <tr key={g.period.id}><td>{TAX_TYPE_LABEL[g.period.tax_type]?.split(' (')[0]} {g.period.period_key}<div className="bc-meta">{g.period.filing_due_on ? `due ${g.period.official_due_on ?? g.period.filing_due_on}${g.period.official_due_on ? ' (official)' : ''}` : ''}</div></td><td><StateBadge table="taxperiod" value={g.period.status} ghost /></td><td>{g.stage ? <StateBadge table="stage" value={g.stage.stage} ghost /> : <span className="dim">none</span>}</td><td className="num"><Money cents={g.stage?.amount_cents ?? null} /></td><td className="num"><Money cents={g.paidCents} /></td></tr>)}
            </tbody>
          </table>
          {mayTax && <div className="mt-4"><TaxForms year={year} mode="stage" /></div>}
        </Section>

        {/* ── Notices ───────────────────────────────────────────── */}
        <Section title="Tax notices (Bescheide)" meta="official figures override estimates; variance shown" id="notices">
          {t.notices.length === 0 ? <p className="bc-meta mt-3">No notice registered.</p> : (
            <div className="bc-rows">
              {t.notices.map((n) => {
                const v = t.variance.find((x) => x.taxType === n.tax_type && x.periodKey === n.period_key);
                return (
                  <div key={n.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span style={{ fontWeight: 600 }}>{TAX_TYPE_LABEL[n.tax_type]?.split(' (')[0]} {n.period_key}</span><span className="bc-badge ghost" data-tone="neutral">{n.notice_type.replace('_', ' ')}</span><span className="bc-badge" data-tone={n.status === 'received' ? 'caution' : n.status === 'disputed' ? 'critical' : 'positive'}>{n.status}</span></div>
                      <div className="bc-meta mt-1">{n.authority} · received <DateCell iso={n.received_on} />{n.assessment_date ? <> · dated <DateCell iso={n.assessment_date} /></> : null}</div>
                      {n.dues.length > 0 && <div className="bc-meta">{n.dues.map((d) => `${d.label ?? 'due'} ${d.due_on}: ${(d.amount_cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €${d.paid_cents >= d.amount_cents ? ' ✓' : ''}`).join(' · ')}</div>}
                      {v && v.varianceCents !== null && <div className="bc-meta">estimate <Money cents={v.estimateCents} /> vs official <Money cents={v.officialCents} /> → variance <strong><Money cents={v.varianceCents} signed /></strong></div>}
                      {n.note && <div className="bc-meta">{n.note}</div>}
                      {mayReview && <div className="mt-2"><NoticeStatusButtons id={n.id} status={n.status} /></div>}
                    </div>
                    <Money cents={n.assessed_cents ?? n.advance_payment_cents} />
                  </div>
                );
              })}
            </div>
          )}
          {mayEdit && <div className="mt-4"><TaxForms year={year} mode="notice" /></div>}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Calendar ──────────────────────────────────────────── */}
        <Section title="Tax calendar" meta="calculated planning dates; official dates override" id="calendar">
          <div className="bc-rows">
            {t.deadlines.slice(0, 16).map((d) => (
              <div key={`${d.taxType}${d.periodKey}${d.kind}${d.dueOn}`} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto' }}>
                <span className="bc-num" style={{ minWidth: 92 }}><DateCell iso={d.dueOn} /></span>
                <span className="min-w-0 truncate">{d.label}<span className="bc-meta ml-2">{d.legalReference}</span></span>
                <span className="bc-badge ghost" data-tone={d.origin === 'official' ? 'positive' : d.origin === 'custom' ? 'progress' : 'neutral'}>{d.origin}</span>
                <span className="bc-badge" data-tone={d.urgency === 'overdue' ? 'critical' : d.urgency === 'due_soon' ? 'caution' : 'muted'}>{d.urgency.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
          <p className="bc-meta mt-2" style={{ fontSize: 12 }}>UStVA: 10th after the period (§ 18 Abs. 1 UStG), +1 month with Dauerfristverlängerung (§ 46 UStDV). KSt advances 10 Mar/Jun/Sep/Dec (§ 31 KStG, § 37 EStG). GewSt advances 15 Feb/May/Aug/Nov (§ 19 GewStG). Weekend/holiday → next working day (§ 108 Abs. 3 AO).</p>
        </Section>

        {/* ── Adjustments, payments, reserve declaration ─────────── */}
        <div>
          <Section title="Tax adjustments" meta="adviser-entered; append-only" id="adjustments">
            {t.adjustments.filter((a) => a.superseded_by === null).length === 0 ? <p className="bc-meta mt-3">None. Taxable income equals the management result until the adviser enters non-deductible expenses, tax-free income, loss carry-forwards, Hinzurechnungen or Kürzungen.</p> : (
              <table className="bc-mini-table mt-2"><thead><tr><th>Tax</th><th>Year</th><th>Kind</th><th className="num">Amount</th><th>Reason</th></tr></thead><tbody>{t.adjustments.filter((a) => a.superseded_by === null).map((a) => <tr key={a.id}><td>{a.tax_type.toUpperCase()}</td><td>{a.fiscal_year}</td><td>{a.kind.replace(/_/g, ' ')}</td><td className="num"><Money cents={a.amount_cents} /></td><td className="bc-meta">{a.reason}{a.legal_reference ? ` (${a.legal_reference})` : ''} · {a.actor}</td></tr>)}</tbody></table>
            )}
            {mayTax && <div className="mt-4"><TaxForms year={year} mode="adjustment" /></div>}
          </Section>
          <Section title="Tax payments and reserve" id="payments">
            {t.payments.length > 0 && <table className="bc-mini-table mt-2"><thead><tr><th>Paid</th><th>Tax · period</th><th>Kind</th><th className="num">Amount</th></tr></thead><tbody>{t.payments.slice(0, 12).map((p) => <tr key={p.id}><td><DateCell iso={p.paid_on} /></td><td>{p.tax_type.toUpperCase()} {p.period_key}</td><td>{p.kind}</td><td className="num"><Money cents={p.amount_cents} /></td></tr>)}</tbody></table>}
            {mayEdit && <div className="mt-4 grid gap-4"><TaxForms year={year} mode="payment" /><TaxForms year={year} mode="reserve" /></div>}
            {!mayEdit && <p className="bc-meta mt-3">Payments and reserve declarations are recorded by operators.</p>}
          </Section>
        </div>
      </div>

      <Section title="What these figures are" id="about">
        <div className="grid gap-3 md:grid-cols-3 mt-2">
          <PlainFigure label="Taxable income (est.)" cents={e.taxableIncomeCents} provenance="estimated" note="management result ± adjustments" />
          <PlainFigure label="Gewerbeertrag (est.)" cents={e.gewerbeertragCents} provenance="estimated" note="rounded down to € 100; no Freibetrag for a GmbH" />
          <PlainFigure label="Total estimate" cents={e.totalEstimateCents} provenance="estimated" note={`remaining ${(e.totalRemainingCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € after advances`} />
        </div>
        <div className="mt-3"><Notice tone="neutral">BoLaGio Control estimates; the Steuerberater files. A system estimate becomes reviewed, filed, assessed and paid only when an administrator records those stages, and the recorded stage then governs the reserve. Trade-tax additions, loss carry-forwards and non-deductible items are the adviser&apos;s entries. The Bayreuth Hebesatz row must be confirmed for each year (Settings).</Notice></div>
      </Section>
      <p className="bc-meta" style={{ fontSize: 12 }}>Last stage recorded: {t.governing.map((g) => g.stage?.computed_at).filter(Boolean).sort().reverse()[0] ? <When value={t.governing.map((g) => g.stage?.computed_at).filter(Boolean).sort().reverse()[0] as string} /> : 'never'}.</p>
    </>
  );
}
