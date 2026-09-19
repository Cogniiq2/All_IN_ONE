'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { articles } from '@/lib/articles';
import { Reveal } from '@/components/ui-kit/reveal';
import { CtaLink, label } from '@/components/ui-kit/cta';

function formatDate(iso: string, locale: 'de' | 'en') {
  return new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function JournalClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  /* The topics actually covered, derived from the articles themselves. At this
     length a reader is better served by seeing the range at a glance than by
     the list being split into five one-item sections. */
  const categories = Array.from(new Set(articles.map((a) => a.category[locale])));

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">Journal</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[15ch]">
              {de ? 'Notizen aus Bayreuth' : 'Notes from Bayreuth'}
            </h1>
            <p className="lede mt-6">
              {de
                ? 'Was wir über die Stadt wissen, über die Festspielzeit und darüber, was einen Aufenthalt hier ausmacht.'
                : 'What we know about the town, about festival season, and about what makes a stay here worthwhile.'}
            </p>
          </Reveal>

          {categories.length > 0 && (
            <Reveal delay={0.06}>
              <ul className="mt-8 flex flex-wrap gap-x-3 gap-y-2">
                {categories.map((category) => (
                  <li
                    key={category}
                    className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--champagne-dark))',
                    }}
                  >
                    {category}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          {articles.length === 0 ? (
            <Reveal>
              <p className="body-copy">
                {de ? 'Der erste Beitrag folgt in Kürze.' : 'The first piece is coming shortly.'}
              </p>
            </Reveal>
          ) : (
            <ul className="grid gap-8 md:grid-cols-2 lg:gap-10">
              {articles.map((article, i) => (
                <Reveal as="li" key={article.slug} delay={i * 0.08}>
                  <article
                    className="card-surface h-full p-7 lg:p-9 flex flex-col"
                  >
                    <p className="eyebrow">{article.category[locale]}</p>
                    <h2 className="display-3 mt-4">
                      <Link
                        href={`/journal/${article.slug}`}
                        className="transition-colors hover:text-[hsl(var(--champagne-dark))]"
                      >
                        {article.title[locale]}
                      </Link>
                    </h2>
                    <p className="body-copy mt-4 text-[14px] flex-1">{article.excerpt[locale]}</p>
                    <div className="mt-6 flex items-center gap-3 text-[12px] text-muted-foreground">
                      <time dateTime={article.publishedDate}>
                        {formatDate(article.publishedDate, locale)}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>{article.readTime[locale]}</span>
                    </div>
                    <div className="mt-5">
                      <Link href={`/journal/${article.slug}`} className="link-quiet">
                        {de ? 'Lesen' : 'Read'}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                </Reveal>
              ))}
            </ul>
          )}

          {/* The overview should not end in nothing. Both onward routes are
              offered once, weighted toward the apartments. */}
          <Reveal delay={0.12}>
            <div
              className="mt-14 flex flex-col gap-6 p-7 lg:flex-row lg:items-center lg:justify-between lg:p-9"
              style={{
                background: 'hsl(var(--secondary) / 0.55)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div>
                <h2 className="display-3">
                  {de ? 'Vom Lesen zum Aufenthalt' : 'From reading to staying'}
                </h2>
                <p className="body-copy mt-3 text-[14px]">
                  {de
                    ? 'Unsere Apartments liegen in der Bayreuther Innenstadt — dort, wo das meiste stattfindet, worüber wir hier schreiben.'
                    : 'Our apartments are in central Bayreuth — where most of what we write about here actually happens.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <CtaLink href="/apartments" withArrow>
                  {label('exploreApartments', locale)}
                </CtaLink>
                <CtaLink href="/bayreuth-2026" variant="secondary">
                  {de ? 'Bayreuth entdecken' : 'Discover Bayreuth'}
                </CtaLink>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
