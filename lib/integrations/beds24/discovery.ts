import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * PROVIDER DISCOVERY — read-only, operations only.
 *
 * "What does this Beds24 account actually contain?"
 *
 * It exists because the mapping between a BoLaGio unit and a Beds24 room is
 * the one piece of configuration that is easy to get wrong and expensive to
 * get wrong: a slug pointed at the wrong room sells the wrong apartment, and
 * nothing downstream can detect it — the calendar looks perfectly healthy.
 *
 * So the ids are not typed into a config file from a spreadsheet. They are
 * read back from the provider, with names attached, and a person confirms the
 * pairing before `bolagio_unit_integrations` is written.
 *
 * ── Deliberately NOT part of BookingProvider ─────────────────────────────
 * `BookingProvider` is the guest-facing seam: availability, offers, holds.
 * This is a one-off administrative read. Putting it on that interface would
 * force the mock provider to implement something no guest flow ever calls,
 * and would imply the booking path may enumerate the whole account, which it
 * may not.
 *
 * ── Why rooms are not fetched separately ─────────────────────────────────
 * `GET /properties/rooms` is not a Beds24 V2 endpoint. It was assumed to be
 * one in an earlier revision of this integration and returned HTTP 500 with a
 * non-JSON body when it was finally tried against a live account. Rooms exist
 * only nested inside the properties response, behind `includeAllRooms=true`,
 * which is what this module requests.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beds24Request } from '@/lib/integrations/beds24/client';
import { mapProperties } from '@/lib/integrations/beds24/mapper';
import type { Beds24PropertiesResponse } from '@/lib/integrations/beds24/types';
import type { ProviderPropertySummary } from '@/lib/integrations/provider';

/**
 * Every property this token can see, with its rooms.
 *
 * One call. Read-only. Pass `propertyId` to narrow it to a single property;
 * omit it to enumerate the account, which is what establishing a mapping for
 * the first time needs.
 */
export async function listPropertiesWithRooms(
  propertyId?: string
): Promise<ProviderPropertySummary[]> {
  const response = await beds24Request<Beds24PropertiesResponse>({
    path: '/properties',
    query: {
      includeAllRooms: 'true',
      propertyId,
    },
  });
  return mapProperties(response);
}
