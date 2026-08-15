'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Section } from '@/components/ui-kit/section';
import { Reveal } from '@/components/ui-kit/reveal';
import { Monogram } from '@/components/brand/logo';

/**
 * The family.
 *
 * BoLaGio is a family name, and the site says so — but it publishes no names,
 * no ages, no biographies and no photographs, because none of that has been
 * released for publication. (The previous About page gave three family members
 * job titles and professional bios.)
 *
 * `familyPortrait` and `familyStory` below are the slots those will occupy.
 * The layout is final; only the content is pending.
 */
const familyPortrait: string | null = null;
// NEEDS CONFIRMATION — a real family photograph, with consent to publish.

const familyStory: { de: string; en: string } | null = null;
// NEEDS CONFIRMATION — how the family came to Bayreuth, why these apartments.

export function FamilySection() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <Section>
      <div className="container-luxury">
        <div className="mx-auto max-w-[720px] text-center">
          <Reveal>
            <div className="flex justify-center mb-8">
              <Monogram size="lg" />
            </div>

            <p className="eyebrow">{de ? 'Wer dahinter steht' : 'Who is behind it'}</p>

            <h2 className="display-2 mt-5">
              {de ? 'Ein Familienunternehmen' : 'A family business'}
            </h2>

            <div className="mt-7 space-y-5">
              <p className="text-[17px] leading-relaxed text-muted-foreground">
                {de
                  ? 'BoLaGio trägt die Namen unserer drei Kinder. Die Wohnungen gehören uns, wir richten sie selbst ein, wir bereiten sie selbst vor, und wenn Sie anrufen, sprechen Sie mit jemandem aus der Familie.'
                  : 'BoLaGio carries the names of our three children. The apartments are ours, we furnish them ourselves, we prepare them ourselves, and when you call, you speak to someone in the family.'}
              </p>

              {familyStory ? (
                <p className="text-[17px] leading-relaxed text-muted-foreground">
                  {familyStory[locale]}
                </p>
              ) : (
                <p className="text-[17px] leading-relaxed text-muted-foreground">
                  {de
                    ? 'Das ist der ganze Unterschied: keine Verwaltung, kein Callcenter, keine Schlüsselagentur. Nur eine Familie, die für ein paar Wohnungen in ihrer Stadt verantwortlich ist.'
                    : 'That is the whole difference: no property management, no call centre, no key agency. Just a family responsible for a few apartments in their own town.'}
                </p>
              )}
            </div>

            {familyPortrait && (
              // Rendered only once a real photograph with publication consent exists.
              <div className="mt-10" />
            )}

            <div className="mt-9">
              <Link href="/about" className="link-quiet">
                {de ? 'Mehr über uns' : 'More about us'}
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
