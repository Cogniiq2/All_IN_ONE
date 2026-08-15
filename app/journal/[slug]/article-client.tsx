'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getArticleBySlug, type Article } from '@/lib/articles';
import { Reveal } from '@/components/ui-kit/reveal';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * Article shell.
 *
 * Structured blocks rather than hand-built JSX per article, so a new piece is
 * a data entry rather than a new page component — and so no article can quietly
 * reintroduce a claim about the apartments.
 */
export function ArticleClient({ slug }: { slug: string }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const article = getArticleBySlug(slug) as Article;

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
          {article.body.map((block, i) =>
            block.type === 'heading' ? (
              <Reveal key={i}>
                <h2 className="display-3 mt-12 mb-4">{block.text[locale]}</h2>
              </Reveal>
            ) : (
              <Reveal key={i}>
                <p className="text-[17px] leading-[1.75] text-muted-foreground mb-6">
                  {block.text[locale]}
                </p>
              </Reveal>
            )
          )}
        </div>

        <Reveal>
          <aside
            className="mt-16 p-7 lg:p-9"
            style={{
              background: 'hsl(var(--secondary) / 0.6)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
            }}
          >
            <h2 className="display-3">
              {de ? 'Sie planen einen Aufenthalt?' : 'Planning a stay?'}
            </h2>
            <p className="body-copy mt-3 text-[14px]">
              {de
                ? 'Wir vermieten zwei eigene Apartments in der Bayreuther Innenstadt. Fragen Sie einfach Ihren Zeitraum an.'
                : 'We let two apartments of our own in central Bayreuth. Simply enquire about your dates.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <EnquiryButton />
              <CtaLink href="/apartments" variant="secondary">
                {label('exploreApartments', locale)}
              </CtaLink>
            </div>
          </aside>
        </Reveal>
      </div>
    </article>
  );
}
