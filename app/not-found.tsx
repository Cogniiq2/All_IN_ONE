import Link from 'next/link';

/**
 * Chrome-free fallback. The public site's 404 — with navigation, footer and
 * both languages — is `app/(site)/not-found.tsx`, reached through the site's
 * catch-all route; this one only renders when a request matches no route
 * group at all.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-[62vh] items-center justify-center px-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="display-3 mt-4">Diese Seite gibt es nicht</h1>
        <p className="mt-6">
          <Link href="/" className="link-quiet">
            Zur Startseite
          </Link>
        </p>
      </div>
    </main>
  );
}
