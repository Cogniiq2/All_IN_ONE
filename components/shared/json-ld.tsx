interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': ['LodgingBusiness', 'ApartmentComplex'],
  name: 'All in One Residences',
  alternateName: ['All in One Residences Bayreuth', 'Ferienwohnung Bayreuth Sternplatz', 'Serviced Apartments Bayreuth'],
  description:
    'Ferienwohnungen und Serviced Apartments in Bayreuth mieten — 5 exklusive Apartments am Sternplatz & in der Altstadt. Mit Garagenparkplatz, Self Check-in 24/7 und persönlichem Service.',
  url: 'https://allinone-residences.de',
  telephone: '+491601832917',
  email: 'info@allinone-residences.de',
  image: [
    'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
    'https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1260',
  ],
  logo: {
    '@type': 'ImageObject',
    url: 'https://allinone-residences.de/logo.png',
    width: 400,
    height: 120,
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Sternplatz',
    addressLocality: 'Bayreuth',
    addressRegion: 'Bayern',
    postalCode: '95444',
    addressCountry: 'DE',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 49.9456,
    longitude: 11.5713,
  },
  hasMap: 'https://maps.google.com/?q=Sternplatz+Bayreuth',
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '00:00',
    closes: '23:59',
  },
  priceRange: '€€€',
  currenciesAccepted: 'EUR',
  paymentAccepted: 'Credit Card, PayPal, Bank Transfer, Direct Booking',
  numberOfRooms: 5,
  amenityFeature: [
    { '@type': 'LocationFeatureSpecification', name: 'Garagenparkplatz', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Self Check-in 24/7', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'WLAN Glasfaser', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Vollküche', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Klimaanlage', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Waschmaschine', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Nichtraucherwohnung', value: true },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '9.4',
    reviewCount: '48',
    bestRating: '10',
    worstRating: '1',
  },
  contactPoint: [
    {
      '@type': 'ContactPoint',
      telephone: '+491601832917',
      contactType: 'reservations',
      availableLanguage: ['German', 'English', 'French', 'Serbian'],
      hoursAvailable: {
        '@type': 'OpeningHoursSpecification',
        opens: '08:00',
        closes: '22:00',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      },
    },
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'info@allinone-residences.de',
      availableLanguage: ['German', 'English', 'French', 'Serbian'],
    },
  ],
  sameAs: [
    'https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201',
  ],
};

export function getAccommodationSchema(residence: {
  name: string;
  slug: string;
  shortDescription: { de: string; en: string };
  longDescription?: { de: string; en: string };
  priceFrom: number;
  images: string[];
  guests: number;
  size?: string;
  hasBalcony?: boolean;
  hasGarage?: boolean;
  features?: { de: string[]; en: string[] };
}) {
  const sizeValue = residence.size
    ? parseInt(residence.size.replace(/\D/g, ''), 10) || 60
    : 60;

  return {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: residence.name,
    description: residence.longDescription?.de || residence.shortDescription.de,
    url: `https://allinone-residences.de/residences/${residence.slug}`,
    image: residence.images.slice(0, 5),
    numberOfRooms: 2,
    floorSize: {
      '@type': 'QuantitativeValue',
      value: sizeValue,
      unitCode: 'MTK',
    },
    occupancy: {
      '@type': 'QuantitativeValue',
      maxValue: residence.guests,
      unitText: 'Personen',
    },
    offers: {
      '@type': 'Offer',
      price: residence.priceFrom,
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: residence.priceFrom,
        priceCurrency: 'EUR',
        unitText: 'Nacht',
      },
      availability: 'https://schema.org/InStock',
      url: `https://allinone-residences.de/residences/${residence.slug}`,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Bayreuth',
      addressRegion: 'Bayern',
      postalCode: '95444',
      addressCountry: 'DE',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 49.9456,
      longitude: 11.5713,
    },
    amenityFeature: [
      { '@type': 'LocationFeatureSpecification', name: 'Garagenparkplatz', value: residence.hasGarage ?? true },
      { '@type': 'LocationFeatureSpecification', name: 'Self Check-in 24/7', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'WLAN Glasfaser', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Vollküche', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Klimaanlage', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Waschmaschine', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Balkon', value: residence.hasBalcony ?? false },
    ],
    containedInPlace: {
      '@type': 'ApartmentComplex',
      name: 'All in One Residences',
      url: 'https://allinone-residences.de',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '9.4',
      reviewCount: '48',
      bestRating: '10',
      worstRating: '1',
    },
  };
}

