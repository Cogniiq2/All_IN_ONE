import { Suspense } from 'react';
import { successMetadata } from '@/components/success/success-metadata';
import BookingConfirmedClient from './confirmed-client';

/**
 * /booking/confirmed?ref=BLG-XXXXXX — a paid direct booking the backend has
 * confirmed.
 *
 * The URL proves nothing: the page reads the booking by reference and says
 * "confirmed" only when `isConfirmedStatus` does. Anything else is sent on to
 * the page that describes it truthfully (/booking/payment-received or
 * /booking/return). Transactional, so noindex and absent from the sitemap.
 */
export const metadata = successMetadata('booking-confirmed');
export const dynamic = 'force-dynamic';

export default function BookingConfirmedPage() {
  return (
    <Suspense fallback={null}>
      <BookingConfirmedClient />
    </Suspense>
  );
}
