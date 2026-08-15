'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BedDouble, Maximize, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  galleryFor,
  STATUS_LABEL,
  type Apartment,
} from '@/lib/content/apartments';
import { REFERENCE_IMAGE_LABEL } from '@/lib/content/media';
import { label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * The apartment card, built to receive real content without redesign:
 * photograph, status, name, positioning, a facts row and the CTA. Facts render
 * only when the data exists — an apartment with no confirmed size shows no
 * size row rather than an empty one.
 *
 * Apartments in preparation never expose a booking or enquiry-to-book CTA.
 */
export function ApartmentCard({
  apartment,
  priority = false,
  headingLevel = 'h3',
}: {
  apartment: Apartment;
  priority?: boolean;
  /** Set to h2 when the card sits directly under the page h1 with no section
   *  heading in between, so the document outline never skips a level. */
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  const { locale } = useI18n();
  const de = locale === 'de';
  const upcoming = apartment.status === 'in-preparation';
  const images = galleryFor(apartment.slug);
  const cover = images[0];

  const facts = [
    apartment.sizeSqm && { icon: Maximize, text: `${apartment.sizeSqm} m²` },
    apartment.maxGuests && {
      icon: Users,
      text: de ? `bis ${apartment.maxGuests} Gäste` : `up to ${apartment.maxGuests} guests`,
    },
    apartment.bedrooms?.length && {
      icon: BedDouble,
      text: de
        ? `${apartment.bedrooms.length} Schlafzimmer`
        : `${apartment.bedrooms.length} bedrooms`,
    },
  ].filter(Boolean) as { icon: typeof Users; text: string }[];

  return (
    <article className="card-surface group flex flex-col overflow-hidden">
      <Link
        href={`/apartments/${apartment.slug}`}
        className="relative block aspect-[4/3] overflow-hidden bg-secondary"
        tabIndex={-1}
        aria-hidden="true"
      >
        {cover ? (
          <>
            <Image
              src={cover.src}
              alt={cover.alt[locale]}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, (max-width: 1180px) 50vw, 520px"
              className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
            />
            <span className="absolute bottom-3 right-3 ref-badge">
              {REFERENCE_IMAGE_LABEL[locale]}
            </span>
          </>
        ) : (
          // No photography yet — a composed empty state, not a broken image.
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 100%)',
            }}
          >
            <span
              className="font-serif text-[42px]"
              style={{ color: 'hsl(var(--champagne-dark) / 0.5)' }}
            >
              {apartment.street.charAt(0)}
            </span>
          </div>
        )}

        <span
          className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-sm"
          style={{
            background: upcoming ? 'hsl(var(--ink) / 0.78)' : 'hsl(var(--background) / 0.94)',
            color: upcoming ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))',
            backdropFilter: 'blur(8px)',
          }}
        >
          {STATUS_LABEL[apartment.status][locale]}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-6 lg:p-7">
        <Heading className="display-3">
          <Link
            href={`/apartments/${apartment.slug}`}
            className="transition-colors hover:text-[hsl(var(--champagne-dark))]"
          >
            {apartment.name[locale]}
          </Link>
        </Heading>

        <p className="mt-2 text-[13px] font-medium" style={{ color: 'hsl(var(--champagne-dark))' }}>
          {apartment.positioning[locale]}
        </p>

        <p className="body-copy mt-4 text-[14px] flex-1">{apartment.intro[locale]}</p>

        {facts.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            {facts.map((fact) => (
              <li key={fact.text} className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                <fact.icon className="w-4 h-4 shrink-0" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
                {fact.text}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={`/apartments/${apartment.slug}`} className="cta-secondary group/link">
            {label('viewApartment', locale)}
            <ArrowRight
              className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1"
              aria-hidden="true"
            />
          </Link>
          {!upcoming && <EnquiryButton apartmentSlug={apartment.slug} />}
        </div>
      </div>
    </article>
  );
}
