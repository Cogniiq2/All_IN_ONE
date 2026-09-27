import { Suspense } from 'react';
import { successMetadata } from '@/components/success/success-metadata';
import PaymentReceivedClient from './payment-received-client';

/**
 * /booking/payment-received?ref=BLG-XXXXXX — the money has arrived (or is
 * clearing at the provider) and the reservation is still being finalised.
 *
 * It never says "confirmed". It watches the booking for a while and moves to
 * /booking/confirmed on its own the moment the backend confirms; the e-mail
 * follows either way. Transactional, so noindex and absent from the sitemap.
 */
export const metadata = successMetadata('payment-received');
export const dynamic = 'force-dynamic';

export default function PaymentReceivedPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReceivedClient />
    </Suspense>
  );
}
