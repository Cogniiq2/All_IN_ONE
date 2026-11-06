import type { Preflight } from '@/lib/booking/live-test';
import { Notice } from '@/components/admin/primitives';

const TONE = { pass: 'positive', fail: 'critical', manual: 'neutral' } as const;
const WORD = { pass: 'Pass', fail: 'Fail', manual: 'Check yourself' } as const;

/** The approved live test, as one go / no-go with every reason named. Read-only. */
export function LivePreflight({ preflight: p }: { preflight: Preflight }) {
  return (
    <div className="grid gap-3 pt-3">
      <Notice tone={p.go ? 'positive' : 'caution'} icon={p.go ? 'check' : 'warn'}>
        {p.go ? 'GO' : 'NO-GO'} — Schulstraße II, {p.test.checkIn} → {p.test.checkOut}. Checked {new Date(p.checkedAt).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' })} (Berlin);
        refresh this page immediately before booking. {p.go ? 'Also confirm the three “check yourself” items.' : 'Do not book until every failed check passes.'}
      </Notice>
      <div className="bc-rows">
        {p.checks.map((c) => (
          <div key={c.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '8px 0' }}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bc-badge" data-tone={TONE[c.state]}>{WORD[c.state]}</span>
                <span style={{ fontWeight: 500 }}>{c.label}</span>
              </div>
              <div className="bc-meta mt-0.5">{c.detail}</div>
            </div>
            <span className="bc-meta whitespace-nowrap">{c.group}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