export function getBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function getArticleSchema(article: {
  title: string;
  description: string;
  url: string;
  image: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: article.url,
    image: {
      '@type': 'ImageObject',
      url: article.image,
      width: 1260,
      height: 750,
    },
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    author: {
      '@type': 'Organization',
      name: 'All in One Residences',
      url: 'https://allinone-residences.de',
    },
    publisher: {
      '@type': 'Organization',
      name: 'All in One Residences',
      url: 'https://allinone-residences.de',
      logo: {
        '@type': 'ImageObject',
        url: 'https://allinone-residences.de/logo.png',
        width: 400,
        height: 120,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': article.url,
    },
    inLanguage: 'de-DE',
  };
}

export function getEventSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Bayreuther Festspiele 2026',
    description: 'Die Bayreuther Festspiele 2026 — das weltweit bedeutendste Richard-Wagner-Festival. Zentrale Ferienwohnungen in Laufnähe zum Festspielhaus.',
    startDate: '2026-07-25',
    endDate: '2026-08-28',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: 'Bayreuther Festspielhaus',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Festspielhügel 1-2',
        addressLocality: 'Bayreuth',
        addressRegion: 'Bayern',
        postalCode: '95445',
        addressCountry: 'DE',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 49.9572,
        longitude: 11.5782,
      },
    },
    organizer: {
      '@type': 'Organization',
      name: 'Bayreuther Festspiele GmbH',
      url: 'https://www.bayreuther-festspiele.de',
    },
    offers: {
      '@type': 'Offer',
      name: 'Ferienwohnung Bayreuth Festspiele 2026',
      description: 'Zentrale Ferienwohnungen für die Bayreuther Festspiele 2026 — Sternplatz & Innenstadt',
      url: 'https://allinone-residences.de/bayreuth-2026',
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        minPrice: 109,
        priceCurrency: 'EUR',
        unitText: 'Nacht',
      },
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'All in One Residences',
        url: 'https://allinone-residences.de',
      },
    },
  };
}

export function getAggregateRatingSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: 'All in One Residences Bayreuth',
    url: 'https://allinone-residences.de',
    telephone: '+491601832917',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Sternplatz',
      addressLocality: 'Bayreuth',
      addressRegion: 'Bayern',
      postalCode: '95444',
      addressCountry: 'DE',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '9.4',
      reviewCount: '48',
      bestRating: '10',
      worstRating: '1',
    },
    review: [
      {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Markus S.' },
        reviewRating: { '@type': 'Rating', ratingValue: '10', bestRating: '10' },
        reviewBody: 'Absolut perfektes Apartment — sauber, stilvoll, zentral. Der Garagenparkplatz war Gold wert während der Festspiele.',
        datePublished: '2025-08-15',
        inLanguage: 'de',
      },
      {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Claire D.' },
        reviewRating: { '@type': 'Rating', ratingValue: '10', bestRating: '10' },
        reviewBody: 'Exceptional stay. The apartment felt like a private residence — spacious, well-equipped, and perfectly located near the Festspielhaus.',
        datePublished: '2025-08-20',
        inLanguage: 'en',
      },
      {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Thomas W.' },
        reviewRating: { '@type': 'Rating', ratingValue: '9', bestRating: '10' },
        reviewBody: 'Sehr gutes Apartment für Geschäftsreisen. Vollküche, schnelles WLAN, ruhige Lage — alles was man braucht. Besser als jedes Hotel.',
        datePublished: '2025-06-10',
        inLanguage: 'de',
      },
    ],
  };
}

export function getContactSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: 'All in One Residences Bayreuth',
    url: 'https://allinone-residences.de',
    telephone: '+491601832917',
    email: 'info@allinone-residences.de',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Sternplatz',
      addressLocality: 'Bayreuth',
      addressRegion: 'Bayern',
      postalCode: '95444',
      addressCountry: 'DE',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: '+491601832917',
        contactType: 'reservations',
        availableLanguage: ['German', 'English', 'French', 'Serbian'],
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          opens: '08:00',
          closes: '22:00',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        },
        areaServed: 'Bayreuth',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'info@allinone-residences.de',
        availableLanguage: ['German', 'English', 'French', 'Serbian'],
      },
    ],
  };
}

export function getCollectionSchema(collection: {
  name: string;
  description: string;
  url: string;
  residences: { name: string; url: string; price: number }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.name,
    description: collection.description,
    url: collection.url,
    hasPart: collection.residences.map((r) => ({
      '@type': 'Apartment',
      name: r.name,
      url: r.url,
      offers: {
        '@type': 'Offer',
        price: r.price,
        priceCurrency: 'EUR',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: r.price,
          priceCurrency: 'EUR',
          unitText: 'Nacht',
        },
        availability: 'https://schema.org/InStock',
      },
    })),
    provider: {
      '@type': 'Organization',
      name: 'All in One Residences',
      url: 'https://allinone-residences.de',
    },
  };
}
