/**
 * From database rows to the stay-tax engine's inputs. Pure, so the joining
 * rules — which statement line belongs to which reservation, how Beds24's
 * commission text becomes cents, which ledger figures are NOT stays — are
 * tested on their own.
 */

import type { PolicyRow, StayTaxReservationRow } from '@/lib/finance/rows';
import type { SettlementRow } from '@/lib/finance/settlements';
import type { VatMonthlyRow } from '@/lib/finance/tax/vat';
import { compactUnitName } from '@/lib/admin/format';
import { DEFAULT_STAY_TAX_POLICY, type OtherVatInputs, type StayTaxInput, type StayTaxPolicy } from '@/lib/finance/tax/stay-tax';

/** Policy keys, effective-dated in `bolagio_finance_policy`. */
export const STAY_TAX_POLICY_KEYS = { paymentFee: 'ota_payment_fee_vat', cancellationCharge: 'cancellation_charge_vat' } as const;

function policyAt(rows: readonly PolicyRow[], key: string, on: string): string | null {
  const live = rows.filter((p) => p.key === key && p.effective_from <= on && (p.effective_to === null || p.effective_to >= on)).sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return live[0]?.value ?? null;
}

/** The company's settings for the engine, and which of them a person has actually decided (vs. the stated default). */
export function stayTaxPolicyFrom(rows: readonly PolicyRow[], on: string): { policy: StayTaxPolicy; decided: { smallBusiness: boolean; paymentFee: boolean; cancellationCharge: boolean } } {
  const small = policyAt(rows, 'small_business_scheme', on);
  const fee = policyAt(rows, STAY_TAX_POLICY_KEYS.paymentFee, on);
  const cancel = policyAt(rows, STAY_TAX_POLICY_KEYS.cancellationCharge, on);
  return {
    policy: {
      smallBusinessScheme: small === 'true' ? true : small === 'false' ? false : null,
      paymentFee: fee === 'exempt' ? 'exempt' : fee === 'reverse_charge' ? 'reverse_charge' : DEFAULT_STAY_TAX_POLICY.paymentFee,
      cancellationCharge: cancel === 'taxable' ? 'taxable' : 'undecided',
    },
    decided: { smallBusiness: small !== null, paymentFee: fee !== null, cancellationCharge: cancel !== null },
  };
}

/** Beds24 states the commission in euros as text ("41.66"). Zero and nonsense mean "not stated". */
export function commissionCentsFromBeds24(text: string | null): number | null {
  if (text === null || text === undefined) return null;
  const value = Number(String(text).trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Each reservation with its current Booking.com statement line, if one exists:
 * matched at import time by id, else by the Booking.com number. A superseded
 * or conflicting amendment never counts; only reservation rows are stays.
 */
export function stayTaxInputsFrom(
  reservations: readonly StayTaxReservationRow[],
  settlements: readonly SettlementRow[],
  units: ReadonlyArray<{ id: string; display_name: string }>
): { inputs: StayTaxInput[]; unmatchedSettlements: SettlementRow[] } {
  const current = settlements.filter((s) => s.amendment_state === 'current' && s.row_type.toLowerCase() === 'reservation');
  const used = new Set<string>();
  const unitName = new Map(units.map((u) => [u.id, compactUnitName(u.display_name)]));
  const inputs = reservations.map((r) => {
    const settlement = current.find((s) => s.reservation_id === r.id) ?? (r.channel_reference ? current.find((s) => s.booking_number === r.channel_reference) : undefined) ?? null;
    if (settlement) used.add(settlement.id);
    const nights = Math.round((Date.parse(`${r.check_out}T00:00:00Z`) - Date.parse(`${r.check_in}T00:00:00Z`)) / 86_400_000);
    return {
      reservationId: r.id,
      reference: r.channel_reference ?? r.external_booking_id,
      unitName: (r.unit_id && unitName.get(r.unit_id)) || 'an apartment',
      source: r.source,
      statusClass: r.status_class,
      checkIn: r.check_in,
      checkOut: r.check_out,
      nights,
      currency: r.currency ?? 'EUR',
      beds24GrossCents: r.total_amount_cents,
      beds24CommissionCents: commissionCentsFromBeds24(r.commission),
      settlement: settlement
        ? {
            payoutId: settlement.payout_id,
            payoutDate: settlement.payout_date,
            grossCents: settlement.gross_cents,
            commissionCents: settlement.commission_cents,
            paymentFeeCents: settlement.payment_service_fee_cents,
            netCents: settlement.net_cents,
            reservationStatus: settlement.reservation_status,
          }
        : null,
    } satisfies StayTaxInput;
  });
  return { inputs, unmatchedSettlements: current.filter((s) => !used.has(s.id)) };
}

const OTHER_19 = new Set(['DE_STANDARD', 'DE_BEVERAGE_STANDARD', 'DE_ANCILLARY_STANDARD']);
const OTHER_7 = new Set(['DE_FOOD_REDUCED', 'DE_REDUCED']);

/**
 * What the books add to the return besides the stays: purchases' input VAT
 * (box 66) and other sales such as the minibar. Accommodation and the
 * platforms' reverse charge are NOT taken from the books — they come from
 * the stays, and counting them twice is exactly the error this prevents.
 */
export function otherVatFromLedger(rows: readonly VatMonthlyRow[]): OtherVatInputs {
  const out: OtherVatInputs = { kz66VatCents: 0, kz81BaseCents: 0, kz81VatCents: 0, otherKz86BaseCents: 0, otherKz86VatCents: 0 };
  for (const r of rows) {
    const n = (v: unknown) => Number(v) || 0;
    if (OTHER_19.has(r.tax_code)) {
      out.kz81BaseCents += n(r.output_basis_cents);
      out.kz81VatCents += n(r.output_vat_cents);
    } else if (OTHER_7.has(r.tax_code)) {
      out.otherKz86BaseCents += n(r.output_basis_cents);
      out.otherKz86VatCents += n(r.output_vat_cents);
    }
    if (r.treatment !== 'reverse_charge' && r.treatment !== 'review_required') out.kz66VatCents += n(r.input_vat_cents);
  }
  return out;
}
