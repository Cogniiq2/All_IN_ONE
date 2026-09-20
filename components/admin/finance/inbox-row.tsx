import Link from 'next/link';
import type { InboxItem } from '@/lib/finance/inbox';
import { formatCents } from '@/lib/finance/money';
import { LevelBadge, When } from '@/components/admin/primitives';

const KIND_LABEL: Record<string, string> = {
  missing_document: 'Document', unknown_transaction: 'Unknown', tax_classification: 'Tax code', reverse_charge_review: 'Reverse charge', input_vat_review: 'Input VAT', payout_mismatch: 'Payout',
  duplicate_suspect: 'Duplicate?', unmatched_refund: 'Refund', unmatched_payment: 'Payment', unreconciled_revenue: 'Revenue', unallocated_cost: 'Allocation', tax_notice: 'Notice', tax_deadline: 'Deadline',
  missing_invoice_number: 'Invoice no.', minibar_variance: 'Minibar', asset_candidate: 'Asset', reserve_gap: 'Reserve', import_failed: 'Import', match_proposal: 'Match',
};

export function InboxRow({ item, compact }: { item: InboxItem; compact?: boolean }) {
  const body = (
    <div className="bc-attn" data-level={item.level} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <LevelBadge level={item.level} />
        <span className="bc-label" style={{ letterSpacing: '0.1em' }}>{KIND_LABEL[item.kind] ?? item.kind}</span>
        {item.reference && <span className="bc-ref">{item.reference}</span>}
        <span className="bc-meta ml-auto whitespace-nowrap"><When value={item.since} relative /></span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{item.title}</p>
      {!compact && (
        <>
          <p className="bc-prose" style={{ fontSize: 13 }}>{item.why}</p>
          <p style={{ fontSize: 13, marginTop: 2 }}><span className="bc-label" style={{ letterSpacing: '0.1em', marginRight: 8 }}>Safest next step</span>{item.nextStep}</p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <span className="bc-badge ghost" data-tone={item.impactCents === null ? 'muted' : 'caution'}>{item.impactCents === null ? 'Impact: unknown' : `Impact ${formatCents(item.impactCents)}`}</span>
      </div>
    </div>
  );
  return (
    <Link href={item.href} className="bc-row-link block" style={{ margin: 0, padding: 0 }} aria-label={`${item.level}: ${item.title}`}>
      {body}
    </Link>
  );
}
