'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING FUNNEL EVENTS — hooks, not an analytics stack.
 *
 * This repository has no analytics vendor and this task does not add one:
 * pulling in a tag manager for eight events would cost a script on every page,
 * a consent banner conversation and a DSGVO assessment that nobody has asked
 * for yet.
 *
 * What it adds is the seam. `track()` currently forwards to a `window`-level
 * sink if one exists and does nothing otherwise, so the funnel is instrumented
 * the day a vendor is chosen without a single component being touched.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 * A booking event may carry a unit slug, a night count, a party size, an
 * amount, a currency and a payment provider.
 *
 * It may NOT carry a name, an email address, a phone number, a country, or a
 * booking reference. The allow-list below is the enforcement, so a field added
 * to a call site later cannot leak by being forgotten about — and under TDDDG
 * nothing here may fire before consent exists anyway, which is the sink's
 * problem to honour, not this file's to assume.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BookingAnalyticsEvent } from '@/lib/booking/types';

const ALLOWED = new Set(['unitSlug', 'nights', 'guests', 'adults', 'children', 'amountCents', 'currency', 'paymentProvider', 'step']);

type Payload = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    /** Set by whatever analytics layer is eventually adopted. */
    bolagioAnalytics?: (event: string, payload: Record<string, unknown>) => void;
  }
}

export function track(event: BookingAnalyticsEvent, payload: Payload = {}): void {
  if (typeof window === 'undefined') return;
  const sink = window.bolagioAnalytics;
  if (typeof sink !== 'function') return;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED.has(key) || value === undefined) continue;
    safe[key] = value;
  }

  try {
    sink(event, safe);
  } catch {
    // Analytics must never be able to break a booking.
  }
}
