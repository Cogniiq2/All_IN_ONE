'use client';

import { useI18n } from '@/lib/i18n';
import { useEnquiry } from '@/components/enquiry/enquiry-context';
import { CtaButton, label } from '@/components/ui-kit/cta';

/**
 * The single way to open the enquiry dialog. Every "Verfügbarkeit anfragen"
 * on the site is this component, so the wording and behaviour cannot drift.
 */
export function EnquiryButton({
  apartmentSlug,
  variant = 'primary',
  invert = false,
  full = false,
  withArrow = false,
  className = '',
  children,
}: {
  apartmentSlug?: string;
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
      onClick={() => openEnquiry(apartmentSlug)}
      variant={variant}
      invert={invert}
      full={full}
      withArrow={withArrow}
      className={className}
    >
      {children ?? label('requestAvailability', locale)}
    </CtaButton>
  );
}
