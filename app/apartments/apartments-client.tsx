'use client';

import { Hammer } from 'lucide-react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { bookableApartments, upcomingApartments } from '@/lib/content/apartments';
import { ApartmentCard } from '@/components/apartments/apartment-card';
import { Reveal } from '@/components/ui-kit/reveal';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { contact } from '@/lib/content/brand';

/**
 * Apartment overview.
 *
 * The previous version filtered five invented apartments across two invented
 * "collections". Two real apartments do not need filters — they need to be
 * seen properly.
 */
export function ApartmentsClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const bookable = bookableApartments();
  const upcoming = upcomingApartments();

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Unsere Apartments' : 'Our apartments'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[16ch]">
              {de ? 'Wohnen mitten in Bayreuth' : 'Stay in the middle of Bayreuth'}
            </h1>
            <p className="lede mt-6">
              {de
                ? `Zwei Wohnungen in der ${contact.street}, beide im selben Haus, beide in Familienbesitz. Ein drittes Apartment in der Opernstraße wird gerade renoviert.`
                : `Two apartments on ${contact.street}, both in the same building, both family-owned. A third apartment on Opernstraße is currently being renovated.`}
            </p>
            <div className="mt-8">
              <EnquiryButton withArrow />
            </div>
          </Reveal>
        </div>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
            {bookable.map((apartment, i) => (
              <Reveal key={apartment.slug} delay={i * 0.08}>
                <ApartmentCard apartment={apartment} priority={i === 0} headingLevel="h2" />
              </Reveal>
            ))}
          </div>

          {upcoming.length > 0 && (
            <div className="mt-14">
              <Reveal>
                <h2 className="display-3 mb-6">{de ? 'In Vorbereitung' : 'In preparation'}</h2>
              </Reveal>
              {upcoming.map((apartment) => (
                <Reveal key={apartment.slug} delay={0.06}>
                  <div
                    className="flex flex-col gap-6 p-7 lg:flex-row lg:items-center lg:justify-between lg:p-9"
                    style={{
                      background: 'hsl(var(--secondary) / 0.6)',
                      border: '1px dashed hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <div className="flex-1">
                      <span
                        className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: 'hsl(var(--champagne-dark))' }}
                      >
                        <Hammer className="w-3.5 h-3.5" aria-hidden="true" />
                        {de ? 'Noch nicht buchbar' : 'Not yet bookable'}
                      </span>
                      <h3 className="display-3 mt-3">{apartment.name[locale]}</h3>
                      <p className="body-copy mt-3 text-[14px]">{apartment.intro[locale]}</p>
                    </div>
                    <Link href={`/apartments/${apartment.slug}`} className="cta-secondary group shrink-0">
                      {de ? 'Mehr dazu' : 'Learn more'}
                      <ArrowRight
                        className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
