'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { articles } from '@/lib/articles';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function JournalClient() {
  const { locale } = useI18n();

  const featured = articles.find((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">

        <SectionReveal>
          <div className="mb-16 lg:mb-20">
            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-4">
              {locale === 'de' ? 'Einblicke & Geschichten' : 'Insights & Stories'}
            </span>
            <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-4">
              {locale === 'de' ? 'Bayreuth Journal' : 'Bayreuth Journal'}
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
              {locale === 'de'
                ? 'Über Bayreuth, Wagner, das Reisen und den kleinen Unterschied, der aus einem Aufenthalt eine Erinnerung macht.'
                : 'On Bayreuth, Wagner, travel, and the small difference that turns a stay into a memory.'}
            </p>
          </div>
        </SectionReveal>

        {featured && (
          <SectionReveal>
            <Link href={`/journal/${featured.slug}`} className="block group mb-16 lg:mb-20">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-xl overflow-hidden border border-border/60 hover:border-champagne/40 transition-all duration-500 bg-card">
                <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[420px] overflow-hidden">
                  <Image
                    src={featured.image}
                    alt={featured.title[locale]}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                </div>
                <div className="p-8 lg:p-12 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-champagne">
                      {featured.category[locale]}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-[11px] text-muted-foreground">{featured.publishedDate[locale]}</span>
                  </div>
                  <h2 className="font-serif text-2xl lg:text-3xl xl:text-4xl font-semibold mb-5 group-hover:text-champagne transition-colors duration-300 leading-snug">
                    {featured.title[locale]}
                  </h2>
                  <p className="text-muted-foreground leading-relaxed mb-8 text-base max-w-lg">
                    {featured.excerpt[locale]}
                  </p>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {featured.readTime[locale]}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-champagne group-hover:gap-2.5 transition-all duration-300">
                      {locale === 'de' ? 'Weiterlesen' : 'Read more'}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </SectionReveal>
        )}

        <div className="mb-10">
          <div className="flex items-center gap-4">
            <h2 className="font-serif text-xl font-semibold">
              {locale === 'de' ? 'Alle Beiträge' : 'All articles'}
            </h2>
            <div className="flex-1 h-px bg-border/50" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rest.map((article, i) => (
            <SectionReveal key={article.slug} delay={i * 0.07}>
              <Link href={`/journal/${article.slug}`} className="block group h-full">
                <div className="bg-card rounded-lg overflow-hidden border border-border/60 hover:border-champagne/40 transition-all duration-300 h-full flex flex-col">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={article.image}
                      alt={article.title[locale]}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2.5 mb-4">
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.16em] text-champagne">
                        {article.category[locale]}
                      </span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="text-[10px] text-muted-foreground">{article.publishedDate[locale]}</span>
                    </div>
                    <h3 className="font-serif text-lg font-semibold mb-3 group-hover:text-champagne transition-colors duration-300 leading-snug flex-1">
                      {article.title[locale]}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-5 line-clamp-3 leading-relaxed">
                      {article.excerpt[locale]}
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/40">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {article.readTime[locale]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground group-hover:text-champagne transition-colors duration-300">
                        {locale === 'de' ? 'Weiterlesen' : 'Read more'}
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </SectionReveal>
          ))}
        </div>

        {/* Internal linking CTA */}
        <SectionReveal>
          <div className="mt-20 pt-12 border-t border-border/30">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="font-serif text-2xl font-semibold mb-3">
                  {locale === 'de' ? 'Bereit für Ihren Aufenthalt in Bayreuth?' : 'Ready for your stay in Bayreuth?'}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  {locale === 'de'
                    ? '5 exklusive Serviced Apartments im Zentrum — direkt buchbar, ohne Aufpreis.'
                    : '5 exclusive serviced apartments in the city center — book direct, no markup.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/residences"
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-foreground text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity group"
                  >
                    {locale === 'de' ? 'Residenzen entdecken' : 'Explore residences'}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/book-direct"
                    className="inline-flex items-center gap-2 px-6 py-2.5 border border-border/60 rounded-sm text-sm font-medium hover:border-champagne/40 transition-colors"
                  >
                    {locale === 'de' ? 'Direkt buchen' : 'Book direct'}
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { href: '/bayreuth-2026', label: locale === 'de' ? 'Festspiele 2026' : 'Festival 2026', sub: locale === 'de' ? 'Unterkunft sichern' : 'Secure accommodation' },
                  { href: '/business-stays', label: locale === 'de' ? 'Geschäftsreisen' : 'Business stays', sub: locale === 'de' ? 'Dienstreise & Projekt' : 'Work trips' },
                  { href: '/long-stay', label: locale === 'de' ? 'Langzeitaufenthalt' : 'Long stays', sub: locale === 'de' ? 'Ab 7 Nächten' : 'From 7 nights' },
                  { href: '/faq', label: 'FAQ', sub: locale === 'de' ? 'Alle Fragen beantwortet' : 'All questions answered' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group p-4 rounded-sm border border-border/40 hover:border-champagne/30 transition-all duration-300"
                  >
                    <p className="font-medium text-[12px] mb-1 group-hover:text-champagne transition-colors">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </SectionReveal>

      </div>
    </div>
  );
}
