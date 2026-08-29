'use client';

import { MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Section } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { contact } from '@/lib/content/brand';

/**
 * The final decision point: explore, or ask.
 *
 * No countdown, no "3 people are viewing this", no "last apartment at this
 * price". We have no availability data, so any urgency here would be invented.
 */
export function ClosingSection() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <Section tone="muted" compact>
      <div className="container-luxury">
        <Reveal>
          <div
            className="px-7 py-14 text-center lg:px-16 lg:py-20"
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <p className="eyebrow">{de ? 'Nächster Schritt' : 'Next step'}</p>

            <h2 className="display-2 mt-5 mx-auto max-w-[18ch]">
              {de ? 'Wann möchten Sie kommen?' : 'When would you like to come?'}
            </h2>

            <p className="lede mx-auto mt-5">
              {de
                ? 'Schreiben Sie uns Ihren Zeitraum. Wir prüfen ihn persönlich und antworten mit Verfügbarkeit, Preis und allem, was Sie sonst wissen möchten.'
                : 'Send us your dates. We check them personally and reply with availability, price and anything else you would like to know.'}
            </p>

            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
              <EnquiryButton withArrow />
              <CtaLink href="/apartments" variant="secondary">
                {label('exploreApartments', locale)}
              </CtaLink>
            </div>

            <div className="mt-8">
              <a
                href={contact.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="link-quiet"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                {label('writeWhatsApp', locale)}
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
