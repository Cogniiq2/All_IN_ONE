'use client';

import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function AGBClient() {
  const { t, locale } = useI18n();

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="max-w-2xl mx-auto">
            <h1 className="font-serif text-4xl font-semibold mb-8">{t('legal.agbTitle')}</h1>
            <div className="prose prose-sm text-muted-foreground space-y-6">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '1. Geltungsbereich' : '1. Scope'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Diese Allgemeinen Geschäftsbedingungen gelten für alle Buchungen und Aufenthalte in den Residenzen von All in One Residences — Bayreuth.'
                    : 'These General Terms and Conditions apply to all bookings and stays at the residences of All in One Residences — Bayreuth.'}
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '2. Buchung & Zahlung' : '2. Booking & Payment'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Die Buchung wird mit Eingang der vollständigen Zahlung verbindlich. Die Zahlung ist zu 100 % bei Buchung fällig. Akzeptierte Zahlungsmethoden: Kreditkarte (Stripe) und PayPal.'
                    : 'The booking becomes binding upon receipt of full payment. Payment of 100% is due at the time of booking. Accepted payment methods: credit card (Stripe) and PayPal.'}
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '3. Stornierung' : '3. Cancellation'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Stornierungen sind bis 14 Tage vor Anreise kostenfrei möglich. Bei Stornierung innerhalb von 14 Tagen vor Anreise werden 50 % des Gesamtbetrags berechnet. Bei Nichterscheinen wird der volle Betrag fällig.'
                    : 'Cancellations are free of charge up to 14 days before arrival. Cancellations within 14 days of arrival will be charged 50% of the total amount. No-shows will be charged the full amount.'}
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '4. Hausregeln' : '4. House Rules'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'Ruhezeiten: 22:00–07:00 Uhr. Rauchen ist in allen Residenzen untersagt. Haustiere sind nur nach vorheriger Absprache gestattet. Die maximale Belegung beträgt 4 Gäste pro Residenz.'
                    : 'Quiet hours: 10 PM–7 AM. Smoking is prohibited in all residences. Pets are allowed only by prior arrangement. Maximum occupancy is 4 guests per residence.'}
                </p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
                  {locale === 'de' ? '5. Haftung' : '5. Liability'}
                </h2>
                <p>
                  {locale === 'de'
                    ? 'All in One Residences haftet nicht für den Verlust persönlicher Gegenstände. Schäden an der Residenz, die durch den Gast verursacht werden, sind vom Gast zu tragen.'
                    : 'All in One Residences is not liable for the loss of personal belongings. Damages to the residence caused by the guest are the responsibility of the guest.'}
                </p>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}
