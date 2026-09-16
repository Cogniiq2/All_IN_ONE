import 'server-only';

/**
 * Which provider implementation answers, decided once.
 *
 * ── The non-negotiable ───────────────────────────────────────────────────
 * There is no fallback edge in this function. `live` returns the live
 * provider and nothing else; if Beds24 is unreachable the live provider
 * throws and the guest is told that live availability is temporarily
 * unavailable. It does NOT quietly return fixtures, because a booking engine
 * that invents a free night under failure will eventually sell a night that is
 * already someone's holiday.
 */

import { beds24Mode } from '@/lib/booking/config';
import type { BookingProvider } from '@/lib/integrations/provider';
import { beds24LiveProvider } from '@/lib/integrations/beds24/live';
import { beds24MockProvider } from '@/lib/integrations/beds24/mock';

export function bookingProvider(): BookingProvider {
  return beds24Mode() === 'live' ? beds24LiveProvider : beds24MockProvider;
}

export { ProviderError } from '@/lib/integrations/provider';
