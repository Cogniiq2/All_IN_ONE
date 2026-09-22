import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FINANCIAL SHAPE PROBE — what a Beds24 booking says about money, and
 * nothing whatsoever about the person who made it.
 *
 * BoLaGio's finance subledger has to learn, from a REAL Booking.com
 * reservation, which financial facts Beds24 actually supplies: is `price`
 * gross or net, is the channel commission present at all, are taxes broken
 * out, what do invoice items look like. None of that can be settled from the
 * documentation — `beds24.com` is unreachable from the environment this is
 * built in (docs/beds24-contract.md) — so it has to be read off a live
 * booking once.
 *
 * Reading a live booking means holding, for a few milliseconds, a guest's
 * name, email, phone, address and possibly their payment card. This module
 * exists so that NONE of it can leave the process.
 *
 * ── The three rules that make that true ──────────────────────────────────
 *  1. ALLOW LIST, not deny list. A value is returned only when its key
 *     matches a financial pattern AND is not on the forbidden list AND the
 *     value is a shape money comes in (a number, a boolean, a numeric
 *     string, a currency code, a short single token). Everything else
 *     contributes a NAME and a TYPE, never a value.
 *  2. FORBIDDEN KEYS VANISH. A key that looks like a person or a payment
 *     instrument is not reported at all — not its value, not its name, not
 *     its type. It cannot be re-derived from the answer.
 *  3. A FINAL SWEEP. Whatever the first two rules produce is walked once
 *     more and compared against every string the provider actually sent
 *     under a person-shaped key. Anything that matches is replaced by
 *     `[redacted]`. This is the net under the trapeze: if a future Beds24
 *     field puts a guest's surname under `feeDescription`, rules 1 and 2
 *     might let it through and this one will not.
 *
 * ── Read-only, like everything else on this path ─────────────────────────
 * One `GET /bookings?id=…&includeInvoiceItems=true`. No `method`, no body,
 * no idempotency key. `includeInvoiceItems` is the parameter the import
 * already sends (as `false`); this is the same parameter with the other
 * value, not an invented one.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beds24Request } from '@/lib/integrations/beds24/client';
import type { Beds24Booking, Beds24BookingsResponse } from '@/lib/integrations/beds24/types';

/* ── Rule 2: keys that are never reported, in any form ─────────────────── */

/**
 * A key matching this is dropped entirely — its name never appears in the
 * answer, so the answer cannot even confirm that the field exists.
 *
 * It covers three things: the person (name, contact, address, free text they
 * or an agent wrote), the payment instrument (card, PAN, CVV, IBAN), and the
 * credentials the account itself holds (token, password, key). `reference`
 * and its relatives are here because a channel confirmation number
 * identifies one guest's reservation — its PRESENCE is reported separately,
 * under `sourceIdentifiers`, which is all the finance work needs.
 */
const FORBIDDEN_KEY =
  /(name|email|phone|mobile|fax|address|street|city(?!tax|fee)|postcode|postal|zip|state|country|guest|comment|note|message|remark|request|title|company|passport|birth|dob|arrivaltime|card|cvv|cvc|pan|iban|bic|swift|account|token|password|secret|apikey|api_key|signature|custom|infoitem|info_item|ipaddress|ip_address|gps|latitude|longitude|reference|refnum|masked|holder|description|desc(?![a-z])|text|label)/i;

/**
 * Keys whose STRING values identify a PERSON: a name, an address, a contact,
 * an instrument, a reference. Their values are short and specific, so both
 * the whole value and each of its words become needles for the final sweep.
 */
const IDENTITY_VALUE_SOURCE =
  /(name|email|phone|mobile|address|street|city(?!tax|fee)|postcode|postal|zip|country|company|passport|card|iban|holder|reference|custom|title)/i;

/**
 * Keys that hold FREE TEXT someone typed.
 *
 * Only the whole value becomes a needle, never its individual words — and
 * that distinction is the difference between a useful report and an empty
 * one. An invoice line reading "Room charge for Mustermann" would otherwise
 * contribute `room`, `charge` and `for` as needles, and the sweep would go on
 * to redact the field name `roomId`, the item type `charge` and every key
 * with "for" in it. The guest's name in that sentence is already a needle in
 * its own right, from `lastName`; the whole-string rule is what remains
 * useful — it catches a note echoed verbatim into a permitted field.
 */
