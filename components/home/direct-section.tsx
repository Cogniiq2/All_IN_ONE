'use client';

import { Check, Minus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Section, SectionHeader } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * Why book directly.
 *
 * Every row here is a difference we can actually stand behind: who you talk to,
 * what can be arranged, how questions get answered. There is no savings
 * percentage, because none has been verified — the previous site claimed
 * platform fees of "10–20%" with nothing behind it.
 *
 * `verifiedPriceAdvantage` is the slot for that claim. It stays `null` until
 * the owners supply real, comparable figures; the section is written to work
 * without it, so adding it later is additive rather than a redesign.
 */
const verifiedPriceAdvantage: { de: string; en: string } | null = null;
// NEEDS CONFIRMATION — e.g. { de: 'Direkt sparen Sie die Plattformgebühr von X %', en: '…' }

const rows = [
  {
    de: 'Wer antwortet',
    en: 'Who answers',
    platform: { de: 'Formular und Support-Team', en: 'Form and support team' },
    direct: { de: 'Die Familie, die die Wohnung besitzt', en: 'The family who owns the apartment' },
  },
  {
    de: 'Fragen vor der Buchung',
    en: 'Questions before booking',
    platform: { de: 'Über die Plattform, oft verzögert', en: 'Via the platform, often delayed' },
    direct: { de: 'Direkt per WhatsApp oder Telefon', en: 'Directly by WhatsApp or phone' },
  },
  {
    de: 'Besondere Wünsche',
    en: 'Special requests',
    platform: { de: 'Nur im Standardrahmen', en: 'Only within the standard framework' },
    direct: { de: 'Wir sprechen darüber, bevor Sie zusagen', en: 'We talk it through before you commit' },
  },
  {
    de: 'Anreise abstimmen',
    en: 'Coordinating arrival',
    platform: { de: 'Feste Vorgaben', en: 'Fixed parameters' },
    direct: { de: 'Persönlich abgestimmt', en: 'Agreed personally' },
  },
  {
    de: 'Längere Aufenthalte',
    en: 'Longer stays',
    platform: { de: 'Standardkonditionen', en: 'Standard conditions' },
    direct: { de: 'Sprechen Sie uns an', en: 'Talk to us' },
  },
];

export function DirectSection() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <Section tone="muted">
      <div className="container-luxury">
        <SectionHeader
          eyebrow={de ? 'Direkt anfragen' : 'Book direct'}
          title={de ? 'Warum direkt bei uns' : 'Why come to us directly'}
          lede={
            de
              ? 'Wir sind auch auf Plattformen zu finden. Direkt zu fragen ändert aber, mit wem Sie sprechen — und was sich vor Ihrer Zusage noch klären lässt.'
              : 'You can find us on platforms too. Coming to us directly changes who you speak to — and what can still be settled before you commit.'
          }
        />

        <Reveal delay={0.08}>
          <div
            className="mt-12 overflow-hidden"
            style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', background: 'hsl(var(--card))' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left border-collapse">
                <caption className="sr-only">
                  {de
                    ? 'Vergleich: Anfrage über eine Plattform gegenüber direkter Anfrage'
                    : 'Comparison: enquiring via a platform versus enquiring directly'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-[26%] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {de ? 'Thema' : 'Topic'}
                    </th>
                    <th scope="col" className="w-[37%] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {de ? 'Über eine Plattform' : 'Via a platform'}
                    </th>
                    <th
                      scope="col"
                      className="w-[37%] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: 'hsl(var(--champagne-dark))' }}
                    >
                      {de ? 'Direkt bei BoLaGio' : 'Direct with BoLaGio'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.de} style={{ borderTop: '1px solid hsl(var(--border) / 0.8)' }}>
                      <th scope="row" className="px-5 py-4 text-[14px] font-semibold align-top">
                        {de ? row.de : row.en}
                      </th>
                      <td className="px-5 py-4 text-[14px] text-muted-foreground align-top">
                        <span className="inline-flex items-start gap-2">
                          <Minus className="w-4 h-4 mt-0.5 shrink-0 opacity-50" aria-hidden="true" />
                          {de ? row.platform.de : row.platform.en}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[14px] align-top">
                        <span className="inline-flex items-start gap-2">
                          <Check
                            className="w-4 h-4 mt-0.5 shrink-0"
                            style={{ color: 'hsl(var(--champagne-dark))' }}
                            aria-hidden="true"
                          />
                          {de ? row.direct.de : row.direct.en}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Renders only when a verified figure exists. */}
                  {verifiedPriceAdvantage && (
                    <tr style={{ borderTop: '1px solid hsl(var(--border) / 0.8)' }}>
                      <th scope="row" className="px-5 py-4 text-[14px] font-semibold align-top">
                        {de ? 'Preis' : 'Price'}
                      </th>
                      <td className="px-5 py-4 text-[14px] text-muted-foreground align-top" colSpan={2}>
                        {verifiedPriceAdvantage[locale]}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <EnquiryButton withArrow />
            <p className="text-[13px] text-muted-foreground max-w-[46ch]">
              {de
                ? 'Eine Anfrage ist unverbindlich. Wir prüfen den Zeitraum und melden uns mit Verfügbarkeit und Preis.'
                : 'An enquiry commits you to nothing. We check your dates and come back with availability and price.'}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
