import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getResidenceBySlug, residences } from '@/lib/residences';
import { JsonLd, getAccommodationSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import ResidenceDetailClient from './residence-detail-client';

export async function generateStaticParams() {
  return residences.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const residence = getResidenceBySlug(params.slug);
  if (!residence) return {};

  const description = `${residence.name} — Ferienwohnung in Bayreuth mieten. ${residence.shortDescription.de} Ab €${residence.priceFrom}/Nacht. Garagenparkplatz inklusive, Self Check-in 24/7, zentrale Lage.`;

  return {
    title: `${residence.name} — Ferienwohnung Bayreuth mieten | All in One Residences`,
    description,
    keywords: [
      `${residence.name} Bayreuth`,
      `Ferienwohnung ${residence.name} Bayreuth mieten`,
      `${residence.name} mieten`,
      'Serviced Apartment Bayreuth Innenstadt',
      'Ferienwohnung Bayreuth mieten',
      'Apartment Bayreuth Sternplatz',
      'Wohnung Bayreuth kurzzeitmiete',
      'Bayreuth Unterkunft Zentrum',
      `Bayreuth Apartment ${residence.size || ''} mieten`,
      'Garagenparkplatz Bayreuth Innenstadt',
    ],
    openGraph: {
      title: `${residence.name} — Ferienwohnung Bayreuth | All in One Residences`,
      description,
      url: `https://allinone-residences.de/residences/${params.slug}`,
      type: 'website',
      images: residence.images[0]
        ? [{ url: residence.images[0], width: 1200, height: 750, alt: `${residence.name} — Ferienwohnung Bayreuth` }]
        : [],
    },
    alternates: {
      canonical: `https://allinone-residences.de/residences/${params.slug}`,
    },
  };
}

export default function ResidenceDetailPage({ params }: { params: { slug: string } }) {
  const residence = getResidenceBySlug(params.slug);
  if (!residence) return notFound();

  const accommodationSchema = getAccommodationSchema({
    name: residence.name,
    slug: residence.slug,
    shortDescription: residence.shortDescription,
    longDescription: residence.longDescription,
    priceFrom: residence.priceFrom,
    images: residence.images,
    guests: residence.guests,
    size: residence.size,
    hasBalcony: residence.hasBalcony,
    hasGarage: residence.hasGarage,
  });

  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Ferienwohnungen Bayreuth', url: 'https://allinone-residences.de/residences' },
    { name: residence.name, url: `https://allinone-residences.de/residences/${params.slug}` },
  ]);

  return (
    <>
      <JsonLd data={accommodationSchema} />
      <JsonLd data={breadcrumbSchema} />
      <ResidenceDetailClient slug={params.slug} />
    </>
  );
}
