'use client';

import { useI18n } from '@/lib/i18n';
import { brand } from '@/lib/content/brand';
import { LegalPage, LegalSection } from '@/components/legal/legal-page';

/**
 * AGB.
 *
 * NEEDS LEGAL REVIEW before launch — final terms are out of scope for this
 * frontend pass and must be drafted with a Fachanwalt.
 *
 * Removed from the previous version because none of it was decided: "100 %
 * payment due at booking by Stripe or PayPal", a 14-day / 50 % cancellation
 * schedule, a maximum occupancy of four guests per apartment, and fixed quiet
 * hours. Those are commercial decisions the owners have not yet made, and the
 * website no longer takes payment at all.
 */
export default function AGBClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  const pending = de
    ? 'Die verbindlichen Konditionen werden vor Veröffentlichung ergänzt und rechtlich geprüft.'
    : 'The binding terms will be completed and legally reviewed before publication.';

  return (
    <LegalPage
      title={de ? 'Allgemeine Geschäftsbedingungen' : 'Terms and conditions'}
      intro={
        de
          ? `Grundlage für Anfragen und Aufenthalte bei ${brand.name}.`
          : `The basis for enquiries and stays with ${brand.name}.`
      }
    >
      <LegalSection heading={de ? '1. Geltungsbereich' : '1. Scope'}>
        <p>
          {de
            ? `Diese Bedingungen gelten für Anfragen und Aufenthalte in den von ${brand.name} in Bayreuth vermieteten Apartments.`
            : `These terms apply to enquiries and stays in the apartments let by ${brand.name} in Bayreuth.`}
        </p>
      </LegalSection>

      <LegalSection heading={de ? '2. Anfrage und Zustandekommen' : '2. Enquiry and formation'}>
        <p>
          {de
            ? 'Eine über diese Website gesendete Anfrage ist unverbindlich und stellt keine Buchung dar. Ein Vertrag kommt erst zustande, wenn wir Verfügbarkeit und Preis bestätigt haben und Sie diese Bestätigung ausdrücklich annehmen.'
            : 'An enquiry sent through this website is non-binding and does not constitute a booking. A contract is formed only once we have confirmed availability and price and you have expressly accepted that confirmation.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? '3. Preise und Zahlung' : '3. Prices and payment'}>
        <p>
          {de
            ? 'Preise werden individuell je Zeitraum, Aufenthaltsdauer und Personenzahl mitgeteilt. Über diese Website werden keine Zahlungen abgewickelt.'
            : 'Prices are quoted individually according to dates, length of stay and number of guests. No payments are processed through this website.'}
        </p>
        <p>{pending}</p>
      </LegalSection>

      <LegalSection heading={de ? '4. Stornierung' : '4. Cancellation'}>
        <p>{pending}</p>
      </LegalSection>

      <LegalSection heading={de ? '5. Nutzung der Apartments' : '5. Use of the apartments'}>
        <p>
          {de
            ? 'Die Apartments sind Wohnungen in bewohnten Häusern. Wir bitten um einen entsprechend rücksichtsvollen Umgang mit Nachbarschaft und Gebäude. Die konkreten Hausregeln erhalten Sie mit der Bestätigung Ihres Aufenthalts.'
            : 'The apartments are homes in occupied buildings. We ask for corresponding consideration towards neighbours and the building. The specific house rules are provided with the confirmation of your stay.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? '6. Haftung' : '6. Liability'}>
        <p>{pending}</p>
      </LegalSection>
    </LegalPage>
  );
}
