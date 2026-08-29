'use client';

/**
 * The availability panel, seated directly under the hero.
 *
 * On desktop it lifts into the photograph so the first action a visitor sees
 * is "when are you coming" rather than another block of copy. On mobile it
 * sits cleanly below the hero — overlapping a full-height hero on a small
 * screen costs more than it buys, and the negative margin is dropped there.
 *
 * The panel itself is `components/booking/availability-search.tsx`, which is
 * reusable and knows nothing about this placement.
 */

import { AvailabilitySearch } from '@/components/booking/availability-search';

export function AvailabilityBand() {
  return (
    <div className="relative z-20 lg:-mt-14">
      <div className="container-luxury">
        <AvailabilitySearch />
      </div>
    </div>
  );
}
