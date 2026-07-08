'use client';

import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function DatenschutzClient() {
  const { t, locale } = useI18n();

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="max-w-2xl mx-auto">
            <h1 className="font-serif text-4xl font-semibold mb-8">{t('legal.datenschutzTitle')}</h1>
            <div className="prose prose-sm text-muted-foreground space-y-6">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '1. Datenschutz auf einen Blick' : '1. Privacy at a Glance'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.'
                    : 'The following notices provide a simple overview of what happens to your personal data when you visit this website. Personal data is any data that can be used to personally identify you.'}
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '2. Verantwortliche Stelle' : '2. Responsible Party'}
                </h2>
                <p>
                  All in One Residences<br />
                  Musterstraße 1<br />
                  95444 Bayreuth<br />
                  E-Mail: info@allinone-residences.de
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '3. Datenerfassung auf dieser Website' : '3. Data Collection on This Website'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Beim Besuch dieser Website werden automatisch technische Daten (z.B. Internetbrowser, Betriebssystem, Uhrzeit des Seitenaufrufs) erfasst. Diese Daten werden automatisch beim Besuch der Website erhoben.'
                    : 'When you visit this website, technical data (e.g. internet browser, operating system, time of page access) is automatically collected. This data is collected automatically when you visit the website.'}
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '4. Ihre Rechte' : '4. Your Rights'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben außerdem das Recht, die Berichtigung oder Löschung dieser Daten zu verlangen.'
                    : 'You have the right at any time to obtain free information about the origin, recipients, and purpose of your stored personal data. You also have the right to request correction or deletion of this data.'}
                </p>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}
