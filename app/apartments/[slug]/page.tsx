import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apartments, getApartment } from '@/lib/content/apartments';
import { SITE_URL, brand } from '@/lib/content/brand';
import { JsonLd, getApartmentSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import { ApartmentDetailClient } from './apartment-detail-client';

export function generateStaticParams() {
  return apartments.map((apartment) => ({ slug: apartment.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const apartment = getApartment(params.slug);
  if (!apartment) return { title: 'Apartment' };

  return {
    title: apartment.name.de,
    description: apartment.intro.de,
    alternates: { canonical: `${SITE_URL}/apartments/${apartment.slug}` },
    openGraph: {
      title: `${apartment.name.de} — ${brand.name}`,
      description: apartment.intro.de,
      url: `${SITE_URL}/apartments/${apartment.slug}`,
    },
    // Units still in renovation are not indexed: there is nothing to book yet.
    robots: apartment.status === 'in-preparation' ? { index: false, follow: true } : undefined,
  };
}

export default function ApartmentPage({ params }: { params: { slug: string } }) {
  const apartment = getApartment(params.slug);
  if (!apartment) notFound();

  return (
    <>
      <JsonLd
        data={getApartmentSchema({
          name: apartment.name.de,
          slug: apartment.slug,
          description: apartment.intro.de,
        })}
      />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Apartments', url: `${SITE_URL}/apartments` },
          { name: apartment.name.de, url: `${SITE_URL}/apartments/${apartment.slug}` },
        ])}
      />
      <ApartmentDetailClient slug={apartment.slug} />
    </>
  );
}
