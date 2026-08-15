/** @type {import('next').NextConfig} */
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

      // The fabricated inventory and its landing pages have been consolidated
      // into the real three-unit architecture under /apartments.
      { source: '/residences', destination: '/apartments', permanent: true },
      { source: '/residences/:slug', destination: '/apartments', permanent: true },
      { source: '/collections/:path*', destination: '/apartments', permanent: true },
      { source: '/business-stays', destination: '/apartments', permanent: true },
      { source: '/long-stay', destination: '/apartments', permanent: true },

      // The reviews page contained only invented guest reviews.
      { source: '/reviews', destination: '/apartments', permanent: true },

      // Journal articles that asserted the fabricated inventory were removed.
      { source: '/journal/wie-wir-arbeiten', destination: '/journal', permanent: true },
      { source: '/journal/wo-in-bayreuth-ubernachten', destination: '/journal', permanent: true },
      { source: '/journal/richard-wagner-bayreuth-mythos', destination: '/journal', permanent: true },
      {
        source: '/journal/bayreuth-festspiele-unterkunft-guide',
        destination: '/journal',
        permanent: true,
      },
      {
        source: '/journal/serviced-apartments-bayreuth-geschaftsreisen',
        destination: '/journal',
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
