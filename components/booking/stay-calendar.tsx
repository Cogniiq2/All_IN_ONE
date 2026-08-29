'use client';

/**
 * Date-range calendar for a short stay.
 *
 * ── What it may and may not say ──────────────────────────────────────────
 * It is a *selection* calendar, not an availability calendar. No live source
 * exists (lib/booking/availability.ts), so the only dates it greys out are ones
 * that are unselectable as a matter of fact — days in the past, and departures
 * before the arrival. It never paints a night as free or as taken, because it
 * has no way to know, and a calendar that guesses is worse than no calendar.
 *
 * ── Ready for the PMS ────────────────────────────────────────────────────
 * `blockedDates` is the seam. When the channel manager is connected, its answer
 * is passed in and those days render as unavailable — the visual state already
 * exists and is exercised by the legend. Until then the prop is simply empty
 * and the component tells the visitor, in words, that we confirm the dates
 * personally.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { hasLiveAvailability, todayIso } from '@/lib/booking/availability';

const MONTHS = {
  de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
} as const;

/** Monday-first, as in Germany. */
const WEEKDAYS = {
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days in the grid for a month, Monday-first, with leading blanks. */
function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
}

export function StayCalendar({
  arrival,
  departure,
  onSelect,
  /** Reserved for the PMS. Empty until a real source is connected. */
  blockedDates = [],
  months = 1,
}: {
  arrival?: string;
  departure?: string;
  onSelect: (next: { arrival?: string; departure?: string }) => void;
  blockedDates?: string[];
  months?: 1 | 2;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const today = todayIso();

  const start = arrival && arrival >= today ? arrival : today;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const blocked = useMemo(() => new Set(blockedDates), [blockedDates]);

  const shift = (delta: number) =>
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  const pick = (date: string) => {
    // First click sets arrival. Second sets departure when it is later,
    // otherwise it restarts the range from the new, earlier date.
    if (!arrival || (arrival && departure)) {
      onSelect({ arrival: date, departure: undefined });
    } else if (date > arrival) {
      onSelect({ arrival, departure: date });
    } else {
      onSelect({ arrival: date, departure: undefined });
    }
  };

  const canGoBack = (() => {
    const [ty, tm] = today.split('-').map(Number);
    return cursor.year > ty || (cursor.year === ty && cursor.month > tm - 1);
  })();

  const renderMonth = (offset: number) => {
    const base = new Date(Date.UTC(cursor.year, cursor.month + offset, 1));
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();

    return (
      <div key={`${year}-${month}`} className="flex-1 min-w-0">
        <p className="mb-3 text-center text-[13px] font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          {MONTHS[locale][month]} {year}
        </p>
        <div className="grid grid-cols-7 gap-y-1">
          {WEEKDAYS[locale].map((d) => (
            <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em]"
                 style={{ color: 'hsl(var(--muted-foreground))' }}>
              {d}
            </div>
          ))}
          {monthGrid(year, month).map((day, i) => {
            if (day === null) return <div key={`b${i}`} />;
            const date = iso(year, month, day);
            const past = date < today;
            const isBlocked = blocked.has(date);
            const disabled = past || isBlocked;
            const isArrival = date === arrival;
            const isDeparture = date === departure;
            const inRange =
              Boolean(arrival && departure && date > arrival && date < departure);
            const edge = isArrival || isDeparture;

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => pick(date)}
                aria-label={date}
                aria-pressed={edge || inRange}
                className="relative flex h-10 items-center justify-center text-[13px] transition-colors
                           disabled:cursor-not-allowed"
                style={{
                  borderRadius: 'var(--radius)',
                  background: edge
                    ? 'hsl(var(--foreground))'
                    : inRange
                    ? 'hsl(var(--champagne) / 0.26)'
                    : 'transparent',
                  color: edge
                    ? 'hsl(var(--primary-foreground))'
                    : disabled
                    ? 'hsl(var(--muted-foreground) / 0.32)'
                    : 'hsl(var(--foreground))',
                  fontWeight: edge ? 600 : 400,
                  textDecoration: isBlocked && !past ? 'line-through' : undefined,
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canGoBack}
          className="flex h-10 w-10 items-center justify-center transition-colors disabled:opacity-30"
          style={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
          aria-label={de ? 'Vorheriger Monat' : 'Previous month'}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]"
           style={{ color: 'hsl(var(--champagne-dark))' }}>
          {de ? 'Zeitraum wählen' : 'Choose your dates'}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="flex h-10 w-10 items-center justify-center transition-colors"
          style={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
          aria-label={de ? 'Nächster Monat' : 'Next month'}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex gap-6">
        {Array.from({ length: months }, (_, i) => renderMonth(i))}
      </div>

      {/*
        Says plainly that the greyed-out days are past days, not sold nights.
        Replaced by a real legend once a source is connected.
      */}
      {!hasLiveAvailability() && (
        <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Wir zeigen hier keine belegten Nächte an — ausgegraut sind ausschließlich vergangene Tage. Ob Ihr Zeitraum frei ist, bestätigen wir Ihnen persönlich.'
            : 'No booked-out nights are shown here — only past days are greyed out. Whether your dates are free is something we confirm to you personally.'}
        </p>
      )}
    </div>
  );
}
