/**
 * ══════════════════════════════════════════════════════════════════════════
 * FRESHNESS — how current the owner's figures are, in plain words.
 *
 * Every number on the owner screens comes from `bolagio_reservations`, which
 * two things keep current: the Beds24 webhook (seconds after a change) and
 * the hourly import (the safety net). The owner does not need either word —
 * she needs to know when the bookings were last brought up to date, and to
 * be told clearly when they are not. Pure; the queries supply the inputs.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The hourly import's overdue threshold, as the alerts use it. */
export const BOOKINGS_OVERDUE_MS = 2 * 60 * 60_000;

export type FreshnessState = 'current' | 'delayed' | 'failing' | 'unknown';

export interface BookingFreshness {
  state: FreshnessState;
  /** The newest moment the bookings were confirmed against the booking system. */
  updatedAt: string | null;
  /** "Bookings updated 4 minutes ago". */
  headline: string;
  /** Present when the owner should not fully trust the figures; plain words. */
  warning: string | null;
}

export interface FreshnessInput {
  /** The last finished hourly import. */
  lastImport: { finishedAt: string; ok: boolean } | null;
  /** The last change Beds24 announced and BoLaGio processed. */
  lastWebhookAt: string | null;
  /** Upcoming booked stays no sync has confirmed for over a day. */
  staleUpcoming: number;
  /** Webhook refreshes that failed recently (retried automatically). */
  failedRefreshes: number;
}

export function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function bookingFreshness(input: FreshnessInput | null, now: Date): BookingFreshness {
  if (!input) {
    return { state: 'unknown', updatedAt: null, headline: 'Booking status unknown', warning: 'The dashboard could not check when the bookings were last updated. Figures may be out of date.' };
  }
  const okImport = input.lastImport?.ok ? input.lastImport.finishedAt : null;
  const candidates = [okImport, input.lastWebhookAt].filter((v): v is string => Boolean(v));
  const updatedAt = candidates.sort().at(-1) ?? null;
  const importAge = input.lastImport ? now.getTime() - Date.parse(input.lastImport.finishedAt) : Number.POSITIVE_INFINITY;

  if (!input.lastImport) {
    return { state: 'failing', updatedAt, headline: updatedAt ? `Bookings updated ${ago(updatedAt, now)}` : 'Bookings never updated', warning: 'The automatic booking update has never run. New bookings and changes are not reaching the dashboard.' };
  }
  if (!input.lastImport.ok && importAge <= BOOKINGS_OVERDUE_MS) {
    return { state: 'failing', updatedAt, headline: updatedAt ? `Bookings updated ${ago(updatedAt, now)}` : 'Bookings not updated', warning: 'The last automatic booking update failed. It retries every hour; if this stays, the booking system may be unreachable.' };
  }
  if (importAge > BOOKINGS_OVERDUE_MS) {
    return { state: 'failing', updatedAt, headline: updatedAt ? `Bookings updated ${ago(updatedAt, now)}` : 'Bookings not updated', warning: `The automatic booking update has not run since ${ago(input.lastImport.finishedAt, now)}. Bookings made or changed since then may be missing.` };
  }
  if (input.staleUpcoming > 0) {
    return { state: 'delayed', updatedAt, headline: `Bookings updated ${ago(updatedAt ?? input.lastImport.finishedAt, now)}`, warning: `${input.staleUpcoming} upcoming ${input.staleUpcoming === 1 ? 'booking has' : 'bookings have'} not been re-checked for over a day.` };
  }
  if (input.failedRefreshes > 0) {
    return { state: 'delayed', updatedAt, headline: `Bookings updated ${ago(updatedAt ?? input.lastImport.finishedAt, now)}`, warning: `${input.failedRefreshes} instant ${input.failedRefreshes === 1 ? 'update' : 'updates'} from the booking system failed; the hourly update will catch ${input.failedRefreshes === 1 ? 'it' : 'them'} up.` };
  }
  return { state: 'current', updatedAt, headline: `Bookings updated ${ago(updatedAt ?? input.lastImport.finishedAt, now)}`, warning: null };
}

export interface PayoutFreshness {
  /** When Booking.com settlement data last entered the books; null when never. */
  updatedAt: string | null;
  headline: string;
  /** Statement files checked but not imported. */
  awaitingReview: number;
}

export function payoutFreshness(lastSettlementAt: string | null, awaitingReview: number, now: Date): PayoutFreshness {
  return {
    updatedAt: lastSettlementAt,
    headline: lastSettlementAt ? `Booking.com payouts last updated ${ago(lastSettlementAt, now)}` : 'Booking.com payouts not yet imported',
    awaitingReview,
  };
}
