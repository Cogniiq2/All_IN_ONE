import { notFound } from 'next/navigation';

/**
 * Every URL the public site does not define lands here and is answered by
 * `app/(site)/not-found.tsx` — inside the site layout, so the 404 keeps the
 * navigation and footer a visitor expects. The root `not-found.tsx` only
 * exists as a chrome-free fallback for a request that matches no group at all.
 */
export default function SiteCatchAll(): never {
  notFound();
}
