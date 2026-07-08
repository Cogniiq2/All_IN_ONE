export interface Review {
  id: string;
  guestName: string;
  guestLocation: { de: string; en: string };
  rating: number;
  date: string;
  residence?: string;
  quote: { de: string; en: string };
  highlight?: { de: string; en: string };
}

export const reviews: Review[] = [
  {
    id: '1',
    guestName: 'Thomas & Anna M.',
    guestLocation: { de: 'München', en: 'Munich' },
    rating: 10,
    date: '2024-02',
    residence: 'Belvédère Schulstraße',
    quote: {
      de: 'Wir haben in vielen Städten übernachtet, aber diese Residenz hat uns wirklich beeindruckt. Die Liebe zum Detail, die zentrale Lage und der problemlose Check-in — alles auf höchstem Niveau.',
      en: 'We\'ve stayed in many cities, but this residence truly impressed us. The attention to detail, central location, and seamless check-in — everything at the highest level.',
    },
    highlight: { de: 'Liebe zum Detail', en: 'Attention to detail' },
  },
  {
    id: '2',
    guestName: 'Dr. Michael B.',
    guestLocation: { de: 'Frankfurt', en: 'Frankfurt' },
    rating: 10,
    date: '2024-01',
    residence: 'Maison Sternplatz',
    quote: {
      de: 'Als Geschäftsreisender schätze ich Zuverlässigkeit und Qualität. Hier stimmt einfach alles: schnelles WLAN, ruhige Lage trotz Zentrum, und eine Küche, die wirklich funktioniert.',
      en: 'As a business traveler, I value reliability and quality. Everything is perfect here: fast Wi-Fi, quiet location despite being central, and a kitchen that actually works.',
    },
    highlight: { de: 'Perfekt für Geschäftsreisen', en: 'Perfect for business' },
  },
  {
    id: '3',
    guestName: 'Sophie L.',
    guestLocation: { de: 'Paris', en: 'Paris' },
    rating: 10,
    date: '2024-03',
    residence: 'Atelier Opernstraße',
    quote: {
      de: 'Ein außergewöhnlicher Aufenthalt. Die Residenz verbindet modernen Komfort mit stilvoller Eleganz. Der Balkon mit Stadtblick war ein Traum.',
      en: 'An exceptional stay. The residence combines modern comfort with stylish elegance. The balcony with city view was a dream.',
    },
    highlight: { de: 'Stilvolle Eleganz', en: 'Stylish elegance' },
  },
  {
    id: '4',
    guestName: 'Familie Weber',
    guestLocation: { de: 'Hamburg', en: 'Hamburg' },
    rating: 9,
    date: '2024-02',
    residence: 'Design Loft Innenstadt',
    quote: {
      de: 'Wir waren für die Festspiele in Bayreuth und haben uns für eine direkte Buchung entschieden. Die persönliche Betreuung und das Willkommensgeschenk haben den Unterschied gemacht.',
      en: 'We were in Bayreuth for the festival and chose to book directly. The personal service and welcome gift made all the difference.',
    },
    highlight: { de: 'Persönliche Betreuung', en: 'Personal service' },
  },
  {
    id: '5',
    guestName: 'Elena R.',
    guestLocation: { de: 'Wien', en: 'Vienna' },
    rating: 10,
    date: '2024-01',
    residence: 'Loge am Sternplatz',
    quote: {
      de: 'Die beste Unterkunft, die wir in Deutschland hatten. Alles wirkt durchdacht und hochwertig. Man merkt, dass hier mit Leidenschaft gearbeitet wird.',
      en: 'The best accommodation we\'ve had in Germany. Everything feels thoughtful and high-quality. You can tell this is run with passion.',
    },
    highlight: { de: 'Mit Leidenschaft geführt', en: 'Run with passion' },
  },
  {
    id: '6',
    guestName: 'James & Catherine',
    guestLocation: { de: 'London', en: 'London' },
    rating: 10,
    date: '2024-03',
    residence: 'Belvédère Schulstraße',
    quote: {
      de: 'Die Garage war für uns entscheidend — in der Innenstadt einen sicheren Parkplatz zu haben, ist Gold wert. Die Residenz selbst übertraf alle Erwartungen.',
      en: 'The garage was crucial for us — having secure parking in the city center is worth its weight in gold. The residence itself exceeded all expectations.',
    },
    highlight: { de: 'Garage in zentraler Lage', en: 'Central garage parking' },
  },
];

export const overallRating = 9.4;
export const totalReviews = 48;
export const repeatGuestRate = 34;
