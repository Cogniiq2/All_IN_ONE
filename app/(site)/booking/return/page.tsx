import type { Metadata } from 'next';
import { Suspense } from 'react';
import BookingReturnClient from './return-client';

/**
 * Where a guest lands when the payment provider sends them back.
 *
 * ── Why this page proves nothing on its own ──────────────────────────────
 * Arriving here means a browser navigated. It does not mean a card cleared:
 * the URL can be typed, shared, bookmarked or reached by closing the
 * provider's page early. So this page has no idea whether the payment
 * succeeded and does not guess — it reads the booking's status from the
 * backend, and the backend only ever reaches 'confirmed' through an
 * authenticated callback from n8n.
 *
 * ── SEO ──────────────────────────────────────────────────────────────────
 * `noindex, nofollow`, and deliberately absent from app/sitemap.ts. It is a
 * transactional endpoint carrying a reservation reference in the query string;
 * it must never appear in a search result or be followed by a crawler.
 */
export const metadata: Metadata = {
  title: 'Buchung',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default function BookingReturnPage() {
  return (
    <Suspense fallback={null}>
      <BookingReturnClient />
    </Suspense>
  );
}
