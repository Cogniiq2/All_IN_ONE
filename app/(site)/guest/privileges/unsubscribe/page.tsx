import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import UnsubscribeClient from './unsubscribe-client';

/**
 * Withdrawal of marketing consent — the page the unsubscribe link lands on.
 *
 * One button, because a GET must never unsubscribe (mail scanners follow
 * links). noindex: it is reached from an email, not from search.
 */
export const metadata: Metadata = {
  title: 'Abmelden',
  description: 'Werbe-E-Mails von BoLaGio abbestellen.',
  alternates: { canonical: `${SITE_URL}/guest/privileges/unsubscribe` },
  robots: { index: false, follow: false, nocache: true },
};

export default function UnsubscribePage({ searchParams }: { searchParams: { id?: string; sig?: string } }) {
  const id = typeof searchParams.id === 'string' && /^[0-9a-fA-F-]{36}$/.test(searchParams.id) ? searchParams.id : undefined;
  const sig = typeof searchParams.sig === 'string' && /^[0-9a-fA-F]{64}$/.test(searchParams.sig) ? searchParams.sig : undefined;
  return <UnsubscribeClient id={id} sig={sig} />;
}
