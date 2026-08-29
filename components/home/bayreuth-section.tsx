'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Section } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { tempImages, REFERENCE_IMAGE_LABEL } from '@/lib/content/media';
import { label } from '@/components/ui-kit/cta';

/**
 * Bayreuth.
 *
 * Only claims that hold without measurement: the Festival exists, it fills the
 * town, the town is small. No walking or driving times appear anywhere — the
 * previous site gave three different figures for the same distance, in two
 * languages, and none of them was verified.
 *
 * The Bayerischer Rundfunk press photograph that illustrated this section was
 * removed; it was never licensed.
 */
export function BayreuthSection() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <Section tone="ink" className="relative overflow-hidden">
      <div className="container-luxury">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
          <Reveal>
            <div>
              <p className="eyebrow-on-dark">{de ? 'Die Stadt' : 'The town'}</p>
              <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
              <h2 className="display-2" style={{ color: 'hsl(var(--on-dark))' }}>
                {de ? 'Bayreuth füllt sich im Sommer' : 'Bayreuth fills up in summer'}
              </h2>
              <div className="mt-6 space-y-4">
                <p className="text-[16px] leading-relaxed" style={{ color: 'hsl(var(--on-dark-muted))' }}>
                  {de
                    ? 'Während der Festspiele reist ein Publikum an, das seit Jahren auf seine Karten gewartet hat. Die Stadt ist klein, die Abende sind lang, und danach möchte niemand mehr weit fahren.'
                    : 'During the Festival, an audience arrives that has waited years for its tickets. The town is small, the evenings are long, and afterwards nobody wants a long journey.'}
                </p>
                <p className="text-[16px] leading-relaxed" style={{ color: 'hsl(var(--on-dark-muted))' }}>
                  {de
                    ? 'Auch außerhalb der Festspielzeit ist Bayreuth eine Stadt, in der man zu Fuß unterwegs ist: Markgräfliches Opernhaus, Hofgarten, die Universität, die Innenstadt mit ihren Cafés.'
                    : 'Outside festival season Bayreuth remains a town you walk: the Margravial Opera House, the Hofgarten, the university, the cafés of the old centre.'}
                </p>
              </div>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/bayreuth-2026" className="cta-primary cta-primary-invert group">
                  {de ? 'Bayreuth & Festspiele' : 'Bayreuth & the Festival'}
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
                <Link href="/journal" className="cta-secondary cta-secondary-invert">
                  {label('readJournal', locale)}
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative aspect-[4/5] overflow-hidden" style={{ borderRadius: 'var(--radius-lg)' }}>
              <Image
                src={tempImages.loft.src}
                alt={tempImages.loft.alt[locale]}
                fill
                sizes="(max-width: 1024px) 100vw, 520px"
                className="object-cover"
              />
              <span className="absolute bottom-3 right-3 ref-badge">
                {REFERENCE_IMAGE_LABEL[locale]}
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
