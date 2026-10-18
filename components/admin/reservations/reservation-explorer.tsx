'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  BOOKED_LABEL,
  STAY_LABEL,
  addDaysIso,
  effectiveShow,
  hasActiveReservationFilter,
  reservationFilterToParams,
  type ReservationBooked,
  type ReservationFilter,
  type ReservationShow,
  type ReservationWhen,
} from '@/lib/admin/reservation-filters';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The reservations explorer.
 *
 * Four plain questions, each answered with one tap — when are they staying,
 * when was it booked, which apartment, what to show — and the answer is
 * repeated back as a sentence. Every choice is URL state, so a view is a
 * link, the back button works, and "Save as PDF" exports exactly that view.
 *
 * Feedback: a chip lights the moment it is tapped (optimistic), a hairline
 * progress bar runs while the server answers, the results dim and then settle
 * in. All motion is transform/opacity and stops under reduced motion.
 * ══════════════════════════════════════════════════════════════════════════
 */

type Unit = { slug: string; name: string; short: string };

const STAY_CHIPS = (Object.keys(STAY_LABEL) as Array<keyof typeof STAY_LABEL>).filter((k) => k !== 'all');
const BOOKED_CHIPS: ReservationBooked[] = ['any', 'today', 'last_7', 'last_30', 'this_month'];
const SHOW_LABEL: Record<ReservationShow, string> = { booked: 'Booked', cancelled: 'Cancelled', all: 'Everything' };
const CHANNELS: Array<{ key: ReservationFilter['source']; label: string }> = [
  { key: null, label: 'All channels' },
  { key: 'booking_com', label: 'Booking.com' },
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'direct', label: 'Website' },
  { key: 'manual', label: 'Manual' },
];

