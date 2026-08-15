'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { articles } from '@/lib/articles';
import { Reveal } from '@/components/ui-kit/reveal';

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
        </div>
      </section>
    </>
  );
}
