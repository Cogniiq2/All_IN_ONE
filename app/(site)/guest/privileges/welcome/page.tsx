import { successMetadata } from '@/components/success/success-metadata';
import { PrivilegesSuccess } from '@/components/success/privileges-success';

/**
 * /guest/privileges/welcome — where the confirmation link lands once the
 * address is verified (app/api/guest/privileges/verify/route.ts). An invalid
 * or used link still lands on /guest/privileges?state=link-invalid.
 */
export const metadata = successMetadata('privileges-welcome');

export default function PrivilegesWelcomePage() {
  return <PrivilegesSuccess scene="privileges-welcome" />;
}
