import type { HealthSectionDto } from '@/lib/admin/dto';
import { HealthBadge } from '@/components/admin/primitives';

/** One measured subsystem: its status, a sentence, and the facts behind it. Used by System and the overview. */
export function HealthSectionCard({ section: s, action }: { section: HealthSectionDto; action?: React.ReactNode }) {
  return (
    <article className="bc-panel" style={{ padding: '16px 18px' }} aria-labelledby={`sys-${s.key}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={`sys-${s.key}`} className="bc-h2">
          {s.title}
        </h2>
        <HealthBadge status={s.status} />
      </div>
      <p className="bc-prose mt-2" style={{ fontSize: 13 }}>
        {s.summary}
      </p>
      {s.facts.length > 0 && (
        <dl className="mt-4 grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', fontSize: 12.5 }}>
          {s.facts.map((f) => (
            <div key={f.label}>
              <dt className="bc-label" style={{ letterSpacing: '0.1em' }}>
                {f.label}
              </dt>
              <dd className="mt-1 bc-num" style={{ color: f.tone ? `hsl(var(--bc-${f.tone === 'muted' ? 'text-3' : f.tone}))` : undefined, fontWeight: f.tone === 'critical' || f.tone === 'caution' ? 600 : 500 }}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {action && <div className="mt-3">{action}</div>}
    </article>
  );
}
