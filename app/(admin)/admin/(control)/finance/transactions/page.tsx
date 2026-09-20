import type { Metadata } from 'next';
import Link from 'next/link';
import { loadTransactions, unitNamer } from '@/lib/finance/queries';
import { one, pageOf, qs, type Params } from '@/lib/finance/params';
import { KIND_LABEL, CHANNEL_LABEL } from '@/lib/finance/presentation';
import { categoryLabel } from '@/lib/finance/categories';
import { PageHeader, ErrorNotice, EmptyState } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { Pagination } from '@/components/admin/bookings/pagination';
import { Money, StateBadge, DateCell } from '@/components/admin/finance/primitives';

export const metadata: Metadata = { title: 'Transactions' };

const PAGE_SIZE = 50;

/**
 * The unified operational list: every economic fact with its states,
 * filterable by everything a person actually filters by. Rows link to the
 * detail; no bulk classification exists here by design.
 */
export default async function TransactionsPage({ searchParams }: { searchParams: Params }) {
  const page = pageOf(searchParams);
  const filters = {
    from: one(searchParams, 'from', 10), to: one(searchParams, 'to', 10), kind: one(searchParams, 'kind', 20), sourceType: one(searchParams, 'source', 20), unitId: one(searchParams, 'unit', 60), category: one(searchParams, 'category', 60),
    taxCode: one(searchParams, 'tax', 60), reviewState: one(searchParams, 'review', 30), documentState: one(searchParams, 'document', 20), reconciliationState: one(searchParams, 'reconciliation', 30), paymentState: one(searchParams, 'payment', 20),
    channel: one(searchParams, 'channel', 20), counterpartyId: one(searchParams, 'counterparty', 60), status: one(searchParams, 'status', 20), search: one(searchParams, 'q', 80),
    minGrossCents: one(searchParams, 'min', 12) ? Math.round(Number(one(searchParams, 'min', 12)) * 100) : null, maxGrossCents: one(searchParams, 'max', 12) ? Math.round(Number(one(searchParams, 'max', 12)) * 100) : null,
    sort: (one(searchParams, 'sort', 20) as 'booked_desc' | 'booked_asc' | 'amount_desc' | 'amount_asc' | null) ?? 'booked_desc',
  };
  const asset = one(searchParams, 'asset', 20);
  const result = await loadTransactions({ ...filters, page, pageSize: PAGE_SIZE });
  const hrefFor = (p: number) => `/admin/finance/transactions${qs({ ...Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])), page: p > 1 ? p : null })}`;
  const active = Object.entries(filters).filter(([k, v]) => v && k !== 'sort').length;

  return (
    <>
      <PageHeader eyebrow="Finance" title="Transactions" description="Every economic fact — revenue, expense, refund, commission, fee — with its tax, document, payment and reconciliation state. Money never changes here; corrections are reversals." actions={<RefreshControl loadedAt={result.loadedAt} />} />

      <form action="/admin/finance/transactions" className="bc-panel mb-5" style={{ padding: 12 }} role="search">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <input type="search" name="q" defaultValue={filters.search ?? ''} className="bc-input" placeholder="Description, supplier, reference, invoice no." aria-label="Search" />
          <input type="date" name="from" defaultValue={filters.from ?? ''} className="bc-input" aria-label="From" />
          <input type="date" name="to" defaultValue={filters.to ?? ''} className="bc-input" aria-label="To" />
          <select name="kind" defaultValue={filters.kind ?? ''} className="bc-select" aria-label="Kind"><option value="">Any kind</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select name="source" defaultValue={filters.sourceType ?? ''} className="bc-select" aria-label="Source"><option value="">Any source</option>{['booking', 'payment', 'refund', 'minibar', 'cleaning', 'import', 'manual', 'system'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <select name="channel" defaultValue={filters.channel ?? ''} className="bc-select" aria-label="Channel"><option value="">Any channel</option>{Object.entries(CHANNEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {result.ok && <select name="unit" defaultValue={filters.unitId ?? ''} className="bc-select" aria-label="Unit"><option value="">Any unit</option>{result.data.units.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select>}
          {result.ok && <select name="category" defaultValue={filters.category ?? ''} className="bc-select" aria-label="Category"><option value="">Any category</option>{result.data.categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>}
          {result.ok && <select name="tax" defaultValue={filters.taxCode ?? ''} className="bc-select" aria-label="Tax code"><option value="">Any tax code</option>{result.data.taxCodes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>}
          <select name="review" defaultValue={filters.reviewState ?? ''} className="bc-select" aria-label="Review state"><option value="">Any review state</option>{['auto_verified', 'suggested', 'needs_review', 'reviewed', 'accountant_locked'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          <select name="document" defaultValue={filters.documentState ?? ''} className="bc-select" aria-label="Document state"><option value="">Any document state</option>{['complete', 'missing', 'pending', 'not_required'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          <select name="reconciliation" defaultValue={filters.reconciliationState ?? ''} className="bc-select" aria-label="Reconciliation"><option value="">Any reconciliation</option>{['unmatched', 'partially_matched', 'matched', 'mismatch', 'needs_review', 'not_applicable'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          <select name="payment" defaultValue={filters.paymentState ?? ''} className="bc-select" aria-label="Payment"><option value="">Any payment state</option>{['unpaid', 'partially_paid', 'paid', 'not_applicable'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
          <select name="status" defaultValue={filters.status ?? ''} className="bc-select" aria-label="Status"><option value="">Posted + reversed</option><option value="posted">Posted only</option><option value="reversed">Reversed</option><option value="reversal">Reversals</option></select>
          <input type="number" step="0.01" name="min" defaultValue={filters.minGrossCents ? filters.minGrossCents / 100 : ''} className="bc-input" placeholder="Min €" aria-label="Minimum amount" />
          <input type="number" step="0.01" name="max" defaultValue={filters.maxGrossCents ? filters.maxGrossCents / 100 : ''} className="bc-input" placeholder="Max €" aria-label="Maximum amount" />
          <select name="sort" defaultValue={filters.sort} className="bc-select" aria-label="Sort"><option value="booked_desc">Newest first</option><option value="booked_asc">Oldest first</option><option value="amount_desc">Largest first</option><option value="amount_asc">Smallest first</option></select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="submit" className="bc-btn sm">Filter</button>
          {active > 0 && <Link href="/admin/finance/transactions" className="bc-btn quiet sm">Clear {active}</Link>}
          {asset && <span className="bc-badge ghost" data-tone="caution">Asset filter applies on the detail; use category Furniture / Equipment</span>}
          <Link href="/admin/finance/expenses/new" className="bc-btn sm ml-auto">Post an expense</Link>
        </div>
      </form>

      {!result.ok ? <ErrorNotice title="Transactions could not be loaded.">{result.error}</ErrorNotice> : result.data.rows.length === 0 ? (
        <div className="bc-panel"><EmptyState title="No transactions match.">Widen the range or clear a filter. Booking facts appear after the first ingestion run.</EmptyState></div>
      ) : (
        <>
          <p className="bc-meta mb-2">{result.data.total} transactions · this page: net <Money cents={result.data.sums.netCents} /> · VAT <Money cents={result.data.sums.vatCents} /> · gross <Money cents={result.data.sums.grossCents} /></p>
          <div className="hidden md:block">
            <div className="bc-table-wrap">
              <table className="bc-table">
                <thead><tr><th scope="col">Booked</th><th scope="col">Description</th><th scope="col">Kind · source</th><th scope="col">Unit</th><th scope="col" className="num">Net</th><th scope="col" className="num">VAT</th><th scope="col" className="num">Gross</th><th scope="col">Review</th><th scope="col">Document</th><th scope="col">Money</th></tr></thead>
                <tbody>
                  {result.data.rows.map((t) => {
                    const name = unitNamer(result.data.units);
                    return (
                      <tr key={t.id} data-href={`/admin/finance/transactions/${t.id}`} style={t.status !== 'posted' ? { opacity: 0.6 } : undefined}>
                        <td className="bc-cover"><Link href={`/admin/finance/transactions/${t.id}`}><DateCell iso={t.booked_on} /></Link></td>
                        <td><div style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div><div className="bc-meta">{t.counterparty_label ?? (t.booking_reference ? <span className="bc-ref">{t.booking_reference}</span> : '—')}{t.supplier_invoice_no ? ` · ${t.supplier_invoice_no}` : ''}</div></td>
                        <td><div>{KIND_LABEL[t.kind] ?? t.kind}{t.status !== 'posted' && <span className="bc-badge ghost ml-2" data-tone="neutral">{t.status}</span>}</div><div className="bc-meta">{t.source_type}{t.channel ? ` · ${CHANNEL_LABEL[t.channel] ?? t.channel}` : ''}</div></td>
                        <td className="dim">{name(t.unit_id)}</td>
                        <td className="num"><Money cents={t.net_cents} /></td>
                        <td className="num"><Money cents={t.vat_cents} /></td>
                        <td className="num" style={{ fontWeight: 600 }}><Money cents={t.gross_cents} /></td>
                        <td><StateBadge table="review" value={t.review_state} ghost /></td>
                        <td><StateBadge table="document" value={t.document_state} ghost /></td>
                        <td><StateBadge table="reconciliation" value={t.reconciliation_state} ghost /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="md:hidden bc-cards">
            {result.data.rows.map((t) => (
              <Link key={t.id} href={`/admin/finance/transactions/${t.id}`} className="bc-card">
                <div className="flex items-center justify-between gap-3"><DateCell iso={t.booked_on} /><span style={{ fontWeight: 600 }}><Money cents={t.gross_cents} /></span></div>
                <div className="mt-2 truncate" style={{ fontWeight: 500 }}>{t.description}</div>
                <div className="bc-meta mt-1">{KIND_LABEL[t.kind] ?? t.kind} · {t.counterparty_label ?? t.booking_reference ?? t.source_type}</div>
                <div className="mt-3 flex flex-wrap gap-1.5"><StateBadge table="review" value={t.review_state} ghost /><StateBadge table="document" value={t.document_state} ghost /><StateBadge table="reconciliation" value={t.reconciliation_state} ghost /></div>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.data.total} hrefFor={hrefFor} />
          <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Category labels: {filters.category ? categoryLabel(filters.category) : 'all'}.</p>
        </>
      )}
    </>
  );
}
