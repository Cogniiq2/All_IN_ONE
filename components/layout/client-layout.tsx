'use client';

import { type ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { WhatsAppFloat } from '@/components/shared/whatsapp-float';

export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <Navbar />
      <main className="min-h-screen pt-16 lg:pt-20">{children}</main>
      <Footer />
      <WhatsAppFloat />
    </I18nProvider>
  );
}
