'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { Section, SectionHeader } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { CONTROL_HEIGHT } from '@/components/ui-kit/date-field';

/**
 * The guest-facing privileges page.
 *
 * One heading, one sentence, one field, one button. The temptation on a page
 * like this is to sell; the brand position is the opposite — a residence
 * privilege is stated once, calmly, and then the guest is left alone.
 *
 * ── What this component is NOT allowed to do ─────────────────────────────
 * Decide anything about eligibility. It has no discount logic, no campaign
 * rules and no notion of who is entitled to what. It posts an address and
 * renders what the server says. The benefit is resolved server-side at quote
 * time from the database; there is no coupon here to read, edit or forge.
 */

type Phase = 'idle' | 'sending' | 'sent' | 'invalid' | 'error';

const COPY = {
  de: {
    eyebrow: 'Residence Privileges',
    title: 'Ihr Aufenthalt endet nicht beim Check-out.',
    lede:
      'Gäste, die wieder bei uns wohnen, buchen direkt — zu Konditionen, die wir Portalen nicht geben. Hinterlassen Sie Ihre E-Mail-Adresse, und wir hinterlegen Ihre Vorteile.',
    benefitsTitle: 'Was dazugehört',
    benefits: [
      ['Direktbucher-Rate', 'Unser bester Preis, ohne Portal dazwischen.'],
      ['Früher ankommen, später gehen', 'Bevorzugte Berücksichtigung, wenn die Wohnung es zulässt.'],
      ['Direkter Draht', 'Sie schreiben uns, nicht einem Callcenter.'],
    ],
    emailLabel: 'E-Mail-Adresse',
    emailHint: 'Bitte die Adresse, mit der Sie später buchen möchten.',
    consent:
      'Ich möchte gelegentlich Nachrichten zu Angeboten und Neuigkeiten von BoLaGio erhalten. Die Einwilligung kann ich jederzeit widerrufen.',
    consentNote:
      'Optional. Ihre Vorteile erhalten Sie auch ohne dieses Häkchen — wir senden Ihnen dann ausschließlich die Bestätigungs-E-Mail.',
    submit: 'Vorteile freischalten',
    sending: 'Einen Moment …',
    sentTitle: 'Prüfen Sie bitte Ihr Postfach.',
    sentBody:
      'Wir haben Ihnen eine E-Mail geschickt. Ein Klick auf den Link darin bestätigt Ihre Adresse — erst dann sind Ihre Vorteile hinterlegt.',
    verifiedTitle: 'Ihre Vorteile sind hinterlegt.',
    verifiedBody:
      'Buchen Sie beim nächsten Mal direkt auf bolagio.de mit dieser E-Mail-Adresse — Ihre Konditionen werden automatisch erkannt.',
    invalidTitle: 'Dieser Link ist nicht mehr gültig.',
    invalidBody:
      'Bestätigungslinks laufen nach 72 Stunden ab und lassen sich nur einmal verwenden. Tragen Sie Ihre Adresse einfach noch einmal ein.',
    errorBody: 'Das hat gerade nicht geklappt. Bitte versuchen Sie es in einem Moment noch einmal.',
    invalidEmail: 'Diese E-Mail-Adresse sieht nicht vollständig aus.',
    privacy: 'Wie wir mit Ihren Daten umgehen, steht in der Datenschutzerklärung.',
    privacyLink: 'Datenschutz',
    again: 'Andere Adresse eintragen',
  },
  en: {
    eyebrow: 'Residence Privileges',
    title: 'Your stay needn’t end at checkout.',
    lede:
      'Guests who come back book with us directly — on terms we do not give the portals. Leave your email address and we will put your benefits on file.',
    benefitsTitle: 'What that includes',
    benefits: [
      ['The direct rate', 'Our best price, with no portal in between.'],
      ['Arrive early, leave late', 'Preference where the apartment allows it.'],
      ['A direct line', 'You write to us, not to a call centre.'],
    ],
    emailLabel: 'Email address',
    emailHint: 'Please use the address you would like to book with.',
    consent:
      'I would like to receive occasional news and offers from BoLaGio. I can withdraw this consent at any time.',
    consentNote:
      'Optional. Your benefits are put on file either way — without this, we send only the confirmation email.',
    submit: 'Unlock my benefits',
    sending: 'One moment…',
    sentTitle: 'Please check your inbox.',
    sentBody:
      'We have sent you an email. Clicking the link in it confirms your address — only then are your benefits on file.',
    verifiedTitle: 'Your benefits are on file.',
    verifiedBody:
      'Next time, book directly on bolagio.de with this email address and your terms will be recognised automatically.',
    invalidTitle: 'This link is no longer valid.',
    invalidBody:
      'Confirmation links expire after 72 hours and work only once. Simply enter your address again.',
    errorBody: 'That did not work just now. Please try again in a moment.',
    invalidEmail: 'That email address looks incomplete.',
    privacy: 'How we handle your data is set out in our privacy notice.',
    privacyLink: 'Privacy',
    again: 'Use a different address',
  },
} as const;

