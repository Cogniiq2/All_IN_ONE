import type { Metadata, Viewport } from 'next';
import './control.css';

/**
 * BoLaGio Control — the outer layout for everything under `/admin`.
 *
 * Deliberately thin: it scopes the operations stylesheet and sets the
 * metadata every admin page inherits. Authentication is NOT here — the login
 * page lives under this layout too — but in `(control)/layout.tsx`, which
 * wraps every protected screen and is the only way to reach one.
 *
 * `noindex, nofollow` here is belt; the middleware's `X-Robots-Tag` is braces.
 * The admin is also absent from the sitemap and linked from nowhere public.
 */
export const metadata: Metadata = {
  title: {
    default: 'BoLaGio Control',
    template: '%s · BoLaGio Control',
  },
  description: 'Residence Operations — internal.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: undefined,
  twitter: undefined,
  alternates: { canonical: undefined },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#15181f',
};

export const dynamic = 'force-dynamic';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="bc">{children}</div>;
}
