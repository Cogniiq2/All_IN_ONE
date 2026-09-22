import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import PrivilegesClient from './privileges-client';

/**
 * BoLaGio Residence Privileges — the QR destination.
 *
 * A guest standing in the apartment scans a small, tasteful code and lands
 * here. The page has one job: explain the benefit in a sentence and take an
 * email address. Everything else is restraint.
 *
 * ── noindex, deliberately ────────────────────────────────────────────────
 * This is a private guest courtesy, not a public offer. Indexing it would
 * turn a residence privilege into a coupon anybody can find, which is exactly
 * the positioning this is meant to avoid — and would put a benefit page in
 * front of people who were never guests.
 */
export const metadata: Metadata = {
  title: 'Residence Privileges',
  description:
    'Für Gäste von BoLaGio: Vorteile bei der nächsten Direktbuchung. Ein Zugang, der Ihrem Aufenthalt folgt.',
  alternates: { canonical: `${SITE_URL}/guest/privileges` },
  robots: { index: false, follow: false, nocache: true },
};

export default function PrivilegesPage({
  searchParams,
}: {
  searchParams: { property?: string; campaign?: string; state?: string };
}) {
  /*
   * Every parameter is a HINT, validated here and re-validated on the server
   * when it is used. A QR code is printed on a wall where anyone can
   * photograph it, so nothing it carries may be an authority — and nothing
   * secret may be in it. The slug names an apartment; it grants nothing.
   */
  const property =
    typeof searchParams.property === 'string' && /^[a-z0-9-]{2,64}$/.test(searchParams.property)
      ? searchParams.property
      : undefined;
  const campaign =
    typeof searchParams.campaign === 'string' && /^[a-z0-9][a-z0-9-]{1,48}$/.test(searchParams.campaign)
      ? searchParams.campaign
      : undefined;
  const state = searchParams.state === 'verified' || searchParams.state === 'link-invalid' ? searchParams.state : undefined;

  return <PrivilegesClient property={property} campaign={campaign} initialState={state} />;
}
