import type { Metadata } from 'next';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import BusinessStaysClient from './business-stays-client';

export const metadata: Metadata = {
  title: 'Serviced Apartment Bayreuth Geschäftsreise mieten — Business Stays | All in One Residences',
  description:
    'Business Apartment Bayreuth mieten: zentrale Lage, Glasfaser-WLAN, vollausgestattete Küche, Garagenparkplatz, Homeoffice-Arbeitsplatz und ordnungsgemäße Rechnung. Besser als jedes Hotelzimmer.',
  keywords: [
    'Serviced Apartment Bayreuth Geschäftsreise',
    'Business Apartment Bayreuth mieten',
    'Firmenwohnung Bayreuth',
    'Businesswohnung Bayreuth mieten',
    'Bayreuth Unterkunft Geschäftsreisende',
    'Apartment Bayreuth mit Rechnung',
    'Bayreuth Wohnung Dienstreise',
    'Monteurwohnung Bayreuth Innenstadt',
    'Bayreuth Arbeitnehmerüberlassung Unterkunft',
  ],
  openGraph: {
    title: 'Business Apartment Bayreuth mieten | All in One Residences',
    description:
      'Serviced Apartments für Geschäftsreisende in Bayreuth — Glasfaser-WLAN, Vollküche, Garagenparkplatz, Rechnung. Besser als Hotel.',
    url: 'https://allinone-residences.de/business-stays',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Business Apartment Bayreuth — All in One Residences',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/business-stays' },
};

export default function BusinessStaysPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Business Stays', url: 'https://allinone-residences.de/business-stays' },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <BusinessStaysClient />
    </>
  );
}
