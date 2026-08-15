/** @type {import('next').NextConfig} */

/**
 * Route migration.
 *
 * Every destination below is a live 200 page, so no redirect points at another
 * redirect (no chains) and none points back at its own source (no loops).
 * Nothing is dumped generically on the homepage: each old URL goes to the
 * closest page that still serves the same intent.
 *
 * The five journal articles were restored at their original slugs, so those
 * URLs are served directly and are NOT redirected.
 */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // Internal admin application — untouched by this frontend pass.
      {
        source: '/admin',
        destination: '/admin/index.html',
        permanent: false,
      },

      // ── Inventory ────────────────────────────────────────────────────
      // The five invented apartments have no real counterpart, so they go to
      // the apartment overview rather than being mapped onto a real unit —
      // claiming "Maison Sternplatz is now Schulstraße I" would be a new
      // false statement. The one exception is the Opernstraße unit, where the
      // street genuinely matches.
      { source: '/residences', destination: '/apartments', permanent: true },
      {
        source: '/residences/atelier-opernstrasse',
        destination: '/apartments/opernstrasse',
        permanent: true,
      },
      { source: '/residences/:slug', destination: '/apartments', permanent: true },
      { source: '/collections/:path*', destination: '/apartments', permanent: true },

      // ── Audience landing pages ───────────────────────────────────────
      // Both covered the same subject as the restored business-travel article,
      // which is a closer match than the apartment list.
      {
        source: '/business-stays',
        destination: '/journal/serviced-apartments-bayreuth-geschaftsreisen',
        permanent: true,
      },
      {
        source: '/long-stay',
        destination: '/journal/serviced-apartments-bayreuth-geschaftsreisen',
        permanent: true,
      },

      // ── Reviews ──────────────────────────────────────────────────────
      // The page contained only invented guest reviews. Visitors arriving from
      // it are looking for reassurance about who we are, so About is the
      // closest honest destination.
      { source: '/reviews', destination: '/about', permanent: true },

      // ── Interim slug ─────────────────────────────────────────────────
      // A replacement article briefly existed at this slug between the rebuild
      // and the restoration of the originals. It was never deployed, but the
      // redirect costs nothing and prevents a dead link.
      {
        source: '/journal/bayreuth-und-die-festspiele',
        destination: '/journal/bayreuth-festspiele-unterkunft-guide',
        permanent: true,
      },
    ];
  },
  images: {
    // NOTE: left unchanged deliberately. Enabling Next.js image optimization
    // needs to be verified against the live Netlify deployment first, and
    // deployment is out of scope for this pass. All images are now local, so
    // no remote patterns are required.
    unoptimized: true,
  },
};

module.exports = nextConfig;
