'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { BOOKING_SOURCES, STATE_GROUPS, filterToParams, type BookingListFilter, type StateGroup } from '@/lib/admin/filters';
import { BOOKING_STATES, PAYMENT_STATES } from '@/lib/booking/states';
import { bookingStatePresentation, paymentStatePresentation, sourcePresentation } from '@/lib/admin/presentation';

const GROUP_LABEL: Record<StateGroup, string> = {
  active: 'Active',
  confirmed: 'Confirmed',
  in_payment: 'In payment',
  exceptions: 'Exceptions',
  closed: 'Closed',
};

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * URL-backed filters. Every control writes to the query string and the page
 * re-renders on the server, so a filtered view is a shareable address and
 * the back button works. The search box debounces; the segmented group
 * control moves a single thumb between options instead of repainting them.
 */
export function FilterBar({ filter, units }: { filter: BookingListFilter; units: { slug: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filter.q);
  const first = useRef(true);

  const apply = (patch: Partial<BookingListFilter>) => {
    const next = { ...filter, ...patch, page: 1 };
    const params = filterToParams(next);
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false }));
  };

  useEffect(() => {
    setQ(filter.q);
  }, [filter.q]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (q === filter.q) return;
    const t = setTimeout(() => apply({ q }), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the typed value only.
  }, [q]);

  const groupHref = (group: StateGroup | null) => {
    const params = filterToParams({ ...filter, group, status: null, page: 1 });
    return `${pathname}${params.size ? `?${params}` : ''}`;
  };

  return (
    <div className="grid gap-3" data-pending={pending ? 'true' : undefined} style={{ opacity: pending ? 0.75 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-[420px]">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--bc-text-3))' }}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            className="bc-input"
            style={{ paddingLeft: 34 }}
            placeholder="Reference, surname, email, external id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search bookings"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Segmented
          options={[{ key: '', label: 'All', href: groupHref(null) }, ...(Object.keys(STATE_GROUPS) as StateGroup[]).map((g) => ({ key: g, label: GROUP_LABEL[g], href: groupHref(g) }))]}
          value={filter.group ?? ''}
        />
        <label className="bc-btn quiet sm" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={filter.attention} onChange={(e) => apply({ attention: e.target.checked })} style={{ accentColor: 'hsl(var(--bc-accent))' }} />
          Attention only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="bc-input bc-select" style={{ width: 'auto', minWidth: 150, height: 32, fontSize: 12.5 }} value={filter.unit ?? ''} onChange={(e) => apply({ unit: e.target.value || null })} aria-label="Property">
          <option value="">All properties</option>
          {units.map((u) => (
            <option key={u.slug} value={u.slug}>
              {u.name}
            </option>
          ))}
        </select>
        <select className="bc-input bc-select" style={{ width: 'auto', minWidth: 150, height: 32, fontSize: 12.5 }} value={filter.status ?? ''} onChange={(e) => apply({ status: (e.target.value || null) as BookingListFilter['status'], group: null })} aria-label="Booking state">
          <option value="">Any state</option>
          {BOOKING_STATES.map((s) => (
            <option key={s} value={s}>
              {bookingStatePresentation(s).label}
            </option>
          ))}
        </select>
        <select className="bc-input bc-select" style={{ width: 'auto', minWidth: 150, height: 32, fontSize: 12.5 }} value={filter.payment ?? ''} onChange={(e) => apply({ payment: (e.target.value || null) as BookingListFilter['payment'] })} aria-label="Payment state">
          <option value="">Any payment</option>
          {PAYMENT_STATES.map((s) => (
            <option key={s} value={s}>
              {paymentStatePresentation(s).label}
            </option>
          ))}
        </select>
        <select className="bc-input bc-select" style={{ width: 'auto', minWidth: 130, height: 32, fontSize: 12.5 }} value={filter.source ?? ''} onChange={(e) => apply({ source: (e.target.value || null) as BookingListFilter['source'] })} aria-label="Source">
          <option value="">Any source</option>
          {BOOKING_SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourcePresentation(s).label}
            </option>
          ))}
        </select>
        <label className="bc-meta inline-flex items-center gap-2">
          <span>Arrival from</span>
          <input type="date" className="bc-input" style={{ width: 'auto', height: 32, fontSize: 12.5 }} value={filter.from ?? ''} onChange={(e) => apply({ from: e.target.value || null })} aria-label="Arrival from" />
        </label>
        <label className="bc-meta inline-flex items-center gap-2">
          <span>to</span>
          <input type="date" className="bc-input" style={{ width: 'auto', height: 32, fontSize: 12.5 }} value={filter.to ?? ''} onChange={(e) => apply({ to: e.target.value || null })} aria-label="Arrival before" />
        </label>
        {(filter.q || filter.unit || filter.status || filter.group || filter.payment || filter.source || filter.from || filter.to || filter.attention) && (
          <Link href={pathname} className="bc-btn quiet sm">
            Clear
          </Link>
        )}
      </div>
    </div>
  );
}

/** A segmented control whose selected thumb slides. Plain links underneath. */
export function Segmented({ options, value }: { options: { key: string; label: string; href: string }[]; value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[aria-current="true"]');
    if (!active) {
      setThumb(null);
      return;
    }
    setThumb({ x: active.offsetLeft, w: active.offsetWidth });
  }, [value, options.length]);

  return (
    <div ref={ref} className="bc-seg" role="group">
      {thumb && <span className="bc-seg-thumb" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w, left: 0 }} aria-hidden="true" />}
      {options.map((o) => (
        <Link key={o.key} href={o.href} aria-current={o.key === value ? 'true' : undefined} replace scroll={false}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
