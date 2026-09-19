'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getArticleBySlug, getRelatedArticles, type Article } from '@/lib/articles';
import { apartments } from '@/lib/content/apartments';
import { Reveal } from '@/components/ui-kit/reveal';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * Article shell.
 *
 * Articles are structured data rather than bespoke page components, so a piece
 * cannot quietly reintroduce a claim about the apartments through hand-written
 * JSX, and every article inherits the same typography, spacing and internal
 * linking.
 */
export function ArticleClient({ slug }: { slug: string }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const article = getArticleBySlug(slug) as Article;
  const related = getRelatedArticles(slug);

  const date = new Date(article.publishedDate).toLocaleDateString(
    de ? 'de-DE' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <article className="section-pad-sm">
      <div className="container-narrow">
        <nav aria-label={de ? 'Brotkrumen-Navigation' : 'Breadcrumb'} className="mb-8">
          <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                {de ? 'Start' : 'Home'}
              </Link>
            </li>
            <ChevronRight className="w-3 h-3 opacity-50" aria-hidden="true" />
            <li>
              <Link href="/journal" className="hover:text-foreground transition-colors">
                Journal
              </Link>
            </li>
            <ChevronRight className="w-3 h-3 opacity-50" aria-hidden="true" />
            <li aria-current="page" className="text-foreground line-clamp-1">
              {article.category[locale]}
            </li>
          </ol>
        </nav>

        <Reveal>
          <header>
            <p className="eyebrow">{article.category[locale]}</p>
            <h1 className="display-1 mt-5">{article.title[locale]}</h1>
            <div className="mt-6 flex items-center gap-3 text-[13px] text-muted-foreground">
              <time dateTime={article.publishedDate}>{date}</time>
              <span aria-hidden="true">·</span>
              <span>{article.readTime[locale]}</span>
            </div>
            <div className="rule-hair mt-8" aria-hidden="true" />
          </header>
        </Reveal>

        <div className="mt-10">
          {article.body.map((block, i) => {
            switch (block.type) {
              case 'lead':
                return (
                  <Reveal key={i}>
                    <p className="text-[19px] leading-[1.68] text-foreground mb-7">
                      {block.text[locale]}
                    </p>
                  </Reveal>
                );

              case 'paragraph':
                return (
                  <Reveal key={i}>
                    <p className="text-[17px] leading-[1.75] text-muted-foreground mb-6">
                      {block.text[locale]}
                    </p>
                  </Reveal>
                );

              case 'heading':
                return (
                  <Reveal key={i}>
                    <h2 className="display-3 mt-12 mb-4">{block.text[locale]}</h2>
                  </Reveal>
                );

              case 'note':
                return (
                  <Reveal key={i}>
                    <aside
                      className="my-9 flex gap-4 p-6"
                      style={{
                        background: 'hsl(var(--secondary) / 0.7)',
                        borderLeft: '2px solid hsl(var(--champagne-dark))',
                        borderRadius: 'var(--radius-lg)',
                      }}
                    >
                      <Info
                        className="w-4 h-4 mt-1 shrink-0"
                        style={{ color: 'hsl(var(--champagne-dark))' }}
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-[15px] font-semibold">{block.title[locale]}</p>
                        <p className="body-copy mt-2 text-[15px]">{block.text[locale]}</p>
                      </div>
                    </aside>
                  </Reveal>
                );

              case 'quote':
                return (
                  <Reveal key={i}>
                    <blockquote className="my-10 pl-6" style={{ borderLeft: '2px solid hsl(var(--champagne))' }}>
                      <p className="font-serif text-[22px] leading-[1.4]">{block.text[locale]}</p>
                      {block.attribution && (
                        <footer className="mt-3 text-[13px] text-muted-foreground">
                          {block.attribution[locale]}
                        </footer>
                      )}
                    </blockquote>
                  </Reveal>
                );

              case 'list':
                return (
                  <Reveal key={i}>
                    <ol className="my-8 flex flex-col gap-4">
                      {block.items.map((item, index) => (
                        <li
                          key={item.title.de}
                          className="flex gap-4 p-5"
                          style={{
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 'var(--radius-lg)',
                            background: 'hsl(var(--card))',
                          }}
                        >
                          {/* Numbering is meaningful here: these are ordered
                              criteria the reader works through. */}
                          <span
                            className="font-serif text-[18px] leading-none pt-0.5 shrink-0"
                            style={{ color: 'hsl(var(--champagne-dark))' }}
                            aria-hidden="true"
                          >
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div>
                            <p className="text-[15px] font-semibold">{item.title[locale]}</p>
                            <p className="body-copy mt-1.5 text-[15px]">{item.text[locale]}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Reveal>
                );

              case 'link':
                return (
                  <Reveal key={i}>
                    <p className="my-8">
                      <Link href={block.href} className="link-quiet">
                        {block.label[locale]}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </p>
                  </Reveal>
                );

              default:
                return null;
            }
          })}
        </div>

        <Reveal>
          <aside
            className="mt-16 p-7 lg:p-9"
            style={{
              background: 'hsl(var(--secondary) / 0.6)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h2 className="display-3">{de ? 'Sie planen einen Aufenthalt?' : 'Planning a stay?'}</h2>
            <p className="body-copy mt-3 text-[14px]">
              {de
                ? `Wir vermieten ${apartments.length} eigene Apartments in der Bayreuther Innenstadt. Fragen Sie einfach Ihren Zeitraum an.`
                : `We let ${apartments.length} apartments of our own in central Bayreuth. Simply enquire about your dates.`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <EnquiryButton />
              <CtaLink href="/apartments" variant="secondary">
                {label('exploreApartments', locale)}
              </CtaLink>
            </div>
            {/* The third point of the cluster. Every article routes to the
                inventory and to the location page, not only to more reading. */}
            <p className="mt-5 text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {de ? 'Neu in Bayreuth? ' : 'New to Bayreuth? '}
              <Link href="/bayreuth-2026" className="link-quiet">
                {de ? 'Die Stadt und die Festspiele' : 'The town and the festival'}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </p>
          </aside>
        </Reveal>

        {related.length > 0 && (
          <Reveal>
            <section className="mt-14 pt-10" style={{ borderTop: '1px solid hsl(var(--border))' }}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-6">
                {de ? 'Weitere Beiträge' : 'More articles'}
              </h2>
              <ul className="grid gap-5 sm:grid-cols-2">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/journal/${item.slug}`}
                      className="card-surface group block h-full p-5"
                    >
                      <p className="eyebrow">{item.category[locale]}</p>
                      <p className="font-serif text-[17px] leading-snug mt-2.5 transition-colors group-hover:text-[hsl(var(--champagne-dark))]">
                        {item.title[locale]}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        {de ? 'Weiterlesen' : 'Read more'}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        )}
      </div>
    </article>
  );
}
