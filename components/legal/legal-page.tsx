'use client';

import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Reveal } from '@/components/ui-kit/reveal';

/**
 * Shared shell for the three legal pages.
 *
 * ── Scope note ────────────────────────────────────────────────────────────
 * Final legal text is explicitly out of scope for this frontend pass and must
 * be drafted with the owners' Steuerberater / Fachanwalt. What this pass does
 * is remove the false data the pages previously published — a fabricated
 * address ("Musterstraße 1"), a fabricated VAT number ("DE XXX XXX XXX") and
 * the wrong company name — and replace it with an honest statement that the
 * entries are still being completed.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
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
