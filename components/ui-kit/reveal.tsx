'use client';

import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

/**
 * The single scroll reveal used across the site.
 *
 * Replaces the previous set of five variants plus a dozen bespoke inline
 * animations. One motion, one easing, one duration — applied sparingly.
 *
 * Reduced motion is handled by `MotionConfig` in ClientLayout, not by a branch
 * here: rendering a different element for those users made the server markup
 * disagree with the client and discarded the server-rendered page on hydration.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
