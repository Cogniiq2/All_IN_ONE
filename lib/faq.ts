/**
 * Frequently asked questions.
 *
 * Rewritten so that no answer asserts anything unverified. Removed from the
 * previous version: a guaranteed reserved garage space at every apartment,
 * "100 % payment at booking by card or PayPal", access codes sent 24 hours
 * before arrival, fixed check-in times, a stated maximum occupancy and a
 * four-language service claim.
 *
 * Where the honest answer is "ask us", it says so — that is also the
 * conversion path while rates and specifications are still being confirmed.
 */

export interface FAQ {
  id: string;
  category: { de: string; en: string };
  question: { de: string; en: string };
  answer: { de: string; en: string };
}

const CATEGORY = {
  enquiry: { de: 'Anfrage & Buchung', en: 'Enquiry & booking' },
  apartments: { de: 'Die Apartments', en: 'The apartments' },
  stay: { de: 'Aufenthalt', en: 'Your stay' },
  bayreuth: { de: 'Bayreuth', en: 'Bayreuth' },
} as const;

export const faqs: FAQ[] = [
  {
    id: 'how-to-enquire',
    category: CATEGORY.enquiry,
    question: {
      de: 'Wie frage ich einen Zeitraum an?',
      en: 'How do I enquire about dates?',
    },
    answer: {
      de: 'Über das Anfrageformular auf dieser Website, per WhatsApp oder telefonisch. Sie nennen uns Ihren Zeitraum und die Anzahl der Personen — wir prüfen persönlich und melden uns mit Verfügbarkeit und Preis zurück.',
      en: 'Through the enquiry form on this site, via WhatsApp or by phone. Tell us your dates and how many of you there are — we check personally and come back to you with availability and price.',
    },
  },
  {
    id: 'binding',
    category: CATEGORY.enquiry,
    question: {
      de: 'Ist eine Anfrage schon verbindlich?',
      en: 'Is an enquiry already binding?',
    },
    answer: {
      de: 'Nein. Eine Anfrage kostet nichts und verpflichtet zu nichts. Verbindlich wird ein Aufenthalt erst, wenn wir Verfügbarkeit und Preis bestätigt haben und Sie ausdrücklich zusagen.',
      en: 'No. An enquiry costs nothing and commits you to nothing. A stay becomes binding only once we have confirmed availability and price and you have explicitly agreed.',
    },
  },
  {
    id: 'payment',
    category: CATEGORY.enquiry,
    question: {
      de: 'Wie läuft die Bezahlung?',
      en: 'How does payment work?',
    },
    answer: {
      de: 'Über diese Website wird derzeit nichts abgerechnet. Zahlungsweg und Konditionen stimmen wir mit Ihnen ab, sobald der Aufenthalt bestätigt ist.',
      en: 'Nothing is charged through this website at the moment. We agree the payment method and terms with you once your stay is confirmed.',
    },
  },
  {
    id: 'both-apartments',
    category: CATEGORY.apartments,
    question: {
      de: 'Können wir beide Wohnungen zusammen mieten?',
      en: 'Can we take both apartments together?',
    },
    answer: {
      de: 'Ja, sofern beide im gewünschten Zeitraum frei sind. Sie liegen im selben Haus — für Familien oder Gruppen, die zusammen anreisen, ist das oft praktischer als mehrere Hotelzimmer. Fragen Sie beide einfach gemeinsam an.',
      en: 'Yes, provided both are free for your dates. They are in the same building — for families or groups travelling together that is often more practical than several hotel rooms. Simply enquire about both at once.',
    },
  },
  {
    id: 'equipment',
    category: CATEGORY.apartments,
    question: {
      de: 'Wie sind die Wohnungen ausgestattet?',
      en: 'How are the apartments equipped?',
    },
    answer: {
      de: 'Wir stellen die vollständigen Angaben zu Größe, Räumen, Schlafplätzen und Ausstattung gerade zusammen und veröffentlichen sie hier, sobald sie geprüft sind. Fragen Sie uns in der Zwischenzeit gern direkt — wir beantworten alles konkret.',
      en: 'We are compiling the full details on size, rooms, sleeping arrangements and amenities, and will publish them here once verified. In the meantime, just ask us directly — we will answer specifically.',
    },
  },
  {
    id: 'parking',
    category: CATEGORY.stay,
    question: {
      de: 'Gibt es einen Parkplatz?',
      en: 'Is parking available?',
    },
    answer: {
      de: 'Sprechen Sie uns bitte darauf an, wenn Sie mit dem Auto anreisen. Wir sagen Ihnen dann, welche Möglichkeit für Ihren Zeitraum tatsächlich zur Verfügung steht.',
      en: 'Please mention it if you are arriving by car. We will tell you what is genuinely available for your dates.',
    },
  },
  {
    id: 'arrival',
    category: CATEGORY.stay,
    question: {
      de: 'Wie läuft die Anreise ab?',
      en: 'How does arrival work?',
    },
    answer: {
      de: 'Die genaue Adresse, den Weg und alle Anreisedetails erhalten Sie von uns, sobald Ihr Aufenthalt feststeht. Wenn Sie spät ankommen oder Ihre Ankunftszeit noch offen ist, schreiben Sie uns — wir stimmen das persönlich ab.',
      en: 'You receive the exact address, directions and all arrival details from us once your stay is confirmed. If you are arriving late or your time is still open, write to us — we arrange it personally.',
    },
  },
  {
    id: 'long-stay',
    category: CATEGORY.stay,
    question: {
      de: 'Sind längere Aufenthalte möglich?',
      en: 'Are longer stays possible?',
    },
    answer: {
      de: 'Grundsätzlich ja. Für längere Zeiträume sprechen wir Konditionen individuell ab — schreiben Sie uns, wie lange Sie bleiben möchten.',
      en: 'In principle, yes. For longer periods we agree terms individually — write and tell us how long you would like to stay.',
    },
  },
  {
    id: 'languages',
    category: CATEGORY.stay,
    question: {
      de: 'In welchen Sprachen können wir schreiben?',
      en: 'What languages can we write in?',
    },
    answer: {
      de: 'Deutsch und Englisch.',
      en: 'German and English.',
    },
  },
  {
    id: 'opernstrasse',
    category: CATEGORY.apartments,
    question: {
      de: 'Wann ist das Apartment Opernstraße verfügbar?',
      en: 'When will the Opernstraße apartment be available?',
    },
    answer: {
      de: 'Es wird derzeit renoviert und ist noch nicht buchbar. Ein Eröffnungstermin steht noch nicht fest — schreiben Sie uns, wenn wir Sie informieren sollen, sobald es so weit ist.',
      en: 'It is currently being renovated and is not yet bookable. No opening date has been set — write to us if you would like to be told as soon as it is ready.',
    },
  },
  {
    id: 'why-city-centre',
    category: CATEGORY.bayreuth,
    question: {
      de: 'Warum in der Innenstadt übernachten und nicht am Stadtrand?',
      en: 'Why stay in the centre rather than on the edge of town?',
    },
    answer: {
      de: 'Bayreuth ist eine überschaubare Stadt. Wer zentral wohnt, erreicht Gastronomie, Geschäfte und Kultur zu Fuß und braucht für den Alltag kein Auto. Gerade an Festspielabenden, die spät enden, ist ein kurzer Heimweg mehr wert als ein günstigeres Zimmer außerhalb.',
      en: 'Bayreuth is a compact town. Staying centrally means restaurants, shops and culture are reachable on foot, and you need no car for day-to-day life. On festival evenings, which end late, a short way home is worth more than a cheaper room outside town.',
    },
  },
  {
    id: 'festival-season-booking',
    category: CATEGORY.bayreuth,
    question: {
      de: 'Wie früh sollte ich für die Festspielzeit anfragen?',
      en: 'How early should I enquire for the festival season?',
    },
    answer: {
      de: 'So früh wie möglich. In den Festspielwochen ist in Bayreuth deutlich weniger frei als sonst, und wir haben nur wenige Wohnungen. Wenn Ihr Zeitraum feststeht, fragen Sie ihn an — wir sagen Ihnen ehrlich, ob wir ihn halten können.',
      en: 'As early as you can. During the festival weeks there is markedly less available in Bayreuth than at other times, and we have only a few apartments. Once your dates are settled, ask about them — we will tell you honestly whether we can hold them.',
    },
  },
  {
    id: 'outside-festival',
    category: CATEGORY.bayreuth,
    question: {
      de: 'Lohnt sich Bayreuth außerhalb der Festspiele?',
      en: 'Is Bayreuth worth visiting outside the festival?',
    },
    answer: {
      de: 'Den Rest des Jahres ist Bayreuth eine ruhige oberfränkische Stadt mit markgräflichem Barock, Hofgarten und Universität. Wer wegen der Architektur, der Museen oder geschäftlich kommt, findet die Stadt dann entspannter — und wir haben mehr Spielraum bei Zeitraum und Aufenthaltsdauer.',
      en: 'For the rest of the year Bayreuth is a quiet Upper Franconian town of margravial baroque, gardens and a university. If you come for the architecture, the museums or for work, you will find it calmer then — and we have more room to accommodate your dates and length of stay.',
    },
  },
];

/** The questions belonging to one category, in their authored order. */
export function faqsByCategory(key: keyof typeof CATEGORY): FAQ[] {
  return faqs.filter((f) => f.category.de === CATEGORY[key].de);
}
