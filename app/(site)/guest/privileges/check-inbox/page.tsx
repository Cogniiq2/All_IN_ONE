import { successMetadata } from '@/components/success/success-metadata';
import { PrivilegesSuccess } from '@/components/success/privileges-success';

/**
 * /guest/privileges/check-inbox — after the Residence Privileges sign-up.
 *
 * The same answer for every address, known or not: the sign-up endpoint must
 * not reveal whether an address is already on file, so neither may this page.
 */
export const metadata = successMetadata('privileges-check-inbox');

export default function PrivilegesCheckInboxPage() {
  return <PrivilegesSuccess scene="privileges-check-inbox" />;
}
