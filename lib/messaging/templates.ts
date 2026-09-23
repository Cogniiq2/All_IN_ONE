/**
 * ══════════════════════════════════════════════════════════════════════════
 * GUEST MESSAGE TEMPLATES — the catalogue.
 *
 * Five kinds, two languages, one version each. A template is data: an id,
 * a version, the variables it REQUIRES, and a subject and body written with
 * `{{variable}}` placeholders. The renderer (`render.ts`) refuses to produce
 * a message with a missing required variable or an unresolved placeholder,
 * so a guest can never receive "Dear {{firstName}}".
 *
 * ── What is deliberately absent ─────────────────────────────────────────
 * Access codes, door instructions, Wi-Fi passwords, cleaner names, review
 * links. None of those are facts this repository holds; a template that
 * invented one would be a lie in a guest's inbox. When such facts exist
 * (on the unit row, verified by the owners) they become variables here —
 * with a required flag, so their absence fails safely rather than sending a
 * message with a hole in it.
 *
 * ── Versioning ──────────────────────────────────────────────────────────
 * `id` and `version` are written to the delivery ledger with every send, so
 * "which wording did this guest receive" is a query, not a guess. Changing
 * copy means bumping `version`.
 *
 * This module is import-safe from anywhere: data and types only.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const MESSAGE_KINDS = ['booking_confirmation', 'prearrival', 'checkin', 'checkout', 'review_request'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_LOCALES = ['de', 'en'] as const;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];

export const DEFAULT_LOCALE: MessageLocale = 'de';

export function isMessageKind(value: unknown): value is MessageKind {
  return typeof value === 'string' && (MESSAGE_KINDS as readonly string[]).includes(value);
}

export function toMessageLocale(value: unknown): MessageLocale {
  return value === 'en' ? 'en' : 'de';
}

/** Every variable any template may reference. The renderer validates against this set. */
export const MESSAGE_VARIABLES = [
  'firstName',
  'lastName',
  'reference',
  'unitName',
  'checkInDate',
  'checkOutDate',
  'checkInTime',
  'checkOutTime',
  'nights',
  'adults',
  'children',
  'totalAmount',
  'brandName',
  'contactEmail',
  'contactPhone',
  'siteUrl',
  'daysUntilArrival',
  // The contract terms, for the booking confirmation on a durable medium
  // (§ 312f Abs. 2 BGB). Resolved BY VERSION from the terms the guest was
  // shown at checkout — never from whatever is current when the mail goes out.
  'contractingParty',
  'cancellationPolicy',
  'withdrawalNotice',
  'termsUrl',
  'privacyUrl',
] as const;
export type MessageVariable = (typeof MESSAGE_VARIABLES)[number];

export interface MessageTemplate {
  id: string;
  kind: MessageKind;
  locale: MessageLocale;
  version: string;
  /** Rendering fails if any of these is absent or empty. */
  required: readonly MessageVariable[];
  subject: string;
  text: string;
}

const CORE: readonly MessageVariable[] = ['firstName', 'reference', 'unitName', 'checkInDate', 'checkOutDate', 'brandName', 'contactEmail'];

/**
 * A booking confirmation without its contract terms is not a confirmation the
 * law recognises (§ 312f Abs. 2 BGB, Art. 246a EGBGB): the trader's identity,
 * the cancellation terms and the withdrawal notice must reach the guest on a
 * durable medium. Required, so a missing one refuses to render rather than
 * sending a confirmation with a hole where the terms should be.
 */
const CONTRACT_TERMS: readonly MessageVariable[] = ['contractingParty', 'cancellationPolicy', 'withdrawalNotice', 'termsUrl', 'privacyUrl'];

