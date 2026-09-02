'use client';

/**
 * What the apartment offers, in the detail view.
 *
 * Renders whatever `lib/content/property-facts.ts` holds for the unit and
 * nothing else — no slug appears here, and a unit without a fact sheet simply
 * renders nothing.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 * A row of chips answers the question most visitors actually have, then the
 * detail follows in small groups: a quiet gold label, a drawn rule, and a
 * short list. Two columns on a desktop and one on a phone, so a group is
 * always read as a unit rather than as a column of loose lines. It is a
 * specification, deliberately not a brochure: every line is one fact, stated
 * once.
 *
 * The motion is the same vocabulary as the gallery below it — the label's
 * letters settle, the rule draws, the list fades up — so the two sections of
 * the detail view read as one document.
 */

import {
  Bath,
  BedDouble,
  Building2,
  ConciergeBell,
  Laptop,
  MapPin,
  ShieldCheck,
  Sofa,
  Sun,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  groupsForScope,
  type FactGroup,
  type FactIcon,
  type PropertyFacts,
} from '@/lib/content/property-facts';
import { RevealBlock, RevealLetters, RevealRule } from '@/components/property/reveal-on-scroll';

const ICONS: Record<FactIcon, typeof Sofa> = {
  living: Sofa,
  kitchen: UtensilsCrossed,
  bed: BedDouble,
  bath: Bath,
  work: Laptop,
  family: Users,
  outdoor: Sun,
  access: Building2,
  safety: ShieldCheck,
  service: ConciergeBell,
  location: MapPin,
};

export function PropertyFactsSection({
  facts,
  shortTerm,
}: {
  facts: PropertyFacts;
  /** False in the rental journey, where short-stay services are left out. */
  shortTerm: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const groups = groupsForScope(facts, shortTerm);

  return (
    <section className="border-t border-border/70 px-6 py-10 sm:px-8 lg:px-10 lg:py-12">
      <header>
        <p className="eyebrow">{de ? 'Ausstattung' : 'The apartment'}</p>
        <RevealLetters
          as="h3"
          className="display-3 mt-3"
          text={de ? 'Auf einen Blick' : 'At a glance'}
        />
      </header>

      {/* The short answer. Nothing here is repeated in the groups below. */}
      <RevealBlock className="mt-5 flex flex-wrap gap-2">
        {facts.highlights.map((highlight) => (
          <span
            key={highlight.de}
            className="inline-flex items-center px-3 py-1.5 text-[12.5px] font-medium"
            style={{
              borderRadius: 'var(--radius-xs)',
              border: '1px solid hsl(var(--champagne) / 0.55)',
              background: 'hsl(var(--champagne) / 0.12)',
              color: 'hsl(var(--foreground))',
            }}
          >
            {highlight[locale]}
          </span>
        ))}
      </RevealBlock>

      <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
        {groups.map((group, i) => (
          <Group key={group.id} group={group} index={i} />
        ))}
      </div>
    </section>
  );
}

function Group({ group, index }: { group: FactGroup; index: number }) {
  const { locale } = useI18n();
  const Icon = ICONS[group.icon];

  return (
    <section aria-labelledby={`facts-${group.id}`} className="min-w-0">
      <div className="flex items-center gap-3">
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: 'hsl(var(--champagne-dark))' }}
          aria-hidden="true"
        />
        <RevealLetters
          as="h4"
          id={`facts-${group.id}`}
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em]"
          text={group.label[locale]}
        />
        <RevealRule className="min-w-0 flex-1" delay={120} />
      </div>

      <RevealBlock index={index} className="mt-3.5">
        <ul className="flex flex-col gap-2">
          {group.items.map((item) => (
            <li key={item.de} className="flex items-start gap-2.5 text-[14px] leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-[9px] h-1 w-1 shrink-0 rotate-45"
                style={{ background: 'hsl(var(--champagne-dark) / 0.75)' }}
              />
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>{item[locale]}</span>
            </li>
          ))}
        </ul>
      </RevealBlock>
    </section>
  );
}
