'use client';

/**
 * The conversion system.
 *
 * Exactly two CTA styles exist on this site, and their wording is fixed in
 * `ctaLabel` below so the same action is never called two different things.
 *
 *   primary   → the action we want (enquire, explore)
 *   secondary → the alternative, never competing visually
 *
 * Internal navigation always uses next/link, so no CTA triggers a full
 * document reload.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { type ReactNode } from 'react';
import type { Locale } from '@/lib/content/apartments';

/** Single source of truth for CTA wording, German-first. */
export const ctaLabel = {
  exploreApartments: { de: 'Apartments entdecken', en: 'Explore apartments' },
  requestAvailability: { de: 'Verfügbarkeit anfragen', en: 'Request availability' },
  viewApartment: { de: 'Apartment ansehen', en: 'View apartment' },
  writeWhatsApp: { de: 'Per WhatsApp schreiben', en: 'Message on WhatsApp' },
  contactUs: { de: 'Kontakt aufnehmen', en: 'Get in touch' },
  readJournal: { de: 'Zum Journal', en: 'Read the journal' },
  keepMePosted: { de: 'Informiert werden', en: 'Keep me posted' },
  back: { de: 'Zurück', en: 'Back' },
  send: { de: 'Anfrage senden', en: 'Send enquiry' },
  close: { de: 'Schließen', en: 'Close' },
} as const;

export function label(key: keyof typeof ctaLabel, locale: Locale): string {
  return ctaLabel[key][locale];
}

type Variant = 'primary' | 'secondary';

function classesFor(variant: Variant, invert: boolean, full: boolean) {
  const base = variant === 'primary' ? 'cta-primary' : 'cta-secondary';
  const inv = invert
    ? variant === 'primary'
      ? 'cta-primary-invert'
      : 'cta-secondary-invert'
    : '';
  return `${base} ${inv} ${full ? 'w-full' : ''}`.trim();
}

export function CtaLink({
  href,
  children,
  variant = 'primary',
  invert = false,
  full = false,
  withArrow = false,
  external = false,
  className = '',
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  invert?: boolean;
  full?: boolean;
  withArrow?: boolean;
  external?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const cls = `${classesFor(variant, invert, full)} group ${className}`;
  const content = (
    <>
      <span>{children}</span>
      {withArrow && (
        <ArrowRight
          className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={cls} aria-label={ariaLabel}>
      {content}
    </Link>
  );
}

export function CtaButton({
  onClick,
  children,
  variant = 'primary',
  invert = false,
  full = false,
  withArrow = false,
  disabled = false,
  type = 'button',
  className = '',
  ariaLabel,
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: Variant;
  invert?: boolean;
  full?: boolean;
  withArrow?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${classesFor(variant, invert, full)} group disabled:opacity-45 disabled:cursor-not-allowed disabled:transform-none ${className}`}
    >
      <span>{children}</span>
      {withArrow && (
        <ArrowRight
          className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
