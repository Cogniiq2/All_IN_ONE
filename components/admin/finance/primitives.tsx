import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCents, formatRate } from '@/lib/finance/money';
import { present } from '@/lib/finance/presentation';
import { formatIsoDate } from '@/lib/admin/format';
import type { Figure } from '@/lib/finance/queries';

/* ── Money ──────────────────────────────────────────────────────────── */

export function Money({ cents, signed, compact, className }: { cents: number | null | undefined; signed?: boolean; compact?: boolean; className?: string }) {
  if (cents === null || cents === undefined) return <span className="dim">—</span>;
  return (
    <span className={`bc-amount ${className ?? ''}`} data-negative={cents < 0 ? 'true' : undefined}>
      {formatCents(cents, 'EUR', { signed, compact })}
    </span>
  );
}

export function Pct({ ratio, digits = 0 }: { ratio: number | null | undefined; digits?: number }) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return <span className="dim">—</span>;
  return <span className="bc-num">{(ratio * 100).toFixed(digits)} %</span>;
}

export function Rate({ bp }: { bp: number }) {
  return <span className="bc-num">{formatRate(bp)}</span>;
}

/* ── Provenance and states ─────────────────────────────────────────── */

export function Provenance({ value, size }: { value: string; size?: 'lg' }) {
  const p = present('provenance', value);
  return (
    <span className={`bc-badge ghost ${size ?? ''}`} data-tone={p.tone} title={p.summary}>
      <i className="bc-glyph" data-glyph={p.glyph} aria-hidden="true" />
      {p.label}
    </span>
  );
}

export function StateBadge({ table, value, ghost }: { table: 'review' | 'document' | 'payment' | 'reconciliation' | 'txstatus' | 'period' | 'taxperiod' | 'stage' | 'batch' | 'charge' | 'invoice'; value: string | null | undefined; ghost?: boolean }) {
  const p = present(table, value);
  return (
    <span className={`bc-badge ${ghost ? 'ghost' : ''}`} data-tone={p.tone} title={p.summary}>
      <i className="bc-glyph" data-glyph={p.glyph} aria-hidden="true" />
      {p.label}
    </span>
  );
}

/* ── Figures ────────────────────────────────────────────────────────── */

export function FigureTile({ label, figure, note, href }: { label: string; figure: Figure; note?: ReactNode; href?: string }) {
  const target = href ?? figure.href;
  const inner = (
    <>
      <p className="bc-label">{label}</p>
      <p className={`bc-figure-value ${figure.cents === null ? 'unavailable' : ''}`} data-negative={(figure.cents ?? 0) < 0 ? 'true' : undefined}>
        {figure.cents === null ? 'Unknown' : formatCents(figure.cents)}
      </p>
      <p className="bc-figure-note">
        <Provenance value={figure.provenance} />
        {note ?? figure.note}
      </p>
    </>
  );
  return target ? <Link href={target} className="bc-figure">{inner}</Link> : <div className="bc-figure">{inner}</div>;
}

export function PlainFigure({ label, cents, provenance = 'actual', note, href, value }: { label: string; cents?: number | null; provenance?: string; note?: ReactNode; href?: string; value?: ReactNode }) {
  const inner = (
    <>
      <p className="bc-label">{label}</p>
      <p className={`bc-figure-value ${cents === null && !value ? 'unavailable' : ''}`} data-negative={(cents ?? 0) < 0 ? 'true' : undefined}>
        {value ?? (cents === null || cents === undefined ? 'Unknown' : formatCents(cents))}
      </p>
      <p className="bc-figure-note">
        <Provenance value={provenance} />
        {note}
      </p>
    </>
  );
  return href ? <Link href={href} className="bc-figure">{inner}</Link> : <div className="bc-figure">{inner}</div>;
}

/* ── Ledger rows ────────────────────────────────────────────────────── */

export function LedgerRow({ label, cents, level = 0, total, href, meta }: { label: ReactNode; cents: number | null; level?: 0 | 1; total?: boolean | 'estimate'; href?: string; meta?: ReactNode }) {
  const body = (
    <div className="bc-ledger-row" data-level={level} data-total={total === true ? 'true' : total === 'estimate' ? 'estimate' : undefined}>
      <span className="min-w-0 truncate">
        {label}
        {meta && <span className="bc-meta ml-2">{meta}</span>}
      </span>
      <Money cents={cents} />
    </div>
  );
  return href ? <Link href={href} className="block link-quiet">{body}</Link> : body;
}

/* ── Bars ───────────────────────────────────────────────────────────── */

export function Bars({ points, valueKey = 'result' }: { points: Array<{ month: string; revenueCents: number; costsCents: number; operatingResultCents: number }>; valueKey?: 'result' | 'revenue' }) {
  if (points.length === 0) return <p className="bc-meta">No months to show.</p>;
  const max = Math.max(1, ...points.map((p) => Math.max(p.revenueCents, p.costsCents)));
  return (
    <div className="bc-bars" style={{ ['--n' as string]: points.length }} role="img" aria-label="Revenue and costs by month">
      {points.map((p) => (
        <div key={p.month} className="bc-bar-col" title={`${p.month}: revenue ${formatCents(p.revenueCents)}, costs ${formatCents(p.costsCents)}, result ${formatCents(p.operatingResultCents)}`}>
          <i style={{ height: `${Math.round((Math.max(0, p.revenueCents) / max) * 100)}%` }} data-kind={valueKey === 'revenue' ? 'result' : undefined} />
          <i data-kind="cost" style={{ height: `${Math.round((Math.max(0, p.costsCents) / max) * 100)}%`, marginTop: 1 }} />
          <span className="bc-bar-label">{p.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function Gauge({ ratio }: { ratio: number | null }) {
  const pct = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  const tone = ratio === null ? 'muted' : pct >= 1 ? 'positive' : pct >= 0.5 ? 'caution' : 'critical';
  return (
    <div className="bc-gauge" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct * 100}%` }} data-tone={tone} />
    </div>
  );
}

/* ── Range picker (GET form) ────────────────────────────────────────── */

export function RangeForm({ action, from, to, presets, extra }: { action: string; from: string; to: string; presets?: Array<{ label: string; from: string; to: string }>; extra?: ReactNode }) {
  return (
    <form action={action} className="mb-5 flex flex-wrap items-end gap-2" role="search">
      <label className="bc-field"><span className="bc-label">From</span><input type="date" name="from" defaultValue={from} className="bc-input" /></label>
      <label className="bc-field"><span className="bc-label">To (exclusive)</span><input type="date" name="to" defaultValue={to} className="bc-input" /></label>
      {extra}
      <button type="submit" className="bc-btn sm">Apply</button>
      {presets && presets.length > 0 && (
        <span className="bc-seg" role="group" aria-label="Presets">
          {presets.map((p) => (
            <Link key={p.label} href={`${action}?from=${p.from}&to=${p.to}`} aria-current={p.from === from && p.to === to ? 'true' : undefined}>{p.label}</Link>
          ))}
        </span>
      )}
    </form>
  );
}

export function DateCell({ iso }: { iso: string | null | undefined }) {
  return <span className="bc-num dim">{iso ? formatIsoDate(iso, 'long') : '—'}</span>;
}

export function Caveats({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="bc-prose mt-3 grid gap-1" style={{ fontSize: 12.5, color: 'hsl(var(--bc-caution))' }}>
      {items.map((c) => (
        <li key={c}>· {c}</li>
      ))}
    </ul>
  );
}
