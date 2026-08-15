'use client';

import Link from 'next/link';
import { ArrowRight, Hammer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { bookableApartments, upcomingApartments } from '@/lib/content/apartments';
import { Section, SectionHeader } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { ApartmentCard } from '@/components/apartments/apartment-card';
import { label } from '@/components/ui-kit/cta';

/**
 * Two apartments, presented properly — not five invented ones presented
 * identically. Opernstraße appears below, visually separated, with no booking
 * or payment affordance of any kind.
 */
export function ApartmentsSection() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const bookable = bookableApartments();
  const upcoming = upcomingApartments();

  return (
    <Section id="apartments">
      <div className="container-luxury">
        <SectionHeader
          eyebrow={de ? 'Unsere Apartments' : 'Our apartments'}
          title={
            de
              ? 'Zwei Wohnungen in der Schulstraße'
              : 'Two apartments on Schulstraße'
          }
          lede={
            de
              ? 'Beide gehören unserer Familie, beide liegen im selben Haus mitten in der Innenstadt. Wer mit einer größeren Gruppe kommt, kann sie zusammen anfragen.'
              : 'Both belong to our family, both are in the same building in the middle of town. Travelling as a larger group? They can be enquired about together.'
          }
        />

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:gap-8">
          {bookable.map((apartment, i) => (
            <Reveal key={apartment.slug} delay={i * 0.08}>
              <ApartmentCard apartment={apartment} priority={i === 0} />
            </Reveal>
          ))}
        </div>

        {upcoming.length > 0 && (
          <Reveal delay={0.1}>
            <div className="mt-8 lg:mt-10">
              {upcoming.map((apartment) => (
                <div
                  key={apartment.slug}
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
                      {de ? 'In Vorbereitung' : 'In preparation'}
                    </span>
                    <h3 className="display-3 mt-3">{apartment.name[locale]}</h3>
                    <p className="body-copy mt-3 text-[14px]">{apartment.intro[locale]}</p>
                  </div>
                  <div className="shrink-0">
                    <Link href={`/apartments/${apartment.slug}`} className="cta-secondary group">
                      {de ? 'Mehr dazu' : 'Learn more'}
                      <ArrowRight
                        className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        <Reveal delay={0.15}>
          <div className="mt-10 text-center">
            <Link href="/apartments" className="link-quiet">
              {label('exploreApartments', locale)}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
