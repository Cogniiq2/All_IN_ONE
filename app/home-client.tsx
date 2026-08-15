'use client';

import { Hero } from '@/components/home/hero';
import { ApartmentsSection } from '@/components/home/apartments-section';
import { DirectSection } from '@/components/home/direct-section';
import { BayreuthSection } from '@/components/home/bayreuth-section';
import { FamilySection } from '@/components/home/family-section';
import { ClosingSection } from '@/components/home/closing-section';

/**
 * Six sections, in the order a visitor actually decides:
 *   see it → evaluate it → understand why direct → picture the town →
 *   trust who is behind it → act.
 *
 * The previous homepage stacked eleven, six of which were variations on
 * "trust us, book direct".
 */
export function HomePageClient() {
  return (
    <>
      <Hero />
      <ApartmentsSection />
      <DirectSection />
      <BayreuthSection />
      <FamilySection />
      <ClosingSection />
    </>
  );
}
