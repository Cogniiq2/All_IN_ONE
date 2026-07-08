'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getResidencesByCollection } from '@/lib/residences';
import { ResidenceCard } from '@/components/shared/residence-card';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function SternplatzClient() {
  const { t } = useI18n();
  const residencesList = getResidencesByCollection('sternplatz');

  const bullets = [
    t('collectionPage.sternplatzBullet1'),
    t('collectionPage.sternplatzBullet2'),
    t('collectionPage.sternplatzBullet3'),
  ];

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="max-w-2xl mb-14">
            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
              Collection
            </span>
            <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-5">
              Sternplatz Collection
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              {t('collectionPage.sternplatzIntro')}
            </p>
          </div>
        </SectionReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {residencesList.map((r, i) => (
            <SectionReveal key={r.slug} delay={i * 0.06}>
              <ResidenceCard residence={r} />
            </SectionReveal>
          ))}
        </div>

        <SectionReveal>
          <div className="max-w-xl">
            <h2 className="font-serif text-2xl font-semibold mb-6">
              {t('collectionPage.definesCollection')}
            </h2>
            <ul className="space-y-3 mb-10">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 mt-0.5 text-champagne flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/residences"
              className="inline-flex items-center justify-center px-7 py-3.5 bg-foreground text-primary-foreground rounded-sm text-sm font-medium tracking-wide hover:opacity-90 transition-opacity"
            >
              {t('collectionPage.checkAvailability')}
            </Link>
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}
