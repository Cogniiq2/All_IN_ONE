'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Search, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { faqs } from '@/lib/faq';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function FAQClient() {
  const { locale } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFaqs = faqs.filter((faq) =>
    faq.question[locale].toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = Array.from(new Set(faqs.map((f) => f.category[locale])));

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <li><Link href="/" className="hover:text-foreground transition-colors">{locale === 'de' ? 'Startseite' : 'Home'}</Link></li>
              <li><ArrowRight className="w-3 h-3 opacity-40" /></li>
              <li className="text-foreground font-medium">FAQ</li>
            </ol>
          </nav>
        </SectionReveal>
        <SectionReveal>
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-4">
              {locale === 'de' ? 'Häufige Fragen' : 'Frequently Asked Questions'}
            </h1>
            <p className="text-muted-foreground mb-8">
              {locale === 'de'
                ? 'Alles, was Sie für Ihren Aufenthalt wissen müssen'
                : 'Everything you need to know for your stay'}
            </p>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={locale === 'de' ? 'Frage suchen...' : 'Search questions...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-secondary border border-border rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-champagne"
              />
            </div>
          </div>
        </SectionReveal>

        <div className="max-w-3xl mx-auto">
          {categories.map((category, catIdx) => {
            const categoryFaqs = filteredFaqs.filter((f) => f.category[locale] === category);
            if (categoryFaqs.length === 0) return null;

            return (
              <SectionReveal key={category} delay={catIdx * 0.05}>
                <div className="mb-12">
                  <h2 className="font-serif text-xl font-semibold mb-6">{category}</h2>
                  <div className="space-y-2">
                    {categoryFaqs.map((faq) => (
                      <div
                        key={faq.id}
                        className="border border-border/40 rounded-lg overflow-hidden bg-card"
                      >
                        <button
                          onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                          className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors"
                        >
                          <span className="text-sm font-medium pr-4">{faq.question[locale]}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                              openId === faq.id ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <AnimatePresence>
                          {openId === faq.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-5 pt-1">
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {faq.answer[locale]}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionReveal>
            );
          })}
        </div>

        <SectionReveal>
          <div className="max-w-2xl mx-auto text-center mt-16 pt-12 border-t border-champagne/20">
            <h3 className="font-serif text-xl font-semibold mb-3">
              {locale === 'de' ? 'Weitere Fragen?' : 'More questions?'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {locale === 'de'
                ? 'Unser Team steht Ihnen gerne zur Verfügung — per WhatsApp, Telefon oder E-Mail. Antwort in unter 2 Stunden.'
                : 'Our team is happy to help — via WhatsApp, phone, or email. Reply within 2 hours.'}
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href="https://wa.me/491601832917"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-foreground text-primary-foreground rounded-sm text-sm font-medium tracking-wide hover:opacity-90 transition-opacity"
              >
                WhatsApp
              </a>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-7 py-3 border border-border/60 rounded-sm text-sm font-medium tracking-wide hover:border-champagne/40 transition-colors"
              >
                {locale === 'de' ? 'Kontakt aufnehmen' : 'Get in touch'}
              </Link>
            </div>
          </div>
        </SectionReveal>

        <SectionReveal>
          <div className="mt-12 pt-10 border-t border-border/30">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-6 text-center">
              {locale === 'de' ? 'Nächste Schritte' : 'Next steps'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
              {[
                { href: '/residences', label: locale === 'de' ? 'Residenzen ansehen' : 'View residences', sub: locale === 'de' ? '5 Apartments, ab €109' : '5 apartments, from €109' },
                { href: '/book-direct', label: locale === 'de' ? 'Direkt buchen' : 'Book direct', sub: locale === 'de' ? 'Beste Konditionen' : 'Best rates' },
                { href: '/bayreuth-2026', label: locale === 'de' ? 'Festspiele 2026' : 'Festival 2026', sub: locale === 'de' ? 'Jetzt sichern' : 'Secure now' },
                { href: '/reviews', label: locale === 'de' ? 'Bewertungen' : 'Reviews', sub: '9.4/10 · 48+' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group p-4 rounded-sm border border-border/40 hover:border-champagne/30 transition-all duration-300 hover:shadow-sm text-center"
                >
                  <p className="font-medium text-[12px] mb-1 group-hover:text-champagne transition-colors">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}
