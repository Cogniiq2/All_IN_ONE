'use client';

import { useI18n } from '@/lib/i18n';
import { brand, contact } from '@/lib/content/brand';
import { LegalPage, LegalSection } from '@/components/legal/legal-page';

/**
 * Datenschutzerklärung.
 *
 * NEEDS LEGAL REVIEW before launch — final privacy text is out of scope for
 * this frontend pass. What this version does is name the processing that the
 * redesigned frontend actually performs, which the previous 63-line version
 * did not: an enquiry submitted to an external automation endpoint, and a
 * language preference in localStorage.
 *
 * What changed technically and is reflected here: web fonts are now served
 * from our own origin (the Google Fonts import was removed), no analytics or
 * tracking runs, and no payment provider is contacted from this website.
 */
export default function DatenschutzClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <LegalPage
      title={de ? 'Datenschutzerklärung' : 'Privacy policy'}
      intro={
        de
          ? 'Wie wir mit personenbezogenen Daten umgehen, wenn Sie diese Website nutzen.'
          : 'How we handle personal data when you use this website.'
      }
    >
      <LegalSection heading={de ? 'Verantwortlich' : 'Controller'}>
        <p>
          {brand.name}, {contact.postalCode} {brand.city}, {brand.country}.
        </p>
        <p>
          {de
            ? 'Die vollständigen Angaben zum Verantwortlichen werden gemeinsam mit dem Impressum vor Veröffentlichung ergänzt.'
            : 'Full controller details will be completed together with the legal notice before publication.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Anfragen über diese Website' : 'Enquiries through this website'}>
        <p>
          {de
            ? 'Wenn Sie das Anfrageformular nutzen, verarbeiten wir die von Ihnen eingegebenen Angaben (Name, E-Mail-Adresse, optional Telefonnummer und Nachricht sowie Ihren gewünschten Reisezeitraum), um Ihre Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO.'
            : 'When you use the enquiry form we process the details you enter (name, email address, optionally phone number and message, and your requested dates) in order to answer your enquiry. The legal basis is Art. 6(1)(b) or (f) GDPR.'}
        </p>
        <p>
          {de
            ? 'Die Übermittlung erfolgt an einen von uns eingesetzten Automatisierungsdienst, der die Anfrage an uns weiterleitet. Details zu Auftragsverarbeitern und Speicherfristen werden vor Veröffentlichung ergänzt.'
            : 'Submissions are transmitted to an automation service we use, which forwards the enquiry to us. Details of processors and retention periods will be completed before publication.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Hosting' : 'Hosting'}>
        <p>
          {de
            ? 'Diese Website wird bei einem externen Anbieter gehostet. Beim Aufruf werden technisch notwendige Daten wie IP-Adresse, Zeitpunkt und aufgerufene Seite verarbeitet. Der Anbieter und die Vertragsgrundlage werden vor Veröffentlichung benannt.'
            : 'This website is hosted by an external provider. Technically necessary data such as IP address, time and requested page are processed when you visit. The provider and contractual basis will be named before publication.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Schriften' : 'Fonts'}>
        <p>
          {de
            ? 'Alle Schriften werden von unserem eigenen Server ausgeliefert. Es besteht keine Verbindung zu Google Fonts oder einem anderen externen Schriftdienst.'
            : 'All fonts are served from our own origin. No connection is made to Google Fonts or any other external font service.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Analyse und Tracking' : 'Analytics and tracking'}>
        <p>
          {de
            ? 'Diese Website setzt keine Analyse- oder Tracking-Dienste ein und verwendet keine Cookies zu Werbezwecken. Ihre Sprachauswahl wird lokal in Ihrem Browser gespeichert (localStorage) und nicht an uns übertragen.'
            : 'This website uses no analytics or tracking services and no advertising cookies. Your language preference is stored locally in your browser (localStorage) and is not transmitted to us.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Zahlungen' : 'Payments'}>
        <p>
          {de
            ? 'Über diese Website werden derzeit keine Zahlungen abgewickelt. Es wird kein Zahlungsdienstleister eingebunden.'
            : 'No payments are processed through this website at present. No payment provider is embedded.'}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Ihre Rechte' : 'Your rights'}>
        <p>
          {de
            ? 'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, sich bei einer Aufsichtsbehörde zu beschweren. Wenden Sie sich dafür an die im Impressum genannten Kontaktdaten.'
            : 'You have the right to access, rectification, erasure, restriction of processing, data portability and objection, as well as the right to lodge a complaint with a supervisory authority. Please use the contact details in the legal notice.'}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
