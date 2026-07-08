export interface FAQ {
  id: string;
  category: { de: string; en: string };
  question: { de: string; en: string };
  answer: { de: string; en: string };
}

export const faqs: FAQ[] = [
  {
    id: 'checkin',
    category: { de: 'Anreise & Check-in', en: 'Arrival & Check-in' },
    question: { de: 'Wie funktioniert der Self Check-in?', en: 'How does self check-in work?' },
    answer: {
      de: 'Sie erhalten 24 Stunden vor Anreise einen persönlichen Zugangscode per E-Mail und SMS. Damit können Sie jederzeit eigenständig einchecken — ohne Wartezeiten, ohne Schlüsselübergabe. Bei Fragen stehen wir Ihnen jederzeit per WhatsApp oder Telefon zur Verfügung.',
      en: 'You\'ll receive a personal access code via email and SMS 24 hours before arrival. This allows you to check in independently at any time — no waiting, no key handover. If you have questions, we\'re always available via WhatsApp or phone.',
    },
  },
  {
    id: 'parking',
    category: { de: 'Anreise & Check-in', en: 'Arrival & Check-in' },
    question: { de: 'Ist ein Parkplatz verfügbar?', en: 'Is parking available?' },
    answer: {
      de: 'Ja, jede Residenz verfügt über einen reservierten Garagenstellplatz in zentraler Lage — ein seltener Vorteil in der Bayreuther Innenstadt. Die genaue Adresse und Zugangsdetails erhalten Sie mit Ihrer Buchungsbestätigung.',
      en: 'Yes, each residence includes a reserved garage parking space in a central location — a rare advantage in Bayreuth\'s city center. The exact address and access details are provided with your booking confirmation.',
    },
  },
  {
    id: 'payment',
    category: { de: 'Buchung & Zahlung', en: 'Booking & Payment' },
    question: { de: 'Wie funktioniert die Zahlung?', en: 'How does payment work?' },
    answer: {
      de: 'Die Zahlung erfolgt zu 100 % bei Buchung per Kreditkarte (Stripe) oder PayPal. Sie erhalten umgehend eine Buchungsbestätigung und alle notwendigen Informationen per E-Mail.',
      en: 'Payment of 100% is due at booking via credit card (Stripe) or PayPal. You\'ll immediately receive a booking confirmation and all necessary information via email.',
    },
  },
  {
    id: 'cancellation',
    category: { de: 'Buchung & Zahlung', en: 'Booking & Payment' },
    question: { de: 'Welche Stornierungsbedingungen gelten?', en: 'What are the cancellation terms?' },
    answer: {
      de: 'Stornierungen sind bis 14 Tage vor Anreise kostenfrei möglich. Bei Stornierung innerhalb von 14 Tagen vor Anreise werden 50 % des Gesamtbetrags berechnet. Bei Nichterscheinen wird der volle Betrag fällig.',
      en: 'Cancellations are free of charge up to 14 days before arrival. Cancellations within 14 days of arrival will be charged 50% of the total amount. No-shows will be charged the full amount.',
    },
  },
  {
    id: 'invoice',
    category: { de: 'Geschäftsreisen', en: 'Business Travel' },
    question: { de: 'Erhalte ich eine Rechnung für Geschäftsreisen?', en: 'Will I receive an invoice for business travel?' },
    answer: {
      de: 'Ja, Sie erhalten automatisch eine ordnungsgemäße Rechnung per E-Mail nach Ihrem Aufenthalt. Für Geschäftsreisende stellen wir auf Anfrage auch gerne vorab eine Proforma-Rechnung aus.',
      en: 'Yes, you\'ll automatically receive a proper invoice via email after your stay. For business travelers, we\'re happy to issue a proforma invoice in advance upon request.',
    },
  },
  {
    id: 'longstay',
    category: { de: 'Aufenthalt', en: 'Stay' },
    question: { de: 'Gibt es Sonderkonditionen für längere Aufenthalte?', en: 'Are there special rates for longer stays?' },
    answer: {
      de: 'Ja, für Aufenthalte ab 7 Nächten bieten wir attraktive Langzeitkonditionen an. Kontaktieren Sie uns direkt für ein individuelles Angebot.',
      en: 'Yes, we offer attractive long-term rates for stays of 7 nights or more. Contact us directly for a personalized quote.',
    },
  },
  {
    id: 'location',
    category: { de: 'Lage & Umgebung', en: 'Location & Area' },
    question: { de: 'Wie zentral sind die Residenzen?', en: 'How central are the residences?' },
    answer: {
      de: 'Alle fünf Residenzen befinden sich im Herzen von Bayreuth — am Sternplatz, an der Opernstraße und in der Innenstadt. Zu Fuß erreichen Sie in wenigen Minuten das Markgräfliche Opernhaus, den Hofgarten, Restaurants, Cafés und alle wichtigen Sehenswürdigkeiten Bayreuths.',
      en: 'All five residences are located in the heart of Bayreuth — at Sternplatz, on Opernstraße, and in the city center. Within a few minutes\' walk, you can reach the Margravial Opera House, Hofgarten, restaurants, cafés, and all of Bayreuth\'s main attractions.',
    },
  },
  {
    id: 'direct',
    category: { de: 'Direktbuchung', en: 'Direct Booking' },
    question: { de: 'Warum sollte ich direkt buchen?', en: 'Why should I book directly?' },
    answer: {
      de: 'Direktbuchungen ermöglichen uns, Ihnen den besten Service zu bieten: persönlicher Kontakt, exklusiver Willkommenswein, transparente Preise ohne Plattform-Gebühren und direkter Support vor, während und nach Ihrem Aufenthalt.',
      en: 'Direct bookings allow us to provide you with the best service: personal contact, exclusive welcome wine, transparent pricing without platform fees, and direct support before, during, and after your stay.',
    },
  },
  {
    id: 'guests',
    category: { de: 'Aufenthalt', en: 'Stay' },
    question: { de: 'Wie viele Gäste können in einer Residenz übernachten?', en: 'How many guests can stay in a residence?' },
    answer: {
      de: 'Jede Residenz bietet komfortablen Platz für bis zu 4 Gäste. Die genaue Betten-Konfiguration finden Sie auf der jeweiligen Residenz-Seite.',
      en: 'Each residence comfortably accommodates up to 4 guests. The exact bed configuration can be found on the respective residence page.',
    },
  },
  {
    id: 'quiet',
    category: { de: 'Hausregeln', en: 'House Rules' },
    question: { de: 'Gibt es Ruhezeiten?', en: 'Are there quiet hours?' },
    answer: {
      de: 'Ja, wir bitten um Einhaltung der Ruhezeiten von 22:00 bis 07:00 Uhr — aus Rücksicht auf Nachbarn und Mitbewohner. Rauchen ist in allen Residenzen untersagt.',
      en: 'Yes, we kindly ask guests to observe quiet hours from 10 PM to 7 AM — out of respect for neighbors and fellow residents. Smoking is prohibited in all residences.',
    },
  },
];
