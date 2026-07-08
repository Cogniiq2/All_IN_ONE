'use client';

import Link from 'next/link';
import { Chrome as Home, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { locale } = useI18n();

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-20">
      <div className="container-luxury">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border border-champagne/30 mb-6">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="font-serif text-6xl font-semibold mb-4">404</h1>
            <p className="text-xl text-muted-foreground mb-3">
              {locale === 'de' ? 'Seite nicht gefunden' : 'Page not found'}
            </p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-10">
              {locale === 'de'
                ? 'Die gesuchte Seite existiert nicht oder wurde verschoben. Kehren Sie zur Startseite zurück oder erkunden Sie unsere Residenzen.'
                : 'The page you are looking for does not exist or has been moved. Return to the homepage or explore our residences.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-foreground text-primary-foreground rounded-sm text-sm font-medium tracking-wide hover:opacity-90 transition-opacity"
            >
              <Home className="w-4 h-4" />
              {locale === 'de' ? 'Zur Startseite' : 'Go to homepage'}
            </Link>
            <Link
              href="/residences"
              className="inline-flex items-center justify-center px-7 py-3.5 border border-border rounded-sm text-sm font-medium tracking-wide hover:border-foreground/40 transition-colors"
            >
              {locale === 'de' ? 'Residenzen ansehen' : 'View residences'}
            </Link>
          </div>

          <div className="mt-12 pt-12 border-t border-champagne/20">
            <p className="text-xs text-muted-foreground mb-4">
              {locale === 'de' ? 'Beliebte Seiten' : 'Popular pages'}
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/book-direct" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {locale === 'de' ? 'Direkt buchen' : 'Book direct'}
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link href="/business-stays" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {locale === 'de' ? 'Geschäftsreisen' : 'Business stays'}
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link href="/reviews" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {locale === 'de' ? 'Bewertungen' : 'Reviews'}
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {locale === 'de' ? 'Kontakt' : 'Contact'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
