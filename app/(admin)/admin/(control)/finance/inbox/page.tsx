import type { Metadata } from 'next';
import { loadFinanceInbox } from '@/lib/finance/queries';
import { countInbox, INBOX_LEVEL_ORDER, type InboxLevel } from '@/lib/finance/inbox';
import { PageHeader, ErrorNotice, Notice, Section } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { InboxRow } from '@/components/admin/finance/inbox-row';
import { RunReconciliationButton } from '@/components/admin/finance/controls';
import { LEVEL_LABEL } from '@/lib/admin/attention';
import { formatCents } from '@/lib/finance/money';

export const metadata: Metadata = { title: 'Finance inbox' };

/**
 * The one list to work: every finance exception, with why, impact and the
 * safest next step. Ordered by cost of ignoring. Working this list down to
 * zero is the daily job; the rest of the finance section is reference.
 */
export default async function FinanceInboxPage() {
  const result = await loadFinanceInbox();
  return (
    <>
      <PageHeader eyebrow="Finance" title="Finance inbox" description="Exceptions only. Everything deterministic has already been done; what is listed here needs a person." actions={<RefreshControl loadedAt={result.loadedAt} />} />
      {!result.ok ? <ErrorNotice title="The inbox could not be loaded.">{result.error}</ErrorNotice> : result.data.items.length === 0 ? (
        <Notice tone="positive" icon="check">Nothing waits. Documents complete, money matched, tax codes classified.</Notice>
      ) : (
        <>
          {(() => {
            const counts = countInbox(result.data.items);
            const impact = result.data.items.reduce((s, i) => s + (i.impactCents ?? 0), 0);
            return <p className="bc-meta mb-4">{counts.critical} critical · {counts.high} high · {counts.elevated} elevated · {counts.watch} watch · known impact {formatCents(impact)}</p>;
          })()}
          <div className="grid gap-8">
            {(Object.keys(INBOX_LEVEL_ORDER) as InboxLevel[]).filter((l) => result.data.items.some((i) => i.level === l)).map((level) => (
              <Section key={level} title={LEVEL_LABEL[level]} meta={`${result.data.items.filter((i) => i.level === level).length}`} id={`level-${level}`}>
                <div className="bc-rows bc-panel" style={{ padding: '0 4px' }}>
                  {result.data.items.filter((i) => i.level === level).map((item) => <InboxRow key={item.id} item={item} />)}
                </div>
              </Section>
            ))}
          </div>
        </>
      )}
      <Section title="Automation" meta="deterministic rules only" id="automation">
        <div className="pt-3 grid gap-3" style={{ maxWidth: 520 }}>
          <RunReconciliationButton />
          <p className="bc-meta" style={{ fontSize: 12 }}>Exact and high-confidence matches (same booking, same amount; a reference that names the invoice) are recorded automatically. Medium ones land here for confirmation. Nothing is guessed silently.</p>
        </div>
      </Section>
    </>
  );
}
