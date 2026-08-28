'use client';

import { useI18n } from '@/lib/i18n';
import { useEnquiry, type EnquiryKind } from '@/components/enquiry/enquiry-context';
import { CtaButton, label } from '@/components/ui-kit/cta';

/**
 * The single way to open an enquiry. Every "Verfügbarkeit anfragen" and every
 * "Beratung anfragen" on the site is this component, so the wording and
 * behaviour of each journey cannot drift.
 *
 * `kind` decides which conversation opens, and with it the default label:
 * accommodation asks about availability, renting asks for a conversation. The
 * two are never the same button with different text.
 */
export function EnquiryButton({
  apartmentSlug,
  kind = 'short-term',
  variant = 'primary',
  invert = false,
  full = false,
  withArrow = false,
  className = '',
  children,
}: {
  /** The unit the visitor is looking at, pre-selected in the form. */
  apartmentSlug?: string;
  kind?: EnquiryKind;
  variant?: 'primary' | 'secondary';
  invert?: boolean;
  full?: boolean;
  withArrow?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const { locale } = useI18n();
  const { openEnquiry } = useEnquiry();

  return (
    <CtaButton
      onClick={() => openEnquiry({ kind, unitSlug: apartmentSlug })}
      variant={variant}
      invert={invert}
      full={full}
      withArrow={withArrow}
      className={className}
    >
      {children ??
        label(kind === 'long-term' ? 'requestConsultation' : 'requestAvailability', locale)}
    </CtaButton>
  );
}
