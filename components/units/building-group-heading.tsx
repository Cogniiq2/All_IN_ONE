'use client';

/**
 * The address heading above a group of unit cards on /apartments.
 *
 * Deliberately the same signpost as a room heading inside the property
 * gallery (components/property/property-gallery.tsx): letters that settle, a
 * gold hairline that draws itself across the remaining width, and the count
 * at the far end. Reusing that vocabulary rather than inventing a second
 * section-heading style is the whole point — the page and the gallery should
 * read as one document.
 *
 * It is a level up in the document outline, and a step up in size, because
 * this heading introduces a building rather than a room; everything else
 * about it is the gallery's own treatment.
 */

import { RevealLetters, RevealRule } from '@/components/property/reveal-on-scroll';

export function BuildingGroupHeading({
  address,
  count,
  id,
}: {
  address: string;
  /** Units below the heading. Shown as the gallery shows a room's picture count. */
  count: number;
  id: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <RevealLetters
        as="h2"
        id={id}
        className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.16em]
                   text-[hsl(var(--champagne-dark))]"
        text={address}
      />
      <RevealRule className="min-w-0 flex-1" delay={140} />
      <span
        className="shrink-0 text-[11px] tabular-nums"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {count}
      </span>
    </div>
  );
}
