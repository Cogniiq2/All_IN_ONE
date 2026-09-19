'use client';

import { useI18n } from '@/lib/i18n';
import { brand, contact } from '@/lib/content/brand';
import { LegalPage, LegalSection } from '@/components/legal/legal-page';

/**
 * Impressum.
 *
 * NEEDS CONFIRMATION before launch — all of it: the registered company name,
 * the Sitz der Gesellschaft, Handelsregister number and Registergericht, the
 * Geschäftsführer named under § 5 DDG, and the USt-IdNr (or confirmation of
 * the Kleinunternehmerregelung).
 *
 * The previous version published "Musterstraße 1" and "DE XXX XXX XXX" as if
 * they were real. Fabricated data is worse than an acknowledged gap, so it is
 * gone.
 */
export default function ImpressumClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  const pending = de
    ? 'Wird vor Veröffentlichung ergänzt.'
    : 'To be completed before publication.';

  return (
    <LegalPage
      title={de ? 'Impressum' : 'Legal notice'}
      intro={
        de
          ? 'Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG).'
          : 'Information pursuant to § 5 of the German Digital Services Act (DDG).'
      }
    >
      <LegalSection heading={de ? 'Anbieter' : 'Provider'}>
        <p>{brand.name}</p>
        <p>
          {contact.postalCode} {brand.city}, {brand.country}
        </p>
        <p>{de ? 'Vollständige Firmierung und Anschrift: ' : 'Full company name and address: '}{pending}</p>
      </LegalSection>

      <LegalSection heading={de ? 'Vertreten durch' : 'Represented by'}>
        <p>{pending}</p>
      </LegalSection>

      <LegalSection heading={de ? 'Handelsregister' : 'Commercial register'}>
        <p>{de ? 'Registergericht und Registernummer: ' : 'Register court and number: '}{pending}</p>
      </LegalSection>

      <LegalSection heading={de ? 'Umsatzsteuer' : 'VAT'}>
        <p>
          {de
            ? 'Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: '
            : 'VAT identification number pursuant to § 27a UStG: '}
          {pending}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Kontakt' : 'Contact'}>
        <p>
          {de ? 'Telefon' : 'Phone'}: {contact.phone}
        </p>
        <p>
          {de
            ? 'Kontaktaufnahme per Anfrageformular und WhatsApp über diese Website.'
            : 'Contact via the enquiry form and WhatsApp on this website.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Streitschlichtung' : 'Dispute resolution'}>
        <p>
          {de
            ? 'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit. Ob und in welchem Umfang wir an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilnehmen, wird hier vor Veröffentlichung ergänzt.'
            : 'The European Commission provides a platform for online dispute resolution. Whether and to what extent we participate in dispute resolution proceedings before a consumer arbitration board will be stated here before publication.'}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
