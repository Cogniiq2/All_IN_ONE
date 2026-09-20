import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadImportBatch } from '@/lib/finance/queries';
import { ADAPTERS } from '@/lib/finance/import/adapters';
import { PageHeader, Section, ErrorNotice, Notice, BackLink, KeyValue, When } from '@/components/admin/primitives';
import { StateBadge } from '@/components/admin/finance/primitives';
import { CommitImportButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Import batch' };

export default async function ImportBatchPage({ params }: { params: { id: string } }) {
  const [result, operator] = await Promise.all([loadImportBatch(params.id), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Import batch" /><ErrorNotice title="The batch could not be loaded.">{result.error}</ErrorNotice></>;
  if (!result.data) notFound();
  const { batch, rows } = result.data;
  const spec = ADAPTERS.find((a) => a.id === batch.adapter);
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  return (
    <>
      <BackLink href="/admin/finance/imports">Imports</BackLink>
      <PageHeader eyebrow="Finance · import" title={batch.filename} description={<span className="inline-flex flex-wrap items-center gap-1.5"><StateBadge table="batch" value={batch.status} /><span className="bc-badge ghost" data-tone={spec?.readiness === 'validated' ? 'positive' : 'caution'}>{spec?.label ?? batch.adapter} · {spec?.readiness ?? 'unknown'} · v{batch.adapter_version}</span></span>} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Rows" meta={`${batch.valid_rows} valid · ${batch.error_rows} errors · ${batch.duplicate_rows} duplicates`} id="rows">
          <div className="bc-table-wrap mt-2">
            <table className="bc-table">
              <thead><tr><th scope="col">#</th><th scope="col">Status</th><th scope="col">Parsed</th><th scope="col">Raw</th><th scope="col">Result</th></tr></thead>
              <tbody>
                {rows.slice(0, 500).map((r) => (
                  <tr key={r.id}>
                    <td className="dim">{r.row_no}</td>
                    <td><span className="bc-badge ghost" data-tone={r.status === 'valid' || r.status === 'imported' ? 'positive' : r.status === 'duplicate' ? 'neutral' : 'critical'}>{r.status}</span>{r.error && <div className="bc-meta" style={{ color: 'hsl(var(--bc-critical))' }}>{r.error}</div>}</td>
                    <td className="bc-mono" style={{ fontSize: 11.5, maxWidth: 360, overflowWrap: 'anywhere' }}>{r.parsed ? summarize(r.parsed) : '—'}</td>
                    <td className="bc-mono bc-meta" style={{ fontSize: 11, maxWidth: 320, overflowWrap: 'anywhere' }}>{Object.entries(r.raw).slice(0, 6).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</td>
                    <td>{r.transaction_id ? <Link href={`/admin/finance/transactions/${r.transaction_id}`} className="bc-ref">transaction →</Link> : r.payment_id ? <Link href={`/admin/finance/reconciliation?payment=${r.payment_id}`}>payment →</Link> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <div>
          <Section title="Batch" id="batch">
            <KeyValue rows={[['Source', batch.source_type], ['Adapter', `${spec?.label ?? batch.adapter} v${batch.adapter_version}`], ['Bytes', String(batch.byte_size)], ['SHA-256', <span key="s" className="bc-mono" style={{ fontSize: 11 }}>{batch.sha256}</span>], ['Staged', <><When value={batch.created_at} /> <span className="bc-meta">by {batch.created_by}</span></>], batch.imported_at ? ['Imported', <When key="i" value={batch.imported_at} />] : null, batch.error ? ['Error', batch.error] : null]} />
          </Section>
          {batch.status === 'validated' && mayEdit && (
            <Section title="Import" id="commit">
              <div className="pt-3 grid gap-3">
                {spec?.readiness === 'experimental' && <Notice tone="caution" title="Experimental adapter.">Check the parsed column against the raw row above before importing. Imported rows are posted as facts; a wrong parse is corrected by reversal, not deletion.</Notice>}
                <CommitImportButton batchId={batch.id} />
                <p className="bc-meta" style={{ fontSize: 12 }}>Payments are recorded by provider reference; expenses by a hash of supplier, number, date and amount; Booking.com stays by book number. Re-importing an overlapping statement posts nothing twice.</p>
              </div>
            </Section>
          )}
          {batch.status === 'rejected' && <Notice tone="neutral">Rejected: the file is not this adapter&apos;s format. Nothing was staged for posting.</Notice>}
        </div>
      </div>
    </>
  );
}

function summarize(p: Record<string, unknown>): string {
  const t = p.target as string | undefined;
  if (t === 'payment') return `${p.direction} ${p.source} ${p.providerReference} ${((p.amountCents as number) / 100).toFixed(2)} € ${String(p.occurredAt).slice(0, 10)} ${p.counterpartyLabel ?? ''} ${p.bookingReference ?? ''}`.trim();
  if (t === 'expense') return `${p.counterpartyName} ${p.supplierInvoiceNo ?? ''} ${p.bookedOn} net ${((p.netCents as number) / 100).toFixed(2)} vat ${((p.vatCents as number) / 100).toFixed(2)} gross ${((p.grossCents as number) / 100).toFixed(2)} ${p.categoryHint ?? ''}`.trim();
  if (t === 'revenue') return `${p.bookingReference} ${p.checkIn}–${p.checkOut} ${((p.grossCents as number) / 100).toFixed(2)} € commission ${p.commissionCents ? ((p.commissionCents as number) / 100).toFixed(2) : '—'} ${p.unitHint ?? ''}`.trim();
  return JSON.stringify(p).slice(0, 200);
}
