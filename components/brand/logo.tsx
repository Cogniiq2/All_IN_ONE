'use client';

/**
 * BoLaGio brand marks.
 *
 * The identity is typographic rather than pictorial: the name already carries
 * three capitals, so the wordmark simply lets them read. Capitals sit at full
 * ink, the connecting lowercase at reduced weight — Bo · La · Gio resolves
 * visually without ever stating what the letters stand for. That story is the
 * family's to tell, and is deliberately not invented here.
 */

import { brand } from '@/lib/content/brand';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const WORDMARK_SIZE: Record<Size, string> = {
  sm: '17px',
  md: '21px',
  lg: '30px',
  xl: '44px',
};

const MONOGRAM_SIZE: Record<Size, string> = {
  sm: '13px',
  md: '16px',
  lg: '22px',
  xl: '34px',
};

interface MarkProps {
  size?: Size;
  /** Render for dark backgrounds (hero photography, footer). */
  invert?: boolean;
  className?: string;
}

/**
 * The full wordmark. `aria-hidden` on the decorative spans; the accessible
 * name comes from the single visually-hidden string so screen readers hear
 * "BoLaGio" once, not three fragments.
 */
export function Wordmark({ size = 'md', invert = false, className = '' }: MarkProps) {
  const ink = invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))';
  const soft = invert ? 'hsl(var(--on-dark) / 0.72)' : 'hsl(var(--foreground) / 0.66)';

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="sr-only">{brand.name}</span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: WORDMARK_SIZE[size],
          fontWeight: 500,
          letterSpacing: '-0.012em',
          lineHeight: 1,
          color: ink,
          whiteSpace: 'nowrap',
        }}
      >
        B<span style={{ color: soft }}>o</span>
        L<span style={{ color: soft }}>a</span>
        G<span style={{ color: soft }}>io</span>
      </span>
    </span>
  );
}

/**
 * The restrained B · L · G monogram. Used as a quiet mark — favicon, footer,
 * section dividers, and the hero entrance.
 */
export function Monogram({ size = 'md', invert = false, className = '' }: MarkProps) {
  const ink = invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))';
  const dot = invert ? 'hsl(var(--on-dark-gold))' : 'hsl(var(--champagne-dark))';

  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{
        fontFamily: 'var(--font-serif), Georgia, serif',
        fontSize: MONOGRAM_SIZE[size],
        fontWeight: 500,
        letterSpacing: '0.06em',
        lineHeight: 1,
        color: ink,
        gap: '0.42em',
      }}
    >
      <span className="sr-only">{brand.name}</span>
      {brand.monogram.map((letter, i) => (
        <span key={letter} aria-hidden="true" className="inline-flex items-center" style={{ gap: '0.42em' }}>
          {letter}
          {i < brand.monogram.length - 1 && (
            <span
              style={{
                width: '3px',
                height: '3px',
                background: dot,
                transform: 'rotate(45deg)',
                display: 'inline-block',
              }}
            />
          )}
        </span>
      ))}
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
    <span className={`inline-flex flex-col ${className}`} style={{ gap: '4px' }}>
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
