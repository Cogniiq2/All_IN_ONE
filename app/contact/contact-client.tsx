'use client';

import { MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, contact } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { useEnquiry } from '@/components/enquiry/enquiry-context';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { label } from '@/components/ui-kit/cta';

/**
 * Contact.
 *
 * One form exists on this site — the enquiry dialog — and this page opens it
 * rather than maintaining a second, subtly different copy of it. That keeps
 * the loading, success and error behaviour identical everywhere.
 *
 * No email address is shown: none has been confirmed. See contact.email in
 * lib/content/brand.ts.
 */
export default function ContactClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { openEnquiry } = useEnquiry();

  const channels = [
    {
      icon: Send,
      title: de ? 'Anfrageformular' : 'Enquiry form',
      body: de
        ? 'Der direkteste Weg: Zeitraum, Personenzahl, fertig. Wir antworten mit Verfügbarkeit und Preis.'
        : 'The most direct route: dates, number of guests, done. We reply with availability and price.',
      action: (
        <button onClick={() => openEnquiry({ kind: 'short-term' })} className="link-quiet">
          {label('requestAvailability', locale)}
        </button>
      ),
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp',
      body: de
        ? 'Für kurze Fragen zwischendurch — meist die schnellste Antwort.'
        : 'For quick questions along the way — usually the fastest reply.',
      action: (
        <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="link-quiet">
          {label('writeWhatsApp', locale)}
        </a>
      ),
    },
    {
      icon: Phone,
      title: de ? 'Telefon' : 'Phone',
      body: de
        ? 'Wenn es einfacher ist, miteinander zu sprechen.'
        : 'When it is simply easier to talk.',
      action: (
        <a href={contact.phoneHref} className="link-quiet">
          {contact.phone}
        </a>
      ),
    },
  ];

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Kontakt' : 'Contact'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[15ch]">
              {de ? 'Schreiben Sie uns' : 'Write to us'}
            </h1>
            <p className="lede mt-6">
              {de
                ? 'Es gibt kein Callcenter dazwischen. Ihre Nachricht kommt bei der Familie an, der die Wohnungen gehören.'
                : 'There is no call centre in between. Your message reaches the family who own the apartments.'}
            </p>
            <p className="mt-4 text-[14px] text-muted-foreground">
              {de ? contact.responseWindow.de : contact.responseWindow.en}
            </p>
          </Reveal>
        </div>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
            {channels.map((channel, i) => (
              <Reveal key={channel.title} delay={i * 0.07}>
                <div
                  className="h-full p-7 flex flex-col"
                  style={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <channel.icon
                    className="w-5 h-5 mb-4"
                    style={{ color: 'hsl(var(--champagne-dark))' }}
                    aria-hidden="true"
                  />
                  <h2 className="text-[16px] font-semibold">{channel.title}</h2>
                  <p className="body-copy mt-2.5 text-[14px] flex-1">{channel.body}</p>
                  <div className="mt-5">{channel.action}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.12}>
            <div
              className="mt-10 flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between lg:p-9"
              style={{
                background: 'hsl(var(--secondary) / 0.6)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
            >
              <div className="flex items-start gap-3">
                <MapPin
                  className="w-5 h-5 mt-0.5 shrink-0"
                  style={{ color: 'hsl(var(--champagne-dark))' }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-[15px] font-semibold">
                    {brand.name} · {brand.city}
                  </p>
                  <p className="body-copy mt-1 text-[14px]">
                    {de
                      ? `${contact.street}, ${contact.postalCode} ${brand.city}. Die genaue Adresse und den Weg erhalten Sie, sobald Ihr Aufenthalt feststeht.`
                      : `${contact.street}, ${contact.postalCode} ${brand.city}. You receive the exact address and directions once your stay is confirmed.`}
                  </p>
                </div>
              </div>
              <EnquiryButton />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