export function ReservationExplorer({ filter, units, children }: { filter: ReservationFilter; units: Unit[]; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // What the controls show: the server's filter, overlaid by the tap that is still travelling.
  const [view, setView] = useState(filter);
  const [q, setQ] = useState(filter.q);
  const [stayDates, setStayDates] = useState(Boolean(filter.from || filter.to));
  const [bookedDates, setBookedDates] = useState(filter.booked === 'custom');
  const firstSearch = useRef(true);

  const serverKey = reservationFilterToParams(filter).toString();
  useEffect(() => {
    setView(filter);
    setQ(filter.q);
    setStayDates(Boolean(filter.from || filter.to));
    setBookedDates(filter.booked === 'custom');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the serialised filter is the identity.
  }, [serverKey]);

  // The latest choice, so two quick taps build on each other rather than on a stale render.
  const viewRef = useRef(view);
  viewRef.current = view;
  const apply = useCallback(
    (patch: Partial<ReservationFilter>) => {
      const next = { ...viewRef.current, ...patch };
      viewRef.current = next;
      setView(next);
      const params = reservationFilterToParams(next);
      startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false }));
    },
    [pathname, router]
  );

  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    if (q === view.q) return;
    const t = setTimeout(() => apply({ q: q.trim() }), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the typed value only.
  }, [q]);

  const stayValue: string = stayDates ? 'dates' : view.when === 'cancelled' ? 'all' : view.when;
  const show = view.status === 'active' ? 'booked' : view.status === 'cancelled' ? 'cancelled' : effectiveShow(view);
  const exportParams = reservationFilterToParams(filter).toString();

  return (
    <div className="bx" data-pending={pending ? 'true' : undefined}>
      <div className="bx-progress" aria-hidden="true" />

      <div className="bx-top">
        <label className="bx-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            placeholder="Guest name or booking number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search reservations"
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="bx-search-clear" onClick={() => setQ('')} aria-label="Clear search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </label>
        <PdfSaveButton query={exportParams} />
      </div>

      <div className="bx-panel">
        <FilterRow label="Staying" hint="When the guests are in the apartment">
          <Chips
            label="Staying"
            value={stayValue}
            options={[
              ...STAY_CHIPS.map((k) => ({ key: k, label: STAY_LABEL[k] })),
              { key: 'all', label: STAY_LABEL.all },
              { key: 'dates', label: 'Choose dates', icon: 'calendar' as const },
            ]}
            onSelect={(key) => {
              if (key === 'dates') {
                setStayDates(true);
                return;
              }
              setStayDates(false);
              apply({ when: key as ReservationWhen, from: null, to: null });
            }}
          />
          {stayDates && (
            <DateRange
              fromLabel="Arriving or staying from"
              toLabel="until"
              from={view.from}
              // `to` is the exclusive end in the URL; people think in the last day.
              to={view.to ? addDaysIso(view.to, -1) : null}
              onChange={(from, until) => apply({ from, to: until ? addDaysIso(until, 1) : null })}
            />
          )}
        </FilterRow>

        <FilterRow label="Booked" hint="When the guest made the booking">
          <Chips
            label="Booked"
            value={bookedDates ? 'custom' : view.booked}
            options={[...BOOKED_CHIPS.map((k) => ({ key: k, label: BOOKED_LABEL[k] })), { key: 'custom', label: BOOKED_LABEL.custom, icon: 'calendar' as const }]}
            onSelect={(key) => {
              if (key === 'custom') {
                setBookedDates(true);
                return;
              }
              setBookedDates(false);
              apply({ booked: key as ReservationBooked, bookedFrom: null, bookedTo: null });
            }}
          />
          {bookedDates && (
            <DateRange
              fromLabel="Booked from"
              toLabel="until"
              from={view.bookedFrom}
              to={view.bookedTo}
              onChange={(from, until) => apply({ booked: from || until ? 'custom' : 'any', bookedFrom: from, bookedTo: until })}
            />
          )}
        </FilterRow>

        <FilterRow label="Apartment">
          <div className="bx-units" role="radiogroup" aria-label="Apartment">
            {[{ slug: '', short: 'All apartments', name: 'Every apartment' }, ...units].map((u) => {
              const on = (view.unit ?? '') === u.slug;
              const detail = u.slug ? u.name.split(' · ')[1] ?? null : 'Every apartment together';
              return (
                <button key={u.slug || 'all'} type="button" role="radio" aria-checked={on} className="bx-unit" onClick={() => apply({ unit: u.slug || null })}>
                  <span className="bx-unit-name">{u.short}</span>
                  {detail && <span className="bx-unit-detail">{detail}</span>}
                  <Tick />
                </button>
              );
            })}
          </div>
        </FilterRow>

        <div className="bx-row-pair">
          <FilterRow label="Show">
            <Chips
              label="Show"
              value={show}
              options={(Object.keys(SHOW_LABEL) as ReservationShow[]).map((k) => ({ key: k, label: SHOW_LABEL[k] }))}
              onSelect={(key) => apply({ show: key as ReservationShow, status: null, when: view.when === 'cancelled' ? 'all' : view.when })}
            />
          </FilterRow>
          <FilterRow label="Sort by">
            <Chips
              label="Sort by"
              value={view.order}
              options={[
                { key: 'arrival', label: 'Arrival date' },
                { key: 'booked', label: 'Booking date' },
              ]}
              onSelect={(key) => apply({ order: key as ReservationFilter['order'] })}
            />
          </FilterRow>
        </div>

        <FilterRow label="Channel">
          <Chips label="Channel" value={view.source ?? ''} options={CHANNELS.map((c) => ({ key: c.key ?? '', label: c.label }))} onSelect={(key) => apply({ source: (key || null) as ReservationFilter['source'] })} />
        </FilterRow>

        {hasActiveReservationFilter(view) && (
          <div className="bx-reset">
            <button
              type="button"
              className="bc-btn quiet sm"
              onClick={() => {
                setQ('');
                setStayDates(false);
                setBookedDates(false);
                setView({ ...view, q: '', unit: null, source: null, status: null, show: null, from: null, to: null, when: 'upcoming', booked: 'any', bookedFrom: null, bookedTo: null, order: 'arrival' });
                startTransition(() => router.replace(pathname, { scroll: false }));
              }}
            >
              Start over
            </button>
          </div>
        )}
      </div>

      <div key={serverKey} className="bx-results">
        {children}
      </div>
    </div>
  );
}

