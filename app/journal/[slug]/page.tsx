import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articles, getArticleBySlug } from '@/lib/articles';
import { SITE_URL } from '@/lib/content/brand';
import { JsonLd, getArticleSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import { ArticleClient } from './article-client';

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = getArticleBySlug(params.slug);
  if (!article) return { title: 'Journal' };

  return {
    title: article.title.de,
    description: article.excerpt.de,
    alternates: { canonical: `${SITE_URL}/journal/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title.de,
      description: article.excerpt.de,
      url: `${SITE_URL}/journal/${article.slug}`,
      publishedTime: article.publishedDate,
    },
  };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticleBySlug(params.slug);
  if (!article) notFound();

  return (
    <>
      <JsonLd
        data={getArticleSchema({
          title: article.title.de,
          description: article.excerpt.de,
          url: `${SITE_URL}/journal/${article.slug}`,
          datePublished: article.publishedDate,
        })}
      />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Journal', url: `${SITE_URL}/journal` },
          { name: article.title.de, url: `${SITE_URL}/journal/${article.slug}` },
        ])}
      />
      <ArticleClient slug={article.slug} />
    </>
  );
}
