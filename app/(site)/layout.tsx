import { ClientLayout } from '@/components/layout/client-layout';
import { JsonLd, organizationSchema } from '@/components/shared/json-ld';

/**
 * The public website.
 *
 * Everything a visitor sees shares this layout: the language provider, the
 * navigation, the footer, the enquiry and booking modals and the organisation
 * schema. It is a route group, so no URL changes — `/` is still `/` — and the
 * operations interface under `/admin` is deliberately outside it.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={organizationSchema} />
      <ClientLayout>{children}</ClientLayout>
    </>
  );
}
