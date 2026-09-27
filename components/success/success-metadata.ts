import type { Metadata } from 'next';
import { SUCCESS_SCENES, type SuccessSceneId } from '@/lib/content/success';

/**
 * Every success page: `noindex, nofollow`, never cached, never in
 * app/sitemap.ts. A confirmation is the end of one visitor's journey — it has
 * nothing to offer a search result, and the booking pages carry a reservation
 * reference in the query string.
 */
export function successMetadata(id: SuccessSceneId): Metadata {
  return {
    title: SUCCESS_SCENES[id].documentTitle.de,
    robots: { index: false, follow: false, nocache: true },
  };
}
