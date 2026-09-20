import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadInvoices } from '@/lib/finance/queries';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, StateBadge } from '@/components/admin/finance/primitives';
import { CreateDraftButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Invoices' };

export default async function InvoicesPage() {
  const [result, operator] = await Promise.all([loadInvoices(), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Invoices" /><ErrorNotice title="Invoices could not be loaded.">{result.error}</ErrorNotice></>;
  const inv = result.data;
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  const cfg = inv.config;
  const ready = cfg.issuerLegalName && cfg.issuerAddress && cfg.issuerTaxIdConfigured && cfg.invoiceSeries && cfg.smallBusinessScheme === false;
  return (
    <>
      <PageHeader eyebrow="Finance · § 14 UStG" title="Guest invoices" description="Drafts are free; issuing draws a gapless number and freezes the document. Issue fails closed while any § 14 requirement is unmet. Nothing is sent from here." />
      <div className="mb-5">
        <Notice tone={ready ? 'positive' : 'caution'} title={ready ? 'Issuer configured.' : 'Issuing is blocked by configuration.'}>
          {cfg.issuerLegalName ?? 'no legal name'} · {cfg.issuerAddress ? 'address set' : 'no address'} · {cfg.issuerTaxIdConfigured ? `${cfg.issuerTaxIdKind === 'ust_idnr' ? 'USt-IdNr' : 'Steuernummer'} ${cfg.issuerTaxIdMasked}` : 'no tax id'} · series {cfg.invoiceSeries ?? 'not set'} · § 19: {cfg.smallBusinessScheme === false ? 'regular taxation' : cfg.smallBusinessScheme === true ? 'small business (invoices would need the § 19 notice)' : 'undecided'}. Set INVOICE_ISSUER_LEGAL_NAME, INVOICE_ISSUER_ADDRESS, INVOICE_ISSUER_TAX_ID, INVOICE_SERIES and INVOICE_SMALL_BUSINESS on the deployment.
        </Notice>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Invoices and credit notes" meta={`${inv.total}`} id="list">
          {inv.rows.length === 0 ? <p className="bc-meta mt-3">No invoice yet.</p> : (
            <div className="bc-rows">
              {inv.rows.map((i) => (
                <Link key={i.id} href={`/admin/finance/invoices/${i.id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <span className="min-w-0"><div style={{ fontWeight: 600 }}>{i.number ? `${i.series}-${String(i.number).padStart(5, '0')}` : 'Draft'} <span className="bc-meta">· {i.kind === 'credit_note' ? 'credit note' : 'invoice'} · {i.recipient_company ?? i.recipient_name}</span></div><div className="bc-meta">{i.booking_reference ? <span className="bc-ref">{i.booking_reference}</span> : '—'} · {i.service_from} – {i.service_to} · <When value={i.issued_at ?? i.created_at} /></div></span>
                  <span className="flex gap-1"><StateBadge table="invoice" value={i.status} /><StateBadge table="payment" value={i.payment_state} ghost /></span>
                  <Money cents={i.gross_cents} />
                </Link>
              ))}
            </div>
          )}
        </Section>
        <Section title="Stays without an invoice" meta="direct bookings that ended in the last 60 days" id="eligible">
          {inv.eligibleStays.length === 0 ? <p className="bc-meta mt-3">Every recent direct stay has a draft or an invoice.</p> : (
            <div className="bc-rows">
              {inv.eligibleStays.map((s) => (
                <div key={s.intent_id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <span className="min-w-0"><span className="bc-ref">{s.reference}</span> <span className="bc-meta">· {s.guest_label ?? ''} · {s.check_in} – {s.check_out} · <Money cents={s.quoted_total_cents} /></span></span>
                  {mayEdit ? <CreateDraftButton intentId={s.intent_id} reference={s.reference} /> : <span className="bc-meta">operator drafts</span>}
                </div>
              ))}
            </div>
          )}
          <p className="bc-meta mt-3" style={{ fontSize: 12 }}>The booking&apos;s quote lines become invoice lines at the gross charged; a mandatory cleaning fee stays review-required until the adviser decides its rate (Aufteilungsgebot). Unpaid minibar consumption for the stay is added as lines.</p>
        </Section>
      </div>
    </>
  );
}
