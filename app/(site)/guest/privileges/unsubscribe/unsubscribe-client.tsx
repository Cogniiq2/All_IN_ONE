'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { Section, SectionHeader } from '@/components/ui-kit/section';
import { CONTROL_HEIGHT } from '@/components/ui-kit/date-field';

/**
 * The unsubscribe confirmation.
 *
 * The answer after the button is the same whatever the link was — valid,
 * forged, already used — because the endpoint answers the same. A guest whose
 * link is broken is told the other way to withdraw, which always works.
 */

type Phase = 'idle' | 'sending' | 'done' | 'error';

const COPY = {
  de: {
    eyebrow: 'Residence Privileges',
    title: 'Keine Werbe-E-Mails mehr erhalten',
    lede: 'Mit einem Klick widerrufen Sie Ihre Einwilligung in Nachrichten zu Angeboten und Neuigkeiten von BoLaGio. Ihre Vorteile für Direktbuchungen bleiben davon unberührt.',
    button: 'Abmelden',
    sending: 'Einen Moment …',
    doneTitle: 'Sie sind abgemeldet.',
    doneBody: 'Wir senden Ihnen keine Werbe-E-Mails mehr. Nachrichten zu einer Buchung erhalten Sie weiterhin, soweit sie für Ihren Aufenthalt nötig sind.',
    missing: 'Dieser Link ist unvollständig. Sie können Ihre Einwilligung jederzeit auch formlos widerrufen — antworten Sie einfach auf eine unserer E-Mails oder schreiben Sie uns über die Kontaktseite.',
    error: 'Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut oder schreiben Sie uns über die Kontaktseite.',
    contact: 'Kontakt',
    privacy: 'Datenschutzerklärung',
  },
  en: {
    eyebrow: 'Residence Privileges',
    title: 'Stop receiving marketing emails',
    lede: 'One click withdraws your consent to news and offers from BoLaGio. Your benefits for direct bookings are not affected.',
    button: 'Unsubscribe',
    sending: 'One moment…',
    doneTitle: 'You are unsubscribed.',
    doneBody: 'We will not send you marketing emails any more. You will still receive messages about a booking where they are needed for your stay.',
    missing: 'This link is incomplete. You can always withdraw your consent informally too — simply reply to any of our emails or write to us via the contact page.',
    error: 'That did not work just now. Please try again or write to us via the contact page.',
    contact: 'Contact',
    privacy: 'Privacy notice',
  },
} as const;

export default function UnsubscribeClient({ id, sig }: { id?: string; sig?: string }) {
  const { locale } = useI18n();
  const t = COPY[locale] ?? COPY.de;
  const [phase, setPhase] = useState<Phase>('idle');
  const usable = Boolean(id && sig);

  async function unsubscribe() {
    if (!usable || phase === 'sending') return;
    setPhase('sending');
    try {
      const response = await fetch('/api/guest/privileges/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, sig }),
      });
      setPhase(response.ok ? 'done' : 'error');
    } catch {
      setPhase('error');
    }
  }

  const done = phase === 'done';

  return (
    <Section>
      <div className="mx-auto max-w-[36rem]">
        <SectionHeader eyebrow={t.eyebrow} title={done ? t.doneTitle : t.title} lede={done ? t.doneBody : t.lede} as="h1" />

        {!done && (
          <div className="mt-10 space-y-4">
            {usable ? (
              <button
                type="button"
                onClick={unsubscribe}
                disabled={phase === 'sending'}
                className={`w-full rounded-[--radius-sm] bg-[hsl(var(--primary))] px-6 ${CONTROL_HEIGHT} text-base font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-60`}
              >
                {phase === 'sending' ? t.sending : t.button}
              </button>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.missing}</p>
            )}
            {phase === 'error' && (
              <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
                {t.error}
              </p>
            )}
          </div>
        )}

        <p className="mt-12 text-sm text-[hsl(var(--muted-foreground))]">
          <Link href="/contact" className="underline underline-offset-4">{t.contact}</Link>
          {' · '}
          <Link href="/datenschutz" className="underline underline-offset-4">{t.privacy}</Link>
        </p>
      </div>
    </Section>
  );
}
