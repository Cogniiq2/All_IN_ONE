import './globals.css';
import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import { SITE_URL, brand } from '@/lib/content/brand';

/**
 * Fonts are downloaded at build time and served from our own origin. The
 * previous @import from fonts.googleapis.com in globals.css was removed —
 * it sent every visitor's IP to Google before consent and blocked first paint.
 */
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'BoLaGio — Familiengeführte Apartments in Bayreuth',
    template: '%s | BoLaGio Bayreuth',
  },
  description:
    'BoLaGio vermietet familiengeführte Apartments in der Bayreuther Innenstadt. Direkte Anfrage, persönliche Betreuung, keine Plattform dazwischen.',
  keywords: [
    // Accommodation (short-term) …
    'Apartment Bayreuth',
    'Ferienwohnung Bayreuth',
    'Unterkunft Bayreuth Innenstadt',
    'Bayreuth Festspiele Unterkunft',
    'BoLaGio Bayreuth',
    'Wohnung auf Zeit Bayreuth',
    // … and conventional rental (long-term). Kept as distinct terms rather
    // than blended: the two searches have different intent.
    'Wohnung mieten Bayreuth',
    'Gewerbefläche mieten Bayreuth',
    'Ladenfläche Bayreuth',
  ],
  applicationName: brand.name,
  authors: [{ name: brand.name }],
  creator: brand.name,
  publisher: brand.name,
  category: 'travel',
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    alternateLocale: ['en_US'],
    siteName: `${brand.name} — ${brand.city}`,
    title: 'BoLaGio — Familiengeführte Apartments in Bayreuth',
    description:
      'Familiengeführte Apartments in der Bayreuther Innenstadt. Direkt anfragen, persönlich betreut.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BoLaGio — Familiengeführte Apartments in Bayreuth',
    description: 'Familiengeführte Apartments in der Bayreuther Innenstadt.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

/**
 * The root layout carries only what EVERY surface shares: the document, the
 * self-hosted fonts and the default metadata.
 *
 * The public website's providers, navigation, footer, modals and JSON-LD live
 * in `app/(site)/layout.tsx`; BoLaGio Control has its own shell under
 * `app/(admin)/admin/layout.tsx`. Neither inherits the other's chrome, so the
 * operations interface cannot ship the marketing providers and the marketing
 * site cannot ship the operations shell.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="de"
      suppressHydrationWarning
      className={`${playfair.variable} ${inter.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