const FREETEXT_VALUE_SOURCE = /(comment|note|message|remark|descr|text|label|info)/i;

/* ── Rule 1: the financial allow list ──────────────────────────────────── */

export type FinancialCategory =
  | 'price'
  | 'commission'
  | 'tax'
  | 'fee'
  | 'payment'
  | 'payout'
  | 'currency'
  | 'discount';

/**
 * The category a key belongs to, or nothing.
 *
 * Order matters: `commissionAmount` is a commission before it is an amount,
 * and `taxAmount` is a tax before it is an amount, so the specific patterns
 * are consulted before the generic `price` one. A key that matches nothing
 * here is not financial as far as this probe is concerned — it is reported
 * by name and type only.
 */
export function categorise(key: string): FinancialCategory | undefined {
  if (FORBIDDEN_KEY.test(key)) return undefined;
  const k = key.toLowerCase();
  if (/currency|curr(?![a-z])/.test(k)) return 'currency';
  if (/commission|channelfee|channel_fee/.test(k)) return 'commission';
  if (/\btax|vat|mwst|gst|levy|citytax|touris/.test(k)) return 'tax';
  if (/payout|remit|disburse|settle/.test(k)) return 'payout';
  if (/discount|voucher|promo|rebate/.test(k)) return 'discount';
  if (/fee|surcharge|charge(?!back)/.test(k)) return 'fee';
  if (/payment|paid|deposit|balance|due|outstanding|owed|invoice/.test(k)) return 'payment';
  if (/price|amount|total|gross|netamount|netprice|nettotal|netrate|netrevenue|netto|^net$|subtotal|rate|cost|revenue|value/.test(k)) return 'price';
  return undefined;
}

/* ── What a reported value may be ──────────────────────────────────────── */

/** A currency code, and nothing that merely looks like one. */
const CURRENCY = /^[A-Z]{3}$/;
/** A decimal number the provider sent as a string. Beds24 does this. */
const NUMERIC = /^-?\d{1,12}(\.\d{1,6})?$/;
/**
 * A single machine token — a status, a type, an enum. No spaces, no `@`, no
 * punctuation a sentence would carry. A person's full name cannot match it,
 * and a first name alone would still be caught by the final sweep.
 */
const TOKEN = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

/** The JSON type of a value, for the fields whose value is not reportable. */
export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * The value, if it is a shape money comes in — otherwise nothing.
 *
 * A long string, a string with a space in it, an object, an array: all
 * refused. The caller reports the field's name and type instead, which is
 * what the finance work needs in order to ask a better question next time.
 */
export function reportableValue(value: unknown): number | boolean | string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (NUMERIC.test(trimmed)) return trimmed;
  if (CURRENCY.test(trimmed)) return trimmed;
  if (TOKEN.test(trimmed)) return trimmed;
  return undefined;
}

/* ── Rule 3: the final sweep ───────────────────────────────────────────── */

/**
 * Every string the provider sent under a person-shaped key, anywhere in the
 * object. For an IDENTITY field the individual words count too: a response
 * that reported `"Mustermann"` out of a `guestName` of `"Erika Mustermann"`
 * would otherwise slip through an equality check. For a FREE TEXT field only
 * the whole value counts — see `FREETEXT_VALUE_SOURCE`.
 */
export function collectPiiNeedles(value: unknown, keyPath = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectPiiNeedles(item, keyPath, out);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectPiiNeedles(child, key, out);
    }
    return out;
  }
  if (typeof value !== 'string') return out;
  const identity = IDENTITY_VALUE_SOURCE.test(keyPath);
  if (!identity && !FREETEXT_VALUE_SOURCE.test(keyPath)) return out;
  const trimmed = value.trim();
  add(trimmed, out);
  if (identity) {
    for (const word of trimmed.split(/[\s,;/|]+/)) add(word, out);
  }
  return out;
}

