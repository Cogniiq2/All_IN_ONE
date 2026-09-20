import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadInvoice } from '@/lib/finance/queries';
import { totalsByRate } from '@/lib/finance/invoices';
import { taxCode as taxCodeOf } from '@/lib/finance/tax-codes';
import { PageHeader, Section, ErrorNotice, Notice, BackLink, KeyValue, When } from '@/components/admin/primitives';
import { Money, StateBadge } from '@/components/admin/finance/primitives';
import { IssueInvoiceButton, PrintButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const [result, operator] = await Promise.all([loadInvoice(params.id), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Invoice" /><ErrorNotice title="The invoice could not be loaded.">{result.error}</ErrorNotice></>;
  if (!result.data) notFound();
  const { invoice: i, lines, requirements, config } = result.data;
  const number = i.number ? `${i.series}-${String(i.number).padStart(5, '0')}` : null;
  const mayReview = can(operator?.role, 'finance.review') && !operator?.preview;
  const blockers = requirements.filter((r) => !r.ok);
  const draftLines = lines.map((l) => ({ lineNo: l.line_no, description: l.description, quantity: l.quantity, category: l.category, taxCode: l.tax_code, rateBp: l.rate_bp, netCents: l.net_cents, vatCents: l.vat_cents, grossCents: l.gross_cents }));
  return (
    <>
      <BackLink href="/admin/finance/invoices">Invoices</BackLink>
      <PageHeader eyebrow={i.kind === 'credit_note' ? 'Credit note' : 'Invoice'} title={number ?? 'Draft'} description={<span className="inline-flex flex-wrap items-center gap-1.5"><StateBadge table="invoice" value={i.status} /><StateBadge table="payment" value={i.payment_state} ghost />{i.booking_reference && <Link href={`/admin/bookings/${i.booking_reference}`} className="bc-ref">{i.booking_reference}</Link>}</span>} actions={<span className="flex gap-2">{i.status === 'issued' && <PrintButton />}</span>} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <Section title="Document" meta={i.status === 'issued' ? 'frozen' : 'draft — may change until issued'} id="doc">
            <div className="bc-panel mt-2" style={{ padding: 24 }}>
              <div className="flex flex-wrap justify-between gap-4">
                <div><p className="bc-label">Issuer</p><p style={{ fontWeight: 600 }}>{i.issuer_name ?? config.issuerLegalName ?? <span className="dim">not configured</span>}</p><p className="bc-meta" style={{ whiteSpace: 'pre-line' }}>{config.issuerAddress ?? ''}</p><p className="bc-meta">{i.issuer_tax_id_masked ?? config.issuerTaxIdMasked ?? 'tax id not configured'}</p></div>
                <div style={{ textAlign: 'right' }}><p className="bc-label">{i.kind === 'credit_note' ? 'Credit note' : 'Invoice'}</p><p className="bc-display" style={{ fontSize: 22 }}>{number ?? 'DRAFT — no number'}</p><p className="bc-meta">{i.issued_on ? `Issued ${i.issued_on}` : 'Not issued'}</p></div>
              </div>
              <div className="mt-5"><p className="bc-label">Recipient</p><p style={{ fontWeight: 600 }}>{i.recipient_company ?? i.recipient_name}</p>{i.recipient_company && <p>{i.recipient_name}</p>}<p className="bc-meta">{i.recipient_country ?? ''}</p></div>
              <p className="bc-meta mt-3">Service period {i.service_from} – {i.service_to}{i.booking_reference ? ` · booking ${i.booking_reference}` : ''}</p>
              <table className="bc-mini-table mt-4">
                <thead><tr><th>#</th><th>Description</th><th className="num">Qty</th><th className="num">Net</th><th className="num">VAT</th><th className="num">Gross</th></tr></thead>
                <tbody>{lines.map((l) => <tr key={l.id}><td>{l.line_no}</td><td>{l.description}<div className="bc-meta">{taxCodeOf(l.tax_code)?.label ?? l.tax_code}{taxCodeOf(l.tax_code)?.reviewRequired ? ' — rate undecided' : ''}</div></td><td className="num">{l.quantity}</td><td className="num"><Money cents={l.net_cents} /></td><td className="num">{l.rate_bp / 100} % · <Money cents={l.vat_cents} /></td><td className="num"><Money cents={l.gross_cents} /></td></tr>)}</tbody>
                <tfoot>
                  {totalsByRate(draftLines).map((t) => <tr key={t.rateBp}><td colSpan={3} className="bc-meta">Net at {t.label}</td><td className="num"><Money cents={t.netCents} /></td><td className="num"><Money cents={t.vatCents} /></td><td className="num"><Money cents={t.grossCents} /></td></tr>)}
                  <tr><td colSpan={3} style={{ fontWeight: 600 }}>Total</td><td className="num"><Money cents={i.net_cents} /></td><td className="num"><Money cents={i.vat_cents} /></td><td className="num" style={{ fontWeight: 600 }}><Money cents={i.gross_cents} /></td></tr>
                </tfoot>
              </table>
              <p className="bc-meta mt-4" style={{ fontSize: 11.5 }}>{config.smallBusinessScheme === true ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' : 'Amounts in EUR. Rates per § 12 UStG.'}</p>
            </div>
          </Section>
        </div>
        <div>
          <Section title="§ 14 Abs. 4 UStG checklist" meta={blockers.length === 0 ? 'complete' : `${blockers.length} open`} id="checklist">
            <div className="bc-rows">{requirements.map((r) => <div key={r.code} className="bc-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}><span className="bc-badge" data-tone={r.ok ? 'positive' : 'critical'}><i className="bc-glyph" data-glyph={r.ok ? 'check' : 'alert'} aria-hidden="true" />{r.legal}</span><span>{r.label}{r.detail && <span className="bc-meta"> — {r.detail}</span>}</span></div>)}</div>
            {i.status === 'draft' && (
              <div className="mt-4">
                {blockers.length > 0 ? <Notice tone="caution" title="Issue is blocked (fails closed).">Resolve the open items above. A number is never drawn for an incomplete invoice.</Notice> : mayReview ? <IssueInvoiceButton invoiceId={i.id} /> : <p className="bc-meta">Issuing is done by operators.</p>}
              </div>
            )}
          </Section>
          <Section title="Facts" id="facts">
            <KeyValue rows={[['Created', <><When value={i.created_at} /> <span className="bc-meta">by {i.created_by}</span></>], i.issued_at ? ['Issued', <><When key="i" value={i.issued_at} /> <span className="bc-meta">by {i.issued_by}</span></>] : null, i.transaction_id ? ['Revenue fact', <Link key="t" href={`/admin/finance/transactions/${i.transaction_id}`} className="bc-ref">open →</Link>] : null, i.corrects_invoice_id ? ['Corrects', <Link key="c" href={`/admin/finance/invoices/${i.corrects_invoice_id}`}>original →</Link>] : null, i.document_id ? ['Registry document', <Link key="d" href="/admin/finance/documents">registered →</Link>] : null]} />
            <p className="bc-meta mt-3" style={{ fontSize: 12 }}>An issued invoice is immutable; a correction is a credit note referencing it. Retention: 8 years (§ 14b UStG). Nothing is emailed from BoLaGio Control.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
