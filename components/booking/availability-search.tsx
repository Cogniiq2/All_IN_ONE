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
 * connected, so the panel does not claim to check anything. The heading plans a
 * stay and the button names exactly what pressing it does — it shows the
 * apartments, carrying the visitor's choices with them. It deliberately says
 * neither "Verfügbarkeit prüfen" (there is no live answer behind it) nor "Jetzt
 * buchen" (it selects an apartment, it does not book one). When
 * `hasLiveAvailability()` becomes true the submit can filter the selection by a
 * real answer, and the note below stops being needed.
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
import { CONTROL_HEIGHT, DateField } from '@/components/ui-kit/date-field';
import { useStay } from '@/lib/booking/stay-context';
import {
  clampGuests,
  hasLiveAvailability,
  MAX_GUESTS,
  MIN_GUESTS,
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
      guests: clampGuests(Number(guests)),
    };
    // Context first so the destination renders with the values already present,
    // then the URL so a reload or a shared link carries them too.
    setStay(next);
    router.push(`/apartments${toQueryString(next)}`);
  };

  /**
   * ── Field geometry ─────────────────────────────────────────────────────
   * Three controls with three different intrinsic heights used to sit in one
   * `items-end` row: a native date input, a number input and the CTA. Bottom-
   * aligning them left each label at a different height and the boxes visibly
   * out of line with one another. Every control is now pinned to the one
   * CONTROL_HEIGHT, and each label is a single line, so the row aligns exactly
   * — top, bottom and baseline.
   *
   * ── Why the tracks cannot collide ──────────────────────────────────────
   * A native date input carries a wide intrinsic minimum width, and a grid
   * track never shrinks below the minimum of what it holds. Left alone that
   * floor makes the two date columns overflow their share of the row, which is
   * what pushes the fields into one another and shunts the CTA out of the
   * panel. Three things remove it, and all three are needed:
   *
   *   minmax(0, 1fr)   on the flexible columns, so the track itself may go
   *                    narrower than its content's minimum;
   *   min-w-0          on every cell, so the wrapper does not reinstate it;
   *   min-w-0          on the input element (see `dateInputClass`), which is
   *                    where the floor actually lives.
   *
   * The guests column and the CTA sit in fixed and auto tracks, so neither can
   * be squeezed by its neighbours, and `gap` is a real gutter the tracks are
   * laid out around rather than margin that content can eat into.
   *
   * Nothing about the panel's surface — padding, radius, shadow, colour, type
   * scale, placement — is touched.
   */
  const fieldClass =
    `block w-full min-w-0 ${CONTROL_HEIGHT} px-3.5 py-0 bg-secondary/40 border border-border ` +
    'rounded-md text-[15px] text-foreground transition-colors ' +
    'focus:outline-none focus:border-champagne focus:bg-secondary/70';

  const fieldLabel =
    'block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5';

  return (
    <form
      onSubmit={submit}
      className={`p-5 sm:p-6 lg:p-7 ${className}`}
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius-lg)',
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
          {de ? 'Aufenthalt planen' : 'Plan your stay'}
        </h2>
      </div>

      <div
        className="mt-5 grid min-w-0 gap-x-3 gap-y-4 sm:grid-cols-2
                   lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem_minmax(0,auto)]
                   lg:items-end lg:gap-x-4"
      >
        <DateField
          id={`${id}-arrival`}
          label={de ? 'Anreise' : 'Check-in'}
          value={arrival}
          onChange={setArrival}
          min={today}
          labelClassName={fieldLabel}
        />

        <DateField
          id={`${id}-departure`}
          label={de ? 'Abreise' : 'Check-out'}
          value={departure}
          onChange={setDeparture}
          min={nextDayIso(arrival) ?? today}
          labelClassName={fieldLabel}
        />

        <div className="min-w-0">
          <label htmlFor={`${id}-guests`} className={`${fieldLabel} truncate`}>
            {de ? 'Personen' : 'Guests'}
          </label>
          <input
            id={`${id}-guests`}
            type="number"
            min={MIN_GUESTS}
            max={MAX_GUESTS}
            inputMode="numeric"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className={fieldClass}
          />
        </div>

        {/*
          `self-end` matters in the two-column tablet layout, where the CTA
          shares a row with the Personen field: without it the button floats up
          beside that field's label instead of sitting on the same line as the
          control.
        */}
        <CtaButton type="submit" full withArrow className={`self-end lg:!w-auto ${CONTROL_HEIGHT}`}>
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
