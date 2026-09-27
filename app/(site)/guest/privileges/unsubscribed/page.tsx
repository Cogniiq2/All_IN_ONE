import { successMetadata } from '@/components/success/success-metadata';
import { PrivilegesSuccess } from '@/components/success/privileges-success';

/**
 * /guest/privileges/unsubscribed — after a successful unsubscribe.
 *
 * It says "you are unsubscribed" only to the tab that just did it; anyone
 * else is sent to the privileges page rather than told something untrue.
 */
export const metadata = successMetadata('privileges-unsubscribed');

export default function PrivilegesUnsubscribedPage() {
  return <PrivilegesSuccess scene="privileges-unsubscribed" />;
}