export default function PrivilegesClient({
  property,
  campaign,
  initialState,
}: {
  property?: string;
  campaign?: string;
  initialState?: 'verified' | 'link-invalid';
}) {
  const { locale } = useI18n();
  const t = COPY[locale] ?? COPY.de;

  const [phase, setPhase] = useState<Phase>(
    initialState === 'verified' ? 'sent' : initialState === 'link-invalid' ? 'invalid' : 'idle'
  );
  const [verified] = useState(initialState === 'verified');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (phase === 'sending') return;
    setFieldError(null);
    setPhase('sending');
    try {
      const response = await fetch('/api/guest/privileges/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, campaign, unit: property, locale, marketingConsent: consent }),
      });
      const body = (await response.json().catch(() => ({}))) as { status?: string };
      if (body.status === 'invalid_email') {
        setFieldError(t.invalidEmail);
        setPhase('idle');
        return;
      }
      // Every other outcome is the same answer, by design: this endpoint
      // must not reveal whether an address is already known to us.
      setPhase(response.ok ? 'sent' : 'error');
    } catch {
      setPhase('error');
    }
  }

  const done = phase === 'sent';

  return (
    <Section>
      <div className="mx-auto max-w-[36rem]">
        <SectionHeader
          eyebrow={t.eyebrow}
          title={verified ? t.verifiedTitle : done ? t.sentTitle : t.title}
          lede={verified ? t.verifiedBody : done ? t.sentBody : t.lede}
          as="h1"
        />

        {!done && (
          <>
            {phase === 'invalid' && (
              <Reveal>
                <div className="mt-8 rounded-[--radius-md] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-5">
                  <p className="font-medium">{t.invalidTitle}</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t.invalidBody}</p>
                </div>
              </Reveal>
            )}

            <Reveal>
              <form onSubmit={submit} className="mt-10 space-y-5" noValidate>
                <div>
                  <label htmlFor="privileges-email" className="block text-sm font-medium">
                    {t.emailLabel}
                  </label>
                  <input
                    id="privileges-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby="privileges-email-hint"
                    aria-invalid={fieldError ? true : undefined}
                    className={`mt-2 w-full rounded-[--radius-sm] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 ${CONTROL_HEIGHT} text-base outline-none transition focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/30`}
                  />
                  <p id="privileges-email-hint" className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    {fieldError ?? t.emailHint}
                  </p>
                </div>

                {/*
                  Never pre-checked, and never bundled with the benefit. The
                  benefit is granted either way; only marketing depends on
                  this box. See LEGAL_REVIEW_REQUIRED.md.
                */}
                <div className="flex gap-3">
                  <input
                    id="privileges-consent"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <label htmlFor="privileges-consent" className="text-sm leading-relaxed">
                    {t.consent}
                    <span className="mt-1 block text-[hsl(var(--muted-foreground))]">{t.consentNote}</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={phase === 'sending'}
                  className={`w-full rounded-[--radius-sm] bg-[hsl(var(--primary))] px-6 ${CONTROL_HEIGHT} text-base font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-60`}
                >
                  {phase === 'sending' ? t.sending : t.submit}
                </button>

                {phase === 'error' && (
                  <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
                    {t.errorBody}
                  </p>
                )}
              </form>
            </Reveal>

            <Reveal>
              <div className="mt-14">
                <p className="eyebrow">{t.benefitsTitle}</p>
                <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
                <dl className="space-y-6">
                  {t.benefits.map(([term, detail]) => (
                    <div key={term}>
                      <dt className="font-medium">{term}</dt>
                      <dd className="mt-1 text-[hsl(var(--muted-foreground))]">{detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </>
        )}

        <Reveal>
          <p className="mt-12 text-sm text-[hsl(var(--muted-foreground))]">
            {t.privacy}{' '}
            <Link href="/datenschutz" className="underline underline-offset-4">
              {t.privacyLink}
            </Link>
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
