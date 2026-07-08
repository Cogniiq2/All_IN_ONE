'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { Menu, X, ArrowUpRight, ExternalLink, Phone } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { LanguageToggle } from '@/components/shared/language-toggle';
import { BrandLogo } from '@/components/shared/brand-logo';

const navItems = [
  { key: 'residences', href: '/residences', tKey: 'nav.residences' },
  { key: 'bookDirect', href: '/book-direct', tKey: 'nav.bookDirect' },
  { key: 'bayreuth2026', href: '/bayreuth-2026', tKey: 'nav.bayreuth2026' },
  { key: 'journal', href: '/journal', tKey: 'nav.journal' },
  { key: 'reviews', href: '/reviews', tKey: 'nav.reviews' },
  { key: 'about', href: '/about', tKey: 'nav.about' },
  { key: 'contact', href: '/contact', tKey: 'nav.contact' },
];

function MagneticNavItem({
  item,
  isActive,
  transparent,
  label,
}: {
  item: typeof navItems[0];
  isActive: boolean;
  transparent: boolean;
  label: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 28 });
  const springY = useSpring(y, { stiffness: 300, damping: 28 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.22);
    y.set((e.clientY - cy) * 0.22);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      ref={ref as React.RefObject<HTMLAnchorElement>}
      href={item.href}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] transition-colors duration-300 group inline-block ${
        transparent
          ? isActive ? 'text-white' : 'text-white/48 hover:text-white'
          : isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span
        className="absolute bottom-1 left-4 right-4 h-px origin-center"
        style={{
          background: transparent
            ? 'linear-gradient(90deg, transparent, hsl(38 44% 74% / 0.9), transparent)'
            : 'linear-gradient(90deg, transparent, hsl(34 40% 50% / 0.8), transparent)',
          transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
          opacity: isActive ? 1 : 0,
          transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease',
        }}
      />
      <span
        className="absolute bottom-1 left-4 right-4 h-px origin-left opacity-0 group-hover:opacity-100 group-hover:[transform:scaleX(1)] [transform:scaleX(0)]"
        style={{
          background: transparent
            ? 'linear-gradient(90deg, hsl(38 44% 74% / 0.5), transparent)'
            : 'linear-gradient(90deg, hsl(34 40% 50% / 0.4), transparent)',
          transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease',
        }}
      />
    </motion.a>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useI18n();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docH > 0 ? (y / docH) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const isHeroPage = pathname === '/';
  const transparent = !scrolled && isHeroPage;

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-700"
        style={{
          background: transparent ? 'transparent' : 'hsl(36 22% 96% / 0.92)',
          backdropFilter: transparent ? 'none' : 'blur(32px) saturate(220%)',
          WebkitBackdropFilter: transparent ? 'none' : 'blur(32px) saturate(220%)',
          borderBottom: transparent ? '1px solid transparent' : '1px solid hsl(34 16% 85% / 0.4)',
          boxShadow: scrolled ? '0 1px 40px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        {/* Scroll progress */}
        <div
          className="absolute bottom-0 left-0 h-[1px] z-10 origin-left transition-all duration-150"
          style={{
            width: `${scrollProgress}%`,
            background: 'linear-gradient(90deg, hsl(34 40% 50% / 0.5), hsl(41 58% 64% / 1), hsl(34 40% 50% / 0.5))',
            opacity: scrollProgress > 1 ? 1 : 0,
          }}
        />

        <nav className="container-luxury flex items-center justify-between h-[68px] lg:h-[78px]">
          <Link href="/" aria-label="All in One Residences — Home" className="flex items-center shrink-0 group">
            <motion.div
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <BrandLogo size="md" light={transparent} />
            </motion.div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <MagneticNavItem
                  key={item.key}
                  item={item}
                  isActive={isActive}
                  transparent={transparent}
                  label={t(item.tKey)}
                />
              );
            })}

            <div className={`ml-4 pl-4 flex items-center gap-3 ${
              transparent ? 'border-l border-white/12' : 'border-l border-border/35'
            }`}>
              <LanguageToggle />
              <a
                href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
                target="_blank"
                rel="noopener noreferrer"
                className={`group hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium tracking-[0.1em] transition-all duration-350 ${
                  transparent
                    ? 'text-white/38 hover:text-white/75 border border-white/10 hover:border-white/24'
                    : 'text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/70'
                }`}
                style={{ borderRadius: 'var(--radius)' }}
                aria-label="Book on Booking.com"
              >
                Booking.com
                <ExternalLink className="w-2.5 h-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
              <Link
                href="/residences"
                className={`hidden xl:inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-semibold tracking-[0.1em] uppercase transition-all duration-350 ${
                  transparent
                    ? 'bg-white/12 text-white hover:bg-white/20 border border-white/18 hover:border-white/36'
                    : 'bg-foreground text-primary-foreground hover:opacity-90 border border-transparent'
                }`}
                style={{ borderRadius: 'var(--radius)' }}
                aria-label={transparent ? 'Residenzen entdecken' : 'Jetzt buchen'}
              >
                {transparent ? 'Entdecken' : 'Jetzt buchen'}
              </Link>
            </div>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-3 lg:hidden">
            <LanguageToggle />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`relative w-8 h-8 flex items-center justify-center transition-all duration-300 ${
                transparent
                  ? 'text-white border border-white/18 hover:border-white/38'
                  : 'text-foreground border border-border/40 hover:border-border/70'
              }`}
              style={{ borderRadius: 'var(--radius)' }}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileOpen ? (
                  <motion.div key="close" initial={{ rotate: -45, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 45, opacity: 0 }} transition={{ duration: 0.14 }}>
                    <X className="w-3.5 h-3.5" />
                  </motion.div>
                ) : (
                  <motion.div key="open" initial={{ rotate: 45, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -45, opacity: 0 }} transition={{ duration: 0.14 }}>
                    <Menu className="w-3.5 h-3.5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 40 }}
              className="absolute right-0 top-0 bottom-0 w-[84vw] max-w-[340px] flex flex-col shadow-2xl"
              style={{
                background: 'hsl(36 22% 96% / 0.98)',
                backdropFilter: 'blur(32px) saturate(200%)',
                borderLeft: '1px solid hsl(34 16% 85% / 0.5)',
              }}
            >
              <div className="flex items-center justify-between px-7 h-[68px] border-b" style={{ borderBottomColor: 'hsl(34 16% 85% / 0.45)' }}>
                <Link href="/" onClick={() => setMobileOpen(false)}>
                  <BrandLogo size="sm" />
                </Link>
                <button onClick={() => setMobileOpen(false)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <nav className="flex-1 px-7 py-8 overflow-y-auto">
                {navItems.map((item, i) => {
                  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                  return (
                    <motion.div
                      key={item.key}
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Link
                        href={item.href}
                        className={`flex items-center justify-between py-4 border-b text-[14.5px] transition-colors duration-200 ${
                          isActive ? 'text-foreground' : 'text-foreground/42 hover:text-foreground'
                        }`}
                        style={{ borderBottomColor: 'hsl(34 16% 85% / 0.28)' }}
                      >
                        <span className="font-serif tracking-tight">{t(item.tKey)}</span>
                        {isActive && (
                          <span style={{ color: 'hsl(34 40% 50%)' }}>
                            <ArrowUpRight className="w-3 h-3" />
                          </span>
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>

              <div className="px-7 pb-10 pt-5 border-t space-y-3" style={{ borderTopColor: 'hsl(34 16% 85% / 0.38)' }}>
                <a
                  href="https://wa.me/491601832917"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-foreground text-primary-foreground text-[10.5px] font-medium tracking-[0.1em] uppercase transition-opacity hover:opacity-85"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  WhatsApp
                </a>
                <a
                  href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-3 text-[10.5px] font-medium transition-all duration-300"
                  style={{
                    borderRadius: 'var(--radius)',
                    background: 'hsl(213 100% 17% / 0.05)',
                    border: '1px solid hsl(213 100% 40% / 0.18)',
                    color: 'hsl(213 100% 32%)',
                  }}
                >
                  Booking.com
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-foreground/22 backdrop-blur-sm -z-10"
              onClick={() => setMobileOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
