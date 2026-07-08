'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ExternalLink, ArrowUpRight, Phone, Mail, MapPin, Star } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { BrandLogo } from '@/components/shared/brand-logo';

function FooterLink({ href, label, delay }: { href: string; label: string; delay: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -5 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.44, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 text-[12px] leading-snug transition-all duration-300"
        style={{ color: 'hsl(218 8% 50%)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 75%)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 50%)'; }}
      >
        <span className="relative">
          {label}
          <span
            className="absolute -bottom-px left-0 h-px w-0 group-hover:w-full transition-all duration-380"
            style={{ background: 'hsl(38 44% 58% / 0.35)' }}
          />
        </span>
      </Link>
    </motion.li>
  );
}

function FooterColumnHeader({ label, delay }: { label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5"
    >
      <h4
        className="text-[8.5px] font-medium uppercase tracking-[0.3em]"
        style={{ color: 'hsl(38 44% 56% / 0.65)' }}
      >
        {label}
      </h4>
      <div
        className="mt-3.5"
        style={{ height: '0.5px', background: 'linear-gradient(90deg, hsl(38 44% 58% / 0.22), transparent 60%)' }}
      />
    </motion.div>
  );
}

function useFooterI18n() {
  const { t, locale } = useI18n();
  return { t, locale };
}

