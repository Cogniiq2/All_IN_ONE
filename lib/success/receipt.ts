/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE RECEIPT — what a form hands to its success page.
 *
 * A success page is a separate URL (so it can be linked, reloaded and
 * measured as a conversion), but the details that make it personal — the
 * guest's first name, the apartment, the dates — must NOT travel in that URL:
 * a query string lands in server logs, analytics, the Referer header of the
 * next click and the browser history of a shared computer.
 *
 * So the form writes a small receipt into sessionStorage immediately before
 * it navigates, and the page reads it:
 *
 *   • sessionStorage: this tab only, gone when the tab closes, never sent to
 *     any server. It holds only what the visitor typed a moment earlier, to
 *     show it back to them — the confirmation they asked for, which is why it
 *     needs no separate consent (strictly necessary, § 25 Abs. 2 Nr. 2 TDDDG).
 *   • 30 minutes: a receipt older than that is ignored, so a page reopened the
 *     next day shows the general, still-accurate version rather than stale
 *     details.
 *   • no receipt (direct visit, private mode, storage refused): the page
 *     renders its general version. Nothing is invented to fill a gap.
 *
 * Booking confirmations take their facts from the booking backend by
 * reference, the only source allowed to say "confirmed". The receipt adds
 * nothing to them but the guest's first name.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { ThankYouKind } from '@/lib/content/success';

/**
 * One receipt per success page. `booking` is the paid flow: it carries only
 * the first name and the reference, and the confirmed page uses the name
 * only when that reference matches the one it is showing.
 * `privileges-unsubscribed` is empty: its presence is what lets that page say
 * "you are unsubscribed" to the person who just did it, and to nobody else.
 */
export type ReceiptKind = ThankYouKind | 'booking' | 'privileges-unsubscribed';

export interface Receipt {
  /** The first word of the name the visitor typed. Never the full name. */
  firstName?: string;
  unitSlug?: string;
  /** ISO dates, short-term journeys only. */
  arrival?: string;
  departure?: string;
  guests?: number;
  /** Long-term journeys: who is asking. */
  party?: 'private' | 'company';
  /** Long-term enquiry: what they asked for. */
  request?: 'consultation' | 'viewing' | 'information';
  /** Long-term: the residential or commercial interest. */
  interest?: 'long-term-residential' | 'long-term-commercial';
  /** Set by the booking-request flow when a BoLaGio reference exists. */
  reference?: string;
}

const PREFIX = 'bolagio:receipt:';
export const RECEIPT_TTL_MS = 30 * 60_000;

/** The first word of a typed name, trimmed and bounded. */
export function firstNameOf(name: string): string | undefined {
  const first = name.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : undefined;
}

export function saveReceipt(kind: ReceiptKind, receipt: Receipt, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(PREFIX + kind, JSON.stringify({ at: now, receipt }));
  } catch {
    // Storage refused (private mode, quota, policy): the page shows its
    // general version. The submission itself already succeeded.
  }
}

export function readReceipt(kind: ReceiptKind, now: number = Date.now()): Receipt | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + kind);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown; receipt?: unknown };
    if (typeof parsed.at !== 'number' || now - parsed.at > RECEIPT_TTL_MS || now < parsed.at) return null;
    return sanitizeReceipt(parsed.receipt);
  } catch {
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Everything read back is untrusted (another script on the origin, a manual
 * edit): each field is re-validated and anything unexpected is dropped.
 */
export function sanitizeReceipt(value: unknown): Receipt | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: Receipt = {};
  if (typeof v.firstName === 'string' && v.firstName.trim()) out.firstName = v.firstName.trim().slice(0, 40);
  if (typeof v.unitSlug === 'string' && /^[a-z0-9-]{2,64}$/.test(v.unitSlug)) out.unitSlug = v.unitSlug;
  if (typeof v.arrival === 'string' && ISO_DATE.test(v.arrival)) out.arrival = v.arrival;
  if (typeof v.departure === 'string' && ISO_DATE.test(v.departure)) out.departure = v.departure;
  if (typeof v.guests === 'number' && Number.isInteger(v.guests) && v.guests > 0 && v.guests < 50) out.guests = v.guests;
  if (v.party === 'private' || v.party === 'company') out.party = v.party;
  if (v.request === 'consultation' || v.request === 'viewing' || v.request === 'information') out.request = v.request;
  if (v.interest === 'long-term-residential' || v.interest === 'long-term-commercial') out.interest = v.interest;
  if (typeof v.reference === 'string' && /^BLG-[A-Z0-9]{6}$/.test(v.reference)) out.reference = v.reference;
  return out;
}
