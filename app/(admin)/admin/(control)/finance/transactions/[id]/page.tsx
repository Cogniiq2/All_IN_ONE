import type { Metadata } from 'next';
import { formatInvoiceNumber } from '@/lib/invoicing/contract';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadTransaction, unitNamer } from '@/lib/finance/queries';
import { isUuid } from '@/lib/finance/params';
import { KIND_LABEL, CHANNEL_LABEL, SOURCE_LABEL, ALLOCATION_LABEL, INPUT_VAT_LABEL, DOCUMENT_TYPE_LABEL } from '@/lib/finance/presentation';
import { categoryLabel } from '@/lib/finance/categories';
import { taxCode as taxCodeOf } from '@/lib/finance/tax-codes';
import { PageHeader, Section, KeyValue, ErrorNotice, Notice, BackLink, When } from '@/components/admin/primitives';
import { Money, StateBadge, DateCell, Rate } from '@/components/admin/finance/primitives';
import { TransactionActions } from '@/components/admin/finance/transaction-actions';
import { ConfirmMatchButtons } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Transaction' };

/**
 * One economic fact, fully explained: lines with tax codes, the override
 * trail, the reconciliation links, the documents, the related facts of the
 * same booking, and the period's lock state. Every figure on every
 * aggregate screen drills down to a list of these.
 */
