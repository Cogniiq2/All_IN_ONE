import type { Metadata } from 'next';
import Link from 'next/link';
import { loadVat } from '@/lib/finance/queries';
import { one, type Params } from '@/lib/finance/params';
import { periodLabel, periodRange } from '@/lib/finance/periods';
import { categoryLabel } from '@/lib/finance/categories';
import { INPUT_VAT_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, StateBadge, Provenance, LedgerRow, Caveats, DateCell } from '@/components/admin/finance/primitives';
import { ExportButton, RunTaxEstimatesButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'VAT' };

/**
 * The VAT position by filing period: output by code, reverse charge both
 * ways, deductible input, what is excluded and why, the stages the adviser
 * recorded, and the planning deadline. An estimate is never shown as filed.
 */
export default async function VatPage({ searchParams }: { searchParams: Params }) {
  const key = one(searchParams, 'period', 10);
  const result = await loadVat(key && /^\d{4}(-Q[1-4]|-\d{2})?$/.test(key) ? key : null);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="VAT" /><ErrorNotice title="The VAT position could not be loaded.">{result.error}</ErrorNotice></>;
  const v = result.data;
  const p = v.position;
  const range = periodRange(v.periodKey);
  const governing = v.stages.length > 0 ? v.stages[v.stages.length - 1] : null;
  return (
    <>
      <PageHeader
        eyebrow="Finance · Umsatzsteuer"
        title={`VAT · ${v.label}`}
        description={<span className="inline-flex flex-wrap items-center gap-1.5"><StateBadge table="taxperiod" value={v.taxPeriod?.status ?? 'open'} /><span className="bc-badge ghost" data-tone="neutral">{v.calendar.vatFilingFrequency}{v.calendar.dauerfristverlaengerung ? ' · Dauerfristverlängerung' : ''}</span>{v.deadline && <span className="bc-badge ghost" data-tone="neutral">planning deadline {v.deadline.dueOn}</span>}</span>}
        actions={<span className="flex flex-wrap gap-2"><ExportButton kind="vat_report" from={range.from} to={range.to} label="Export VAT report" /><ExportButton kind="reverse_charge_report" from={range.from} to={range.to} label="Reverse-charge report" /></span>}
      />
      <div className="mb-5 bc-seg" role="group" aria-label="Period">
        {v.keys.slice(0, 8).map((k) => <Link key={k} href={`/admin/finance/vat?period=${k}`} aria-current={k === v.periodKey ? 'true' : undefined}>{periodLabel(k)}</Link>)}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title="Position" meta={<span>rules {p.rulesVersion} · <Provenance value="estimated" /></span>} id="position">
            <div className="bc-ledger mt-2">
              <div className="bc-ledger-row" data-total="true"><span>OUTPUT VAT</span><Money cents={p.outputVatCents} /></div>
              {p.output.map((l) => <LedgerRow key={l.taxCode} label={<>{l.label} <span className="bc-meta">net {(l.basisCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></>} cents={l.vatCents} level={1} href={`/admin/finance/transactions?tax=${l.taxCode}&kind=revenue&from=${range.from}&to=${range.to}`} />)}
              {p.output.length === 0 && <div className="bc-ledger-row" data-level="1"><span className="bc-meta">no taxable sales in the period</span><span /></div>}
              <div className="bc-ledger-row" data-total="true"><span>REVERSE CHARGE (§ 13b) <span className="bc-meta">basis {(p.reverseCharge.basisCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></span><span /></div>
              <LedgerRow label="Output VAT owed as recipient" cents={p.reverseCharge.outputVatCents} level={1} href={`/admin/finance/transactions?tax=DE_REVERSE_CHARGE&from=${range.from}&to=${range.to}`} />
              <LedgerRow label="Input VAT deducted (§ 15 Abs. 1 Nr. 4)" cents={-p.reverseCharge.inputVatCents} level={1} href={`/admin/finance/transactions?tax=DE_REVERSE_CHARGE&from=${range.from}&to=${range.to}`} />
              <div className="bc-ledger-row" data-total="true"><span>INPUT VAT (deductible)</span><Money cents={-p.inputVatCents} /></div>
              {p.input.map((l) => <LedgerRow key={l.taxCode} label={<>{l.label} <span className="bc-meta">net {(l.basisCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></>} cents={-l.vatCents} level={1} href={`/admin/finance/transactions?tax=${l.taxCode}&kind=expense&from=${range.from}&to=${range.to}`} />)}
              {p.nonDeductibleVatCents !== 0 && <LedgerRow label="Not deductible (excluded)" cents={p.nonDeductibleVatCents} level={1} meta="shown, not counted" />}
              {p.reviewVatCents !== 0 && <LedgerRow label="Awaiting deductibility decision (excluded)" cents={p.reviewVatCents} level={1} meta="shown, not counted" />}
              {p.adjustmentsCents !== 0 && <LedgerRow label="Manual adjustments (adviser)" cents={p.adjustmentsCents} />}
              <div className="bc-ledger-row" data-total="estimate"><span>{p.estimateCents >= 0 ? 'ESTIMATED VAT PAYABLE' : 'ESTIMATED VAT REFUND'} <Provenance value="estimated" /></span><Money cents={p.estimateCents} /></div>
            </div>
            <Caveats items={p.caveats} />
            <p className="bc-meta mt-3" style={{ fontSize: 12 }}>Accommodation 7 % (§ 12 Abs. 2 Nr. 11 UStG); beverages and ancillary services 19 %; foreign B2B services under § 13b. Lines under a review-required code contribute nothing until classified. Rounding: docs/finance/vat.md.</p>
          </Section>

          {v.reviewLines.length > 0 && (
            <Section title="Lines that block a clean position" meta={`${v.reviewLines.length}`} id="review">
              <div className="bc-rows">
                {v.reviewLines.slice(0, 40).map((l) => (
                  <Link key={l.id} href={`/admin/finance/transactions/${l.transaction_id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span className="min-w-0 truncate">{l.transaction.counterparty_label ?? l.transaction.description} · {categoryLabel(l.category)} · <span className="bc-mono">{l.tax_code}</span> · {INPUT_VAT_LABEL[l.input_vat_treatment] ?? ''} <StateBadge table="review" value={l.classification} ghost /></span>
                    <Money cents={l.gross_cents} />
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {v.rcLines.length > 0 && (
            <Section title="Reverse-charge lines" meta="issuer and country decide; confirm each" id="rc">
              <div className="bc-rows">
                {v.rcLines.map((l) => (
                  <Link key={l.id} href={`/admin/finance/transactions/${l.transaction_id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                    <span className="min-w-0 truncate">{l.transaction.counterparty_label} · {l.transaction.supplier_invoice_no ?? '—'} · <DateCell iso={l.transaction.booked_on} /> <StateBadge table="review" value={l.classification} ghost /></span>
                    <span className="bc-meta">RC VAT <Money cents={l.reverse_charge_vat_cents} /></span>
                    <Money cents={l.net_cents} />
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div>
          <Section title="Stages" meta="append-only; a filed amount is never recalculated" id="stages">
            {v.stages.length === 0 ? <p className="bc-meta mt-3">No stage recorded for this period yet. The figure above is the live system estimate; recording it makes it visible on the Taxes page and in the reserve.</p> : (
              <div className="bc-timeline mt-2">
                {v.stages.map((s) => (
                  <div key={s.id} className="bc-tl-item" data-tone={s.stage === 'system_estimate' ? undefined : 'positive'}>
                    <div className="flex items-center justify-between gap-3"><StateBadge table="stage" value={s.stage} /><Money cents={s.amount_cents} /></div>
                    <div className="bc-meta mt-1"><When value={s.computed_at} /> · {s.actor} · {s.rules_version}{s.note ? ` · ${s.note}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
            {governing && governing.stage !== 'system_estimate' && Math.abs(governing.amount_cents - p.estimateCents) > 0 && (
              <div className="mt-3"><Notice tone="neutral" title="Variance.">The {governing.stage.replace('_', ' ')} figure differs from the live estimate by <Money cents={governing.amount_cents - p.estimateCents} />. Later postings into the period or adviser corrections explain it; the recorded stage governs.</Notice></div>
            )}
            <div className="mt-4"><RunTaxEstimatesButton /></div>
          </Section>

          <Section title="Filing" id="filing">
            <dl className="bc-kv">
              <div className="contents"><dt>Frequency</dt><dd>{v.calendar.vatFilingFrequency} <span className="bc-meta">(policy — confirm with the Finanzamt)</span></dd></div>
              <div className="contents"><dt>Dauerfristverlängerung</dt><dd>{v.calendar.dauerfristverlaengerung ? 'granted' : 'not set'}</dd></div>
              <div className="contents"><dt>Planning deadline</dt><dd>{v.deadline ? <>{v.deadline.dueOn} <span className="bc-meta">({v.deadline.legalReference})</span></> : '—'}</dd></div>
              <div className="contents"><dt>Official date</dt><dd>{v.taxPeriod?.official_due_on ?? <span className="dim">none recorded</span>}</dd></div>
              <div className="contents"><dt>Status</dt><dd><StateBadge table="taxperiod" value={v.taxPeriod?.status ?? 'open'} /></dd></div>
            </dl>
            <p className="bc-meta mt-3" style={{ fontSize: 12 }}>Nothing is transmitted from here. The adviser files via ELSTER and records the filed amount as a stage on the Taxes page (administrator).</p>
          </Section>
        </div>
      </div>
    </>
  );
}
