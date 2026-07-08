'use client';

import { HeroSection } from '@/components/home/hero-section';
import { ProofStrip } from '@/components/home/proof-strip';
import { CollectionsTeaser } from '@/components/home/collections-teaser';
import { WhyChooseSection } from '@/components/home/why-choose-section';
import { PillarsSection } from '@/components/home/pillars-section';
import { ResidencesPreview } from '@/components/home/residences-preview';
import { DirectBookingSection } from '@/components/home/direct-booking-section';
import { ReviewsSection } from '@/components/home/reviews-section';
import { BayreuthTeaser } from '@/components/home/bayreuth-teaser';
import { TrustTeaser } from '@/components/home/trust-teaser';
import { FinalCta } from '@/components/home/final-cta';

export function HomePageClient() {
  return (
    <>
      <HeroSection />
      <ProofStrip />
      <CollectionsTeaser />
      <WhyChooseSection />
      <PillarsSection />
      <ResidencesPreview />
      <DirectBookingSection />
      <ReviewsSection />
      <BayreuthTeaser />
      <TrustTeaser />
      <FinalCta />
    </>
  );
}
