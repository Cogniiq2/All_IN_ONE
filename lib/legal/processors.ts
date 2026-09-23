/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE SERVICES THAT TOUCH PERSONAL DATA — as the privacy notice names them.
 *
 * One entry per external service the website and its booking operations
 * actually use, read by /datenschutz. It lists what the code does, not a
 * policy. The CONTRACT facts are left `null` until BoLaGio reads them off
 * the signed agreement:
 *
 *   entity      the contracting legal entity and seat
 *   location    where BoLaGio's data is stored and the transfer basis
 *               (adequacy decision / EU-US Data Privacy Framework / SCCs)
 *
 * The page renders `null` as "wird ergänzt" — visible, never guessed. Every
 * `processor` entry also needs a signed Art. 28 GDPR agreement; that is a
 * contract, not code, and is tracked in LEGAL_REVIEW_REQUIRED.md.
 *
 * Import-safe: data only.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Localized } from '@/lib/legal/booking-terms';

export interface DataService {
  key: string;
  name: string;
  /** Legal entity and seat, from the contract. `null` = to be completed. */
  entity: string | null;
  /** processor = acts on BoLaGio's instructions (Art. 28); controller = its own responsibility. */
  role: 'processor' | 'controller';
  /** When it is involved at all. */
  when: 'always' | 'direct_booking' | 'on_request' | 'operations';
  purpose: Localized;
  /** Storage region and transfer basis. `null` = to be completed from the contract. */
  location: Localized | null;
}

export const DATA_SERVICES: readonly DataService[] = [
  {
    key: 'cloudflare',
    name: 'Cloudflare',
    entity: null,
    role: 'processor',
    when: 'always',
    purpose: {
      de: 'Hosting und Auslieferung dieser Website (Cloudflare Workers, Content Delivery Network, Schutz vor Angriffen).',
      en: 'Hosting and delivery of this website (Cloudflare Workers, content delivery network, attack protection).',
    },
    location: null,
  },
  {
    key: 'supabase',
    name: 'Supabase',
    entity: null,
    role: 'processor',
    when: 'operations',
    purpose: {
      de: 'Datenbank für Buchungen, Reservierungen, Gastnachrichten und das Programm „Residence Privileges“.',
      en: 'Database for bookings, reservations, guest messages and the “Residence Privileges” programme.',
    },
    location: null,
  },
  {
    key: 'beds24',
    name: 'Beds24',
    entity: null,
    role: 'processor',
    when: 'operations',
    purpose: {
      de: 'Channel-Manager: gleicht Verfügbarkeiten und Reservierungen zwischen dieser Website, Booking.com und Airbnb ab.',
      en: 'Channel manager: synchronises availability and reservations between this website, Booking.com and Airbnb.',
    },
    location: null,
  },
  {
    key: 'n8n',
    name: 'n8n (Automatisierung) / E-Mail-Versand',
    entity: null,
    role: 'processor',
    when: 'operations',
    purpose: {
      de: 'Weiterleitung von Anfragen an uns und Versand von E-Mails zu Buchungen und zur Bestätigung Ihrer E-Mail-Adresse.',
      en: 'Forwarding enquiries to us and sending emails about bookings and to confirm your email address.',
    },
    location: null,
  },
  {
    key: 'paypal',
    name: 'PayPal',
    entity: 'PayPal (Europe) S.à r.l. et Cie, S.C.A., Luxemburg',
    role: 'controller',
    when: 'direct_booking',
    purpose: {
      de: 'Zahlungsabwicklung bei einer Direktbuchung. PayPal verarbeitet Ihre Zahlungsdaten in eigener Verantwortung; es gilt zusätzlich die Datenschutzerklärung von PayPal.',
      en: 'Payment processing for a direct booking. PayPal processes your payment data under its own responsibility; PayPal’s privacy statement applies in addition.',
    },
    location: null,
  },
  {
    key: 'google-maps',
    name: 'Google Maps',
    entity: 'Google Ireland Limited, Dublin',
    role: 'controller',
    when: 'on_request',
    purpose: {
      de: 'Kartendarstellung auf der Kontaktseite — nur nach Ihrem Klick auf „Karte laden“.',
      en: 'Map display on the contact page — only after you select “Load map”.',
    },
    location: {
      de: 'Eine Übermittlung in Drittländer, insbesondere die USA, ist nicht ausgeschlossen.',
      en: 'A transfer to third countries, in particular the USA, cannot be excluded.',
    },
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    entity: null,
    role: 'controller',
    when: 'on_request',
    purpose: {
      de: 'Wenn Sie uns über den WhatsApp-Link schreiben. Die Website überträgt dabei nichts; die Kommunikation läuft über WhatsApp.',
      en: 'If you write to us via the WhatsApp link. The website transmits nothing; the conversation runs through WhatsApp.',
    },
    location: null,
  },
];
