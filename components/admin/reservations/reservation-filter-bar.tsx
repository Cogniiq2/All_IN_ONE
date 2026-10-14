'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Segmented } from '@/components/admin/bookings/filter-bar';
import {
  RESERVATION_SOURCES,
  RESERVATION_STATUS_CLASSES,
  hasActiveReservationFilter,
  reservationFilterToParams,
  type ReservationFilter,
  type ReservationWhen,
} from '@/lib/admin/reservation-filters';
import { reservationClassPresentation, sourcePresentation } from '@/lib/admin/presentation';

const WHEN_LABEL: Record<ReservationWhen, string> = { upcoming: 'Upcoming', current: 'In house', past: 'Past', cancelled: 'Cancelled', all: 'All' };
const SELECT = { width: 'auto', minWidth: 140, height: 32, fontSize: 12.5 } as const;

/**
 * URL-backed filters for channel reservations, built like the bookings filter
 * bar: every control writes the query string, so a filtered view is a link.
 */
export function ReservationFilterBar({ filter, units }: { filter: ReservationFilter; units: { slug: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filter.q);
  const first = useRef(true);

  const hrefFor = (patch: Partial<ReservationFilter>) => {
    const params = reservationFilterToParams({ ...filter, ...patch });
    return `${pathname}${params.size ? `?${params}` : ''}`;
  };
  const apply = (patch: Partial<ReservationFilter>) => startTransition(() => router.replace(hrefFor(patch), { scroll: false }));

  useEffect(() => setQ(filter.q), [filter.q]);
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

  const dated = Boolean(filter.from || filter.to);

  return (
    <div className="grid gap-3" style={{ opacity: pending ? 0.75 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
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
            placeholder="Guest, Booking.com / Airbnb reference, Beds24 id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search reservations"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {!dated && (
          <Segmented
            options={(Object.keys(WHEN_LABEL) as ReservationWhen[]).map((w) => ({ key: w, label: WHEN_LABEL[w], href: hrefFor({ when: w }) }))}
            value={filter.when}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="bc-input bc-select" style={SELECT} value={filter.unit ?? ''} onChange={(e) => apply({ unit: e.target.value || null })} aria-label="Property">
          <option value="">All properties</option>
          {units.map((u) => (
            <option key={u.slug} value={u.slug}>
              {u.name}
            </option>
          ))}
        </select>
        <select className="bc-input bc-select" style={SELECT} value={filter.source ?? ''} onChange={(e) => apply({ source: (e.target.value || null) as ReservationFilter['source'] })} aria-label="Channel">
          <option value="">Any channel</option>
          {RESERVATION_SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourcePresentation(s).label}
            </option>
          ))}
        </select>
        <select className="bc-input bc-select" style={SELECT} value={filter.status ?? ''} onChange={(e) => apply({ status: (e.target.value || null) as ReservationFilter['status'] })} aria-label="Status">
          <option value="">Any status</option>
          {RESERVATION_STATUS_CLASSES.map((s) => (
            <option key={s} value={s}>
              {reservationClassPresentation(s).label}
            </option>
          ))}
        </select>
        <label className="bc-meta inline-flex flex-wrap items-center gap-2">
          <span>Stay from</span>
          <input type="date" className="bc-input" style={{ width: 'auto', height: 32, fontSize: 12.5 }} value={filter.from ?? ''} onChange={(e) => apply({ from: e.target.value || null })} aria-label="Stay from" />
        </label>
        <label className="bc-meta inline-flex items-center gap-2">
          <span>to</span>
          <input type="date" className="bc-input" style={{ width: 'auto', height: 32, fontSize: 12.5 }} value={filter.to ?? ''} onChange={(e) => apply({ to: e.target.value || null })} aria-label="Stay before" />
        </label>
        {hasActiveReservationFilter(filter) && (
          <Link href={pathname} className="bc-btn quiet sm">
            Clear
          </Link>
        )}
      </div>
    </div>
  );
}
