'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE STAY CALENDAR.
 *
 * Same calendar as before — Monday-first, hairline chevrons, the champagne
 * range fill, the extra-small radius that keeps a month from reading as a
 * field of lozenges. What changed is that it now knows things.
 *
 * `days` carries real, day-by-day inventory from the availability service
 * (Supabase cache, refreshed from Beds24). When it is empty the component
 * behaves exactly as it always did: past days greyed, nothing claimed about
 * any other night, and the sentence underneath saying so. No availability is
 * invented in either mode.
 *
 * ── Hotel date semantics, as the guest experiences them ──────────────────
 * A reservation from the 16th to the 20th takes the nights of the 16th to the
 * 19th. The 20th is a checkout: it is offered as a new arrival, and it is
 * offered as a departure for someone else's stay. Marking both ends of a
 * reservation as taken would quietly lose one sellable night on every
 * back-to-back booking, so `available` (the night) and `canCheckOut` (the
 * boundary) are separate flags and are read separately here.
 *
 * ── Why unavailable nights stay visible ──────────────────────────────────
 * They are not hidden and they are not painted red. A guest scanning a month
 * needs to see the shape of what is taken to choose around it; a red grid
 * makes a desirable residence look broken. The treatment is the one the site
 * already established — the day recedes and is struck through, and the legend
 * says what that means.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { todayIso } from '@/lib/booking/availability';
