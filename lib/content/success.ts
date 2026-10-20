/**
 * ══════════════════════════════════════════════════════════════════════════
 * SUCCESS SCENES — what BoLaGio says after a visitor has done something.
 *
 * One scene per moment a visitor can complete on this site. Each page under
 * /thank-you, /booking/confirmed, /booking/payment-received and
 * /guest/privileges/* renders exactly one of these through
 * components/success/success-experience.tsx. The layout is shared; the words
 * are not, because a guest who paid for a stay, a company asking about office
 * space and someone with a general question are in three different moments.
 *
 * ── What a scene may say ─────────────────────────────────────────────────
 * Only what is true at the moment the page renders. In particular:
 *
 *   • "bestätigt" / "confirmed" appears ONLY on the booking-confirmed scene,
 *     and that page renders it only once the booking backend says so.
 *   • every request scene says plainly that nothing is binding yet and
 *     nothing was charged, because a hospitality visitor who just pressed a
 *     button reasonably assumes the opposite.
 *   • the response time is the brand's own `contact.responseWindow` wording
 *     ("usually the same day"), never a sharper promise.
 *   • nothing about a tenancy suggests a permitted use or an entitlement —
 *     the same caution as `longTermUse` in lib/content/apartments.ts.
 *
 * `title` is the page's h1 and stays short and stable (the guest e2e specs
 * address pages by it). A personal greeting, when a name is known, is a
 * separate line above it — `greeting` — so the heading never depends on
 * what somebody typed.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Localized } from '@/lib/content/apartments';

export type SuccessSceneId =
  | 'booking-confirmed'
  | 'payment-received'
  | 'booking-request'
  | 'stay-enquiry'
  | 'rental-enquiry'
  | 'business-enquiry'
  | 'appointment-request'
  | 'waitlist'
  | 'message'
  | 'privileges-check-inbox'
  | 'privileges-welcome'
  | 'privileges-unsubscribed';

export type SceneMark = 'check' | 'key' | 'clock' | 'mail' | 'calendar' | 'bell' | 'message' | 'building' | 'sparkle' | 'leaf';

/** Where a step stands: behind the visitor, happening now, or ahead. */
export type StepState = 'done' | 'active' | 'next';

export interface SceneStep {
  state: StepState;
  title: Localized;
  body: Localized;
}

export interface SceneCopy {
  eyebrow: Localized;
  /** The h1. Short, stable, never personalised. */
  title: Localized;
  /** One or two sentences under the title. */
  lede: Localized;
  steps: SceneStep[];
  /** The honest small print: what this is not. */
  note?: Localized;
}

export interface SuccessScene extends SceneCopy {
  id: SuccessSceneId;
  /** ink: a dark, celebratory ground for a completed transaction. ivory: everything else. */
  tone: 'ink' | 'ivory';
  mark: SceneMark;
  /** The browser-tab title. */
  documentTitle: Localized;
  /**
   * Copy that replaces parts of the scene for a sub-case — the kind of
   * rental request, the kind of party, a payment still in flight. Picked by
   * the page from facts it actually has; an unknown key falls back to the
   * scene itself.
   */
  variants?: Partial<Record<string, Partial<SceneCopy>>>;
}

/** The personal line above the title. `{name}` is the visitor's first name. */
export const GREETING: Record<'thanks' | 'welcome', Localized> = {
  thanks: { de: 'Danke, {name}.', en: 'Thank you, {name}.' },
  welcome: { de: 'Willkommen, {name}.', en: 'Welcome, {name}.' },
};

export const STEPS_HEADING: Localized = { de: 'Was jetzt passiert', en: 'What happens now' };

const RESPONSE = {
  de: 'Wir antworten persönlich, meist am selben Tag.',
  en: 'We reply personally, usually the same day.',
};

