'use client';

/**
 * Why BoLaGio — a restrained factual trust layer.
 *
 * The homepage already carries two kinds of trust: FamilySection tells the
 * story (who we are, why we answer the phone ourselves) and DirectSection
 * argues the comparison (platform vs. direct). Neither states the plain
 * operating facts a visitor scans for in five seconds before deciding this
 * is worth a closer look — so this fills that gap and nothing else.
 *
 * Every line is something already established elsewhere in the codebase:
 *   - the two addresses are published (lib/content/locations.ts)
 *   - "we furnish and prepare them ourselves" is FamilySection's own claim
 *   - "no call centre" is FamilySection's own claim
 *   - "we answer directly" is DirectSection's own claim
 * This does not introduce a new fact, only a scannable restatement of ones
 * already on the page — which is why it is four short lines and a divider,
 * not a new section with its own heading, icon cards or copy block.
 */

import { MapPin, MessageCircle, Sofa, UserRound } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Reveal } from '@/components/ui-kit/reveal';

const POINTS = [
  {
    icon: MapPin,
    de: 'Zentrale Lagen in der Bayreuther Innenstadt',
    en: 'Central locations in Bayreuth’s old town',
  },
  {
    icon: Sofa,
    de: 'Selbst eingerichtet, selbst vorbereitet',
    en: 'Furnished and prepared by us, personally',
  },
  {
    icon: UserRound,
    de: 'Eigene Apartments, keine Verwaltung dazwischen',
    en: 'Our own apartments, no agency in between',
  },
  {
    icon: MessageCircle,
    de: 'Direkter Kontakt zur Familie',
    en: 'Direct contact with the family',
  },
] as const;

export function TrustStrip() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <div className="border-y border-border/70" style={{ background: 'hsl(var(--secondary) / 0.35)' }}>
      <div className="container-luxury py-8 lg:py-9">
        <Reveal>
          <ul className="flex flex-col divide-y divide-border/70 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:divide-y-0 sm:gap-x-10 sm:gap-y-4">
            {POINTS.map(({ icon: Icon, de: deText, en: enText }) => (
              <li key={deText} className="flex items-center gap-3 py-3 sm:py-0">
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'hsl(var(--champagne-dark))' }}
                  aria-hidden="true"
                />
                <span className="text-[13.5px] leading-snug text-foreground/85">
                  {de ? deText : enText}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </div>
  );
}
