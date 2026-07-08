import './globals.css';
import type { Metadata } from 'next';
import { Great_Vibes } from 'next/font/google';
import { ClientLayout } from '@/components/layout/client-layout';
import { JsonLd, organizationSchema } from '@/components/shared/json-ld';

const greatVibes = Great_Vibes({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-script',
  display: 'block',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://allinone-residences.de'),
  title: {
    default: 'Ferienwohnung Bayreuth mieten — Premium Serviced Apartments | All in One Residences',
    template: '%s | All in One Residences Bayreuth',
  },
  description:
    'Ferienwohnung in Bayreuth mieten — 5 exklusive Serviced Apartments am Sternplatz & in der Innenstadt. Garagenparkplatz inklusive, Self Check-in 24/7, familiengeführt. Ab €109/Nacht. Ideal für Festspiele 2026, Geschäftsreisen & Langzeitaufenthalte.',
  keywords: [
    'Ferienwohnung Bayreuth mieten',
    'Serviced Apartment Bayreuth',
    'Wohnung mieten Bayreuth Innenstadt',
    'Apartment Bayreuth Sternplatz',
    'Unterkunft Bayreuth Festspiele',
    'Bayreuth Festspiele 2026 Unterkunft',
    'Ferienwohnung Bayreuth Innenstadt',
    'Bayreuth Geschäftsreise Apartment',
    'Serviced Apartments Bayreuth mieten',
    'Langzeitmiete Apartment Bayreuth',
    'Bayreuth Wohnung kurzzeitmiete',
    'Luxury accommodation Bayreuth',
    'Bayreuth furnished apartment',
    'Appartement Bayreuth Zentrum',
    'Bayreuth Urlaub Unterkunft',
    'Penthouse Bayreuth',
    'Design Loft Bayreuth',
    'Maison Sternplatz Bayreuth',
    'Garagenparkplatz Bayreuth Apartment',
    'Bayreuth Unterkunft Zentrum buchen',
  ],
  authors: [{ name: 'All in One Residences', url: 'https://allinone-residences.de' }],
  creator: 'All in One Residences',
  publisher: 'All in One Residences',
  category: 'travel',
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    alternateLocale: ['en_US', 'fr_FR'],
    siteName: 'All in One Residences — Bayreuth',
    title: 'Ferienwohnung Bayreuth mieten — All in One Residences',
    description:
      '5 exklusive Serviced Apartments in Bayreuth — am Sternplatz & in der Innenstadt. Garagenparkplatz inklusive, Self Check-in 24/7, familiengeführt. Ab €109/Nacht.',
    url: 'https://allinone-residences.de',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'All in One Residences Bayreuth — Premium Serviced Apartments am Sternplatz',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ferienwohnung Bayreuth mieten — All in One Residences',
    description: '5 exklusive Serviced Apartments in Bayreuth. Sternplatz & Innenstadt. Garage inklusive. Ab €109/Nacht.',
    images: ['https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: 'https://allinone-residences.de',
    languages: {
      'de-DE': 'https://allinone-residences.de',
      'en-US': 'https://allinone-residences.de',
      'x-default': 'https://allinone-residences.de',
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning className={greatVibes.variable}>
      <head>
        <JsonLd data={organizationSchema} />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
