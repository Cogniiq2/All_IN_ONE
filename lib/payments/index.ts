import 'server-only';

/**
 * Which payment adapter answers.
 *
 * One provider today. The seam exists because the second one always arrives,
 * and because keeping `paypal` out of the service layer costs nothing now and
 * a great deal later.
 *
 * There is no fallback edge in this function and no mock adapter: a payment
 * system that quietly succeeds without a provider is worse than one that
 * refuses, because the failure surfaces as a guest who believes they have paid.
 */

import { paypalAdapter } from '@/lib/payments/paypal/provider';
import type { PaymentProviderAdapter } from '@/lib/payments/provider';
import type { PaymentProvider } from '@/lib/booking/types';
import { PaymentProviderError } from '@/lib/payments/provider';

export function paymentAdapter(provider: PaymentProvider = 'paypal'): PaymentProviderAdapter {
  if (provider === 'paypal') return paypalAdapter;
  // Stripe is a planned second implementation of `PaymentProviderAdapter`.
  // Until it exists, asking for it is a configuration error, not a silent
  // fallback to PayPal — a guest who chose a card must not be handed a
  // PayPal page.
  throw new PaymentProviderError('not_configured', `payment provider "${provider}" is not implemented`);
}

export { PaymentProviderError } from '@/lib/payments/provider';
export type {
  PaymentProviderAdapter,
  ProviderOrder,
  VerifiedPaymentEvent,
} from '@/lib/payments/provider';
