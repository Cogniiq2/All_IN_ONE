import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadDocuments } from '@/lib/finance/queries';
import { one, pageOf, qs, type Params } from '@/lib/finance/params';
import { DOCUMENT_TYPE_LABEL } from '@/lib/finance/presentation';
import { RETENTION_CLASSES } from '@/lib/finance/documents';
import { PageHeader, Section, ErrorNotice, EmptyState, Notice, When } from '@/components/admin/primitives';
import { Pagination } from '@/components/admin/bookings/pagination';
import { Money, DateCell } from '@/components/admin/finance/primitives';
import { ActionForm, LinkDocumentButton } from '@/components/admin/finance/controls';
import * as actions from '@/lib/finance/actions';

export const metadata: Metadata = { title: 'Documents' };

const PAGE_SIZE = 50;

export default async function DocumentsPage({ searchParams }: { searchParams: Params }) {
  const page = pageOf(searchParams);
  const type = one(searchParams, 'type', 60);
  const q = one(searchParams, 'q', 80);
  const [result, operator] = await Promise.all([loadDocuments({ type, search: q, page, pageSize: PAGE_SIZE }), currentOperator()]);
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  const hrefFor = (p: number) => `/admin/finance/documents${qs({ type, q, page: p > 1 ? p : null })}`;
  return (
    <>
      <PageHeader eyebrow="Finance" title="Documents" description="The evidence registry: every invoice, statement and notice, hashed on arrival, versioned, never overwritten, with its retention class. Nothing here deletes." />
      {!result.ok ? <ErrorNotice title="Documents could not be loaded.">{result.error}</ErrorNotice> : (
        <>
          {result.data.missing.length > 0 && (
            <div className="mb-5">
              <Notice tone="caution" title={`${result.data.missing.length} transaction${result.data.missing.length === 1 ? '' : 's'} without a document.`}>
                {result.data.missing.slice(0, 4).map((t) => <Link key={t.id} href={`/admin/finance/transactions/${t.id}`} className="bc-ref mr-2">{t.counterparty_label ?? t.description}</Link>)}
                <Link href="/admin/finance/transactions?document=missing">all →</Link>
              </Notice>
            </div>
          )}
          {!result.data.config.documentStorageConfigured && <div className="mb-5"><Notice tone="neutral">No private storage bucket is configured (FINANCE_DOCUMENT_BUCKET): uploads are registered and hashed but the bytes are not stored. Configure the bucket before relying on the registry as the archive.</Notice></div>}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <form action="/admin/finance/documents" className="mb-4 flex flex-wrap items-center gap-2" role="search">
                <input type="search" name="q" defaultValue={q ?? ''} className="bc-input" style={{ maxWidth: 320 }} placeholder="File name" aria-label="Search documents" />
                <select name="type" defaultValue={type ?? ''} className="bc-select"><option value="">Any type</option>{Object.entries(DOCUMENT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <button type="submit" className="bc-btn sm">Search</button>
                {(q || type) && <Link href="/admin/finance/documents" className="bc-btn quiet sm">Clear</Link>}
              </form>
              {result.data.rows.length === 0 ? <div className="bc-panel"><EmptyState title="No documents registered." /></div> : (
                <>
                  <div className="bc-rows bc-panel" style={{ padding: '0 12px' }}>
                    {result.data.rows.map((d) => {
                      const links = result.data.links.filter((l) => l.document_id === d.id);
                      return (
                        <div key={d.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><span className="truncate" style={{ fontWeight: 500 }}>{d.original_filename}</span><span className="bc-badge ghost" data-tone="neutral">{DOCUMENT_TYPE_LABEL[d.document_type] ?? d.document_type}</span>{d.structured_format !== 'none' && d.structured_format !== 'pdf_only' && <span className="bc-badge ghost" data-tone="progress">{d.structured_format}{d.structured_valid === null ? ' · validity not asserted' : d.structured_valid ? ' · valid' : ' · invalid'}</span>}{d.legal_hold && <span className="bc-badge" data-tone="critical">legal hold</span>}{d.supersedes_id && <span className="bc-badge ghost" data-tone="muted">new version</span>}</div>
                            <div className="bc-meta mt-1">{d.document_date ? <DateCell iso={d.document_date} /> : '—'} · {(d.byte_size / 1024).toFixed(0)} KB · {d.mime_type} · sha256 <span className="bc-mono">{d.sha256.slice(0, 12)}…</span></div>
                            <div className="bc-meta">{RETENTION_CLASSES[d.retention_class as keyof typeof RETENTION_CLASSES]?.label ?? d.retention_class} · retain until {d.retain_until ?? 'unclassified'}{d.retention_review ? ' · adviser to confirm' : ''} · {links.length === 0 ? <span style={{ color: 'hsl(var(--bc-caution))' }}>not linked to any record</span> : links.map((l) => <Link key={l.id} href={l.target_type === 'transaction' ? `/admin/finance/transactions/${l.target_id}` : l.target_type === 'invoice' ? `/admin/finance/invoices/${l.target_id}` : '/admin/finance/taxes#notices'} className="mr-2">{l.target_type} →</Link>)}</div>
                          </div>
                          <span className="bc-meta whitespace-nowrap"><When value={d.received_at} relative /></span>
                        </div>
                      );
                    })}
                  </div>
                  <Pagination page={page} pageSize={PAGE_SIZE} total={result.data.total} hrefFor={hrefFor} />
                </>
              )}
            </div>
            <div>
              {mayEdit ? (
                <Section title="Register a document" meta="hashed on arrival" id="upload">
                  <div className="pt-3">
                    <ActionForm action={actions.uploadDocumentAction} submitLabel="Register" success={(r) => (r.duplicate ? 'Already registered (same content). Nothing duplicated.' : 'Registered. Link it from the transaction it evidences, or below.')}>
                      <label className="bc-field"><span className="bc-label">File</span><input name="file" type="file" className="bc-input" required accept=".pdf,.jpg,.jpeg,.png,.webp,.xml,.csv,.txt" /></label>
                      <div className="row">
                        <label className="bc-field"><span className="bc-label">Type</span><select name="document_type" className="bc-select" defaultValue="supplier_invoice">{Object.entries(DOCUMENT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                        <label className="bc-field"><span className="bc-label">Document date</span><input name="document_date" type="date" className="bc-input" /></label>
                        <label className="bc-field"><span className="bc-label">Counterparty</span><select name="counterparty_id" className="bc-select" defaultValue=""><option value="">—</option>{result.data.counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                      </div>
                      <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" /></label>
                    </ActionForm>
                  </div>
                </Section>
              ) : <Notice tone="neutral">Documents are registered by operators. Your session is read-only here.</Notice>}
              {mayEdit && result.data.missing.length > 0 && result.data.rows.some((d) => !result.data.links.some((l) => l.document_id === d.id)) && (
                <Section title="Link an unlinked document" meta="to a transaction missing one" id="link">
                  <div className="bc-rows">
                    {result.data.rows.filter((d) => !result.data.links.some((l) => l.document_id === d.id)).slice(0, 5).map((d) => (
                      <div key={d.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                        <div className="truncate" style={{ fontWeight: 500 }}>{d.original_filename}</div>
                        <div className="mt-1 grid gap-1">
                          {result.data.missing.slice(0, 3).map((t) => <div key={t.id} className="flex items-center justify-between gap-2 bc-meta"><span className="truncate">{t.counterparty_label ?? t.description} · <Money cents={t.gross_cents} /></span><LinkDocumentButton documentId={d.id} targetType="transaction" targetId={t.id} /></div>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              <Section title="Retention classes" meta="planning dates — nothing deletes" id="retention">
                <table className="bc-mini-table">
                  <thead><tr><th>Class</th><th className="num">Years</th><th>Basis</th></tr></thead>
                  <tbody>{Object.entries(RETENTION_CLASSES).map(([k, v]) => <tr key={k}><td>{v.label}</td><td className="num">{v.years ?? '—'}</td><td className="bc-meta">{v.basis}</td></tr>)}</tbody>
                </table>
              </Section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
