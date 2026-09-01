'use client';

/**
 * The apartments, on the homepage.
 *
 * An overview and nothing more: photograph, name, one paragraph, a CTA. The
 * detail — the full description, the facts, the stay panel and the route into
 * booking — lives in the large modal a card opens, not on this page. Dumping it
 * here would bury the rest of the homepage and give a visitor several long
 * reads before any decision.
 *
 * All of them appear, the Opernstraße flats included. Their cards carry the
 * "In Vorbereitung" badge and their detail views offer no booking path, so
 * presenting them beside the lettable ones costs nothing in honesty and stops
 * the collection looking thinner than it is.
 *
 * The heading and the lede count the inventory rather than stating a number, so
 * a new apartment or a new building changes this section by changing the data.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  apartments,
  countWord,
  countWordInline,
  streetCount,
  unitsByStreet,
} from '@/lib/content/apartments';
import { Section, SectionHeader } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { UnitCard, UNIT_GRID } from '@/components/units/unit-card';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { useStay } from '@/lib/booking/stay-context';
import { label } from '@/components/ui-kit/cta';

export function ApartmentsSection() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { openDetail } = useUnitFlow();
  const { toQueryString } = useStay();

  const total = apartments.length;
  const streets = streetCount(apartments);
  const perStreet = unitsByStreet(apartments)
    .map(({ street, count }) =>
      de
        ? `${countWordInline(count, 'de')} in der ${street}`
        : `${countWordInline(count, 'en')} on ${street}`
    )
    .join(', ');
  const perStreetSentence = perStreet.charAt(0).toUpperCase() + perStreet.slice(1);

  return (
    <Section id="apartments">
      <div className="container-luxury">
        <SectionHeader
          eyebrow={de ? 'Unsere Apartments' : 'Our apartments'}
          title={
            de
              ? `${countWord(total, 'de')} ${total === 1 ? 'Wohnung' : 'Wohnungen'}, ${countWordInline(streets, 'de')} ${streets === 1 ? 'Haus' : 'Häuser'}`
              : `${countWord(total, 'en')} ${total === 1 ? 'apartment' : 'apartments'}, ${countWordInline(streets, 'en')} ${streets === 1 ? 'building' : 'buildings'}`
          }
          lede={
            de
              ? `${perStreetSentence}. Alle gehören unserer Familie und werden von uns selbst betreut. Tippen Sie auf eine Wohnung, um sie im Detail zu sehen — buchbare Apartments buchen Sie direkt von dort aus.`
              : `${perStreetSentence}. All belong to our family and are looked after by us. Tap an apartment to see it in detail — bookable apartments are booked straight from there.`
          }
        />

        <div className={`mt-12 ${UNIT_GRID}`}>
          {apartments.map((apartment, i) => (
            <Reveal key={apartment.slug} delay={i * 0.08} className="h-full">
              <UnitCard
                unit={apartment}
                mode="stay"
                priority={i === 0}
                onOpen={(unit) => openDetail(unit, 'stay')}
              />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-10 text-center">
            {/* Keeps the crawlable route in the page and carries any chosen
                dates with it. */}
            <Link href={`/apartments${toQueryString()}`} className="link-quiet">
              {label('exploreApartments', locale)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