export function Footer() {
  const { t, locale } = useFooterI18n();

  return (
    <footer
      className="relative overflow-hidden"
      style={{ background: 'hsl(218 20% 9%)' }}
    >
      {/* Top border line */}
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '0.5px',
          background: 'linear-gradient(90deg, transparent, hsl(38 44% 58% / 0.32) 30%, hsl(41 58% 58% / 0.45) 50%, hsl(38 44% 58% / 0.32) 70%, transparent)',
          transformOrigin: 'center',
          pointerEvents: 'none',
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[40vh] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at top, hsl(38 44% 44% / 0.04), transparent 65%)' }}
      />

      {/* Decorative corner */}
      <div
        className="absolute top-0 right-0 w-40 h-40 pointer-events-none opacity-[0.03]"
        style={{ background: 'radial-gradient(circle at top right, hsl(38 44% 74%), transparent 65%)' }}
      />

      <div className="container-luxury pt-20 pb-12 lg:pt-28 lg:pb-14 relative">

        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-14 lg:gap-10 mb-16 lg:mb-20">

          {/* Brand column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href="/" className="inline-block mb-8" aria-label="All in One Residences — Home">
              <BrandLogo size="md" light />
            </Link>

            <p
              className="text-[13px] leading-[1.75] mb-8 max-w-[240px]"
              style={{ color: 'hsl(218 8% 46%)' }}
            >
              {t('footer.tagline')}
            </p>

            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.75, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mb-8"
              style={{
                transformOrigin: 'left',
                height: '0.5px',
                width: 40,
                background: 'linear-gradient(90deg, hsl(34 40% 50% / 0.5), transparent)',
              }}
            />

            <div className="space-y-2.5 mb-7">
              <a
                href="https://wa.me/491601832917"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-[12px] transition-colors duration-300 group"
                style={{ color: 'hsl(38 44% 56%)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(38 44% 72%)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(38 44% 56%)'; }}
              >
                <ArrowUpRight className="w-3 h-3 flex-shrink-0 opacity-60" />
                WhatsApp: +49 160 1832917
              </a>
              <a
                href="tel:+491601832917"
                className="flex items-center gap-2.5 text-[12px] transition-colors duration-300"
                style={{ color: 'hsl(218 8% 44%)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 68%)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 44%)'; }}
              >
                <Phone className="w-3 h-3 flex-shrink-0 opacity-50" />
                +49 160 1832917
              </a>
              <a
                href="mailto:info@allinone-residences.de"
                className="flex items-center gap-2.5 text-[12px] transition-colors duration-300"
                style={{ color: 'hsl(218 8% 44%)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 68%)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 44%)'; }}
              >
                <Mail className="w-3 h-3 flex-shrink-0 opacity-50" />
                info@allinone-residences.de
              </a>
              <div className="flex items-center gap-2.5 text-[12px]" style={{ color: 'hsl(218 8% 38%)' }}>
                <MapPin className="w-3 h-3 flex-shrink-0 opacity-50" />
                Sternplatz · 95444 Bayreuth
              </div>
            </div>

            <div
              className="inline-flex items-center gap-2.5 px-3.5 py-2 mb-7"
              style={{
                background: 'hsl(38 44% 48% / 0.08)',
                border: '1px solid hsl(38 44% 48% / 0.18)',
                borderRadius: 'var(--radius)',
              }}
            >
              <Star className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(41 58% 56%)' }} />
              <span className="text-[11px]" style={{ color: 'hsl(38 44% 62%)' }}>
                9.4 / 10 · 48+ {locale === 'de' ? 'Bewertungen' : 'reviews'}
              </span>
            </div>

            <a
              href="https://wa.me/491601832917"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-4 py-2.5 text-[10.5px] font-medium tracking-[0.08em] transition-all duration-380"
              style={{
                color: 'hsl(38 44% 62%)',
                border: '1px solid hsl(38 44% 48% / 0.2)',
                borderRadius: 'var(--radius)',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = 'hsl(38 44% 58% / 0.4)';
                el.style.color = 'hsl(38 44% 72%)';
                el.style.background = 'hsl(38 44% 58% / 0.06)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = 'hsl(38 44% 48% / 0.2)';
                el.style.color = 'hsl(38 44% 62%)';
                el.style.background = 'transparent';
              }}
            >
              {locale === 'de' ? 'Anfrage per WhatsApp' : 'Enquire via WhatsApp'}
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </motion.div>

          {/* Collections */}
          <div>
            <FooterColumnHeader label={t('footer.collections')} delay={0.06} />
            <ul className="space-y-3.5">
              {[
                { href: '/collections/sternplatz', label: t('nav.sternplatz') },
                { href: '/residences/maison-sternplatz', label: 'Maison Sternplatz' },
                { href: '/residences/loge-am-sternplatz', label: 'Loge am Sternplatz' },
                { href: '/residences/atelier-opernstrasse', label: 'Atelier Opernstraße' },
                { href: '/collections/altstadt', label: t('nav.altstadt') },
                { href: '/residences/belvedere-penthouse', label: 'Penthouse Belvédère' },
                { href: '/residences/designloft-innenstadt', label: 'Design Loft Innenstadt' },
                { href: '/residences', label: locale === 'de' ? 'Alle Residenzen →' : 'All residences →' },
              ].map((item, i) => (
                <FooterLink key={item.href} href={item.href} label={item.label} delay={0.1 + i * 0.03} />
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <FooterColumnHeader label={t('footer.company')} delay={0.12} />
            <ul className="space-y-3.5">
              {[
                { href: '/about', label: t('nav.about') },
                { href: '/contact', label: t('nav.contact') },
                { href: '/book-direct', label: t('nav.bookDirect') },
                { href: '/business-stays', label: locale === 'de' ? 'Geschäftsreisen' : 'Business Stays' },
                { href: '/long-stay', label: locale === 'de' ? 'Langzeitaufenthalte' : 'Long Stays' },
                { href: '/reviews', label: t('nav.reviews') },
                { href: '/journal', label: t('nav.journal') },
                { href: '/faq', label: 'FAQ' },
              ].map((item, i) => (
                <FooterLink key={item.href} href={item.href} label={item.label} delay={0.14 + i * 0.03} />
              ))}
            </ul>
          </div>

          {/* Legal + Coming Soon */}
          <div>
            <FooterColumnHeader label={t('footer.legal')} delay={0.18} />
            <ul className="space-y-3.5 mb-10">
              {[
                { href: '/impressum', label: t('footer.impressum') },
                { href: '/datenschutz', label: t('footer.datenschutz') },
                { href: '/agb', label: t('footer.agb') },
              ].map((item, i) => (
                <FooterLink key={item.href} href={item.href} label={item.label} delay={0.2 + i * 0.04} />
              ))}
            </ul>

            <FooterColumnHeader label={t('footer.comingSoon')} delay={0.3} />
            <ul className="space-y-3.5">
              {[
                { href: '/coming-soon/gelateria-michele', label: t('footer.gelateria') },
                { href: '/coming-soon/cafetaria-bayreuth', label: t('footer.cafetaria') },
              ].map((item, i) => (
                <FooterLink key={item.href} href={item.href} label={item.label} delay={0.34 + i * 0.045} />
              ))}
            </ul>
          </div>
        </div>

        {/* Divider line */}
        <div
          style={{ height: '0.5px', background: 'linear-gradient(90deg, transparent, hsl(218 12% 22%) 30%, hsl(218 12% 22%) 70%, transparent)' }}
        />

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, delay: 0.42 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-5"
        >
          <p
            className="text-[10.5px] tracking-[0.05em]"
            style={{ color: 'hsl(218 8% 34%)' }}
          >
            {t('footer.copyright')}
          </p>

          <div className="flex items-center gap-5">
            <span
              className="text-[9px] font-light uppercase tracking-[0.22em]"
              style={{ color: 'hsl(218 8% 32%)' }}
            >
              {locale === 'de' ? 'Bayreuth · Deutschland' : 'Bayreuth · Germany'}
            </span>
            <div style={{ width: '0.5px', height: 12, background: 'hsl(218 12% 22%)' }} />
            <a
              href="https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-[10px] tracking-[0.04em] transition-colors duration-300"
              style={{ color: 'hsl(218 8% 32%)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 60%)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(218 8% 32%)'; }}
            >
              Booking.com
              <ExternalLink className="w-2.5 h-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
