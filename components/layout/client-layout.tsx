'use client';

import { type ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { EnquiryStateProvider } from '@/components/enquiry/enquiry-context';
import { EnquiryDialog } from '@/components/enquiry/enquiry-dialog';

export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <EnquiryStateProvider>
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        <Navbar />
        {/* Every page clears the fixed header here. The homepage hero opts out
            with a matching negative margin so it can run full-bleed. */}
        <main id="main" className="pt-[70px] lg:pt-[84px]">{children}</main>
        <Footer />
        <EnquiryDialog />
      </EnquiryStateProvider>
    </I18nProvider>
  );
}
