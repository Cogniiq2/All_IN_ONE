'use client';

interface BrandLogoProps {
  light?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BrandLogo({ light = false, size = 'md' }: BrandLogoProps) {
  const markW = { sm: 30, md: 42, lg: 56 }[size];
  const markH = { sm: 34, md: 48, lg: 64 }[size];
  const wordmarkSize = { sm: 11, md: 13, lg: 17 }[size];
  const gap = { sm: 4, md: 6, lg: 8 }[size];

  const ink = light ? 'rgba(255,255,255,0.93)' : 'hsl(218 22% 9%)';
  const sub = light ? 'rgba(255,255,255,0.62)' : 'hsl(218 10% 44%)';

  return (
    <span className="inline-flex flex-col items-center select-none" style={{ gap }}>
      {/*
        SVG recreation of the "All in" calligraphic monogram.
        Font --font-script (Great Vibes) is loaded via next/font/google in layout.tsx
        so it is available synchronously from first paint with no FOUF.

        Geometry (viewBox 0 0 420 460, matching the logo's internal proportions):
          • Left diagonal:  (210, 88) → (107, 302)  – the A's left leg
          • Right vertical: (210, 88) → (210, 392)  – the stem / "1" / "i" in "in"
          • "ll" script text at x=222 baseline y=245
          • "n"  script text at x=217 baseline y=348
      */}
      <svg
        width={markW}
        height={markH}
        viewBox="50 60 320 370"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ overflow: 'visible' }}
      >
        {/* Left diagonal stroke */}
        <line
          x1="210" y1="88"
          x2="107" y2="302"
          stroke={ink}
          strokeWidth="19"
          strokeLinecap="round"
        />
        {/* Right vertical stroke */}
        <line
          x1="210" y1="88"
          x2="210" y2="392"
          stroke={ink}
          strokeWidth="19"
          strokeLinecap="round"
        />
        {/* Cursive "ll" — Great Vibes loaded via next/font, referenced via CSS var */}
        <text
          x="222"
          y="245"
          style={{ fontFamily: 'var(--font-script), cursive' } as React.CSSProperties}
          fontSize="112"
          fill={ink}
        >
          ll
        </text>
        {/* Cursive "n" */}
        <text
          x="217"
          y="348"
          style={{ fontFamily: 'var(--font-script), cursive' } as React.CSSProperties}
          fontSize="97"
          fill={ink}
        >
          n
        </text>
      </svg>

      {/* "Residences" wordmark */}
      <span
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 400,
          fontStyle: 'italic',
          fontSize: wordmarkSize,
          letterSpacing: '0.10em',
          lineHeight: 1,
          color: sub,
          whiteSpace: 'nowrap',
        }}
      >
        Residences
      </span>
    </span>
  );
}
