export interface Article {
  slug: string;
  title: { de: string; en: string };
  excerpt: { de: string; en: string };
  category: { de: string; en: string };
  publishedDate: { de: string; en: string };
  readTime: { de: string; en: string };
  image: string;
  featured?: boolean;
}

export const articles: Article[] = [
  {
    slug: 'bayreuth-festspiele-unterkunft-guide',
    title: {
      de: 'Festspiele 2026: Warum Unterkunft dieses Jahr anders denken muss',
      en: 'Festival 2026: Why Accommodation Needs to Be Rethought This Year',
    },
    excerpt: {
      de: 'Die Warteliste ist zehn Jahre lang. Der Abend dauert sechs Stunden. Wer nach dem letzten Akt noch einen langen Weg vor sich hat, verpasst den stillsten Moment des Abends. Ein Plädoyer für Nähe.',
      en: 'The waiting list is ten years long. The evening lasts six hours. Whoever has a long journey ahead after the final act misses the quietest moment of the evening. A case for proximity.',
    },
    category: { de: 'Festspiele 2026', en: 'Festival 2026' },
    publishedDate: { de: '12. Januar 2025', en: 'January 12, 2025' },
    readTime: { de: '8 Min. Lesezeit', en: '8 min read' },
    image: '/images/bayreuther-festspielhaus-blumen-wagner-100~_h-558_v-img__16__9__xl_w-994_-e1d284d92729d9396a907e303225e0f2d9fa53b4.jpg',
    featured: true,
  },
  {
    slug: 'richard-wagner-bayreuth-mythos',
    title: {
      de: 'Richard Wagner und Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde',
      en: 'Richard Wagner and Bayreuth: How a City Became a Place of Pilgrimage',
    },
    excerpt: {
      de: 'Wagner wählte Bayreuth nicht zufällig. Er baute ein Theater nach seinen eigenen Regeln — und schuf damit ein kulturelles Gravitationszentrum, das bis heute nichts von seiner Anziehungskraft verloren hat.',
      en: 'Wagner did not choose Bayreuth by chance. He built a theater by his own rules — and in doing so created a center of cultural gravity that has lost none of its pull to this day.',
    },
    category: { de: 'Kultur & Geschichte', en: 'Culture & History' },
    publishedDate: { de: '28. Februar 2025', en: 'February 28, 2025' },
    readTime: { de: '7 Min. Lesezeit', en: '7 min read' },
    image: '/images/richard-wagner-in-bayreuth-with-festspielhaus-festival-house-and-villa-KD6MMB copy.jpg',
    featured: false,
  },
  {
    slug: 'wie-wir-arbeiten',
    title: {
      de: 'Hinter den Kulissen: Wie wir All in One Residences betreiben',
      en: 'Behind the Scenes: How We Run All in One Residences',
    },
    excerpt: {
      de: 'Fünf Apartments. Kein Rezeptionist. Kein Callcenter. Wie persönlicher Service im Jahr 2025 wirklich aussieht — und warum wir es nicht anders haben wollen.',
      en: 'Five apartments. No receptionist. No call center. What genuine personal service looks like in 2025 — and why we wouldn\'t have it any other way.',
    },
    category: { de: 'Über uns', en: 'About us' },
    publishedDate: { de: '5. März 2025', en: 'March 5, 2025' },
    readTime: { de: '5 Min. Lesezeit', en: '5 min read' },
    image: '/images/723934204.jpg',
    featured: false,
  },
  {
    slug: 'wo-in-bayreuth-ubernachten',
    title: {
      de: 'Wo in Bayreuth übernachten: Ein ehrlicher Guide',
      en: 'Where to Stay in Bayreuth: An Honest Guide',
    },
    excerpt: {
      de: 'Nicht jede Unterkunft in Bayreuth verdient ihren Preis. Wir erklären, was den Unterschied macht — und warum die Lage alles entscheidet, besonders wenn die Festspiele beginnen.',
      en: 'Not every accommodation in Bayreuth deserves its price. We explain what makes the difference — and why location decides everything, especially when the festival begins.',
    },
    category: { de: 'Reiseplanung', en: 'Travel Planning' },
    publishedDate: { de: '18. März 2025', en: 'March 18, 2025' },
    readTime: { de: '6 Min. Lesezeit', en: '6 min read' },
    image: '/images/728876267 copy.jpg',
    featured: false,
  },
  {
    slug: 'serviced-apartments-bayreuth-geschaftsreisen',
    title: {
      de: 'Bayreuth für Geschäftsreisende: Was das Hotelzimmer nicht kann',
      en: 'Bayreuth for Business Travelers: What the Hotel Room Cannot Do',
    },
    excerpt: {
      de: 'Zwischen Uni-Kliniken, Linde, Knorr-Bremse und Schaeffler liegt Bayreuth im Herzen einer Wirtschaftsregion. Warum immer mehr Ingenieure, Consultants und Projektleiter auf Serviced Apartments umsteigen.',
      en: 'Between university clinics, Linde, Knorr-Bremse, and Schaeffler, Bayreuth sits at the heart of an economic region. Why more and more engineers, consultants and project managers are switching to serviced apartments.',
    },
    category: { de: 'Geschäftsreisen', en: 'Business Travel' },
    publishedDate: { de: '22. März 2025', en: 'March 22, 2025' },
    readTime: { de: '5 Min. Lesezeit', en: '5 min read' },
    image: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=800',
    featured: false,
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
