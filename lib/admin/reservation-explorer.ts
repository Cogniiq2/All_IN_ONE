import 'server-only';

/**
 * One loader for the reservations explorer and its PDF, so the file always
 * holds exactly what the screen shows for the same address.
 */

import type { ReservationBoard, QueryResult } from '@/lib/admin/dto';
import { listUnits, loadReservations } from '@/lib/admin/queries';
import { compactUnitName, propertyTodayIso } from '@/lib/admin/format';
import { describeReservationFilter, reservationQueryOf, type ReservationFilter } from '@/lib/admin/reservation-filters';
import { summariseReservations, type ReservationSummary } from '@/lib/admin/reservation-summary';

export interface ReservationExplorerView {
  today: string;
  units: { slug: string; name: string; short: string }[];
  result: QueryResult<ReservationBoard>;
  /** The filter in one plain sentence. */
  description: string;
  summary: ReservationSummary | null;
}

export async function loadReservationExplorer(filter: ReservationFilter, now: Date = new Date()): Promise<ReservationExplorerView> {
  const today = propertyTodayIso(now);
  const [units, result] = await Promise.all([listUnits(), loadReservations(reservationQueryOf(filter, today, null), filter.unit)]);
  const unitList = units.ok ? units.data.map((u) => ({ slug: u.slug, name: u.displayName, short: compactUnitName(u.displayName) })) : [];
  const unitName = filter.unit ? unitList.find((u) => u.slug === filter.unit)?.short ?? filter.unit : null;
  return {
    today,
    units: unitList,
    result,
    description: describeReservationFilter(filter, unitName, today),
    summary: result.ok ? summariseReservations(result.data.items) : null,
  };
}
