'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CalendarDays, MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, contact } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { label } from '@/components/ui-kit/cta';

/**
 * Contact.
 *
 * It maintains no form of its own. Each channel points at the journey that
 * already owns it — the accommodation channel hands the visitor the apartments,
 * where a booking actually starts — so there is no second, subtly different
 * copy of a flow to keep in step.
 *
 * No email address is shown: none has been confirmed. See contact.email in
 * lib/content/brand.ts. Nothing here invents one.
 *
 * ── What this page is for ────────────────────────────────────────────────
 * It is the route for a visitor who does not fit the two main journeys: a
 * general question, an unusual request, or simply not knowing which path to
 * take. It is NOT a third way to book a stay or to ask about a tenancy — both
 * of those have their own flows, and the router below points at them rather
 * than duplicating them here.
 */
export default function ContactClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  const channels = [
    {
      icon: Send,
      title: de ? 'Direkt buchen' : 'Book directly',
      body: de
        ? 'Der direkteste Weg: Zeitraum, Personenzahl, fertig. Verfügbarkeit und Preis bestätigen wir persönlich.'
        : 'The most direct route: dates, number of guests, done. We confirm availability and price personally.',
      // Generic booking entry: it stands in front of no particular apartment, so
      // it hands the visitor the apartments rather than opening a form.
      action: (
        <Link href="/apartments" className="link-quiet">
          {label('bookNow', locale)}
        </Link>
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
                    borderRadius: 'var(--radius-lg)',
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

          {/* Sends a visitor to the journey built for them, before they write
              a message that the booking or appointment flow would answer
              faster. Two routes only, so the page stays a router and not a
              menu. */}
          <Reveal delay={0.1}>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:gap-8">
              {[
                {
                  icon: CalendarDays,
                  title: de ? 'Sie möchten übernachten?' : 'Looking to stay?',
                  body: de
                    ? 'Zeitraum und Personenzahl wählen, den Rest klären wir. Das geht über die Apartments schneller als über eine Nachricht.'
                    : 'Choose your dates and party size and we settle the rest. That is quicker through the apartments than through a message.',
                  href: '/apartments',
                  cta: de ? 'Apartments ansehen' : 'View apartments',
                },
                {
                  icon: Building2,
                  title: de ? 'Sie möchten mieten?' : 'Looking to rent?',
                  body: de
                    ? 'Wohnraum oder Gewerbefläche über einen regulären Mietvertrag. Dafür vereinbaren wir ein Gespräch, keine Buchung.'
                    : 'Residential or commercial space under a conventional rental agreement. For that we arrange a conversation, not a booking.',
                  href: '/mieten',
                  cta: de ? 'Mietangebote ansehen' : 'View properties to rent',
                },
              ].map((route) => (
                <div
                  key={route.href}
                  className="flex flex-col p-7"
                  style={{
                    background: 'hsl(var(--secondary) / 0.5)',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius-lg)',
                  }}
                >
                  <route.icon
                    className="mb-4 h-5 w-5"
                    style={{ color: 'hsl(var(--champagne-dark))' }}
                    aria-hidden="true"
                  />
                  <h2 className="text-[16px] font-semibold">{route.title}</h2>
                  <p className="body-copy mt-2.5 flex-1 text-[14px]">{route.body}</p>
                  <Link href={route.href} className="link-quiet mt-5 self-start">
                    {route.cta}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.14}>
            <div
              className="mt-10 flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between lg:p-9"
              style={{
                background: 'hsl(var(--secondary) / 0.6)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-lg)',
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
