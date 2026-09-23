'use client';

import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Reveal } from '@/components/ui-kit/reveal';

/**
 * Shared shell for the three legal pages.
 *
 * ── Scope note ────────────────────────────────────────────────────────────
 * Final legal text must be approved with the owners' Steuerberater /
 * Fachanwalt. Facts come from lib/legal/company.ts and lib/legal/processors.ts;
 * a fact that is not verified renders as a visible "wird ergänzt" (see
 * `Pending`), never as a plausible-looking guess. The closing review note
 * stays until the page's text is recorded as approved (`reviewed`).
 */
export function LegalPage({
  title,
  intro,
  reviewed = false,
  children,
}: {
  title: string;
  intro?: string;
  /** True once the page's text is recorded as approved in lib/legal/*. */
  reviewed?: boolean;
  children: ReactNode;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <div className="section-pad-sm">
      <div className="container-narrow">
        <Reveal>
          <h1 className="display-2">{title}</h1>
          {intro && <p className="lede mt-5">{intro}</p>}
          <div className="rule-hair mt-8" aria-hidden="true" />
        </Reveal>

        <div className="mt-10 space-y-9">{children}</div>

        {!reviewed && (
        <Reveal>
          <p
            className="mt-14 p-5 text-[13px] leading-relaxed"
            style={{
              background: 'hsl(var(--secondary) / 0.6)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius-lg)',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            {de
              ? 'Diese Seite wird vor der Veröffentlichung der Website vervollständigt und rechtlich geprüft.'
              : 'This page will be completed and legally reviewed before the website goes live.'}
          </p>
        </Reveal>
        )}
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Reveal>
      <section>
        <h2 className="display-3 mb-3">{heading}</h2>
        <div className="body-copy space-y-3">{children}</div>
      </section>
    </Reveal>
  );
}

/**
 * A mandatory fact that has not been supplied yet. Rendered visibly, in the
 * page's own voice, and marked for anyone searching the DOM — never replaced
 * by a plausible-looking placeholder.
 */
export function Pending({ locale }: { locale: 'de' | 'en' }) {
  return (
    <span data-legal-pending="true" style={{ color: 'hsl(var(--muted-foreground))' }}>
      {locale === 'de' ? 'wird vor Veröffentlichung ergänzt' : 'to be completed before publication'}
    </span>
  );
}
