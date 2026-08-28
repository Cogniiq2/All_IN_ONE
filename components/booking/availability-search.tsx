'use client';

/**
 * SHORT-TERM AVAILABILITY SEARCH — accommodation only.
 *
 * The one place a guest states what they want: when, and for how many. It is
 * the front door of the booking journey and is built to stay in place when the
 * PMS arrives — the fields are exactly what the booking service will need.
 *
 * ── What it does today ───────────────────────────────────────────────────
 * `lib/booking/availability.ts` reports that no availability source is
 * connected, so the panel does not claim to check anything. Submitting carries
 * the dates and guest count straight into the short-term enquiry, pre-filled,
 * so nobody types them twice. When `hasLiveAvailability()` becomes true, this
 * component gains a result step and the copy below stops being needed.
 *
 * It must never be used for long-term rental. A tenancy has no nightly
 * availability, and offering dates for one would misrepresent the product —
 * the rental journey uses the enquiry on /mieten instead.
 */

import { useEffect, useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useEnquiry } from '@/components/enquiry/enquiry-context';
import { CtaButton, label } from '@/components/ui-kit/cta';
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
  const { openEnquiry } = useEnquiry();
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
    openEnquiry({
      kind: 'short-term',
      arrival: toIsoDate(arrival),
      departure: toIsoDate(departure),
      guests: Number(guests) || undefined,
    });
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

        <CtaButton type="submit" full className="lg:!w-auto">
          {label('requestAvailability', locale)}
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
            ? 'Wir prüfen Ihren Zeitraum persönlich und melden uns mit Verfügbarkeit und Preis — meist am selben Tag. Eine Anfrage ist unverbindlich.'
            : 'We check your dates personally and reply with availability and price — usually the same day. An enquiry commits you to nothing.'}
        </p>
      )}
    </form>
  );
}
