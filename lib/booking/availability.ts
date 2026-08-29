/**
 * ══════════════════════════════════════════════════════════════════════════
 * SHORT-TERM AVAILABILITY — the service seam.
 *
 * This module is the only thing the UI is allowed to ask about availability.
 * Today it answers "there is no source", and every caller falls back to a
 * personal enquiry. When the PMS / channel manager is connected, the answer
 * changes here and the UI does not:
 *
 *     UI  →  lib/booking/availability  →  PMS / channel manager
 *                                      →  BoLaGio · Booking.com · Airbnb
 *
 * Rules this file exists to enforce:
 *   • no availability is ever invented, in any code path;
 *   • the UI never talks to Booking.com or Airbnb directly — the channel
 *     manager owns those connections;
 *   • this site is not the source of truth for a calendar, and must never
 *     grow a proprietary one.
 *
 * Long-term rental never passes through here. A tenancy is agreed in person
 * under a rental agreement; it has no availability calendar and no booking.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { PAYMENT_ENABLED } from '@/lib/content/brand';

/** What a visitor selected in the availability panel. ISO `YYYY-MM-DD`. */
export interface StayQuery {
  arrival?: string;
  departure?: string;
  guests?: number;
}

/**
 * Which availability source is connected.
 *
 * 'none'  — nothing is connected. The only honest answer to "is it free?" is
 *           "we will check and tell you", so the UI routes to the enquiry.
 * 'pms'   — reserved for the channel-manager integration.
 *
 * NEEDS CONFIRMATION — Booking.com onboarding is pending and no PMS contract
 * exists yet, so this cannot be anything but 'none'.
 */
export const AVAILABILITY_SOURCE: 'none' | 'pms' = 'none';

/** True only when a real, synchronised availability source is connected. */
export function hasLiveAvailability(): boolean {
  return AVAILABILITY_SOURCE !== 'none';
}

/**
 * True only when a stay can be completed on the website end to end.
 * Requires both a real availability source and an enabled payment path.
 */
export function canBookOnline(): boolean {
  return hasLiveAvailability() && PAYMENT_ENABLED;
}

export type AvailabilityResult =
  /** No source connected — hand the query to the enquiry flow. */
  | { kind: 'no-source' }
  /** Reserved for the PMS integration. Never constructed today. */
  | { kind: 'available'; unitSlugs: string[] }
  | { kind: 'unavailable' };

/**
 * Ask the availability service about a stay.
 *
 * Async by design: the PMS answer will be a network call, and every caller is
 * already written to await it, so connecting the real provider is a change to
 * this function alone.
 */
export async function checkAvailability(_query: StayQuery): Promise<AvailabilityResult> {
  // No source. Returning anything else here would be a fabricated answer.
  return { kind: 'no-source' };
}

/** Normalises a `<input type="date">` value to `YYYY-MM-DD` or undefined. */
export function toIsoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** Today as `YYYY-MM-DD` in the visitor's own timezone, for date `min`s. */
export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** The night after `date`, used as the minimum departure. */
export function nextDayIso(date: string | undefined): string | undefined {
  const iso = toIsoDate(date);
  if (!iso) return undefined;
  const next = new Date(`${iso}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Nights between two ISO dates, or undefined when the range is incomplete. */
export function nightsBetween(arrival?: string, departure?: string): number | undefined {
  const from = toIsoDate(arrival);
  const to = toIsoDate(departure);
  if (!from || !to) return undefined;
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : undefined;
}