/**
 * A candidate needle, kept only when it cannot collide with money.
 *
 * ── Why a short number is never a needle ─────────────────────────────────
 * A postcode is `95444`; a nightly rate could be `95444` too, and a city tax
 * of `8.00` sitting inside a payout of `408.00` would redact the very number
 * this probe exists to read. So a needle must either contain a letter — a
 * name, an email, a reference — or be long enough (eight characters) that a
 * collision with an amount is not a realistic accident. A bare short number
 * loses nothing: every field that could hold one is forbidden outright by
 * rule 2, and a five-digit number under a FINANCIAL key is money.
 */
function add(candidate: string, out: Set<string>): void {
  const value = candidate.toLowerCase();
  if (value.length < 3) return;
  if (!/[a-z]/.test(value) && value.length < 8) return;
  out.add(value);
}

export const REDACTED = '[redacted]';

/**
 * Walk a finished report and replace any string that carries one of the
 * needles. Keys are swept too: a provider that names a field after the guest
 * would otherwise put the name in the answer as a key.
 */
export function redact<T>(report: T, needles: ReadonlySet<string>): T {
  if (needles.size === 0) return report;
  const carries = (text: string): boolean => {
    const haystack = text.toLowerCase();
    let found = false;
    // `forEach` rather than `for…of`: the build targets ES5 and a Set is not
    // iterable there without downlevel iteration.
    needles.forEach((needle) => {
      if (haystack.includes(needle)) found = true;
    });
    return found;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return carries(value) ? REDACTED : value;
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[carries(key) ? REDACTED : key] = walk(child);
      }
      return out;
    }
    return value;
  };
  return walk(report) as T;
}

/* ── The report ────────────────────────────────────────────────────────── */

/** One field the provider sent, described without disclosing a person. */
export interface FieldReport {
  field: string;
  type: string;
  category?: FinancialCategory;
  /** Present only when the value is a number, a boolean, a code or a token. */
  value?: number | boolean | string;
  /** Set when the field was present but its value could not safely be shown. */
  withheld?: true;
}

export interface InvoiceItemsReport {
  present: boolean;
  count: number;
  /** The union of the keys seen across the items, financial ones categorised. */
  fields: FieldReport[];
}

export interface FinancialShapeReport {
  /** Every top-level key the booking carried, minus the forbidden ones. */
  fieldNames: string[];
  /** The financial subset, with values where the value is safe to show. */
  financialFields: FieldReport[];
  /** Present but non-financial keys, by name and type only — the discovery surface. */
  otherFields: FieldReport[];
  /** Keys dropped by rule 2, as a COUNT. Their names are not disclosed. */
  withheldFieldCount: number;
  invoiceItems: InvoiceItemsReport;
  /** Where the booking came from. Channel labels, never a guest identifier. */
  sourceIdentifiers: {
    apiSourceId?: number | string;
    apiSource?: string;
    channel?: string;
    bookingSource?: string;
    source?: string;
    hasApiReference: boolean;
    hasChannelReference: boolean;
    hasReference: boolean;
  };
  /** The provider's own status word. Not a person, and central to money. */
  providerStatus?: string;
  currency?: string;
}

/** Keys whose values are channel labels — safe, and the point of the probe. */
const SOURCE_LABEL_KEYS = ['apiSource', 'channel', 'bookingSource', 'source'] as const;

function fieldReport(key: string, value: unknown): FieldReport {
  const category = categorise(key);
  const shown = category === undefined ? undefined : reportableValue(value);
  return {
    field: key,
    type: describeType(value),
    ...(category ? { category } : {}),
    ...(shown === undefined ? {} : { value: shown }),
    ...(category !== undefined && shown === undefined ? { withheld: true as const } : {}),
  };
}

/**
 * Describe one booking's financial surface.
 *
 * Pure: it takes the object and returns the report, so the whole redaction
 * chain is testable without a provider, which is the only way a guarantee
 * like this one stays true.
 */
