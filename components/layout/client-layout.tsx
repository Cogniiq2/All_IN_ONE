'use client';

import { Suspense, type ReactNode } from 'react';
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
 * StayProvider reads useSearchParams, which Next requires to sit inside a
 * Suspense boundary — without one, every page using it opts out of static
 * rendering.
 */
export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <EnquiryStateProvider>
        <Suspense fallback={null}>
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
        </Suspense>
      </EnquiryStateProvider>
    </I18nProvider>
  );
}