export const MESSAGE_TEMPLATES: readonly MessageTemplate[] = [
  /* ── Booking confirmation ─────────────────────────────────────────────── */
  {
    id: 'booking_confirmation.de',
    kind: 'booking_confirmation',
    locale: 'de',
    version: '2',
    required: [...CORE, 'nights', 'totalAmount', 'checkInTime', 'checkOutTime', ...CONTRACT_TERMS],
    subject: 'Ihre Buchung {{reference}} bei {{brandName}} ist bestätigt',
    text: `Guten Tag {{firstName}},

vielen Dank für Ihre Buchung. Ihre Reservierung ist bestätigt.

Referenz: {{reference}}
Unterkunft: {{unitName}}
Anreise: {{checkInDate}} ab {{checkInTime}} Uhr
Abreise: {{checkOutDate}} bis {{checkOutTime}} Uhr
Nächte: {{nights}}
Gesamtbetrag: {{totalAmount}}

Ihr Vertragspartner: {{contractingParty}}

Stornierungsbedingungen:
{{cancellationPolicy}}

Widerrufsrecht:
{{withdrawalNotice}}

Es gelten unsere Allgemeinen Geschäftsbedingungen: {{termsUrl}}
Datenschutzerklärung: {{privacyUrl}}

Wir melden uns kurz vor Ihrer Anreise mit allen Details zum Check-in.

Bei Fragen erreichen Sie uns unter {{contactEmail}}.

Herzliche Grüße
{{brandName}}`,
  },
  {
    id: 'booking_confirmation.en',
    kind: 'booking_confirmation',
    locale: 'en',
    version: '2',
    required: [...CORE, 'nights', 'totalAmount', 'checkInTime', 'checkOutTime', ...CONTRACT_TERMS],
    subject: 'Your booking {{reference}} at {{brandName}} is confirmed',
    text: `Dear {{firstName}},

Thank you for your booking. Your reservation is confirmed.

Reference: {{reference}}
Apartment: {{unitName}}
Arrival: {{checkInDate}} from {{checkInTime}}
Departure: {{checkOutDate}} by {{checkOutTime}}
Nights: {{nights}}
Total: {{totalAmount}}

Your contracting party: {{contractingParty}}

Cancellation terms:
{{cancellationPolicy}}

Right of withdrawal:
{{withdrawalNotice}}

Our terms and conditions apply: {{termsUrl}}
Privacy notice: {{privacyUrl}}

We will be in touch shortly before your arrival with the check-in details.

If you have any questions, write to us at {{contactEmail}}.

Kind regards
{{brandName}}`,
  },

  /* ── Pre-arrival ──────────────────────────────────────────────────────── */
  {
    id: 'prearrival.de',
    kind: 'prearrival',
    locale: 'de',
    version: '1',
    required: [...CORE, 'checkInTime', 'contactPhone'],
    subject: 'Ihre Anreise bei {{brandName}} – {{reference}}',
    text: `Guten Tag {{firstName}},

Ihre Anreise in {{unitName}} steht bevor.

Anreise: {{checkInDate}} ab {{checkInTime}} Uhr
Referenz: {{reference}}

Die Details zum Zugang erhalten Sie von uns persönlich vor Ihrer Ankunft. Wenn Sie Ihre voraussichtliche Ankunftszeit kennen, teilen Sie sie uns gern mit – per E-Mail an {{contactEmail}} oder telefonisch unter {{contactPhone}}.

Wir freuen uns auf Sie.

Herzliche Grüße
{{brandName}}`,
  },
  {
    id: 'prearrival.en',
    kind: 'prearrival',
    locale: 'en',
    version: '1',
    required: [...CORE, 'checkInTime', 'contactPhone'],
    subject: 'Your arrival at {{brandName}} – {{reference}}',
    text: `Dear {{firstName}},

Your stay at {{unitName}} is coming up.

Arrival: {{checkInDate}} from {{checkInTime}}
Reference: {{reference}}

We will send you the access details personally before you arrive. If you already know your approximate arrival time, let us know at {{contactEmail}} or by phone on {{contactPhone}}.

We look forward to welcoming you.

Kind regards
{{brandName}}`,
  },

  /* ── Check-in day ─────────────────────────────────────────────────────── */
  {
    id: 'checkin.de',
    kind: 'checkin',
    locale: 'de',
    version: '1',
    required: [...CORE, 'checkInTime', 'contactPhone'],
    subject: 'Heute Anreise – {{unitName}} ({{reference}})',
    text: `Guten Tag {{firstName}},

heute ist Ihr Anreisetag in {{unitName}}. Der Check-in ist ab {{checkInTime}} Uhr möglich.

Sollte etwas nicht wie erwartet sein, erreichen Sie uns jederzeit unter {{contactPhone}} oder {{contactEmail}}.

Gute Anreise!

Herzliche Grüße
{{brandName}}`,
  },
  {
    id: 'checkin.en',
    kind: 'checkin',
    locale: 'en',
    version: '1',
    required: [...CORE, 'checkInTime', 'contactPhone'],
    subject: 'Arriving today – {{unitName}} ({{reference}})',
    text: `Dear {{firstName}},

Today is your arrival day at {{unitName}}. Check-in is possible from {{checkInTime}}.

If anything is not as expected, reach us any time on {{contactPhone}} or at {{contactEmail}}.

Safe travels!

Kind regards
{{brandName}}`,
  },

  /* ── Check-out notice ─────────────────────────────────────────────────── */
  {
    id: 'checkout.de',
    kind: 'checkout',
    locale: 'de',
    version: '1',
    required: [...CORE, 'checkOutTime'],
    subject: 'Ihre Abreise am {{checkOutDate}} – {{reference}}',
    text: `Guten Tag {{firstName}},

Ihre Abreise aus {{unitName}} ist am {{checkOutDate}}. Wir bitten Sie, das Apartment bis {{checkOutTime}} Uhr zu verlassen.

Wenn Sie Fragen zur Abreise haben, schreiben Sie uns an {{contactEmail}}.

Wir hoffen, Sie hatten einen angenehmen Aufenthalt.

Herzliche Grüße
{{brandName}}`,
  },
  {
    id: 'checkout.en',
    kind: 'checkout',
    locale: 'en',
    version: '1',
    required: [...CORE, 'checkOutTime'],
    subject: 'Your departure on {{checkOutDate}} – {{reference}}',
    text: `Dear {{firstName}},

Your departure from {{unitName}} is on {{checkOutDate}}. We kindly ask you to leave the apartment by {{checkOutTime}}.

If you have any questions about your departure, write to us at {{contactEmail}}.

We hope you enjoyed your stay.

Kind regards
{{brandName}}`,
  },

  /* ── Review request ───────────────────────────────────────────────────── */
  {
    id: 'review_request.de',
    kind: 'review_request',
    locale: 'de',
    version: '1',
    required: [...CORE],
    subject: 'Wie war Ihr Aufenthalt bei {{brandName}}?',
    text: `Guten Tag {{firstName}},

vielen Dank, dass Sie in {{unitName}} zu Gast waren.

Wenn Sie einen Moment haben: Eine kurze Rückmeldung an {{contactEmail}} hilft uns, den nächsten Aufenthalt noch besser zu machen. Ihre Referenz war {{reference}}.

Wir freuen uns, Sie wiederzusehen.

Herzliche Grüße
{{brandName}}`,
  },
  {
    id: 'review_request.en',
    kind: 'review_request',
    locale: 'en',
    version: '1',
    required: [...CORE],
    subject: 'How was your stay at {{brandName}}?',
    text: `Dear {{firstName}},

Thank you for staying at {{unitName}}.

If you have a moment, a short note to {{contactEmail}} helps us make the next stay even better. Your reference was {{reference}}.

We would be glad to welcome you again.

Kind regards
{{brandName}}`,
  },
];

export function findTemplate(kind: MessageKind, locale: MessageLocale): MessageTemplate | undefined {
  return MESSAGE_TEMPLATES.find((t) => t.kind === kind && t.locale === locale);
}
