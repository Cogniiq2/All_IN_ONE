'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * "THESE DATES ARE NO LONGER FREE" — and what is.
 *
 * Shown in the dates step when Beds24 refuses the stay: someone booked it on
 * Booking.com or Airbnb while this guest was choosing, or the live calendar
 * no longer offers it. It is news, not an error, so it reads like a concierge
 * would say it: what happened, that nothing was charged, and the nearest
 * stays of the same length that ARE free — one tap to take one.
 *
 * The suggestions come from the server (`/api/booking/alternatives`), read
 * live from Beds24 at the moment of the refusal. They are suggestions, not
 * holds: adopting one re-quotes it live, exactly as if the guest had picked
 * it in the calendar.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { label } from '@/components/ui-kit/cta';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/booking/date-format';
import { getRentalUnit } from '@/lib/content/apartments';
import { contact } from '@/lib/content/brand';
import type { StayAlternativeView } from '@/lib/booking/client';

export interface UnavailableState {
  checkIn: string;
  checkOut: string;
  loading: boolean;
  alternatives: StayAlternativeView[];
}

export function UnavailablePanel({
  state,
  unitName,
  onAdopt,
  onDismiss,
}: {
  state: UnavailableState;
  unitName: string;
  onAdopt: (alternative: StayAlternativeView) => void;
  onDismiss: () => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();
  const same = state.alternatives.filter((a) => a.sameUnit);
  const other = state.alternatives.filter((a) => !a.sameUnit);

  return (
    <motion.section
      role="status"
      aria-live="polite"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 p-5"
      style={{
        background: 'hsl(var(--secondary) / 0.55)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {formatDate(state.checkIn)} – {formatDate(state.checkOut)}
      </p>
      <h4 className="mt-2 font-serif text-[19px] leading-snug" style={{ color: 'hsl(var(--foreground))' }}>
        {de ? 'Diese Daten sind soeben vergeben worden.' : 'These dates have just been taken.'}
      </h4>
      <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {de
          ? `${shortName(unitName)} wurde für diesen Zeitraum gerade anderweitig reserviert. Es wurde nichts abgebucht, und Ihre Angaben bleiben erhalten.`
          : `${shortName(unitName)} was reserved elsewhere for these dates a moment ago. Nothing has been charged, and your details are kept.`}
      </p>

      <div className="mt-5">
        {state.loading ? (
          <div className="space-y-2" aria-label={de ? 'Freie Zeiträume werden gesucht' : 'Looking for free dates'}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[58px] animate-pulse" style={{ background: 'hsl(var(--background) / 0.7)', borderRadius: 'var(--radius-sm)' }} />
            ))}
          </div>
        ) : state.alternatives.length === 0 ? (
          <div className="text-[13.5px] leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
            <p>{de
              ? 'In den Wochen um Ihren Zeitraum ist keine gleich lange Lücke frei. Wählen Sie im Kalender einen anderen Zeitraum — oder schreiben Sie uns, wir finden eine Lösung.'
              : 'There is no free stay of the same length in the weeks around your dates. Pick another period in the calendar — or write to us and we will find a way.'}</p>
            <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="link-quiet mt-2">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {label('writeWhatsApp', locale)}
            </a>
          </div>
        ) : (
          <>
            {same.length > 0 && (
              <Group label={de ? 'Die nächsten freien Daten' : 'The nearest free dates'}>
                {same.map((a, i) => (
                  <Option key={`${a.checkIn}-${a.unitSlug}`} alternative={a} index={i} onAdopt={onAdopt} />
                ))}
              </Group>
            )}
            {other.length > 0 && (
              <Group label={de ? 'Ihre Daten, in einem anderen Apartment' : 'Your dates, in another apartment'}>
                {other.map((a, i) => (
                  <Option key={`${a.checkIn}-${a.unitSlug}`} alternative={a} index={same.length + i} onAdopt={onAdopt} />
                ))}
              </Group>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 inline-flex min-h-[44px] items-center text-[12.5px] underline-offset-4 hover:underline"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {de ? 'Selbst im Kalender wählen' : 'Choose in the calendar instead'}
      </button>
    </motion.section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-2 text-[11.5px] font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {label}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function Option({ alternative: a, index, onAdopt }: { alternative: StayAlternativeView; index: number; onAdopt: (a: StayAlternativeView) => void }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();
  const nights = de ? `${a.nights} ${a.nights === 1 ? 'Nacht' : 'Nächte'}` : `${a.nights} ${a.nights === 1 ? 'night' : 'nights'}`;
  const shift = Math.abs(a.shiftDays);
  const when = a.sameUnit
    ? a.shiftDays > 0
      ? de ? `${shift} ${shift === 1 ? 'Tag' : 'Tage'} später` : `${shift} ${shift === 1 ? 'day' : 'days'} later`
      : de ? `${shift} ${shift === 1 ? 'Tag' : 'Tage'} früher` : `${shift} ${shift === 1 ? 'day' : 'days'} earlier`
    : shortName(getRentalUnit(a.unitSlug)?.name[locale] ?? a.unitSlug);

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : 0.06 * index, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={() => onAdopt(a)}
        className="group flex min-h-[58px] w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-300 hover:bg-[hsl(var(--background))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ background: 'hsl(var(--background) / 0.7)', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-sm)' }}
      >
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-[13px] font-medium tabular-nums sm:text-[14px]" style={{ color: 'hsl(var(--foreground))' }}>
            {formatDate(a.checkIn)} – {formatDate(a.checkOut)}
          </span>
          <span className="mt-0.5 block truncate text-[12px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {nights} · {when}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium" style={{ color: 'hsl(var(--foreground))' }}>
          <span className="sr-only sm:not-sr-only">{de ? 'Übernehmen' : 'Take these'}</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </motion.li>
  );
}

/** "Design - Apartment II · Premium Wohnung mit Terrasse" → "Design - Apartment II": the name, without the tagline. */
function shortName(name: string): string {
  return name.split(' · ')[0] ?? name;
}
