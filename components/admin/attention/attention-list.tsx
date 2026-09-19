import Link from 'next/link';
import type { AttentionItem, AttentionLevel } from '@/lib/admin/dto';
import { LEVEL_LABEL, LEVEL_ORDER } from '@/lib/admin/attention';
import { LevelBadge, When } from '@/components/admin/primitives';

const CATEGORY: Record<string, string> = {
  booking: 'Booking',
  external_operation: 'External operation',
  reconciliation: 'Reconciliation',
  payment_inbox: 'Payment inbox',
  outbox: 'Automation',
};

function fact(value: boolean | 'unknown', yes: string, no: string): { text: string; tone: string } {
  if (value === 'unknown') return { text: `${yes}: unknown`, tone: 'neutral' };
  return value ? { text: yes, tone: 'caution' } : { text: no, tone: 'muted' };
}

/** One item of the inbox: the keyline carries the level; the text carries the meaning. */
export function AttentionRow({ item, compact }: { item: AttentionItem; compact?: boolean }) {
  const money = fact(item.moneyInvolved, 'Money involved', 'No money involved');
  const inventory = fact(item.inventoryHeld, 'Inventory held', 'No inventory held');
  const body = (
    <div className="bc-attn" data-level={item.level} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <LevelBadge level={item.level} />
        <span className="bc-label" style={{ letterSpacing: '0.1em' }}>
          {CATEGORY[item.category] ?? item.category}
        </span>
        {item.reference && <span className="bc-ref">{item.reference}</span>}
        {item.unitName && <span className="bc-meta">{item.unitName}</span>}
        <span className="bc-meta ml-auto whitespace-nowrap">
          <When value={item.since} relative />
        </span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{item.title}</p>
      {!compact && (
        <>
          <p className="bc-prose" style={{ fontSize: 13 }}>
            {item.explanation}
          </p>
          <p style={{ fontSize: 13, marginTop: 2 }}>
            <span className="bc-label" style={{ letterSpacing: '0.1em', marginRight: 8 }}>
              Safest next step
            </span>
            {item.nextStep}
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <span className="bc-badge ghost" data-tone={money.tone}>
          {money.text}
        </span>
        <span className="bc-badge ghost" data-tone={inventory.tone}>
          {inventory.text}
        </span>
        {item.code && (
          <span className="bc-mono" style={{ color: 'hsl(var(--bc-text-3))' }}>
            {item.code}
          </span>
        )}
      </div>
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="bc-row-link block" style={{ margin: 0, padding: 0 }} aria-label={`${LEVEL_LABEL[item.level]}: ${item.title}${item.reference ? `, ${item.reference}` : ''}`}>
        {body}
      </Link>
    );
  }
  return body;
}

export function AttentionGroups({ items }: { items: AttentionItem[] }) {
  const levels = (Object.keys(LEVEL_ORDER) as AttentionLevel[]).filter((l) => items.some((i) => i.level === l));
  return (
    <div className="grid gap-8">
      {levels.map((level) => {
        const group = items.filter((i) => i.level === level);
        return (
          <section key={level} aria-labelledby={`attn-${level}`}>
            <div className="bc-section-head">
              <h2 id={`attn-${level}`} className="bc-h2 flex items-center gap-3">
                <LevelBadge level={level} />
                <span>
                  {group.length} {group.length === 1 ? 'item' : 'items'}
                </span>
              </h2>
            </div>
            <div className="bc-rows bc-panel" style={{ padding: '0 4px' }}>
              {group.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function AllClear({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bc-allclear">
      <div className="bc-allclear-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </div>
      <p className="bc-display" style={{ fontSize: 24 }}>
        All clear.
      </p>
      <p className="bc-prose mx-auto" style={{ marginTop: 8, fontSize: 13.5, textAlign: 'center' }}>
        {children ?? 'Nothing in the booking core, the payment inbox, the automation outbox or the reconciliation queue needs a person right now.'}
      </p>
    </div>
  );
}
