import Link from 'next/link';
import type { QueryResult } from '@/lib/admin/dto';
import type { BookingFinancePanel as Panel } from '@/lib/finance/queries';
import { KIND_LABEL } from '@/lib/finance/presentation';
import { ErrorNotice, When } from '@/components/admin/primitives';
import { Money, StateBadge } from '@/components/admin/finance/primitives';

/** The finance facts of one booking, on the booking page: economic facts, cash facts, invoice, minibar. Read-only. */
export function BookingFinancePanel({ result }: { result: QueryResult<Panel> }) {
  if (!result.ok) return <ErrorNotice title="Finance facts could not be loaded." tone="caution">{result.error}</ErrorNotice>;
  const f = result.data;
  if (f.transactions.length === 0 && f.payments.length === 0) return <p className="bc-meta">No finance fact yet. Revenue is posted when the stay is confirmed and the next ingestion runs; the capture becomes a cash fact at the same time.</p>;
  return (
    <div className="grid gap-3" style={{ fontSize: 13 }}>
      {f.transactions.map((t) => (
        <Link key={t.id} href={`/admin/finance/transactions/${t.id}`} className="flex flex-wrap items-center gap-2 link-quiet" style={{ padding: '6px 0', borderBottom: '1px solid hsl(var(--bc-line))' }}>
          <span className="bc-badge ghost" data-tone={t.kind === 'revenue' ? 'positive' : t.kind === 'refund' ? 'critical' : 'neutral'}>{KIND_LABEL[t.kind] ?? t.kind}</span>
          <span className="truncate">{t.description}</span>
          <StateBadge table="reconciliation" value={t.reconciliation_state} ghost />
          <StateBadge table="document" value={t.document_state} ghost />
          <span className="ml-auto"><Money cents={t.gross_cents} /></span>
        </Link>
      ))}
      {f.payments.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2" style={{ padding: '6px 0', borderBottom: '1px solid hsl(var(--bc-line))' }}>
          <span className="bc-badge ghost" data-tone={p.direction === 'in' ? 'progress' : 'neutral'}>{p.direction === 'in' ? 'Receipt' : 'Payment out'}</span>
          <span className="bc-mono bc-meta">{p.source} · {p.provider_reference}</span>
          <span className="bc-meta"><When value={p.occurred_at} /></span>
          <StateBadge table="reconciliation" value={p.reconciliation_state} ghost />
          <span className="ml-auto"><Money cents={p.direction === 'in' ? p.amount_cents : -p.amount_cents} signed /></span>
        </div>
      ))}
      {f.invoices.map((i) => (
        <Link key={i.id} href={`/admin/finance/invoices/${i.id}`} className="flex flex-wrap items-center gap-2 link-quiet" style={{ padding: '6px 0' }}>
          <span className="bc-badge ghost" data-tone="neutral">{i.kind === 'credit_note' ? 'Credit note' : 'Invoice'}</span>
          <span>{i.number ? `${i.series}-${String(i.number).padStart(5, '0')}` : 'Draft'}</span>
          <StateBadge table="invoice" value={i.status} ghost />
          <span className="ml-auto"><Money cents={i.gross_cents} /></span>
        </Link>
      ))}
      {f.movements.length > 0 && <p className="bc-meta">Minibar: {f.movements.filter((m) => m.movement === 'sale').length} consumption entries · <Link href="/admin/finance/minibar">Minibar →</Link></p>}
    </div>
  );
}
