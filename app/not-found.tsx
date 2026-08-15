'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { Monogram } from '@/components/brand/logo';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

export default function NotFound() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <div className="section-pad flex min-h-[62vh] items-center">
      <div className="container-narrow text-center">
        <div className="flex justify-center mb-8">
          <Monogram size="lg" />
        </div>

        <p className="eyebrow">404</p>

        <h1 className="display-2 mt-5">
          {de ? 'Diese Seite gibt es nicht' : 'This page does not exist'}
        </h1>

        <p className="lede mx-auto mt-5">
          {de
            ? 'Möglicherweise haben wir sie entfernt oder umbenannt. Von hier aus finden Sie zurück.'
            : 'We may have removed or renamed it. You can find your way back from here.'}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
          <CtaLink href="/apartments">{label('exploreApartments', locale)}</CtaLink>
          <EnquiryButton variant="secondary" />
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px]">
          {[
            { href: '/', label: de ? 'Startseite' : 'Home' },
            { href: '/book-direct', label: de ? 'Direkt anfragen' : 'Book direct' },
            { href: '/bayreuth-2026', label: 'Bayreuth' },
            { href: '/faq', label: de ? 'Häufige Fragen' : 'FAQ' },
            { href: '/contact', label: de ? 'Kontakt' : 'Contact' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
