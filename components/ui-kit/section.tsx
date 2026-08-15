'use client';

import { type ReactNode } from 'react';
import { Reveal } from '@/components/ui-kit/reveal';

/**
 * Section header used by every section on the site, so eyebrow / heading /
 * lede spacing and hierarchy are identical everywhere.
 */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  align = 'left',
  invert = false,
  as: Heading = 'h2',
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'left' | 'center';
  invert?: boolean;
  as?: 'h1' | 'h2' | 'h3';
}) {
  const centered = align === 'center';

  return (
    <Reveal className={centered ? 'text-center' : ''}>
      {eyebrow && (
        <p className={invert ? 'eyebrow-on-dark' : 'eyebrow'}>{eyebrow}</p>
      )}
      <div
        className={`rule-gold mt-4 mb-6 ${centered ? 'mx-auto' : ''}`}
        aria-hidden="true"
      />
      <Heading
        className="display-2"
        style={invert ? { color: 'hsl(var(--on-dark))' } : undefined}
      >
        {title}
      </Heading>
      {lede && (
        <p
          className={`lede mt-5 ${centered ? 'mx-auto' : ''}`}
          style={invert ? { color: 'hsl(var(--on-dark-muted))' } : undefined}
        >
          {lede}
        </p>
      )}
    </Reveal>
  );
}

export function Section({
  id,
  children,
  className = '',
  tone = 'default',
  compact = false,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'muted' | 'ink';
  compact?: boolean;
}) {
  const toneClass =
    tone === 'muted'
      ? 'bg-secondary/45'
      : tone === 'ink'
      ? ''
      : '';

  return (
    <section
      id={id}
      className={`${compact ? 'section-pad-sm' : 'section-pad'} ${toneClass} ${className}`}
      style={tone === 'ink' ? { background: 'hsl(var(--ink))' } : undefined}
    >
      {children}
    </section>
  );
}
