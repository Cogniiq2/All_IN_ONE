'use client';

import { Hero } from '@/components/home/hero';
import { AvailabilityBand } from '@/components/home/availability-band';
import { ApartmentsSection } from '@/components/home/apartments-section';
import { DirectSection } from '@/components/home/direct-section';
import { BayreuthSection } from '@/components/home/bayreuth-section';
import { FamilySection } from '@/components/home/family-section';
import { RentalSection } from '@/components/home/rental-section';
import { ClosingSection } from '@/components/home/closing-section';

/**
 * The order a visitor actually decides in:
 *   see it → say when → evaluate it → understand why direct → picture the
 *   town → trust who is behind it → (a different need? rent instead) → act.
 *
 * ── What changed, and why ────────────────────────────────────────────────
 * Nothing was reordered. The existing six sections stand in their original
 * sequence; two were inserted, each at the only point where it belongs.
 *
 * AvailabilityBand sits directly under the hero because stating dates is the
 * first thing a short-term guest wants to do, and every section below is a
 * reason to do it. Putting it lower would mean scrolling past the offer to
 * reach the action.
 *
 * RentalSection sits late, after the trust sections and before the closing
 * CTA, because it addresses a different audience with a different journey.
 * Placing it among the apartments would ask a guest looking for three nights
 * to choose between two products; placing it after the closing CTA would bury
 * it. Prospective tenants reach it from the navigation and the hero link
 * instead — they do not have to scroll for it.
 */
export function HomePageClient() {
  return (
    <>
      <Hero />
      <AvailabilityBand />
      <ApartmentsSection />
      <DirectSection />
      <BayreuthSection />
      <FamilySection />
      <RentalSection />
      <ClosingSection />
    </>
  );
}
