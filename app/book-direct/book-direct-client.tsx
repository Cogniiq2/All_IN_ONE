'use client';

import { MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { contact } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { DirectSection } from '@/components/home/direct-section';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * Direct enquiry.
 *
 * Removed from the previous version: the claim that direct guests save the
 * "10–20% platform service fee", a promised welcome gift, guaranteed best
 * price, an invoice-with-VAT-ID promise, and the instant card/PayPal checkout.
 * What is left is the part we can stand behind — and the steps are described
 * exactly as they actually happen.
 */

const steps = [
  {
    de: { title: 'Sie schreiben uns Ihren Zeitraum', body: 'Über das Formular, per WhatsApp oder telefonisch. Anzahl der Personen genügt fürs Erste.' },
    en: { title: 'You send us your dates', body: 'Via the form, WhatsApp or phone. The number of people is enough to start with.' },
  },
  {
    de: { title: 'Wir prüfen persönlich', body: 'Wir sehen nach, ob die Wohnung in Ihrem Zeitraum frei ist — und melden uns mit Verfügbarkeit und Preis.' },
    en: { title: 'We check personally', body: 'We look at whether the apartment is free for your dates — and reply with availability and price.' },
  },
  {
    de: { title: 'Offene Punkte klären wir vorher', body: 'Anreisezeit, Parken, längere Aufenthalte, besondere Wünsche: alles besprochen, bevor Sie zusagen.' },
    en: { title: 'We settle open points first', body: 'Arrival time, parking, longer stays, special requests: all discussed before you commit.' },
  },
  {
    de: { title: 'Erst dann wird es verbindlich', body: 'Ein Aufenthalt gilt erst, wenn wir ihn bestätigt haben und Sie ausdrücklich zusagen.' },
    en: { title: 'Only then does it become binding', body: 'A stay counts only once we have confirmed it and you have explicitly agreed.' },
  },
];

export default function BookDirectClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Direkt anfragen' : 'Book direct'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[17ch]">
              {de ? 'Fragen Sie die Familie, nicht die Plattform' : 'Ask the family, not the platform'}
            </h1>
            <p className="lede mt-6">
              {de
                ? 'Eine Anfrage bei uns landet nicht in einem Ticketsystem. Sie landet bei denen, denen die Wohnung gehört — und die entscheiden können, ohne zurückzufragen.'
                : 'An enquiry to us does not land in a ticket system. It lands with the people who own the apartment — and who can decide without asking anyone else.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <EnquiryButton withArrow />
              <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="cta-secondary">
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                {label('writeWhatsApp', locale)}
              </a>
            </div>
          </Reveal>
        </div>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          <Reveal>
            <h2 className="display-2 max-w-[18ch]">{de ? 'So läuft es ab' : 'How it works'}</h2>
          </Reveal>

          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:gap-8">
            {steps.map((step, i) => {
              const copy = de ? step.de : step.en;
              return (
                <Reveal as="li" key={copy.title} delay={i * 0.06}>
                  <div
                    className="h-full p-7"
                    style={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    {/* The numbering is real: these steps happen in this order. */}
                    <span
                      className="font-serif text-[28px] leading-none"
                      style={{ color: 'hsl(var(--champagne-dark))' }}
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-[16px] font-semibold mt-4">{copy.title}</h3>
                    <p className="body-copy mt-2.5 text-[14px]">{copy.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </section>

      {/* The comparison lives in one component, used here and on the homepage. */}
      <DirectSection />
    </>
  );
}
