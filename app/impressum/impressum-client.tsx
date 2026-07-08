'use client';

import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function ImpressumClient() {
  const { t, locale } = useI18n();

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="max-w-2xl mx-auto">
            <h1 className="font-serif text-4xl font-semibold mb-8">{t('legal.impressumTitle')}</h1>
            <div className="prose prose-sm text-muted-foreground space-y-6">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? 'Angaben gemäß § 5 TMG' : 'Information according to § 5 TMG'}
                </h2>
                <p>All in One Residences</p>
                <p>Musterstraße 1<br />95444 Bayreuth<br />Deutschland</p>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                  {locale === 'de' ? 'Vertreten durch' : 'Represented by'}
                </h3>
                <p>Milos Popovic</p>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                  {locale === 'de' ? 'Kontakt' : 'Contact'}
                </h3>
                <p>
                  {locale === 'de' ? 'Telefon' : 'Phone'}: +49 160 1832917<br />
                  E-Mail: info@allinone-residences.de
                </p>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                  {locale === 'de' ? 'Umsatzsteuer-ID' : 'VAT ID'}
                </h3>
                <p>
                  {locale === 'de'
                    ? 'Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: DE XXX XXX XXX'
                    : 'VAT identification number according to § 27a of the Sales Tax Law: DE XXX XXX XXX'}
                </p>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                  {locale === 'de' ? 'Streitschlichtung' : 'Dispute Resolution'}
                </h3>
                <p>
                  {locale === 'de'
                    ? 'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.'
                    : 'The European Commission provides a platform for online dispute resolution (OS). We are not willing or obliged to participate in dispute resolution proceedings before a consumer arbitration board.'}
                </p>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}
