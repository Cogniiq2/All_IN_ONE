import { isConfirmedStatus, type BookingIntentView } from '@/lib/booking/types';

/**
 * Which page tells the truth about a booking right now.
 *
 *   confirmed                        → /booking/confirmed
 *   money arrived or still clearing  → /booking/payment-received
 *   anything else                    → /booking/return (failed, cancelled,
 *                                      released, or still settling before
 *                                      any money moved)
 *
 * The payment column decides the middle branch, not the booking column — a
 * booking can read `payment_failed` while a later capture is on its way, and
 * that guest must not be told their payment failed (see return-client.tsx).
 */
export function nextBookingPage(view: Pick<BookingIntentView, 'reference' | 'status' | 'paymentStatus'>): string {
  const ref = encodeURIComponent(view.reference);
  if (isConfirmedStatus(view.status)) return `/booking/confirmed?ref=${ref}`;
  if (view.paymentStatus === 'paid' || view.paymentStatus === 'capture_pending') {
    return `/booking/payment-received?ref=${ref}`;
  }
  return `/booking/return?ref=${ref}`;
}