/* ── Building blocks ──────────────────────────────────────────────────── */

function FilterRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bx-row">
      <div className="bx-row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="bx-row-body">{children}</div>
    </div>
  );
}

function Chips({ label, value, options, onSelect }: { label: string; value: string; options: Array<{ key: string; label: string; icon?: 'calendar' }>; onSelect: (key: string) => void }) {
  return (
    <div className="bx-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key || 'none'} type="button" role="radio" aria-checked={o.key === value} className="bx-chip" onClick={() => o.key !== value && onSelect(o.key)}>
          {o.icon === 'calendar' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M4 10h16M9 3v4M15 3v4" />
            </svg>
          ) : (
            <Tick />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tick() {
  return (
    <svg className="bx-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function DateRange({ fromLabel, toLabel, from, to, onChange }: { fromLabel: string; toLabel: string; from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void }) {
  return (
    <div className="bx-dates">
      <label>
        <span>{fromLabel}</span>
        <input type="date" className="bc-input" value={from ?? ''} max={to ?? undefined} onChange={(e) => onChange(e.target.value || null, to)} />
      </label>
      <label>
        <span>{toLabel}</span>
        <input type="date" className="bc-input" value={to ?? ''} min={from ?? undefined} onChange={(e) => onChange(from, e.target.value || null)} />
      </label>
    </div>
  );
}

/* ── Save as PDF ──────────────────────────────────────────────────────── */

type SaveState = { phase: 'idle' } | { phase: 'saving' } | { phase: 'done'; name: string } | { phase: 'error'; message: string };

/**
 * Downloads the PDF of exactly this view. It fetches the file first, so the
 * button can show progress and then confirm by name — a plain link would
 * leave the owner wondering whether anything happened.
 */
function PdfSaveButton({ query }: { query: string }) {
  const [state, setState] = useState<SaveState>({ phase: 'idle' });

  useEffect(() => {
    if (state.phase !== 'done' && state.phase !== 'error') return;
    const t = setTimeout(() => setState({ phase: 'idle' }), state.phase === 'done' ? 4200 : 6500);
    return () => clearTimeout(t);
  }, [state]);

  const save = async () => {
    if (state.phase === 'saving') return;
    setState({ phase: 'saving' });
    try {
      const response = await fetch(`/admin/reservations/export${query ? `?${query}` : ''}`, { credentials: 'same-origin', cache: 'no-store' });
      const type = response.headers.get('Content-Type') ?? '';
      if (!response.ok || !type.includes('application/pdf')) {
        let message = response.status === 401 || response.redirected ? 'Your session has ended. Sign in again, then save.' : 'The PDF could not be made. Try again in a moment.';
        if (type.includes('application/json')) message = ((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? message;
        setState({ phase: 'error', message });
        return;
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'bolagio-reservations.pdf';
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ phase: 'done', name });
    } catch {
      setState({ phase: 'error', message: 'No connection. Check the network and try again.' });
    }
  };

  return (
    <>
      <button type="button" className="bc-btn primary bx-pdf" data-state={state.phase} onClick={save} aria-busy={state.phase === 'saving'}>
        <span className="bx-pdf-icon" aria-hidden="true">
          {state.phase === 'done' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          ) : state.phase === 'saving' ? (
            <span className="bx-spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
            </svg>
          )}
        </span>
        {state.phase === 'saving' ? 'Preparing PDF…' : state.phase === 'done' ? 'Saved' : 'Save as PDF'}
      </button>
      <div className="bx-toast-host" role="status" aria-live="polite">
        {state.phase === 'done' && (
          <div className="bx-toast" data-tone="positive">
            <strong>PDF saved</strong>
            <span>{state.name} is in your downloads.</span>
          </div>
        )}
        {state.phase === 'error' && (
          <div className="bx-toast" data-tone="critical">
            <strong>Not saved</strong>
            <span>{state.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
