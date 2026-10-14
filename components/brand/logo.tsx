'use client';

/**
 * BoLaGio brand marks — the logo artwork itself.
 *
 * The wordmark ("BoLaGio") and the stacked B / L / G monogram are drawn from
 * the brand master, not imitated in a web font: `brandArt` holds them as
 * transparent masks and each mark paints its mask in the ink of the surface
 * it sits on (`currentColor`), so the same art reads on light pages and on
 * dark photography. The accessible name is the single visually-hidden
 * "BoLaGio"; the artwork is decorative.
 */

import type { CSSProperties } from 'react';
import { brand } from '@/lib/content/brand';
import { brandArt, type BrandArt } from '@/lib/content/media';

type Size = 'sm' | 'md' | 'lg' | 'xl';

/** Rendered height of the wordmark art, descender included. */
const WORDMARK_HEIGHT: Record<Size, number> = { sm: 24, md: 30, lg: 42, xl: 64 };

/** Rendered height of the stacked monogram. */
const MONOGRAM_HEIGHT: Record<Size, number> = { sm: 28, md: 36, lg: 56, xl: 88 };

interface MarkProps {
  size?: Size;
  /** Render for dark backgrounds (hero photography, footer). */
  invert?: boolean;
  className?: string;
}

/** A logo mask painted in the current text colour, at a fixed height. */
export function BrandArtMask({ art, height, className = '', style }: { art: BrandArt; height: number | string; className?: string; style?: CSSProperties }) {
  const mask = `url(${art.src}) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      style={{
        height,
        aspectRatio: `${art.width} / ${art.height}`,
        backgroundColor: 'currentColor',
        WebkitMask: mask,
        mask,
        ...style,
      }}
    />
  );
}

/** The BoLaGio wordmark. */
export function Wordmark({ size = 'md', invert = false, className = '' }: MarkProps) {
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ color: invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))', lineHeight: 0 }}
    >
      <span className="sr-only">{brand.name}</span>
      <BrandArtMask art={brandArt.wordmark} height={WORDMARK_HEIGHT[size]} />
    </span>
  );
}

/**
 * The stacked B / L / G monogram. Used as a quiet mark — footer, section
 * dividers, the hero entrance.
 */
export function Monogram({ size = 'md', invert = false, className = '' }: MarkProps) {
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ color: invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))', lineHeight: 0 }}
    >
      <span className="sr-only">{brand.name}</span>
      <BrandArtMask art={brandArt.monogram} height={MONOGRAM_HEIGHT[size]} />
    </span>
  );
}

/**
 * Wordmark plus a fine descriptor line. Used in the navbar and footer.
 */
export function LogoLockup({
  size = 'md',
  invert = false,
  descriptor = true,
  className = '',
}: MarkProps & { descriptor?: boolean }) {
  const soft = invert ? 'hsl(var(--on-dark-muted))' : 'hsl(var(--muted-foreground))';

  return (
    <span className={`inline-flex flex-col ${className}`} style={{ gap: '5px' }}>
      <Wordmark size={size} invert={invert} />
      {descriptor && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-sans), sans-serif',
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '0.19em',
            textTransform: 'uppercase',
            color: soft,
            lineHeight: 1,
          }}
        >
          {brand.city}
        </span>
      )}
    </span>
  );
}
