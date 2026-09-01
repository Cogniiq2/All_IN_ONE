'use client';

/**
 * The generic entry into the accommodation journey.
 *
 * "Jetzt buchen" in the navbar, in the hero, at the foot of a page — none of
 * these stand in front of a particular apartment, so none of them can open a
 * booking: there is nothing yet to book. They begin the journey instead, at the
 * one place where a visitor picks a unit:
 *
 *     generic "Jetzt buchen"  →  /apartments  →  card → detail → BookingModal
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * These CTAs used to open the older short-term enquiry dialog — a long form
 * asking for apartment, dates, guests, name, email, phone and a message before
 * the visitor had seen a single apartment. That is the opposite of a booking-
 * first journey, and it bypassed the approved card → detail → booking flow
 * entirely.
 *
 * An apartment-specific "Jetzt buchen" is a different control and is NOT this
 * component: inside the detail modal, on an apartment page and in the mobile
 * sticky bar, the unit is known and the CTA opens the booking dialog directly.
 *
 * Any dates and party size the visitor already chose in the hero panel ride
 * along in the query string, so the selection survives the hop and arrives
 * pre-filled in the booking dialog (lib/booking/stay-context.tsx).
 *
 * Visually this is the site's existing CTA, unchanged — CtaLink and CtaButton
 * share one class system, so swapping a button for a link changes nothing that
 * is visible.
 */

import { useStay } from '@/lib/booking/stay-context';
import { useI18n } from '@/lib/i18n';
import { CtaLink, label } from '@/components/ui-kit/cta';

export function BookingEntryButton({
  variant = 'primary',
  invert = false,
  full = false,
  withArrow = false,
  className = '',
  children,
}: {
  variant?: 'primary' | 'secondary';
  invert?: boolean;
  full?: boolean;
  withArrow?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const { locale } = useI18n();
  const { toQueryString } = useStay();

  return (
    <CtaLink
      href={`/apartments${toQueryString()}`}
      variant={variant}
      invert={invert}
      full={full}
      withArrow={withArrow}
      className={className}
    >
      {children ?? label('bookNow', locale)}
    </CtaLink>
  );
}
