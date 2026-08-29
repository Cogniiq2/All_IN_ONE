'use client';

/**
 * SHORT-TERM AVAILABILITY SEARCH — accommodation only.
 *
 * The one place a guest states what they want: when, and for how many. It is
 * the front door of the booking journey and is built to stay in place when the
 * PMS arrives — the fields are exactly what the booking service will need.
 *
 * ── Where it now leads ───────────────────────────────────────────────────
 * It no longer opens an enquiry. It starts the booking journey: submitting
 * takes the visitor to the apartment selection with their choices attached,
 *
 *     /apartments?arrival=…&departure=…&guests=…
 *
 * and those values ride along through the detail view into the booking dialog,
 * where they arrive already filled in. The values travel twice over — in the
 * URL so a reload or a shared link keeps them, and in StayContext so an in-app
 * navigation is instant (lib/booking/stay-context.tsx).
 *
 * ── What it may not claim ────────────────────────────────────────────────
 * `lib/booking/availability.ts` reports that no availability source is
 * connected, so the panel does not claim to check anything and the button says
 * "anfragen", not "prüfen". When `hasLiveAvailability()` becomes true the
 * submit can filter the selection by a real answer, and the note below stops
 * being needed.
 *
 * It must never be used for long-term rental. A tenancy has no nightly
 * availability, and offering dates for one would misrepresent the product —
 * the rental journey uses the enquiry on /mieten instead.
 */

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CtaButton } from '@/components/ui-kit/cta';
import { useStay } from '@/lib/booking/stay-context';
import {
  hasLiveAvailability,
  nextDayIso,
  todayIso,
  toIsoDate,
} from '@/lib/booking/availability';

export function AvailabilitySearch({
  /** Rendered over photography (homepage) or on the page ground. */
  tone = 'raised',
  className = '',
}: {
  tone?: 'raised' | 'plain';
  className?: string;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const { setStay, toQueryString } = useStay();
  const de = locale === 'de';
  const id = useId();

  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [guests, setGuests] = useState('2');

  /**
   * "Today" depends on the visitor's own timezone, so it cannot be computed
   * during render: the server would emit one date and the browser another, and
   * the mismatch fails hydration for the whole tree. It is set after mount
   * instead, which leaves the inputs unconstrained for one frame and correct
   * from then on.
   */
  const [today, setToday] = useState<string | undefined>(undefined);
  useEffect(() => setToday(todayIso()), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      arrival: toIsoDate(arrival),
      departure: toIsoDate(departure),
      guests: Number(guests) || undefined,
    };
    // Context first so the destination renders with the values already present,
    // then the URL so a reload or a shared link carries them too.
    setStay(next);
    router.push(`/apartments${toQueryString(next)}`);
  };

  const fieldClass =
    'w-full min-h-[46px] px-3.5 py-2.5 bg-secondary/40 border border-border rounded-sm text-[15px] ' +
    'text-foreground transition-colors focus:outline-none focus:border-champagne focus:bg-secondary/70';

  const fieldLabel =
    'block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5';

  return (
    <form
      onSubmit={submit}
      className={`p-5 sm:p-6 lg:p-7 ${className}`}
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        boxShadow: tone === 'raised' ? '0 32px 80px -40px hsl(var(--ink) / 0.55)' : undefined,
      }}
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-center gap-2.5">
        <CalendarDays
          className="w-4 h-4 shrink-0"
          style={{ color: 'hsl(var(--champagne-dark))' }}
          aria-hidden="true"
        />
        <h2 id={`${id}-heading`} className="text-[13px] font-semibold tracking-[0.01em]">
          {de ? 'Aufenthalt anfragen' : 'Enquire about a stay'}
        </h2>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end lg:gap-4">
        <div>
          <label htmlFor={`${id}-arrival`} className={fieldLabel}>
            {de ? 'Anreise' : 'Check-in'}
          </label>
          <input
            id={`${id}-arrival`}
            type="date"
            min={today}
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-departure`} className={fieldLabel}>
            {de ? 'Abreise' : 'Check-out'}
          </label>
          <input
            id={`${id}-departure`}
            type="date"
            min={nextDayIso(arrival) ?? today}
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="lg:w-[104px]">
          <label htmlFor={`${id}-guests`} className={fieldLabel}>
            {de ? 'Personen' : 'Guests'}
          </label>
          <input
            id={`${id}-guests`}
            type="number"
            min={1}
            max={12}
            inputMode="numeric"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className={fieldClass}
          />
        </div>

        <CtaButton type="submit" full withArrow className="lg:!w-auto">
          {de ? 'Apartments ansehen' : 'View apartments'}
        </CtaButton>
      </div>

      {/*
        No availability source is connected, and the panel says so rather than
        implying a live calendar behind it. This line disappears on its own once
        hasLiveAvailability() is true.
      */}
      {!hasLiveAvailability() && (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          {de
            ? 'Wir zeigen Ihnen im nächsten Schritt unsere Apartments — Ihre Angaben nehmen wir mit. Verfügbarkeit und Preis bestätigen wir persönlich.'
            : 'We show you our apartments in the next step, with your details carried over. Availability and price are confirmed by us personally.'}
        </p>
      )}
    </form>
  );
}