export const SUCCESS_SCENES: Record<SuccessSceneId, SuccessScene> = {
  /* ── A paid, confirmed direct booking ─────────────────────────────── */
  'booking-confirmed': {
    id: 'booking-confirmed',
    tone: 'ink',
    mark: 'key',
    documentTitle: { de: 'Buchung bestätigt', en: 'Booking confirmed' },
    eyebrow: { de: 'Buchung bestätigt', en: 'Booking confirmed' },
    title: { de: 'Ihre Buchung ist bestätigt', en: 'Your booking is confirmed' },
    lede: {
      de: 'Ihr Aufenthalt in Bayreuth steht. Alle Anreisedetails schicken wir Ihnen per E-Mail — Ihre Referenz gilt als Reservierungsnummer.',
      en: 'Your stay in Bayreuth is set. We are sending you all the arrival details by email — your reference is your reservation number.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Reservierung bestätigt', en: 'Reservation confirmed' },
        body: { de: 'Ihre Zahlung ist eingegangen, Ihr Zeitraum gehört Ihnen.', en: 'Your payment has arrived and your dates are yours.' },
      },
      {
        state: 'active',
        title: { de: 'Bestätigung per E-Mail', en: 'Confirmation by email' },
        body: { de: 'Sie erhalten Ihre Buchungsbestätigung mit allen Details.', en: 'You receive your booking confirmation with every detail.' },
      },
      {
        state: 'next',
        title: { de: 'Anreise', en: 'Arrival' },
        body: {
          de: 'Die Anreisedetails kommen per E-Mail. Bei Fragen erreichen Sie uns persönlich.',
          en: 'The arrival details come by email. If anything comes up, you reach us personally.',
        },
      },
    ],
  },

  /* ── Paid; the reservation is still being finalised ───────────────── */
  'payment-received': {
    id: 'payment-received',
    tone: 'ink',
    mark: 'clock',
    documentTitle: { de: 'Zahlung erhalten', en: 'Payment received' },
    eyebrow: { de: 'Zahlung erhalten', en: 'Payment received' },
    title: { de: 'Zahlung erhalten', en: 'Payment received' },
    lede: {
      // Not "your dates are reserved": a paid booking whose hold could not be
      // confirmed (manual review) lands here too. Only the confirmed scene
      // may promise the dates.
      de: 'Ihre Zahlung ist bei uns eingegangen. Wir schließen Ihre Reservierung jetzt ab und schicken Ihnen die Bestätigung per E-Mail. Sollte dabei etwas nicht stimmen, melden wir uns persönlich bei Ihnen.',
      en: 'Your payment has reached us. We are now completing your reservation and will email you the confirmation. Should anything not be right, we will contact you personally.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Zahlung eingegangen', en: 'Payment received' },
        body: { de: 'Der Betrag ist bei uns angekommen.', en: 'The amount has reached us.' },
      },
      {
        state: 'active',
        title: { de: 'Reservierung wird abgeschlossen', en: 'Finalising your reservation' },
        body: {
          de: 'Diese Seite aktualisiert sich von selbst, sobald die Bestätigung vorliegt.',
          en: 'This page updates itself as soon as the confirmation is ready.',
        },
      },
      {
        state: 'next',
        title: { de: 'Bestätigung per E-Mail', en: 'Confirmation by email' },
        body: { de: 'Mit allen Anreisedetails.', en: 'With every arrival detail.' },
      },
    ],
    note: {
      de: 'Sie müssen nichts weiter tun. Bitte zahlen Sie nicht ein zweites Mal.',
      en: 'There is nothing further to do. Please do not pay a second time.',
    },
    variants: {
      /* The provider has accepted the payment but not yet released it. */
      pending: {
        lede: {
          de: 'Ihre Zahlung wird noch vom Zahlungsdienst bestätigt. Sobald sie angekommen ist, erhalten Sie Ihre Bestätigung per E-Mail.',
          en: 'Your payment is still being confirmed by the payment provider. As soon as it arrives you will receive your confirmation by email.',
        },
        steps: [
          {
            state: 'done',
            title: { de: 'Zahlung angewiesen', en: 'Payment authorised' },
            body: { de: 'Der Zahlungsdienst hat Ihre Zahlung angenommen.', en: 'The payment provider has accepted your payment.' },
          },
          {
            state: 'active',
            title: { de: 'Zahlungseingang', en: 'Payment clearing' },
            body: {
              de: 'Diese Seite aktualisiert sich von selbst, sobald die Zahlung eingegangen ist.',
              en: 'This page updates itself as soon as the payment has cleared.',
            },
          },
          {
            state: 'next',
            title: { de: 'Bestätigung per E-Mail', en: 'Confirmation by email' },
            body: { de: 'Mit allen Anreisedetails.', en: 'With every arrival detail.' },
          },
        ],
      },
    },
  },

  /* ── The booking dialog, for a residence that cannot be booked online ── */
  'booking-request': {
    id: 'booking-request',
    tone: 'ivory',
    mark: 'check',
    documentTitle: { de: 'Buchungsanfrage erhalten', en: 'Booking request received' },
    eyebrow: { de: 'Buchungsanfrage', en: 'Booking request' },
    title: { de: 'Ihre Buchungsanfrage ist bei uns', en: 'Your booking request has arrived' },
    lede: {
      de: 'Wir prüfen Ihren Zeitraum persönlich und melden uns mit Bestätigung, Preis und Zahlungsweg — meist am selben Tag.',
      en: 'We check your dates personally and come back with confirmation, price and payment details — usually the same day.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Anfrage erhalten', en: 'Request received' },
        body: { de: 'Ihre Wunschdaten liegen bei uns.', en: 'Your preferred dates are with us.' },
      },
      {
        state: 'active',
        title: { de: 'Persönliche Prüfung', en: 'Personal check' },
        body: { de: 'Wir prüfen den Zeitraum für Ihr Apartment.', en: 'We check the dates for your apartment.' },
      },
      {
        state: 'next',
        title: { de: 'Bestätigung und Zahlungsweg', en: 'Confirmation and payment' },
        body: {
          de: 'Sie erhalten Bestätigung, Gesamtpreis und Zahlungsweg von uns.',
          en: 'You receive the confirmation, the total price and the payment details from us.',
        },
      },
    ],
    note: {
      de: 'Ihre Buchung ist damit noch nicht bestätigt und es wurde nichts abgebucht.',
      en: 'Your booking is not confirmed yet, and nothing has been charged.',
    },
  },

  /* ── The general booking-request form (apartment may be undecided) ─── */
  'stay-enquiry': {
    id: 'stay-enquiry',
    tone: 'ivory',
    mark: 'calendar',
    documentTitle: { de: 'Anfrage erhalten', en: 'Enquiry received' },
    eyebrow: { de: 'Aufenthalt in Bayreuth', en: 'A stay in Bayreuth' },
    title: { de: 'Ihre Buchungsanfrage ist bei uns', en: 'Your booking request has arrived' },
    lede: {
      de: 'Wir sehen uns Ihre Reisedaten persönlich an und schlagen Ihnen das passende Apartment vor — mit Verfügbarkeit und Preis.',
      en: 'We look at your travel dates personally and suggest the right apartment — with availability and price.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Anfrage erhalten', en: 'Request received' },
        body: { de: 'Ihre Reisedaten liegen bei uns.', en: 'Your travel dates are with us.' },
      },
      {
        state: 'active',
        title: { de: 'Persönliche Prüfung', en: 'Personal check' },
        body: { de: 'Wir prüfen Verfügbarkeit und passende Apartments.', en: 'We check availability and which apartments suit you.' },
      },
      {
        state: 'next',
        title: { de: 'Ihr Angebot', en: 'Your proposal' },
        body: { de: RESPONSE.de, en: RESPONSE.en },
      },
    ],
    note: {
      de: 'Mit dem Absenden ist noch nichts verbindlich und es wurde nichts abgebucht.',
      en: 'Nothing is binding yet, and nothing has been charged.',
    },
  },

  /* ── Long-term, private residential ───────────────────────────────── */
  'rental-enquiry': {
    id: 'rental-enquiry',
    tone: 'ivory',
    mark: 'leaf',
    documentTitle: { de: 'Mietanfrage erhalten', en: 'Rental enquiry received' },
    eyebrow: { de: 'Langfristig mieten', en: 'Long-term rental' },
    title: { de: 'Ihre Mietanfrage ist bei uns', en: 'Your rental enquiry has arrived' },
    lede: {
      de: 'Wir melden uns persönlich, um Ihre Vorstellungen kennenzulernen — Einzug, Dauer und was Ihnen an einem Zuhause wichtig ist.',
      en: 'We will be in touch personally to learn what you have in mind — move-in, duration and what matters to you in a home.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Anfrage erhalten', en: 'Enquiry received' },
        body: { de: 'Ihre Angaben liegen bei uns.', en: 'Your details are with us.' },
      },
      {
        state: 'active',
        title: { de: 'Persönliches Gespräch', en: 'A personal conversation' },
        body: { de: RESPONSE.de, en: RESPONSE.en },
      },
      {
        state: 'next',
        title: { de: 'Besichtigung', en: 'Viewing' },
        body: { de: 'Wenn es passt, vereinbaren wir einen Termin vor Ort.', en: 'If it feels right, we arrange a time on site.' },
      },
    ],
    note: {
      de: 'Die Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis und keinen Anspruch auf Abschluss eines Mietvertrags.',
      en: 'The enquiry is non-binding. It creates no tenancy and no entitlement to a rental agreement.',
    },
    variants: {
      viewing: {
        lede: {
          de: 'Wir melden uns persönlich mit einem Terminvorschlag für Ihre Besichtigung.',
          en: 'We will be in touch personally with a suggested time for your viewing.',
        },
        steps: [
          {
            state: 'done',
            title: { de: 'Anfrage erhalten', en: 'Enquiry received' },
            body: { de: 'Ihr Wunsch nach einer Besichtigung liegt bei uns.', en: 'Your viewing request is with us.' },
          },
          {
            state: 'active',
            title: { de: 'Terminvorschlag', en: 'A suggested time' },
            body: { de: RESPONSE.de, en: RESPONSE.en },
          },
          {
            state: 'next',
            title: { de: 'Besichtigung vor Ort', en: 'Viewing on site' },
            body: { de: 'Wir zeigen Ihnen die Räume persönlich.', en: 'We show you round in person.' },
          },
        ],
      },
      information: {
        lede: {
          de: 'Wir schicken Ihnen die Informationen, die Sie für Ihre Entscheidung brauchen — ohne Verpflichtung.',
          en: 'We send you the information you need to decide — with no obligation.',
        },
        steps: [
          {
            state: 'done',
            title: { de: 'Anfrage erhalten', en: 'Enquiry received' },
            body: { de: 'Ihre Fragen liegen bei uns.', en: 'Your questions are with us.' },
          },
          {
            state: 'active',
            title: { de: 'Ihre Informationen', en: 'Your information' },
            body: { de: RESPONSE.de, en: RESPONSE.en },
          },
          {
            state: 'next',
            title: { de: 'Wenn Sie möchten', en: 'When you are ready' },
            body: { de: 'Ein Gespräch oder eine Besichtigung — ganz in Ihrem Tempo.', en: 'A conversation or a viewing — entirely at your pace.' },
          },
        ],
      },
    },
  },

  /* ── Long-term, company or commercial ─────────────────────────────── */
  'business-enquiry': {
    id: 'business-enquiry',
    tone: 'ivory',
    mark: 'building',
    documentTitle: { de: 'Geschäftsanfrage erhalten', en: 'Business enquiry received' },
    eyebrow: { de: 'Für Unternehmen', en: 'For companies' },
    title: { de: 'Ihre Anfrage ist bei uns', en: 'Your enquiry has arrived' },
    lede: {
      de: 'Wir melden uns persönlich, um Ihren Bedarf zu verstehen — Flächen, Zeitraum, Konditionen — und besprechen, was zu Ihrem Unternehmen passt.',
      en: 'We will be in touch personally to understand what you need — space, timing, terms — and discuss what fits your company.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Anfrage erhalten', en: 'Enquiry received' },
        body: { de: 'Ihre Angaben liegen bei uns.', en: 'Your details are with us.' },
      },
      {
        state: 'active',
        title: { de: 'Bedarfsgespräch', en: 'Requirements call' },
        body: { de: RESPONSE.de, en: RESPONSE.en },
      },
      {
        state: 'next',
        title: { de: 'Besichtigung und Angebot', en: 'Viewing and proposal' },
        body: { de: 'Wenn es passt, zeigen wir Ihnen die Räume und stimmen die Konditionen ab.', en: 'If it fits, we show you the space and agree the terms.' },
      },
    ],
    note: {
      de: 'Die Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis; ob eine bestimmte Nutzung zulässig ist, klären wir im Gespräch.',
      en: 'The enquiry is non-binding and creates no tenancy. Whether a particular use is permitted is something we clarify together.',
    },
  },

  /* ── The rental appointment dialog ────────────────────────────────── */
  'appointment-request': {
    id: 'appointment-request',
    tone: 'ivory',
    mark: 'calendar',
    documentTitle: { de: 'Terminanfrage erhalten', en: 'Appointment request received' },
    eyebrow: { de: 'Terminanfrage', en: 'Appointment request' },
    title: { de: 'Ihre Terminanfrage ist bei uns', en: 'Your appointment request has arrived' },
    lede: {
      de: 'Wir melden uns persönlich mit einem Terminvorschlag. Erst wenn wir einen Zeitpunkt gemeinsam festgelegt haben, steht Ihr Termin.',
      en: 'We come back personally with a suggested time. Your appointment is set once we have agreed a time together.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Anfrage erhalten', en: 'Request received' },
        body: { de: 'Ihre Wünsche zu Zeitpunkt und Dauer liegen bei uns.', en: 'Your timing and duration are with us.' },
      },
      {
        state: 'active',
        title: { de: 'Terminvorschlag', en: 'A suggested time' },
        body: { de: RESPONSE.de, en: RESPONSE.en },
      },
      {
        state: 'next',
        title: { de: 'Persönlicher Termin', en: 'Meeting in person' },
        body: { de: 'Wir nehmen uns Zeit für Ihre Fragen — vor Ort.', en: 'We take time for your questions — on site.' },
      },
    ],
    note: {
      de: 'Die Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis und keinen Anspruch auf Abschluss eines Mietvertrags.',
      en: 'The enquiry is non-binding. It creates no tenancy and no entitlement to a rental agreement.',
    },
    variants: {
      company: {
        eyebrow: { de: 'Terminanfrage · Unternehmen', en: 'Appointment request · Company' },
        steps: [
          {
            state: 'done',
            title: { de: 'Anfrage erhalten', en: 'Request received' },
            body: { de: 'Ihre Angaben zum Unternehmen liegen bei uns.', en: 'Your company details are with us.' },
          },
          {
            state: 'active',
            title: { de: 'Terminvorschlag', en: 'A suggested time' },
            body: { de: RESPONSE.de, en: RESPONSE.en },
          },
          {
            state: 'next',
            title: { de: 'Besichtigung und Bedarf', en: 'Viewing and requirements' },
            body: { de: 'Wir zeigen Ihnen die Räume und besprechen, was Ihr Team braucht.', en: 'We show you the space and discuss what your team needs.' },
          },
        ],
        note: {
          de: 'Die Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis; ob eine bestimmte Nutzung zulässig ist, klären wir im Gespräch.',
          en: 'The enquiry is non-binding and creates no tenancy. Whether a particular use is permitted is something we clarify together.',
        },
      },
    },
  },

  /* ── "Informiert werden" for a residence in preparation ───────────── */
  waitlist: {
    id: 'waitlist',
    tone: 'ivory',
    mark: 'bell',
    documentTitle: { de: 'Vorgemerkt', en: 'On the list' },
    eyebrow: { de: 'Vorgemerkt', en: 'On the list' },
    title: { de: 'Wir melden uns', en: 'We will be in touch' },
    lede: {
      de: 'Sie gehören zu den Ersten, die erfahren, wann dieses Apartment buchbar ist.',
      en: 'You will be among the first to know when this apartment can be booked.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Vorgemerkt', en: 'Noted' },
        body: { de: 'Ihr Interesse liegt bei uns.', en: 'Your interest is with us.' },
      },
      {
        state: 'active',
        title: { de: 'In Vorbereitung', en: 'In preparation' },
        body: { de: 'Das Apartment wird gerade vorbereitet und ist noch nicht buchbar.', en: 'The apartment is being prepared and cannot be booked yet.' },
      },
      {
        state: 'next',
        title: { de: 'Ihre Nachricht von uns', en: 'Word from us' },
        body: { de: 'Sobald es buchbar ist, sagen wir Ihnen Bescheid.', en: 'As soon as it can be booked, we let you know.' },
      },
    ],
    note: {
      de: 'Dies ist keine Reservierung. Es wurde nichts gebucht und nichts abgebucht.',
      en: 'This is not a reservation. Nothing has been booked or charged.',
    },
  },

  /* ── A general question from /contact ─────────────────────────────── */
  message: {
    id: 'message',
    tone: 'ivory',
    mark: 'message',
    documentTitle: { de: 'Nachricht erhalten', en: 'Message received' },
    eyebrow: { de: 'Ihre Nachricht', en: 'Your message' },
    title: { de: 'Ihre Nachricht ist bei uns', en: 'Your message has arrived' },
    lede: {
      de: 'Ein Mensch aus unserem Team liest sie und antwortet Ihnen persönlich — meist am selben Tag.',
      en: 'A person from our team reads it and replies to you personally — usually the same day.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Nachricht erhalten', en: 'Message received' },
        body: { de: 'Sie ist sicher bei uns angekommen.', en: 'It has safely reached us.' },
      },
      {
        state: 'active',
        title: { de: 'Persönliche Antwort', en: 'A personal reply' },
        body: { de: RESPONSE.de, en: RESPONSE.en },
      },
      {
        state: 'next',
        title: { de: 'Direkter Draht', en: 'A direct line' },
        body: { de: 'Wenn es eilt, erreichen Sie uns auch per WhatsApp oder Telefon.', en: 'If it is urgent, WhatsApp or phone reach us too.' },
      },
    ],
  },

  /* ── Residence Privileges ─────────────────────────────────────────── */
  'privileges-check-inbox': {
    id: 'privileges-check-inbox',
    tone: 'ivory',
    mark: 'mail',
    documentTitle: { de: 'Postfach prüfen', en: 'Check your inbox' },
    eyebrow: { de: 'Residence Privileges', en: 'Residence Privileges' },
    title: { de: 'Prüfen Sie bitte Ihr Postfach.', en: 'Please check your inbox.' },
    lede: {
      de: 'Wir haben Ihnen eine E-Mail geschickt. Ein Klick auf den Link darin bestätigt Ihre Adresse — erst dann sind Ihre Vorteile hinterlegt.',
      en: 'We have sent you an email. Clicking the link in it confirms your address — only then are your benefits on file.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Adresse eingetragen', en: 'Address entered' },
        body: { de: 'Die Bestätigungs-E-Mail ist unterwegs.', en: 'The confirmation email is on its way.' },
      },
      {
        state: 'active',
        title: { de: 'Link bestätigen', en: 'Confirm the link' },
        body: {
          de: 'Der Link ist 72 Stunden gültig. Bitte sehen Sie auch im Spam-Ordner nach.',
          en: 'The link is valid for 72 hours. Please check your spam folder too.',
        },
      },
      {
        state: 'next',
        title: { de: 'Vorteile hinterlegt', en: 'Benefits on file' },
        body: { de: 'Ab dann gelten sie für Ihre nächste Direktbuchung.', en: 'From then on they apply to your next direct booking.' },
      },
    ],
  },

  'privileges-welcome': {
    id: 'privileges-welcome',
    tone: 'ink',
    mark: 'sparkle',
    documentTitle: { de: 'Vorteile hinterlegt', en: 'Benefits on file' },
    eyebrow: { de: 'Residence Privileges', en: 'Residence Privileges' },
    title: { de: 'Ihre Vorteile sind hinterlegt.', en: 'Your benefits are on file.' },
    lede: {
      de: 'Buchen Sie beim nächsten Mal direkt auf bolagio.de mit dieser E-Mail-Adresse — Ihre Konditionen werden automatisch erkannt.',
      en: 'Next time, book directly on bolagio.de with this email address and your terms will be recognised automatically.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Adresse bestätigt', en: 'Address confirmed' },
        body: { de: 'Ihre Vorteile sind Ihrer E-Mail-Adresse zugeordnet.', en: 'Your benefits are linked to your email address.' },
      },
      {
        state: 'active',
        title: { de: 'Direkt buchen', en: 'Book direct' },
        body: { de: 'Mit derselben Adresse, ohne Portal dazwischen.', en: 'With the same address, no portal in between.' },
      },
      {
        state: 'next',
        title: { de: 'Wiederkommen', en: 'Come back' },
        body: { de: 'Ihre Konditionen werden bei der Buchung automatisch erkannt.', en: 'Your terms are recognised automatically when you book.' },
      },
    ],
  },

  'privileges-unsubscribed': {
    id: 'privileges-unsubscribed',
    tone: 'ivory',
    mark: 'check',
    documentTitle: { de: 'Abgemeldet', en: 'Unsubscribed' },
    eyebrow: { de: 'Residence Privileges', en: 'Residence Privileges' },
    title: { de: 'Sie sind abgemeldet.', en: 'You are unsubscribed.' },
    lede: {
      de: 'Wir senden Ihnen keine Werbe-E-Mails mehr. Nachrichten zu einer Buchung erhalten Sie weiterhin, soweit sie für Ihren Aufenthalt nötig sind.',
      en: 'We will not send you marketing emails any more. You will still receive messages about a booking where they are needed for your stay.',
    },
    steps: [
      {
        state: 'done',
        title: { de: 'Abmeldung wirksam', en: 'Unsubscribe effective' },
        body: { de: 'Ab sofort, ohne weitere Schritte.', en: 'Immediately, with nothing more to do.' },
      },
      {
        state: 'next',
        title: { de: 'Jederzeit wieder', en: 'Welcome back any time' },
        body: {
          de: 'Wenn Sie es sich anders überlegen, tragen Sie sich einfach erneut ein.',
          en: 'If you change your mind, simply sign up again.',
        },
      },
    ],
  },
};

/** The pages under /thank-you/[kind]. The rest have routes of their own. */
export const THANK_YOU_KINDS = [
  'booking-request',
  'stay-enquiry',
  'rental-enquiry',
  'business-enquiry',
  'appointment-request',
  'waitlist',
  'message',
] as const satisfies readonly SuccessSceneId[];

export type ThankYouKind = (typeof THANK_YOU_KINDS)[number];

export function isThankYouKind(value: string): value is ThankYouKind {
  return (THANK_YOU_KINDS as readonly string[]).includes(value);
}

/** The scene, with a variant's copy laid over it when the variant exists. */
export function resolveScene(id: SuccessSceneId, variant?: string): SuccessScene {
  const scene = SUCCESS_SCENES[id];
  const override = variant ? scene.variants?.[variant] : undefined;
  return override ? { ...scene, ...override } : scene;
}

export function greetingFor(name: string | undefined, kind: keyof typeof GREETING, locale: 'de' | 'en'): string | undefined {
  return name ? GREETING[kind][locale].replace('{name}', name) : undefined;
}
