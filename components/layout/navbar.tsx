'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { LanguageToggle } from '@/components/shared/language-toggle';
import { LogoLockup } from '@/components/brand/logo';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { brand } from '@/lib/content/brand';

/**
 * Navigation is deliberately short: discovery → evaluation → enquiry.
 * Every internal link is a next/link, so nothing triggers a document reload.
 * (The previous navbar used <motion.a href> on desktop and full-reloaded the
 * whole application on every click.)
 *
 * ── What the items are, and are not ──────────────────────────────────────
 * The nav names the two things BoLaGio offers — Apartments (nights) and
 * Mieten (a tenancy) — followed by context and contact. The filled CTA beside
 * them is the accommodation action, so the two business models are visually
 * distinct: a link for renting, a button for staying.
 *
 * "Direkt anfragen" was removed from the primary nav: it is a *process*, not a
 * product category, and it competed with the CTA that performs it. The route
 * is untouched and still live — it keeps its URL, its metadata and its sitemap
 * entry, and is reached from the homepage section and the footer.
 */
const navItems = [
  { href: '/apartments', de: 'Apartments', en: 'Apartments' },
  { href: '/mieten', de: 'Mieten', en: 'Long-term rental' },
  { href: '/bayreuth-2026', de: 'Bayreuth', en: 'Bayreuth' },
  { href: '/journal', de: 'Journal', en: 'Journal' },
  { href: '/about', de: 'Über uns', en: 'About' },
  { href: '/contact', de: 'Kontakt', en: 'Contact' },
];

export function Navbar() {
  const { locale } = useI18n();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const onHero = pathname === '/';
  const transparent = onHero && !scrolled;

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-colors duration-500 ${
          transparent ? '' : 'glass-surface'
        }`}
      >
        <nav
          className="container-luxury flex items-center justify-between h-[70px] lg:h-[84px]"
          aria-label={locale === 'de' ? 'Hauptnavigation' : 'Main navigation'}
        >
          <Link href="/" aria-label={`${brand.name} — Home`} className="shrink-0">
            <LogoLockup size="md" invert={transparent} />
          </Link>

          {/* Desktop */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="relative px-3.5 py-2 text-[13px] font-medium transition-colors duration-300"
                  style={{
                    color: transparent
                      ? active
                        ? 'hsl(var(--on-dark))'
                        : 'hsl(var(--on-dark) / 0.72)'
                      : active
                      ? 'hsl(var(--foreground))'
                      : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {item[locale]}
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 right-3.5 bottom-0.5 h-px origin-left transition-transform duration-300"
                    style={{
                      background: transparent
                        ? 'hsl(var(--on-dark-gold))'
                        : 'hsl(var(--champagne-dark))',
                      transform: active ? 'scaleX(1)' : 'scaleX(0)',
                    }}
                  />
                </Link>
              );
            })}

            <div
              className="ml-4 pl-4 flex items-center gap-3 border-l"
              style={{
                borderColor: transparent
                  ? 'hsl(var(--on-dark) / 0.22)'
                  : 'hsl(var(--border))',
              }}
            >
              <LanguageToggle invert={transparent} />
              <EnquiryButton
                invert={transparent}
                className="!min-h-[42px] !py-2.5 !px-5 !text-[12px]"
              />
            </div>
          </div>

          {/* Mobile */}
          <div className="flex items-center gap-2 lg:hidden">
            <LanguageToggle invert={transparent} />
            <button
              onClick={() => setMobileOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-sm transition-colors"
              style={{
                color: transparent ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))',
                border: `1px solid ${
                  transparent ? 'hsl(var(--on-dark) / 0.28)' : 'hsl(var(--border))'
                }`,
              }}
              aria-label={locale === 'de' ? 'Menü öffnen' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] lg:hidden"
          >
            <div
              className="absolute inset-0"
              style={{ background: 'hsl(var(--ink) / 0.45)' }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={reduce ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 38 }}
              className="absolute right-0 top-0 bottom-0 w-[86vw] max-w-[360px] flex flex-col bg-background shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label={locale === 'de' ? 'Navigation' : 'Navigation'}
            >
              <div className="flex items-center justify-between px-6 h-[70px] border-b border-border">
                <LogoLockup size="sm" descriptor={false} />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-11 h-11 -mr-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={locale === 'de' ? 'Menü schließen' : 'Close menu'}
                  autoFocus
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-6 py-4">
                <ul>
                  {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className="flex items-center justify-between py-4 border-b border-border/70 text-[17px] font-serif transition-colors"
                          style={{
                            color: active
                              ? 'hsl(var(--foreground))'
                              : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {item[locale]}
                          {active && (
                            <span
                              aria-hidden="true"
                              className="w-1.5 h-1.5 rotate-45"
                              style={{ background: 'hsl(var(--champagne-dark))' }}
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="px-6 pt-4 pb-8 border-t border-border">
                <EnquiryButton full />
                {/* The rental path, subordinate to the accommodation CTA but
                    reachable in one tap from the drawer. */}
                <Link
                  href="/mieten"
                  className="mt-4 flex min-h-[44px] items-center justify-center text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {locale === 'de'
                    ? 'Dauerhaft mieten — Wohnraum & Gewerbe'
                    : 'Long-term rental — residential & commercial'}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
