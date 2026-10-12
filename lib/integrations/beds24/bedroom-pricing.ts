import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BEDROOM PACKAGE → BEDS24 PRICING. The one seam, deliberately empty.
 *
 * A guest chooses `one_bedroom` or `two_bedroom`. What that choice costs must
 * come from Beds24 — the same account that prices Booking.com and Airbnb —
 * and never from a number written into this repository.
 *
 * How the account will express the two packages is NOT established yet: a
 * separate offer per package, a per-guest rule, a second room, or something
 * else. It is being configured by hand in Beds24, and the real `offers`
 * responses are inspected before any mapping is written. Until then this
 * function answers the only true thing it can: the mapping is not configured.
 *
 * ── What this function must never do ─────────────────────────────────────
 *   • pick an offer because it is the cheapest, the first or the only one;
 *   • invent an offer id, a rate id or a price for either package;
 *   • fall back to `two_bedroom` (or anything) when unsure.
 * Any of those would sell one setup at another's price and look healthy doing
 * it. "Not configured" closes the booking button instead — see the
 * `pricing_unconfigured` gate in lib/booking/service.ts.
 *
 * ── Phase 2 ──────────────────────────────────────────────────────────────
 * Once the account is configured and its responses are recorded (as fixtures
 * in tests/provider.test.ts, the way the calendar mapping was verified),
 * this function selects the offer for the requested package from `offers`
 * and returns a configured resolution carrying it. Its callers — `fetchOffer`
 * in live.ts — are the only place the result is read, so nothing above the
 * adapter changes when it does.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BedroomPackage } from '@/lib/booking/types';
import type { ProviderUnitRef } from '@/lib/integrations/provider';
import type { Beds24OffersResponse } from '@/lib/integrations/beds24/types';

export interface Beds24BedroomPricingInput {
  unit: ProviderUnitRef;
  bedroomPackage: BedroomPackage;
  /** The raw offers response for the stay. Read in Phase 2; not interpreted now. */
  offers: Beds24OffersResponse;
}

export type Beds24BedroomPricingResolution = {
  status: 'not_configured';
  bedroomPackage: BedroomPackage;
  reason: 'BEDS24_BEDROOM_MAPPING_NOT_CONFIGURED';
};

export function resolveBeds24BedroomPricing(
  input: Beds24BedroomPricingInput
): Beds24BedroomPricingResolution {
  return {
    status: 'not_configured',
    bedroomPackage: input.bedroomPackage,
    reason: 'BEDS24_BEDROOM_MAPPING_NOT_CONFIGURED',
  };
}
