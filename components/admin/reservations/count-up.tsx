'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/admin/format';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** What each figure last showed, so a new answer rolls on from the old one. */
const last = new Map<string, number>();

function render(value: number, kind: 'int' | 'money', currency: string): string {
  return kind === 'money' ? formatMoney(Math.round(value), currency) : String(Math.round(value));
}

/**
 * A figure that rolls from what it showed before to its new value when the
 * filter changes. On the first load it simply shows the value (the server
 * already rendered it; counting up from zero would flash). Reduced motion:
 * no roll at all.
 */
export function CountUp({ id, value, kind = 'int', currency = 'EUR' }: { id: string; value: number; kind?: 'int' | 'money'; currency?: string }) {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);

  useIsomorphicLayoutEffect(() => {
    const from = last.get(id);
    last.set(id, value);
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (from === undefined || from === value || still) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = 720;
    setShown(from);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [id, value]);

  return <>{render(shown, kind, currency)}</>;
}
