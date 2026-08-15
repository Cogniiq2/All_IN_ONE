/**
 * Structured data.
 *
 * ── What was removed and why ─────────────────────────────────────────────
 * The previous file emitted an `AggregateRating` of 9.4 from 48 reviews and
 * three full `Review` objects with named authors and dates. None of it was
 * real. Publishing invented reviews as machine-readable data is misleading
 * advertising under UWG §5/§5b and grounds for a Google manual action.
 * All rating and review markup is gone, and will only return when it can be
 * generated from verified guest reviews.
 *
 * Also removed: `numberOfRooms: 5`, invented amenity lists, price offers with
 * `availability: InStock` (no availability source exists), the four-language
 * claim and the Pexels stock imagery.
 *
 * What remains is limited to facts the owners have stated: who we are, where
 * we are, and how to reach us.
 */

interface JsonLdProps {
  data: Record<string, unknown>;
}

import { SITE_URL, brand, contact } from '@/lib/content/brand';

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
  '@type': 'LodgingBusiness',
  name: brand.name,
  description:
    'Familiengeführte Apartments in der Bayreuther Innenstadt. Direkte Anfrage, persönliche Betreuung.',
  url: SITE_URL,
  telephone: contact.phone.replace(/\s/g, ''),
  address: {
    '@type': 'PostalAddress',
    // Street only — house numbers are shared after booking, and the registered
    // company address has not been confirmed yet.
    streetAddress: contact.street,
    addressLocality: brand.city,
    addressRegion: 'Bayern',
    postalCode: contact.postalCode,
    addressCountry: 'DE',
  },
  currenciesAccepted: 'EUR',
  availableLanguage: ['German', 'English'],
};

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

/**
 * Apartment schema without offers, ratings or unverified specifications.
 * Price and availability markup returns when real rates and a real
 * availability source exist.
 */
export function getApartmentSchema(apartment: {
  name: string;
  slug: string;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: apartment.name,
    description: apartment.description,
    url: `${SITE_URL}/apartments/${apartment.slug}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: brand.city,
      addressRegion: 'Bayern',
      postalCode: contact.postalCode,
      addressCountry: 'DE',
    },
    containedInPlace: {
      '@type': 'LodgingBusiness',
      name: brand.name,
      url: SITE_URL,
    },
  };
}

export function getArticleSchema(article: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: article.url,
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    author: { '@type': 'Organization', name: brand.name, url: SITE_URL },
    publisher: { '@type': 'Organization', name: brand.name, url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
    inLanguage: 'de-DE',
  };
}

export function getFaqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
