'use client';

/**
 * The arrival journey — a compact, honest map of how a stay actually starts.
 *
 * Every step here restates a fact already made somewhere else on the site —
 * the FAQ's "Wie läuft die Anreise ab?" answer, the booking confirmation
 * copy in components/booking/booking-modal.tsx, and the "Self Check-in mit
 * Schlüsselsafe" line in this unit's own fact sheet. None of that changes;
 * this only draws it as a sequence, because a scattered fact and a visible
 * journey answer different anxieties. No time, code or process is stated
 * here that is not already stated in one of those places.
 *
 * Deliberately NOT shown for a unit still "in preparation" (Opernstraße):
 * there is no confirmed access process for a flat that is not ready, and a
 * journey diagram would imply one exists.
 */

import { CalendarCheck, KeyRound, Mail, MessageCircleHeart } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { RevealBlock, RevealLetters, RevealRule } from '@/components/property/reveal-on-scroll';

const STEPS = [
  {
    icon: CalendarCheck,
    de: { title: 'Anfrage', body: 'Sie wählen Zeitraum und Personenzahl.' },
    en: { title: 'Request', body: 'You choose your dates and party size.' },
  },
  {
    icon: Mail,
    de: { title: 'Bestätigung', body: 'Wir prüfen persönlich und bestätigen Zeitraum und Preis.' },
    en: { title: 'Confirmation', body: 'We check personally and confirm dates and price.' },
  },
  {
    icon: MessageCircleHeart,
    de: { title: 'Anreisedetails', body: 'Adresse und Weg schicken wir Ihnen vor der Anreise per E-Mail.' },
    en: { title: 'Arrival details', body: 'We send the address and directions by email before you arrive.' },
  },
  {
    icon: KeyRound,
    de: { title: 'Self Check-in', body: 'Zugang über einen Schlüsselsafe — ohne Rezeption, in Ihrem eigenen Tempo.' },
    en: { title: 'Self check-in', body: 'Access via a key safe — no reception, at your own pace.' },
  },
] as const;

export function ArrivalJourney() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <section className="border-t border-border/70 px-6 py-10 sm:px-8 lg:px-10 lg:py-12">
      <header>
        <p className="eyebrow">{de ? 'Ablauf' : 'How it works'}</p>
        <RevealLetters
          as="h3"
          className="display-3 mt-3"
          text={de ? 'So läuft Ihre Anreise' : 'How your arrival works'}
        />
      </header>

      {/* One continuous champagne line beneath the numbers, so four separate
          steps still read as one sequence rather than four loose cards. */}
      <div className="relative mt-9">
        <RevealRule className="absolute left-4 right-4 top-4 hidden lg:block" delay={80} />

        <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const copy = de ? step.de : step.en;
            return (
              <RevealBlock key={copy.title} index={i}>
                <li className="flex flex-col gap-3">
                  <div className="relative flex items-center gap-3">
                    <span
                      className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center text-[11px] font-semibold tabular-nums"
                      style={{
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid hsl(var(--champagne) / 0.55)',
                        background: 'hsl(var(--card))',
                        color: 'hsl(var(--champagne-dark))',
                      }}
                    >
                      {i + 1}
                    </span>
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: 'hsl(var(--champagne-dark))' }}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-[13.5px] font-semibold">{copy.title}</p>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {copy.body}
                  </p>
                </li>
              </RevealBlock>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
