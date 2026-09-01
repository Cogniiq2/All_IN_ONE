'use client';

/**
 * Mobile sticky action bar for apartment detail pages.
 *
 * This replaces the previous floating WhatsApp bubble, which sat on every page
 * regardless of context and overlapped content. Contact is now offered where
 * a decision is actually being made, and only on small screens where the page
 * CTA has scrolled away.
 *
 * ── Apartment-specific, so it books ──────────────────────────────────────
 * Unlike the generic "Jetzt buchen" in the navbar or the hero, this bar always
 * stands in front of one known apartment — it only renders on that apartment's
 * page. So it opens the booking dialog for that unit, exactly as the sidebar
 * CTA above it does, rather than the older enquiry form it used to open.
 */

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { contact } from '@/lib/content/brand';
import { getApartment } from '@/lib/content/apartments';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { label } from '@/components/ui-kit/cta';

export function StickyEnquiryBar({ apartmentSlug }: { apartmentSlug?: string }) {
  const { locale } = useI18n();
  const { openBooking } = useUnitFlow();
  const [visible, setVisible] = useState(false);
  const apartment = apartmentSlug ? getApartment(apartmentSlug) : undefined;

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
          onClick={() => apartment && openBooking(apartment)}
          className="cta-primary flex-1"
          tabIndex={visible ? 0 : -1}
        >
          {label('bookNow', locale)}
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
