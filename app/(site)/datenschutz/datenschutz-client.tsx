'use client';

import { useI18n } from '@/lib/i18n';
import { COMPANY } from '@/lib/legal/company';
import { DATA_SERVICES } from '@/lib/legal/processors';
import { PRIVACY_NOTICES, latest } from '@/lib/legal/booking-terms';
import { LegalPage, LegalSection, Pending } from '@/components/legal/legal-page';

/**
 * Datenschutzerklärung.
 *
 * Written against what the code actually does (2026-09-23 audit): the
 * website, the enquiry forms, the direct booking (behind its launch gate),
 * reservations imported from Booking.com / Airbnb via Beds24 (Art. 14 GDPR —
 * those guests never typed anything here), guest emails, the Residence
 * Privileges programme, browser storage and the click-to-load map.
 *
 * Facts BoLaGio has not yet supplied — the controller's address, each
 * provider's contracting entity and storage region, the concrete retention
 * periods — render as a visible `Pending` gap. The page is approved when a
 * version is recorded in PRIVACY_NOTICES (lib/legal/booking-terms.ts); until
 * then the closing review note stays and direct booking stays shut.
 *
 * NEEDS LEGAL REVIEW — see LEGAL_REVIEW_REQUIRED.md.
 */
export default function DatenschutzClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const t = (deText: string, enText: string) => (de ? deText : enText);
  const pending = <Pending locale={locale} />;
  const c = COMPANY;
  const approved = latest(PRIVACY_NOTICES);

  return (
    <LegalPage
      title={t('Datenschutzerklärung', 'Privacy notice')}
      intro={t(
        'Wie wir mit personenbezogenen Daten umgehen — auf dieser Website, bei Anfragen und Buchungen und bei Aufenthalten, die Sie über ein Buchungsportal gebucht haben.',
        'How we handle personal data — on this website, for enquiries and bookings, and for stays you booked through a booking platform.'
      )}
      reviewed={approved !== null}
    >
      <LegalSection heading={t('1. Verantwortlicher', '1. Controller')}>
        <p>{c.legalName ?? pending}</p>
        <p>{c.street && c.postalCode && c.city ? `${c.street}, ${c.postalCode} ${c.city}, ${c.country}` : pending}</p>
        <p>
          {t('E-Mail', 'Email')}: {c.email ?? pending} · {t('Telefon', 'Phone')}: {c.phone ?? pending}
        </p>
        <p>
          {t(
            'Einen Datenschutzbeauftragten haben wir nicht benannt, soweit dazu keine gesetzliche Pflicht besteht. Für alle Fragen zum Datenschutz erreichen Sie uns unter den oben genannten Kontaktdaten.',
            'We have not appointed a data protection officer, as far as there is no legal obligation to do so. For any data protection question, please use the contact details above.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('2. Das Wichtigste in Kürze', '2. In short')}>
        <p>
          {t(
            'Diese Website verwendet keine Analyse-, Tracking- oder Werbedienste, setzt keine Cookies zu Werbe- oder Statistikzwecken und erstellt keine Profile. Wir verarbeiten personenbezogene Daten, um die Website bereitzustellen, Anfragen zu beantworten, Buchungen durchzuführen und gesetzliche Pflichten zu erfüllen — und für Werbung nur mit Ihrer ausdrücklichen, bestätigten Einwilligung.',
            'This website uses no analytics, tracking or advertising services, sets no cookies for advertising or statistics and builds no profiles. We process personal data to provide the website, answer enquiries, carry out bookings and meet legal obligations — and for marketing only with your explicit, confirmed consent.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('3. Aufruf der Website und Hosting', '3. Visiting the website and hosting')}>
        <p>
          {t(
            'Beim Aufruf verarbeitet unser Hosting-Dienstleister technisch notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser- und Geräteangaben sowie die zuvor besuchte Seite. Das ist erforderlich, um die Website auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren, funktionsfähigen Angebot (Art. 6 Abs. 1 lit. f DSGVO).',
            'When you visit, our hosting provider processes technically necessary data: IP address, time, requested address, browser and device details and the referring page. This is needed to deliver the website and protect it against attacks. The legal basis is our legitimate interest in a secure, working service (Art. 6(1)(f) GDPR).'
          )}
        </p>
        <p>
          {t(
            'Unsere eigenen Anwendungsprotokolle enthalten keine IP-Adressen, Namen, E-Mail-Adressen oder Telefonnummern. Zum Schutz vor Missbrauch wird die IP-Adresse kurzzeitig im Arbeitsspeicher gezählt (Anfragebegrenzung) und nicht gespeichert.',
            'Our own application logs contain no IP addresses, names, email addresses or phone numbers. To prevent abuse, the IP address is briefly counted in memory (rate limiting) and not stored.'
          )}
        </p>
        <p>
          {t('Speicherdauer der Zugriffsprotokolle beim Hosting-Dienstleister: ', 'Retention of access logs at the hosting provider: ')}
          {pending}
        </p>
      </LegalSection>

      <LegalSection heading={t('4. Speicherung in Ihrem Browser', '4. Storage in your browser')}>
        <p>
          {t(
            'Wenn Sie die Sprache umstellen, speichern wir Ihre Wahl im lokalen Speicher Ihres Browsers (localStorage, Eintrag „bolagio-locale“). Sie wird nicht an uns übertragen. Diese Speicherung ist für die von Ihnen gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); Sie können sie jederzeit in Ihrem Browser löschen.',
            'If you switch language, we store your choice in your browser’s local storage (localStorage, entry “bolagio-locale”). It is not transmitted to us. This storage is strictly necessary for the function you requested (§ 25(2) no. 2 TDDDG); you can delete it in your browser at any time.'
          )}
        </p>
        <p>
          {t(
            'Weitere Cookies oder vergleichbare Technologien setzt die öffentliche Website nicht. Erst wenn Sie bei einer Direktbuchung den Zahlungsschritt erreichen, wird die Zahlungsschaltfläche von PayPal geladen, die für die Zahlung eigene Cookies verwenden kann (siehe Abschnitt 6).',
            'The public website sets no other cookies or comparable technologies. Only when you reach the payment step of a direct booking is PayPal’s payment button loaded, which may use its own cookies for the payment (see section 6).'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('5. Anfragen', '5. Enquiries')}>
        <p>
          {t(
            'Wenn Sie uns über ein Anfrageformular schreiben, verarbeiten wir Ihre Angaben (Name, E-Mail-Adresse, optional Telefonnummer und Nachricht, gewünschter Zeitraum, Personenzahl, bevorzugte Zahlungsart), um Ihre Anfrage zu beantworten und gegebenenfalls einen Vertrag vorzubereiten. Die Anfrage wird über unseren Automatisierungsdienst an uns weitergeleitet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, bei allgemeinen Anfragen Art. 6 Abs. 1 lit. f DSGVO.',
            'If you write to us through an enquiry form, we process your details (name, email address, optionally phone number and message, requested dates, number of guests, preferred payment method) to answer your enquiry and, where applicable, prepare a contract. The enquiry is forwarded to us through our automation service. The legal basis is Art. 6(1)(b) GDPR, for general enquiries Art. 6(1)(f) GDPR.'
          )}
        </p>
        <p>
          {t('Speicherdauer von Anfragen, aus denen keine Buchung wird: ', 'Retention of enquiries that do not lead to a booking: ')}
          {pending}
        </p>
      </LegalSection>

      <LegalSection heading={t('6. Direktbuchung auf dieser Website', '6. Direct booking on this website')}>
        <p>
          {t(
            'Soweit wir die Online-Buchung anbieten, verarbeiten wir Ihren Namen, Ihre E-Mail-Adresse, Ihre Telefonnummer, gegebenenfalls Ihr Land, Ihre Sprache, den gebuchten Zeitraum, die Personenzahl und den Preis, um den Beherbergungsvertrag abzuschließen und zu erfüllen (Art. 6 Abs. 1 lit. b DSGVO). Ohne Name, E-Mail-Adresse und Telefonnummer ist eine Buchung nicht möglich.',
            'Where we offer online booking, we process your name, email address, phone number, where given your country, your language, the booked dates, the number of guests and the price, to conclude and perform the accommodation contract (Art. 6(1)(b) GDPR). A booking is not possible without name, email address and phone number.'
          )}
        </p>
        <p>
          {t(
            'Zum Nachweis speichern wir, welche Fassung der Stornierungsbedingungen, des Hinweises zum Widerrufsrecht, der AGB, dieser Datenschutzerklärung und der Preisangabe Ihnen bei der Buchung angezeigt wurde, und wann (Art. 6 Abs. 1 lit. b und f DSGVO).',
            'As evidence, we store which version of the cancellation terms, the notice on the right of withdrawal, the terms and conditions, this privacy notice and the price statement you were shown when booking, and when (Art. 6(1)(b) and (f) GDPR).'
          )}
        </p>
        <p>
          {t(
            'Ihre Reservierung wird über unseren Channel-Manager an unseren Kalender übermittelt, damit dieselben Nächte nicht zusätzlich über ein Buchungsportal vergeben werden. Die Zahlung wickelt PayPal in eigener Verantwortung ab; dabei gelten zusätzlich die Datenschutzhinweise von PayPal. Wir erhalten von PayPal nur die Bestätigung der Zahlung, den Betrag und eine Transaktionskennung — keine Konto- oder Kartendaten.',
            'Your reservation is passed through our channel manager to our calendar so that the same nights are not also sold through a booking platform. PayPal processes the payment under its own responsibility; PayPal’s privacy information applies in addition. We receive from PayPal only the payment confirmation, the amount and a transaction reference — no account or card details.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('7. Buchungen über Booking.com, Airbnb und andere Portale', '7. Bookings through Booking.com, Airbnb and other platforms')}>
        <p>
          {t(
            'Wenn Sie über ein Buchungsportal bei uns gebucht haben, haben Sie Ihre Daten nicht auf dieser Website eingegeben. Wir erhalten sie vom jeweiligen Portal über unseren Channel-Manager (Art. 14 DSGVO). Das Portal ist für seine eigene Verarbeitung selbst verantwortlich; es gilt dessen Datenschutzerklärung.',
            'If you booked with us through a booking platform, you did not enter your details on this website. We receive them from that platform through our channel manager (Art. 14 GDPR). The platform is itself responsible for its own processing; its privacy statement applies.'
          )}
        </p>
        <p>
          {t(
            'Dabei handelt es sich um: Ihren Namen, die vom Portal übermittelten Kontaktdaten (häufig eine vom Portal vergebene Weiterleitungsadresse), Anreise- und Abreisedatum, Personenzahl, Preis- und Zahlungsangaben sowie Ihre Nachrichten an uns. Wir verwenden diese Daten, um Ihren Aufenthalt durchzuführen — Vorbereitung der Wohnung, Anreiseinformationen, Kommunikation (Art. 6 Abs. 1 lit. b DSGVO) — und um gesetzliche Pflichten zu erfüllen, insbesondere steuer- und handelsrechtliche Aufbewahrung (Art. 6 Abs. 1 lit. c DSGVO).',
            'This is: your name, the contact details the platform passes on (often a relay address issued by the platform), arrival and departure dates, number of guests, price and payment details, and your messages to us. We use them to carry out your stay — preparing the apartment, arrival information, communication (Art. 6(1)(b) GDPR) — and to meet legal obligations, in particular tax and commercial record-keeping (Art. 6(1)(c) GDPR).'
          )}
        </p>
        <p>
          {t(
            'Eine über ein Portal gebuchte Reservierung ist keine Einwilligung in Werbung. Wir verwenden diese Kontaktdaten nicht für Werbung.',
            'A reservation made through a platform is not consent to marketing. We do not use these contact details for marketing.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('8. Meldepflicht für Gäste', '8. Guest registration')}>
        <p>
          {t(
            'Als Beherbergungsbetrieb sind wir nach §§ 29, 30 Bundesmeldegesetz verpflichtet, bestimmte Gäste (derzeit Gäste ohne deutsche Staatsangehörigkeit) bei Ankunft einen Meldeschein ausfüllen zu lassen. Diese Angaben verarbeiten wir zur Erfüllung dieser Pflicht (Art. 6 Abs. 1 lit. c DSGVO), außerhalb dieser Website, und löschen sie nach Ablauf der gesetzlichen Frist (§ 30 Abs. 4 BMG). Ausweisdaten werden auf dieser Website nicht erhoben.',
            'As an accommodation provider we are required by §§ 29, 30 of the Federal Registration Act (BMG) to have certain guests (currently guests without German nationality) complete a registration form on arrival. We process these details to meet that obligation (Art. 6(1)(c) GDPR), outside this website, and delete them when the statutory period ends (§ 30(4) BMG). No identity-document data is collected on this website.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('9. E-Mails zu Ihrem Aufenthalt', '9. Emails about your stay')}>
        <p>
          {t(
            'Zu einer Direktbuchung senden wir Ihnen die Buchungsbestätigung mit den Vertragsbedingungen sowie Informationen zu An- und Abreise (Art. 6 Abs. 1 lit. b DSGVO). Bitten um Bewertungen oder Rückmeldung senden wir nur, wenn dafür eine Rechtsgrundlage besteht; derzeit versenden wir keine.',
            'For a direct booking we send you the booking confirmation with the contract terms and information about arrival and departure (Art. 6(1)(b) GDPR). We send requests for reviews or feedback only where there is a legal basis for them; at present we send none.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('10. Residence Privileges', '10. Residence Privileges')}>
        <p>
          {t(
            'Über den QR-Code in der Wohnung können Sie Ihre E-Mail-Adresse hinterlegen, um bei einer künftigen Direktbuchung Vorteile zu erhalten. Wir speichern dazu Ihre E-Mail-Adresse, den Bestätigungsstatus, die Wohnung und Aktion des QR-Codes, Ihre Sprache und — nur wenn Sie das freiwillige Häkchen setzen — den Nachweis Ihrer Einwilligung in Werbung (Zeitpunkt, Herkunft, Fassung des Einwilligungstextes, Zeitpunkt der Bestätigung und eines Widerrufs).',
            'Through the QR code in the apartment you can leave your email address to receive benefits on a future direct booking. For this we store your email address, the confirmation status, the apartment and campaign of the QR code, your language and — only if you tick the voluntary box — the evidence of your consent to marketing (time, source, version of the consent wording, time of confirmation and of any withdrawal).'
          )}
        </p>
        <p>
          {t(
            'Die Vorteile erhalten Sie unabhängig von einer Einwilligung in Werbung (Art. 6 Abs. 1 lit. b DSGVO). Werbe-E-Mails senden wir nur mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 7 Abs. 2 Nr. 2 UWG), die erst wirksam wird, wenn Sie sie über den Link in unserer Bestätigungs-E-Mail bestätigen. Sie können sie jederzeit mit Wirkung für die Zukunft widerrufen — über den Abmeldelink in jeder Werbe-E-Mail oder formlos per Nachricht an uns.',
            'You receive the benefits regardless of any consent to marketing (Art. 6(1)(b) GDPR). We send marketing emails only with your consent (Art. 6(1)(a) GDPR, § 7(2) no. 2 UWG), which takes effect only once you confirm it via the link in our confirmation email. You can withdraw it at any time with effect for the future — via the unsubscribe link in every marketing email or informally by writing to us.'
          )}
        </p>
        <p>
          {t('Speicherdauer: ', 'Retention: ')}
          {pending}
        </p>
      </LegalSection>

      <LegalSection heading={t('11. Kontakt per Telefon und WhatsApp', '11. Contact by phone and WhatsApp')}>
        <p>
          {t(
            'Wenn Sie uns anrufen oder über den WhatsApp-Link schreiben, verarbeiten wir Ihre Angaben, um Ihr Anliegen zu bearbeiten (Art. 6 Abs. 1 lit. b bzw. f DSGVO). Der WhatsApp-Link ist ein gewöhnlicher Verweis: Die Website überträgt nichts, bis Sie ihm folgen; die Kommunikation läuft dann über WhatsApp.',
            'If you call us or write via the WhatsApp link, we process your details to handle your request (Art. 6(1)(b) or (f) GDPR). The WhatsApp link is an ordinary link: the website transmits nothing until you follow it; the conversation then runs through WhatsApp.'
          )}
        </p>
      </LegalSection>

      {/* Required by the click-to-load map on /contact. See
          components/contact/location-cards.tsx for the mechanism. */}
      <LegalSection heading={t('12. Karten', '12. Maps')}>
        <p>
          {t(
            'Auf der Kontaktseite zeigen wir unsere Standorte zunächst als lokal erzeugte Vorschau ohne jede Verbindung zu einem Kartenanbieter. Erst wenn Sie ausdrücklich auf „Karte laden“ klicken, wird eine Karte von Google Maps (Google Ireland Limited) nachgeladen. Dabei werden Ihre IP-Adresse und Angaben zu Ihrem Endgerät an Google übertragen; eine Übermittlung in Drittländer ist nicht ausgeschlossen.',
            'On the contact page we show our locations as a locally generated preview with no connection to any map provider. Only when you explicitly select “Load map” is a Google Maps map (Google Ireland Limited) loaded. Your IP address and details about your device are then transmitted to Google; transfer to third countries cannot be excluded.'
          )}
        </p>
        <p>
          {t(
            'Rechtsgrundlage für dieses Nachladen ist Ihre Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG, die Sie durch den Klick erteilen. Ohne diesen Klick findet keine Übertragung statt. Die Einwilligung gilt nur für den jeweiligen Seitenaufruf; sie wird nicht gespeichert und kann durch Neuladen der Seite widerrufen werden.',
            'The legal basis for loading it is your consent under Art. 6(1)(a) GDPR and § 25(1) TDDDG, which you give by that click. Without it, no transfer takes place. The consent applies to that page view only; it is not stored and is withdrawn by reloading the page.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('13. Dienstleister und Empfänger', '13. Service providers and recipients')}>
        <p>
          {t(
            'Wir setzen die folgenden Dienste ein. Auftragsverarbeiter handeln nur nach unserer Weisung auf Grundlage eines Vertrags nach Art. 28 DSGVO; eigenverantwortliche Stellen verarbeiten Daten in eigener Verantwortung.',
            'We use the following services. Processors act only on our instructions under a contract pursuant to Art. 28 GDPR; independent controllers process data under their own responsibility.'
          )}
        </p>
        <ul className="list-disc space-y-3 pl-5">
          {DATA_SERVICES.map((service) => (
            <li key={service.key}>
              <span className="font-semibold">{service.name}</span>
              {' — '}
              {service.role === 'processor' ? t('Auftragsverarbeiter', 'processor') : t('eigenverantwortlich', 'independent controller')}
              <br />
              {service.purpose[locale]}
              <br />
              {t('Anbieter: ', 'Provider: ')}
              {service.entity ?? pending}
              <br />
              {t('Speicherort und Übermittlungsgrundlage: ', 'Storage location and transfer basis: ')}
              {service.location ? service.location[locale] : pending}
            </li>
          ))}
        </ul>
        <p>
          {t(
            'Darüber hinaus geben wir Daten nur weiter, wenn wir gesetzlich dazu verpflichtet sind (etwa an Finanz- oder Meldebehörden) oder es zur Durchsetzung unserer Ansprüche erforderlich ist, sowie an unsere steuerliche Beratung.',
            'Beyond that, we pass on data only where we are legally required to (for instance to tax or registration authorities) or where it is necessary to enforce our claims, and to our tax adviser.'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('14. Speicherdauer', '14. Retention')}>
        <p>
          {t(
            'Wir speichern personenbezogene Daten, solange es für den jeweiligen Zweck erforderlich ist. Buchungs- und Rechnungsunterlagen bewahren wir auf, solange steuer- und handelsrechtliche Aufbewahrungspflichten bestehen (§ 147 AO, § 257 HGB); danach löschen wir sie. Die konkreten Fristen je Datenkategorie: ',
            'We keep personal data for as long as the respective purpose requires. Booking and invoice records are kept for as long as tax and commercial retention obligations apply (§ 147 AO, § 257 HGB); they are then deleted. The specific periods per data category: '
          )}
          {pending}
        </p>
      </LegalSection>

      <LegalSection heading={t('15. Ihre Rechte', '15. Your rights')}>
        <p>
          {t(
            'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Eine Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Eine automatisierte Entscheidungsfindung einschließlich Profiling findet nicht statt.',
            'You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20). You can withdraw consent at any time with effect for the future (Art. 7(3) GDPR). No automated decision-making, including profiling, takes place.'
          )}
        </p>
        <p className="font-semibold">
          {t(
            'Widerspruchsrecht (Art. 21 DSGVO): Soweit wir Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeiten, können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen. Der Verarbeitung für Direktwerbung können Sie jederzeit ohne Angabe von Gründen widersprechen.',
            'Right to object (Art. 21 GDPR): where we process data on the basis of Art. 6(1)(f) GDPR, you may object at any time on grounds relating to your particular situation. You may object to processing for direct marketing at any time without giving reasons.'
          )}
        </p>
        <p>
          {t(
            'Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Für uns zuständig ist das Bayerische Landesamt für Datenschutzaufsicht (BayLDA).',
            'You also have the right to lodge a complaint with a data protection supervisory authority. The authority responsible for us is the Bavarian Data Protection Authority (Bayerisches Landesamt für Datenschutzaufsicht, BayLDA).'
          )}
        </p>
      </LegalSection>

      <LegalSection heading={t('16. Stand', '16. Version')}>
        <p>
          {approved
            ? `${t('Fassung', 'Version')} ${approved.version}`
            : t('Entwurf vom 23.09.2026 — noch nicht freigegeben.', 'Draft of 23 Sep 2026 — not yet approved.')}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
