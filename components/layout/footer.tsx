'use client';

import Link from 'next/link';
import { Bot, MessageCircle, Phone } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { LogoLockup, Monogram } from '@/components/brand/logo';
import { brand, contact } from '@/lib/content/brand';
import { apartments } from '@/lib/content/apartments';

/**
 * Footer.
 *
 * Removed from the previous version: the invented 9.4/10 rating badge, the
 * five fabricated apartment links, the review count, the Booking.com
 * cross-links (we have no verified listing to point at) and the two
 * abandoned "coming soon" pages.
 */
export function Footer() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const year = 2026;

  const columns = [
    {
      title: de ? 'Apartments' : 'Apartments',
      links: [
        ...apartments.map((a) => ({
          href: `/apartments/${a.slug}`,
          label: a.name[locale],
        })),
        { href: '/apartments', label: de ? 'Alle Apartments' : 'All apartments' },
      ],
    },
    {
      title: de ? 'BoLaGio' : 'BoLaGio',
      links: [
        { href: '/about', label: de ? 'Über uns' : 'About us' },
        { href: '/mieten', label: de ? 'Mieten — Wohnraum & Gewerbe' : 'Long-term rental' },
        { href: '/book-direct', label: de ? 'Direkt anfragen' : 'Book direct' },
        { href: '/bayreuth-2026', label: de ? 'Bayreuth & Festspiele' : 'Bayreuth & the Festival' },
        { href: '/journal', label: 'Journal' },
        { href: '/faq', label: de ? 'Häufige Fragen' : 'FAQ' },
        { href: '/contact', label: de ? 'Kontakt' : 'Contact' },
      ],
    },
    {
      title: de ? 'Rechtliches' : 'Legal',
      links: [
        { href: '/impressum', label: 'Impressum' },
        { href: '/datenschutz', label: de ? 'Datenschutz' : 'Privacy' },
        { href: '/agb', label: de ? 'AGB' : 'Terms' },
      ],
    },
  ];

  return (
    <footer style={{ background: 'hsl(var(--ink))' }}>
      <div className="container-luxury pt-16 pb-10 lg:pt-24 lg:pb-12">
        <div className="grid gap-12 lg:gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <Link href="/" aria-label={`${brand.name} — Home`} className="inline-block mb-6">
              <LogoLockup size="lg" invert />
            </Link>

            <p
              className="text-[14px] leading-relaxed max-w-[280px] mb-7"
              style={{ color: 'hsl(var(--on-dark-muted))' }}
            >
              {de
                ? 'Familiengeführte Apartments in der Bayreuther Innenstadt. Wir vermieten, was uns selbst gehört — und kümmern uns persönlich darum.'
                : 'Family-run apartments in central Bayreuth. We let what we own ourselves — and look after it personally.'}
            </p>

            <div className="flex flex-col gap-2.5">
              <a
                href={contact.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 text-[14px] transition-colors"
                style={{ color: 'hsl(var(--on-dark-gold))' }}
              >
                <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                WhatsApp
              </a>
              <a
                href={contact.phoneHref}
                className="inline-flex items-center gap-2.5 text-[14px] transition-colors"
                style={{ color: 'hsl(var(--on-dark-muted))' }}
              >
                <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
                {contact.phone}
              </a>
              {/* No email address is shown: none has been confirmed yet.
                  See contact.email in lib/content/brand.ts */}
            </div>

            <p className="mt-6 text-[13px]" style={{ color: 'hsl(var(--on-dark-muted) / 0.7)' }}>
              {contact.street} · {contact.postalCode} {brand.city}
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h2
                className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-5"
                style={{ color: 'hsl(var(--on-dark-gold))' }}
              >
                {col.title}
              </h2>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[14px] transition-colors hover:opacity-100"
                      style={{ color: 'hsl(var(--on-dark-muted) / 0.82)' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-14 pt-7 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ borderTop: '1px solid hsl(var(--on-dark) / 0.12)' }}
        >
          <div className="flex items-center gap-5">
            <p className="text-[12px]" style={{ color: 'hsl(var(--on-dark-muted) / 0.65)' }}>
              © {year} {brand.name} · {brand.city}
            </p>
            <Monogram size="sm" invert className="sm:hidden" />
          </div>

          <div className="flex items-center gap-5">
            <Monogram size="sm" invert className="hidden sm:block" />
            <AgencyCredit />
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * "Powered by Cogniiq" — a discreet signature, not a badge.
 *
 * "Powered by" is fixed in both locales — not translated to "Umgesetzt von"
 * or similar — because that is the exact wording requested for this credit,
 * independent of the site's own DE/EN copy elsewhere.
 *
 * A plain external link: no script runs and no request fires until it is
 * clicked. It sits beside the monogram on desktop and stacks naturally under
 * the rest of the footer on mobile, per the brief — never `position: fixed`.
 */
function AgencyCredit() {
  return (
    <p className="flex items-center gap-2 text-[12px]" style={{ color: 'hsl(var(--on-dark-muted) / 0.6)' }}>
      <span>Powered by</span>
      <a
        href="https://cogniiq.de"
        target="_blank"
        rel="noopener noreferrer"
        className="agency-credit-link inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium tracking-[0.01em]"
      >
        Cogniiq
        <Bot className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
      </a>
    </p>
  );
}