import type { InventoryDay } from '@/lib/booking/types';

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
  /** Real inventory. Empty means no connected source — see the header. */
  days = [],
  loading = false,
  months = 1,
}: {
  arrival?: string;
  departure?: string;
  onSelect: (next: { arrival?: string; departure?: string }) => void;
  days?: InventoryDay[];
  loading?: boolean;
  months?: 1 | 2;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const today = todayIso();

  const sourced = days.length > 0;
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const start = arrival && arrival >= today ? arrival : today;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  /**
   * The first night after the chosen arrival that is already taken.
   *
   * Everything on or after it is an impossible departure — you cannot sleep
   * through a night someone else has. Computing it once here is what stops the
   * calendar from offering a range it would then have to reject.
   */
  const firstBlockedAfterArrival = useMemo(() => {
    if (!arrival || !sourced) return undefined;
    const later = days
      .filter((d) => d.date > arrival && !d.available)
      .map((d) => d.date)
      .sort();
    return later[0];
  }, [arrival, days, sourced]);

  const minStay = arrival ? byDate.get(arrival)?.minStay : undefined;
  const earliestDeparture = useMemo(() => {
    if (!arrival) return undefined;
    const nights = minStay && minStay > 1 ? minStay : 1;
    const d = new Date(`${arrival}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + nights);
    return d.toISOString().slice(0, 10);
  }, [arrival, minStay]);

  /** Choosing an arrival, or choosing the departure for one already chosen. */
  const pickingDeparture = Boolean(arrival && !departure);

  const shift = (delta: number) =>
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  /**
   * Whether a date can be pressed at all, which depends on which half of the
   * range is being chosen.
   *
   * Arrival: the night must be free and the provider must allow arrivals.
   * Departure: the date must be a legal checkout, must satisfy the minimum
   * stay, and must not sit beyond a night that is already taken.
   */
  const selectable = (date: string): boolean => {
    if (date < today) return false;
    const day = byDate.get(date);

    if (pickingDeparture) {
      if (date <= arrival!) return true; // restarts the range; always allowed
      if (earliestDeparture && date < earliestDeparture) return false;
      if (firstBlockedAfterArrival && date > firstBlockedAfterArrival) return false;
      // Unsourced: nothing is known, so nothing is refused beyond the past.
      return !sourced || !day || day.canCheckOut;
    }

    return !sourced || !day || day.canCheckIn;
  };

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
      <div key={`${year}-${month}`} className="min-w-0 flex-1">
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
            const info = byDate.get(date);

            const past = date < today;
            // "Taken" is about the NIGHT. A checkout date whose own night is
            // free is not taken, and must not look it.
            const taken = sourced && Boolean(info && !info.available) && !past;
            const disabled = !selectable(date);

            const isArrival = date === arrival;
            const isDeparture = date === departure;
            const inRange = Boolean(arrival && departure && date > arrival && date < departure);
            const edge = isArrival || isDeparture;
            const isToday = date === today;

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => pick(date)}
                aria-label={ariaLabel(date, { past, taken, isArrival, isDeparture, inRange }, de)}
                aria-pressed={edge || inRange}
                className="relative flex h-10 items-center justify-center text-[13px] transition-colors
                           disabled:cursor-not-allowed"
                style={{
                  // Extra-small: 42 of these sit in a grid; anything larger
                  // turns the month into a field of lozenges.
                  borderRadius: 'var(--radius-xs)',
                  background: edge
                    ? 'hsl(var(--foreground))'
                    : inRange
                    ? 'hsl(var(--champagne) / 0.26)'
                    : 'transparent',
                  color: edge
                    ? 'hsl(var(--primary-foreground))'
                    : past || disabled || taken
                    ? 'hsl(var(--muted-foreground) / 0.32)'
                    : 'hsl(var(--foreground))',
                  fontWeight: edge ? 600 : 400,
                  // The established treatment for a night that is gone: it
                  // recedes and is struck through. Never a red cell.
                  textDecoration: taken ? 'line-through' : undefined,
                  textDecorationThickness: taken ? '1px' : undefined,
                }}
              >
                {day}
                {/* Today, marked once and quietly. */}
                {isToday && !edge && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 left-1/2 block h-[3px] w-[3px] -translate-x-1/2 rounded-full"
                    style={{ background: 'hsl(var(--champagne-dark))' }}
                  />
                )}
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
          style={{ borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))' }}
          aria-label={de ? 'Vorheriger Monat' : 'Previous month'}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
           style={{ color: 'hsl(var(--champagne-dark))' }}>
          {loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {pickingDeparture
            ? de ? 'Abreise wählen' : 'Choose your departure'
            : de ? 'Zeitraum wählen' : 'Choose your dates'}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="flex h-10 w-10 items-center justify-center transition-colors"
          style={{ borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))' }}
          aria-label={de ? 'Nächster Monat' : 'Next month'}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex gap-6">
        {Array.from({ length: months }, (_, i) => renderMonth(i))}
      </div>

      {sourced ? (
        <Legend de={de} minStay={minStay} />
      ) : (
        /*
          No connected source for this residence. The calendar says plainly
          that the greyed-out days are past days, not sold nights — the same
          sentence this component has always shown, and it disappears on its own
          the moment real inventory arrives.
        */
        <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Wir zeigen hier keine belegten Nächte an — ausgegraut sind ausschließlich vergangene Tage. Ob Ihr Zeitraum frei ist, bestätigen wir Ihnen persönlich.'
            : 'No booked-out nights are shown here — only past days are greyed out. Whether your dates are free is something we confirm to you personally.'}
        </p>
      )}
    </div>
  );
}

/**
 * The legend.
 *
 * Three states, stated once, in the same restrained type as the rest of the
 * dialog. It exists because struck-through and greyed are not self-explanatory
 * and because colour is never the only signal on this site.
 */
function Legend({ de, minStay }: { de: boolean; minStay?: number }) {
  return (
    <div className="mt-5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]"
           style={{ color: 'hsl(var(--muted-foreground))' }}>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="block h-[14px] w-[14px]"
                style={{ borderRadius: 'var(--radius-xs)', border: '1px solid hsl(var(--border))' }} />
          {de ? 'Frei' : 'Available'}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="block h-[14px] w-[14px]"
                style={{
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--muted-foreground) / 0.12)',
                }} />
          <span style={{ textDecoration: 'line-through', textDecorationThickness: '1px' }}>
            {de ? 'Belegt' : 'Reserved'}
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="block h-[14px] w-[14px]"
                style={{ borderRadius: 'var(--radius-xs)', background: 'hsl(var(--foreground))' }} />
          {de ? 'Ihr Zeitraum' : 'Your stay'}
        </span>
      </div>

      {minStay && minStay > 1 && (
        <p className="text-[11.5px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? `Für dieses Anreisedatum gilt ein Mindestaufenthalt von ${minStay} Nächten.`
            : `A minimum stay of ${minStay} nights applies to this arrival date.`}
        </p>
      )}

      <p className="text-[11.5px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {de
          ? 'Der Abreisetag zählt nicht als Nacht — er kann zugleich der Anreisetag eines anderen Aufenthalts sein.'
          : 'The departure day is not a night — it may equally be another stay’s arrival.'}
      </p>
    </div>
  );
}

/** What a screen reader hears. Colour and strikethrough are never the only signal. */
function ariaLabel(
  date: string,
  state: { past: boolean; taken: boolean; isArrival: boolean; isDeparture: boolean; inRange: boolean },
  de: boolean
): string {
  const [y, m, d] = date.split('-');
  const printed = `${d}.${m}.${y}`;
  if (state.isArrival) return `${printed} — ${de ? 'Anreise' : 'check-in'}`;
  if (state.isDeparture) return `${printed} — ${de ? 'Abreise' : 'check-out'}`;
  if (state.inRange) return `${printed} — ${de ? 'im gewählten Zeitraum' : 'within your stay'}`;
  if (state.past) return `${printed} — ${de ? 'vergangen' : 'in the past'}`;
  if (state.taken) return `${printed} — ${de ? 'belegt' : 'reserved'}`;
  return `${printed} — ${de ? 'frei' : 'available'}`;
}
