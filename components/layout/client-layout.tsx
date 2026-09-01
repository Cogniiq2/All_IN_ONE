'use client';

import { type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { I18nProvider } from '@/lib/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { EnquiryStateProvider } from '@/components/enquiry/enquiry-context';
import { EnquiryDialog } from '@/components/enquiry/enquiry-dialog';
import { StayProvider } from '@/lib/booking/stay-context';
import { UnitFlowProvider } from '@/components/units/unit-flow-context';
import { UnitDetailModal } from '@/components/units/unit-detail-modal';
import { BookingModal } from '@/components/booking/booking-modal';
import { AppointmentModal } from '@/components/rental/appointment-modal';

/**
 * Providers, outermost first.
 *
 *   I18n            language
 *   Enquiry         the older contact dialog, still reached from /contact
 *   Stay            dates and guests, carried from the hero bar onward
 *   UnitFlow        which unit is open and how far into its journey
 *
 * The three unit modals are mounted once here rather than per page, so a card
 * on the homepage, on /apartments and on /mieten all open the same instance and
 * the flow survives navigation.
 *
 * `MotionConfig reducedMotion="user"` makes framer honour the OS setting for
 * every animation on the site at once: transform and layout animations are
 * dropped, opacity is kept. Components therefore render the same tree for
 * everyone — which matters, because branching on `useReducedMotion()` produced
 * server markup that did not match the client and threw away the whole
 * server-rendered page on hydration for those users.
 *
 * There is deliberately no Suspense boundary here. An earlier version wrapped
 * this whole tree in one so StayProvider could call `useSearchParams`, which
 * silently opted every page out of static rendering: the prerendered body was
 * empty, so crawlers and first paint got nothing until hydration. StayProvider
 * now reads the query string in an effect instead, and the full markup is
 * server-rendered again.
 */
export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <MotionConfig reducedMotion="user">
      <EnquiryStateProvider>
        <StayProvider>
          <UnitFlowProvider>
            <a href="#main" className="skip-link">
              Zum Inhalt springen
            </a>
            <Navbar />
            {/* Every page clears the fixed header here. The homepage hero opts
                out with a matching negative margin so it can run full-bleed. */}
            <main id="main" className="pt-[70px] lg:pt-[84px]">{children}</main>
            <Footer />
            <EnquiryDialog />
            <UnitDetailModal />
            <BookingModal />
            <AppointmentModal />
          </UnitFlowProvider>
        </StayProvider>
      </EnquiryStateProvider>
      </MotionConfig>
    </I18nProvider>
  );
}
