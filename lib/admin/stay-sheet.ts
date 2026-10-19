'use server';

/**
 * The calendar's stay sheet: everything about one stay, fetched when the
 * operator opens it. Read-only. Guest contact is returned only to signed-in
 * operators (as on the reservation page); money and tax only to roles that
 * may read Finance.
 */

import { operatorFor } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadReservation } from '@/lib/admin/queries';
import { loadStayTax } from '@/lib/finance/queries';
import type { ReservationDetailDto } from '@/lib/admin/dto';

export interface StaySheetMoney {
  grossCents: number | null;
  vatCents: number | null;
  vatRateBp: number | null;
  netCents: number | null;
  commissionCents: number | null;
  commissionSource: 'statement' | 'beds24' | 'none' | null;
  payoutCents: number | null;
  payoutState: 'paid_out' | 'expected' | 'unknown';
  payoutDate: string | null;
  keptCents: number | null;
  vatMonth: string | null;
}

export type StaySheetResult =
  | { ok: true; reservation: ReservationDetailDto; money: StaySheetMoney | null }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'not_found' | 'error'; message: string };

export async function loadStaySheet(reservationId: string): Promise<StaySheetResult> {
  const gate = await operatorFor('view');
  if (!gate.ok) return { ok: false, reason: gate.reason, message: gate.reason === 'unauthenticated' ? 'Your session has ended. Sign in again.' : 'Your role cannot open reservations.' };
  if (typeof reservationId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(reservationId)) return { ok: false, reason: 'not_found', message: 'This reservation does not exist.' };

  const result = await loadReservation(reservationId);
  if (!result.ok) return { ok: false, reason: 'error', message: 'The reservation could not be loaded. Try again in a moment.' };
  if (!result.data) return { ok: false, reason: 'not_found', message: 'This reservation is no longer in the booking system.' };

  let money: StaySheetMoney | null = null;
  if (can(gate.operator.role, 'finance.view')) {
    const t = await loadStayTax(reservationId);
    const tax = t.ok ? t.data?.tax ?? null : null;
    if (tax) {
      money = {
        grossCents: tax.revenue?.grossCents ?? null,
        vatCents: tax.revenue?.vatCents ?? null,
        vatRateBp: tax.revenue?.rateBp ?? null,
        netCents: tax.revenue?.netCents ?? null,
        commissionCents: tax.commission?.netCents ?? null,
        commissionSource: tax.commission?.source ?? (tax.revenue ? 'none' : null),
        payoutCents: tax.payout.netCents,
        payoutState: tax.payout.state,
        payoutDate: tax.payout.date,
        keptCents: tax.keptCents,
        vatMonth: tax.vatMonth,
      };
    }
  }
  return { ok: true, reservation: result.data, money };
}