export function describeFinancialShape(booking: Record<string, unknown>): FinancialShapeReport {
  const entries = Object.entries(booking);
  const permitted = entries.filter(([key]) => !FORBIDDEN_KEY.test(key));

  const financialFields: FieldReport[] = [];
  const otherFields: FieldReport[] = [];
  for (const [key, value] of permitted) {
    const report = fieldReport(key, value);
    // Invoice items get their own section; listing them twice would only
    // invite someone to read the array itself into the answer.
    if (/^invoiceitems$/i.test(key)) continue;
    (report.category ? financialFields : otherFields).push(report);
  }

  const rawItems = (booking as { invoiceItems?: unknown }).invoiceItems;
  const items = Array.isArray(rawItems) ? rawItems : [];
  const itemFields = new Map<string, FieldReport>();
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) continue;
      // The FIRST occurrence that can show a value wins, so one line with a
      // free-text description does not hide a numeric `amount` on another.
      const existing = itemFields.get(key);
      const next = fieldReport(key, value);
      if (!existing || (existing.value === undefined && next.value !== undefined)) {
        itemFields.set(key, next);
      }
    }
  }

  const label = (key: (typeof SOURCE_LABEL_KEYS)[number]): string | undefined => {
    const value = reportableValue(booking[key]);
    return typeof value === 'string' ? value : undefined;
  };

  const apiSourceIdRaw = booking.apiSourceId;
  const status = reportableValue(booking.status);
  const currencyValue = reportableValue(booking.currency);

  return {
    fieldNames: permitted.map(([key]) => key).sort(),
    financialFields,
    otherFields,
    withheldFieldCount: entries.length - permitted.length,
    invoiceItems: {
      present: rawItems !== undefined,
      count: items.length,
      fields: itemFields.size === 0 ? [] : Array.from(itemFields.values()),
    },
    sourceIdentifiers: {
      ...(typeof apiSourceIdRaw === 'number' || (typeof apiSourceIdRaw === 'string' && NUMERIC.test(apiSourceIdRaw))
        ? { apiSourceId: apiSourceIdRaw }
        : {}),
      ...Object.fromEntries(
        SOURCE_LABEL_KEYS.map((key) => [key, label(key)]).filter(([, value]) => value !== undefined)
      ),
      hasApiReference: booking.apiReference !== undefined && booking.apiReference !== '',
      hasChannelReference: booking.channelReference !== undefined && booking.channelReference !== '',
      hasReference: booking.reference !== undefined && booking.reference !== '',
    },
    ...(typeof status === 'string' ? { providerStatus: status } : {}),
    ...(typeof currencyValue === 'string' ? { currency: currencyValue } : {}),
  };
}

/**
 * The whole pipeline: describe, then sweep.
 *
 * Nothing outside this module is allowed to build a report without the sweep,
 * which is why the two halves are not exported as a convenience pair.
 */
export function safeFinancialReport(booking: Record<string, unknown>): FinancialShapeReport {
  return redact(describeFinancialShape(booking), collectPiiNeedles(booking));
}

/* ── The one provider call ─────────────────────────────────────────────── */

export interface FinancialProbeQuery extends Record<string, string> {
  id: string;
  includeInvoiceItems: 'true';
}

export interface FinancialProbeResult {
  found: boolean;
  /** Exactly the query that was sent, so the answer documents its own source. */
  query: FinancialProbeQuery;
  report?: FinancialShapeReport;
}

/**
 * Read ONE booking by id, with invoice items, and describe it.
 *
 * The raw booking never leaves this function: it is not returned, not logged,
 * not attached to an error. Only the report does.
 */
export async function probeBookingFinancials(externalBookingId: string): Promise<FinancialProbeResult> {
  const query: FinancialProbeQuery = { id: externalBookingId, includeInvoiceItems: 'true' };
  const response = await beds24Request<Beds24BookingsResponse>({
    // GET. No method, no body — see the note at the top of this file.
    path: '/bookings',
    query,
  });
  const row = Array.isArray(response?.data) ? response.data[0] : undefined;
  if (!row) return { found: false, query };
  return {
    found: true,
    query,
    report: safeFinancialReport(row as Beds24Booking as Record<string, unknown>),
  };
}