export default async function TransactionPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id) && !/^tx-\d{3}$/.test(params.id)) notFound();
  const [result, operator] = await Promise.all([loadTransaction(params.id), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Transaction" /><ErrorNotice title="The transaction could not be loaded.">{result.error}</ErrorNotice></>;
  if (!result.data) notFound();
  const d = result.data;
  const t = d.transaction;
  const name = unitNamer(d.units);
  const locked = d.period?.status === 'locked';
  const mayReview = can(operator?.role, 'finance.review') && !operator?.preview;
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  const mayTax = can(operator?.role, 'finance.tax_review') && !operator?.preview;

  return (
    <>
      <BackLink href="/admin/finance/transactions">Transactions</BackLink>
      <PageHeader
        eyebrow={`${KIND_LABEL[t.kind] ?? t.kind} · ${SOURCE_LABEL[t.source_type] ?? t.source_type}`}
        title={t.description}
        description={<span className="inline-flex flex-wrap items-center gap-1.5"><StateBadge table="txstatus" value={t.status} /><StateBadge table="review" value={t.review_state} /><StateBadge table="document" value={t.document_state} /><StateBadge table="payment" value={t.payment_state} /><StateBadge table="reconciliation" value={t.reconciliation_state} />{d.period && <StateBadge table="period" value={d.period.status} ghost />}</span>}
        actions={<span className="bc-display" style={{ fontSize: 28 }}><Money cents={t.gross_cents} /></span>}
      />

      {t.status === 'reversed' && <div className="mb-4"><Notice tone="neutral" title="Reversed.">{t.reversal_reason} {t.reversed_by && <Link href={`/admin/finance/transactions/${t.reversed_by}`} className="bc-ref">open the reversal →</Link>}</Notice></div>}
      {t.status === 'reversal' && t.correction_of && <div className="mb-4"><Notice tone="neutral" title="This is a correction.">It reverses <Link href={`/admin/finance/transactions/${t.correction_of}`} className="bc-ref">the original →</Link>{t.note ? ` — ${t.note}` : ''}</Notice></div>}
      {locked && <div className="mb-4"><Notice tone="progress" title="Period locked.">Nothing in {d.period?.period_key} changes. A correction is posted into the open period and linked here.</Notice></div>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title="Lines" meta={<span>gross = net + VAT on every line; a tax code on every line</span>} id="lines">
            <div className="bc-table-wrap mt-3">
              <table className="bc-table">
                <thead><tr><th scope="col">#</th><th scope="col">Category · description</th><th scope="col">Tax code</th><th scope="col" className="num">Net</th><th scope="col" className="num">VAT</th><th scope="col" className="num">Gross</th><th scope="col">Unit</th><th scope="col">State</th></tr></thead>
                <tbody>
                  {d.lines.map((l) => {
                    const code = taxCodeOf(l.tax_code);
                    return (
                      <tr key={l.id}>
                        <td className="dim">{l.line_no}</td>
                        <td><div style={{ fontWeight: 500 }}>{categoryLabel(l.category)}</div><div className="bc-meta">{l.description ?? '—'}{l.quantity ? ` · × ${l.quantity}` : ''}{l.asset_state !== 'none' ? ` · asset ${l.asset_state.replace('_', ' ')}` : ''}</div></td>
                        <td><div>{code?.label ?? l.tax_code}</div><div className="bc-meta"><Rate bp={l.rate_bp} />{t.kind !== 'revenue' && t.kind !== 'refund' ? ` · ${INPUT_VAT_LABEL[l.input_vat_treatment] ?? l.input_vat_treatment}${l.input_vat_treatment === 'partially_deductible' ? ` ${l.deductible_bp / 100} %` : ''}` : ''}{l.reverse_charge_vat_cents ? ` · RC VAT ${(l.reverse_charge_vat_cents / 100).toFixed(2)} €` : ''}</div></td>
                        <td className="num"><Money cents={l.net_cents} /></td>
                        <td className="num"><Money cents={l.vat_cents} /></td>
                        <td className="num" style={{ fontWeight: 600 }}><Money cents={l.gross_cents} /></td>
                        <td className="dim"><div>{name(l.unit_id)}</div><div className="bc-meta">{ALLOCATION_LABEL[l.allocation_method] ?? l.allocation_method}</div></td>
                        <td><StateBadge table="review" value={l.classification} ghost /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={3} style={{ fontWeight: 600 }}>Total</td><td className="num"><Money cents={t.net_cents} /></td><td className="num"><Money cents={t.vat_cents} /></td><td className="num" style={{ fontWeight: 600 }}><Money cents={t.gross_cents} /></td><td colSpan={2} /></tr></tfoot>
              </table>
            </div>
            {d.lines.some((l) => code(l.tax_code)) && <p className="bc-meta mt-2" style={{ fontSize: 12 }}>{d.lines.filter((l) => code(l.tax_code)).map((l) => `${taxCodeOf(l.tax_code)?.legalReference}`).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</p>}
          </Section>

          {t.status === 'posted' && (mayReview || mayEdit) && (
            <Section title="Work this record" meta={locked ? 'period locked — corrections only' : 'every change is recorded with a reason'} id="actions">
              <TransactionActions transaction={t} lines={d.lines} units={d.units} categories={d.categories} taxCodes={d.taxCodes} locked={Boolean(locked)} mayReview={mayReview} mayEdit={mayEdit} mayTax={mayTax} />
            </Section>
          )}

          <Section title="Reconciliation" meta={d.reconciliations.length === 0 ? 'nothing linked yet' : `${d.reconciliations.length} link${d.reconciliations.length === 1 ? '' : 's'}`} id="reconciliation">
            {d.reconciliations.length === 0 ? <p className="bc-meta mt-3">No payment is linked. {t.kind === 'revenue' ? 'A capture from the booking or a payout from a statement will match automatically when it arrives.' : 'A bank line naming the invoice number will match automatically once imported.'}</p> : (
              <div className="bc-rows">
                {d.reconciliations.map((r) => {
                  const p = d.payments.find((x) => x.id === r.payment_id);
                  return (
                    <div key={r.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><StateBadge table="reconciliation" value={r.state === 'rejected' ? 'unmatched' : r.state} /><span className="bc-mono bc-meta">{r.rule} · {r.rule_version}</span><span className="bc-badge ghost" data-tone={r.confidence === 'exact' ? 'positive' : r.confidence === 'high' ? 'progress' : 'caution'}>{r.confidence}</span>{r.state === 'rejected' && <span className="bc-badge ghost" data-tone="muted">rejected</span>}</div>
                        <p className="bc-prose mt-1" style={{ fontSize: 13 }}>{r.reason}</p>
                        {p && <p className="bc-meta mt-1">{p.source} · {p.provider_reference} · <When value={p.occurred_at} /> · {p.counterparty_label ?? ''}</p>}
                        <p className="bc-meta">by {r.matched_by} · <When value={r.created_at} /></p>
                        {r.state === 'needs_review' && mayReview && p && <div className="mt-2"><ConfirmMatchButtons transactionId={t.id} paymentId={p.id} amountCents={r.amount_cents} /></div>}
                      </div>
                      <Money cents={r.amount_cents} />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {d.overrides.length > 0 && (
            <Section title="Change history" meta="old value → new value, reason, actor" id="history">
              <div className="bc-rows">
                {d.overrides.map((o) => (
                  <div key={o.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <div className="min-w-0"><div><span className="bc-mono">{o.target_type}.{o.field}</span>: <span className="dim">{o.old_value ?? '∅'}</span> → <strong>{o.new_value ?? '∅'}</strong></div><div className="bc-meta">{o.reason} · {o.actor}</div></div>
                    <When value={o.created_at} />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div>
          <Section title="Facts" id="facts">
            <KeyValue rows={[
              ['Booked on (period)', <><DateCell iso={t.booked_on} /> <span className="bc-meta">· {d.period?.period_key ?? t.booked_on.slice(0, 7)}</span></>],
              t.service_from ? ['Service period', <span key="s" className="bc-num">{t.service_from} – {t.service_to}</span>] : null,
              t.invoice_date ? ['Invoice date', <DateCell key="i" iso={t.invoice_date} />] : null,
              t.due_on ? ['Due', <DateCell key="d" iso={t.due_on} />] : null,
              ['Counterparty', d.counterparty ? <Link href={`/admin/finance/transactions?counterparty=${d.counterparty.id}`}>{d.counterparty.name}</Link> : t.counterparty_label ?? '—'],
              t.supplier_invoice_no ? ['Invoice no.', <span key="n" className="bc-mono">{t.supplier_invoice_no}</span>] : null,
              t.booking_reference ? ['Booking', /^BLG-/.test(t.booking_reference) ? <Link key="b" href={`/admin/bookings/${t.booking_reference}`} className="bc-ref">{t.booking_reference}</Link> : <span key="b" className="bc-ref">{t.booking_reference}</span>] : null,
              t.channel ? ['Channel', CHANNEL_LABEL[t.channel] ?? t.channel] : null,
              ['Unit', name(t.unit_id)],
              ['Source', <span key="src" className="bc-mono" style={{ fontSize: 12 }}>{t.source_system} · {t.source_reference}</span>],
              ['Posted', <><When value={t.posted_at} /> <span className="bc-meta">by {t.posted_by}</span></>],
              t.note ? ['Note', t.note] : null,
            ]} />
          </Section>

          <Section title="Documents" meta={d.documents.length === 0 ? (t.document_state === 'not_required' ? 'none needed' : 'none linked') : `${d.documents.length}`} id="documents">
            {d.documents.length === 0 ? <p className="bc-meta mt-3">{t.document_state === 'missing' ? 'No invoice or receipt is linked. Upload one below or on the Documents screen.' : 'Nothing linked.'}</p> : (
              <div className="bc-rows">
                {d.documents.map((doc) => (
                  <div key={doc.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <div className="min-w-0"><div className="truncate" style={{ fontWeight: 500 }}>{doc.original_filename}</div><div className="bc-meta">{DOCUMENT_TYPE_LABEL[doc.document_type] ?? doc.document_type} · {doc.structured_format !== 'none' && doc.structured_format !== 'pdf_only' ? `${doc.structured_format} · ` : ''}retain until {doc.retain_until ?? '—'} · sha256 {doc.sha256.slice(0, 10)}…</div></div>
                    <Link href={`/admin/finance/documents?q=${encodeURIComponent(doc.original_filename)}`} className="bc-meta">Registry →</Link>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {d.invoices.length > 0 && (
            <Section title="Guest invoice" id="invoice">
              <div className="bc-rows">{d.invoices.map((i) => <Link key={i.id} href={`/admin/finance/invoices/${i.id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>{i.number ? formatInvoiceNumber(i.series!, i.number) : 'Draft'} <StateBadge table="invoice" value={i.status} ghost /></span><Money cents={i.gross_cents} /></Link>)}</div>
            </Section>
          )}

          {d.turnoverCosts.length > 0 && (
            <Section title="Cleaning expectation" meta="expected vs invoiced" id="cleaning">
              <div className="bc-rows">{d.turnoverCosts.map((c) => <div key={c.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>{c.booking_reference ?? c.turnover_id} · departs {c.departure} · <span className="bc-badge ghost" data-tone={c.state === 'invoiced' ? 'positive' : 'neutral'}>{c.state}</span></span><Money cents={c.expected_net_cents} /></div>)}</div>
            </Section>
          )}

          {d.related.length > 0 && (
            <Section title="Related facts" meta="same booking, or the correction pair" id="related">
              <div className="bc-rows">
                {d.related.map((r) => (
                  <Link key={r.id} href={`/admin/finance/transactions/${r.id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span className="min-w-0 truncate">{KIND_LABEL[r.kind] ?? r.kind} · {r.description} <StateBadge table="txstatus" value={r.status} ghost /></span>
                    <Money cents={r.gross_cents} />
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function code(c: string): boolean {
  return Boolean(taxCodeOf(c)?.legalReference && taxCodeOf(c)?.legalReference !== '—');
}
