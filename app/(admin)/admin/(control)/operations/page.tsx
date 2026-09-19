import type { Metadata } from 'next';
import { cachedAttention } from '@/lib/admin/request-cache';
import { countByLevel } from '@/lib/admin/attention';
import { PageHeader, ErrorNotice, DegradedNotice } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { AttentionGroups, AllClear } from '@/components/admin/attention/attention-list';

export const metadata: Metadata = { title: 'Attention' };

/**
 * The inbox. Everything the booking core, the payment inbox, the external
 * operations ledger, the automation outbox and the reconciliation queue
 * flag, in one ordered list. There is no "retry all": every item says what
 * the safest next step is, and for most of them it is to let a read of the
 * provider happen.
 */
export default async function OperationsPage() {
  const result = await cachedAttention();
  const items = result.ok ? result.data.items : [];
  const counts = countByLevel(items);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Attention"
        description={
          items.length === 0
            ? 'Every exception the system can detect, ordered by what it would cost to ignore.'
            : `${counts.critical} critical · ${counts.high} high · ${counts.elevated} elevated · ${counts.watch} watch`
        }
        actions={<RefreshControl loadedAt={result.loadedAt} every={60} />}
      />

      {!result.ok ? (
        <ErrorNotice title="The attention inbox could not be loaded.">{result.error}</ErrorNotice>
      ) : (
        <>
          {result.data.degraded.length > 0 && (
            <div className="mb-6">
              <DegradedNotice what={`Could not read: ${result.data.degraded.join(', ')}.`} />
            </div>
          )}
          {items.length === 0 ? <AllClear /> : <AttentionGroups items={items} />}
        </>
      )}
    </>
  );
}
