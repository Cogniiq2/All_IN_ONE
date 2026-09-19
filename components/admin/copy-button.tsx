'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Click-to-copy for references and external ids. The confirmation is a
 * quiet colour shift and a checkmark for 1.4 seconds; the value itself is the
 * label, so screen readers read it once and hear "copied" via the live
 * region. Nothing copied is ever written anywhere else.
 */
export function CopyButton({ value, children, className }: { value: string; children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied: nothing to do, and nothing to shout about.
    }
  };

  return (
    <button type="button" className={`bc-copy ${className ?? ''}`} onClick={copy} data-copied={copied ? 'true' : undefined} title="Copy" aria-label={`Copy ${value}`}>
      <span className="truncate">{children ?? value}</span>
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}
