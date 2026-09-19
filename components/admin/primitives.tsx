import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AttentionLevel, HealthStatus } from '@/lib/admin/dto';
import { LEVEL_LABEL } from '@/lib/admin/attention';
import {
  bookingStatePresentation,
  jobStatusPresentation,
  operationOutcomePresentation,
  paymentStatePresentation,
  reconciliationStatePresentation,
  type StatePresentation,
} from '@/lib/admin/presentation';
import { formatInstant, formatRelative } from '@/lib/admin/format';

/* ── Page furniture ────────────────────────────────────────────────── */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="bc-page-head">
      <div className="min-w-0">
        {eyebrow && <p className="bc-label">{eyebrow}</p>}
        <h1 className="bc-h1">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="bc-toolbar">{actions}</div>}
    </header>
  );
}

export function Section({ title, meta, children, className, id }: { title: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`bc-section ${className ?? ''}`} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="bc-section-head">
        <h2 className="bc-h2" id={id ? `${id}-title` : undefined}>
          {title}
        </h2>
        {meta && <div className="bc-meta">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

/* ── Status language ───────────────────────────────────────────────── */

export function Badge({ p, size, ghost, title }: { p: StatePresentation; size?: 'lg'; ghost?: boolean; title?: string }) {
  return (
    <span className={`bc-badge ${size ?? ''} ${ghost ? 'ghost' : ''}`} data-tone={p.tone} title={title ?? p.summary}>
      <i className="bc-glyph" data-glyph={p.glyph} aria-hidden="true" />
      {p.label}
    </span>
  );
}

export function BookingStateBadge({ state, size }: { state: string; size?: 'lg' }) {
  return <Badge p={bookingStatePresentation(state)} size={size} />;
}

export function PaymentStateBadge({ state, size, ghost }: { state: string; size?: 'lg'; ghost?: boolean }) {
  return <Badge p={paymentStatePresentation(state)} size={size} ghost={ghost} />;
}

export function OperationBadge({ outcome }: { outcome: string }) {
  return <Badge p={operationOutcomePresentation(outcome)} />;
}

export function JobBadge({ status }: { status: string }) {
  return <Badge p={jobStatusPresentation(status)} />;
}

export function ReconciliationBadge({ state }: { state: string }) {
  return <Badge p={reconciliationStatePresentation(state)} ghost />;
}

export function LevelBadge({ level }: { level: AttentionLevel }) {
  return (
    <span className="bc-badge" data-level={level} data-tone={undefined}>
      <i className="bc-glyph" data-glyph={level === 'critical' || level === 'high' ? 'alert' : level === 'elevated' ? 'clock' : 'dot'} aria-hidden="true" />
      {LEVEL_LABEL[level]}
    </span>
  );
}

const HEALTH: Record<HealthStatus, { label: string; tone: string; glyph: string }> = {
  healthy: { label: 'Healthy', tone: 'positive', glyph: 'check' },
  attention: { label: 'Attention', tone: 'caution', glyph: 'alert' },
  degraded: { label: 'Degraded', tone: 'critical', glyph: 'alert' },
  not_instrumented: { label: 'Not instrumented', tone: 'muted', glyph: 'dash' },
  unavailable: { label: 'Unavailable', tone: 'neutral', glyph: 'question' },
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  const h = HEALTH[status] ?? HEALTH.unavailable;
  return (
    <span className="bc-badge" data-tone={h.tone}>
      <i className="bc-glyph" data-glyph={h.glyph} aria-hidden="true" />
      {h.label}
    </span>
  );
}

/* ── Time ──────────────────────────────────────────────────────────── */

export function When({ value, relative }: { value: string | null | undefined; relative?: boolean }) {
  if (!value) return <span className="dim">—</span>;
  return (
    <time dateTime={value} title={formatInstant(value, true)} className="bc-num">
      {relative ? formatRelative(value) : formatInstant(value)}
    </time>
  );
}

/* ── Metrics ───────────────────────────────────────────────────────── */

export function Metric({ label, value, note, unavailable }: { label: string; value: ReactNode; note?: ReactNode; unavailable?: boolean }) {
  return (
    <div className="bc-metric">
      <p className="bc-label">{label}</p>
      <p className={`bc-metric-value ${unavailable ? 'unavailable' : ''}`}>{unavailable ? 'Unavailable' : value}</p>
      {note && <p className="bc-metric-note">{note}</p>}
    </div>
  );
}

/* ── Empty / error / degraded ──────────────────────────────────────── */

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="bc-empty">
      <p className="bc-display">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorNotice({ title, children, tone = 'critical' }: { title: string; children?: ReactNode; tone?: 'critical' | 'caution' | 'neutral' }) {
  return (
    <div className="bc-notice" data-tone={tone} role="alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <div>
        <strong>{title}</strong>
        {children && <span> {children}</span>}
      </div>
    </div>
  );
}

export function DegradedNotice({ what }: { what: string }) {
  return (
    <ErrorNotice title="Partially loaded." tone="caution">
      {what} Everything shown is real; what is missing is absent, not zero.
    </ErrorNotice>
  );
}

export function Notice({ tone, title, children, icon = 'info' }: { tone: 'neutral' | 'positive' | 'caution' | 'critical' | 'progress' | 'muted'; title?: string; children: ReactNode; icon?: 'info' | 'warn' | 'check' }) {
  return (
    <div className="bc-notice" data-tone={tone} role="status">
      {icon === 'check' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
      ) : icon === 'warn' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      )}
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

/* ── Key/value ─────────────────────────────────────────────────────── */

export function KeyValue({ rows }: { rows: Array<[string, ReactNode] | null | false> }) {
  return (
    <dl className="bc-kv">
      {rows.filter((r): r is [string, ReactNode] => Boolean(r)).map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd>{v ?? <span className="dim">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Dash() {
  return <span style={{ color: 'hsl(var(--bc-text-3))' }}>—</span>;
}

/* ── Skeleton ──────────────────────────────────────────────────────── */

export function Skeleton({ w = '100%', h = 14, className }: { w?: string | number; h?: number; className?: string }) {
  return <span className={`bc-skel block ${className ?? ''}`} style={{ width: w, height: h }} aria-hidden="true" />;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="bc-meta inline-flex items-center gap-1.5" style={{ color: 'hsl(var(--bc-text-2))' }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m14 6-6 6 6 6" />
      </svg>
      {children}
    </Link>
  );
}
