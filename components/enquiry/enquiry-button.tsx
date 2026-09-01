'use client';

import { useI18n } from '@/lib/i18n';
import { useEnquiry, type EnquiryKind } from '@/components/enquiry/enquiry-context';
import { CtaButton, label } from '@/components/ui-kit/cta';
import { BookingEntryButton } from '@/components/booking/booking-entry';

/**
 * One component, two journeys — and they no longer do the same thing.
 *
 *   kind="long-term"   opens the rental enquiry dialog. Unchanged: a tenancy
 *                      genuinely starts with a conversation, and this is the
 *                      single "Beratung anfragen" on the site.
 *
 *   kind="short-term"  begins the accommodation journey at /apartments. It
 *                      does NOT open a dialog. These CTAs — navbar, hero, page
 *                      feet — stand in front of no particular apartment, so
 *                      there is nothing for them to book yet; they hand the
 *                      visitor the apartments to choose from, and the booking
 *                      dialog opens from the one they pick.
 *
 * Routing the short-term kind here rather than at each call site is deliberate:
 * every generic booking CTA on the site is this component, so one change moves
 * all of them together and none can be left pointing at the old dialog.
 *
 * The older short-term enquiry form (components/enquiry/short-term-form.tsx) is
 * therefore no longer reachable from the public UI. It is kept, not deleted:
 * the dialog shell it lives in still serves the rental journey, and the form is
 * the ready-made fallback if a generic enquiry entry is ever wanted again.
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
  /** The unit the visitor is looking at, pre-selected in the rental form. */
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

  if (kind === 'short-term') {
    return (
      <BookingEntryButton
        variant={variant}
        invert={invert}
        full={full}
        withArrow={withArrow}
        className={className}
      >
        {children}
      </BookingEntryButton>
    );
  }

  return (
    <CtaButton
      onClick={() => openEnquiry({ kind, unitSlug: apartmentSlug })}
      variant={variant}
      invert={invert}
      full={full}
      withArrow={withArrow}
      className={className}
    >
      {children ?? label('requestConsultation', locale)}
    </CtaButton>
  );
}
