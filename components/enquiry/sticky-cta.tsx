'use client';

/**
 * Mobile sticky action bar for apartment detail pages.
 *
 * This replaces the previous floating WhatsApp bubble, which sat on every page
 * regardless of context and overlapped content. Contact is now offered where
 * a decision is actually being made, and only on small screens where the page
 * CTA has scrolled away.
 */

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { contact } from '@/lib/content/brand';
import { useEnquiry } from '@/components/enquiry/enquiry-context';
import { label } from '@/components/ui-kit/cta';

export function StickyEnquiryBar({ apartmentSlug }: { apartmentSlug?: string }) {
  const { locale } = useI18n();
  const { openEnquiry } = useEnquiry();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{
        background: 'hsl(var(--background) / 0.96)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderTop: '1px solid hsl(var(--border))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => openEnquiry(apartmentSlug)}
          className="cta-primary flex-1"
          tabIndex={visible ? 0 : -1}
        >
          {label('requestAvailability', locale)}
        </button>
        <a
          href={contact.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="cta-secondary shrink-0 !px-4"
          aria-label={label('writeWhatsApp', locale)}
          tabIndex={visible ? 0 : -1}
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
