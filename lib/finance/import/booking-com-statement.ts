/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM FINANCE STATEMENT — the real export, parsed exactly.
 *
 * Extranet → Finance → statement export, CSV. Validated against a live
 * export (2026-09); the sanitized fixture with the same schema and totals is
 * `tests/finance/fixtures/booking-com-finance-statement.sanitized.csv`.
 *
 * One row is one SETTLEMENT LINE: what Booking.com says a reservation earned,
 * what it kept as commission and payment-service fee, what it paid out net,
 * and under which payout. The file is authoritative for exactly those money
 * facts. It is NOT authoritative for the stay itself — dates, status and unit
 * are Beds24's — so nothing here writes a reservation.
 *
 * Pure: no I/O, no database, no floating-point money. Everything a caller
 * persists comes out of here already in integer cents with its evidence.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { parseDateLoose } from '@/lib/finance/import/csv';

/** The columns of the live export, in its order. All fifteen are required. */
export const BOOKING_COM_STATEMENT_HEADERS = [
  'Type', 'Booking number', 'Check-in', 'Checkout', 'Guest name', 'Payments service provider', 'Reservation status',
  'Currency', 'Payment status', 'Amount', 'Commission', 'Payments Service Fee', 'Net', 'Payout date', 'Payout ID',
] as const;

/**
 * Personal data the finance record does not need. The column is kept in the
 * header (evidence of the file's shape) but its value never reaches the
 * database: identity is the booking number, never a name.
 */
export const BOOKING_COM_STATEMENT_REDACT = ['Guest name'] as const;

/** Row types observed in a live export. Anything else is refused until one has been seen and understood. */
export const VALIDATED_ROW_TYPES = new Set(['reservation']);

/** Currencies the finance subledger can hold. Nothing here converts currency. */
export const SUPPORTED_CURRENCIES = new Set(['EUR']);

/**
 * Tolerance on the per-row identity Amount + Commission + Fee = Net, in
 * cents. Zero: the live export balances to the cent on every row, so there
 * is no evidence that Booking.com rounds the components independently. If a
 * future export proves otherwise, raise this with that file as the evidence.
 */
export const ROW_IDENTITY_TOLERANCE_CENTS = 0;

const MAX_FIELD = 200;

export interface StatementLine {
  rowType: string;
  bookingNumber: string;
  checkIn: string;
  checkOut: string;
  paymentsServiceProvider: string | null;
  reservationStatus: string;
  currency: string;
  paymentStatus: string | null;
  /** Statement gross ("Amount"), cents. */
  grossCents: number;
  /** Commission AS A COST: positive means BoLaGio paid it. `= -sourceCommissionCents`. */
  commissionCents: number;
  /** Payment-service fee AS A COST. `= -sourcePaymentServiceFeeCents`. */
  paymentServiceFeeCents: number;
  /** "Net", cents. */
  netCents: number;
  /** "Commission" exactly as signed in the file (negative for a cost). */
  sourceCommissionCents: number;
  /** "Payments Service Fee" exactly as signed in the file (negative for a cost). */
  sourcePaymentServiceFeeCents: number;
  payoutId: string;
  /** A calendar date: the source gives no time, so none is invented. */
  payoutDate: string;
}

export type LineResult = { ok: true; line: StatementLine } | { ok: false; error: string };

/**
 * An amount as Booking.com writes it: "2492.16", "-358.96", "2,492.16",
 * optionally with the row's currency code or "€" beside it. Integer
 * arithmetic on the digits; no float ever holds the value. More than two
 * decimals, a German decimal comma, brackets or any other shape → null:
 * refusing is safer than guessing which convention a file used.
 */
export function parseStatementAmount(text: string, currency?: string): number | null {
  let t = text.trim().replace(/−/g, '-');
  if (currency) t = t.replace(new RegExp(`^${currency}\\s*|\\s*${currency}$`, 'i'), '');
  t = t.replace(/^€\s*|\s*€$/g, '').replace(/^(-)\s*€\s*/, '$1').trim();
  const m = /^(-|\+)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const whole = Number.parseInt(m[2].replace(/,/g, ''), 10);
  const frac = m[3] ? Number.parseInt(m[3].padEnd(2, '0'), 10) : 0;
  if (!Number.isSafeInteger(whole) || whole > 100_000_000) return null;
  const cents = whole * 100 + frac;
  return m[1] === '-' ? -cents : cents;
}

const BOOKING_NUMBER = /^\d{6,20}$/;
const PAYOUT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TOKEN = /^[A-Za-z][A-Za-z0-9 _.-]{0,39}$/;

/** Parse and validate one row. Never repairs: a row that does not balance is an error, with the numbers in the message. */
export function parseStatementRow(r: Record<string, string>): LineResult {
  const v = (k: string) => (r[k] ?? '').trim();
  for (const h of BOOKING_COM_STATEMENT_HEADERS) {
    if (!BOOKING_COM_STATEMENT_REDACT.includes(h as (typeof BOOKING_COM_STATEMENT_REDACT)[number]) && v(h).length > MAX_FIELD) return { ok: false, error: `${h} is longer than ${MAX_FIELD} characters.` };
  }
  const rowType = v('Type');
  if (!rowType) return { ok: false, error: 'Type is empty.' };
  if (!TOKEN.test(rowType)) return { ok: false, error: 'Type is not a plain word.' };
  if (!VALIDATED_ROW_TYPES.has(rowType.toLowerCase())) return { ok: false, error: `Row type "${rowType}" has not been validated against a live export; it is kept here as evidence and not imported.` };

  const bookingNumber = v('Booking number');
  if (!BOOKING_NUMBER.test(bookingNumber)) return { ok: false, error: 'Booking number is not a Booking.com reservation number (6–20 digits).' };

  const checkIn = parseDateLoose(v('Check-in'));
  const checkOut = parseDateLoose(v('Checkout'));
  if (!checkIn) return { ok: false, error: 'Check-in is not a date.' };
  if (!checkOut) return { ok: false, error: 'Checkout is not a date.' };
  if (checkOut <= checkIn) return { ok: false, error: 'Checkout is not after check-in.' };

  const currency = v('Currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Currency is not a three-letter code.' };
  if (!SUPPORTED_CURRENCIES.has(currency)) return { ok: false, error: `Currency ${currency} is not supported. Nothing here converts currency and every report sums cents as euros; this row is kept as evidence and not imported.` };

  const reservationStatus = v('Reservation status').toLowerCase();
  if (!TOKEN.test(reservationStatus)) return { ok: false, error: 'Reservation status is empty or not a plain word.' };
  const paymentStatusRaw = v('Payment status');
  if (paymentStatusRaw && !TOKEN.test(paymentStatusRaw)) return { ok: false, error: 'Payment status is not a plain word.' };
  const provider = v('Payments service provider');

  const gross = parseStatementAmount(v('Amount'), currency);
  const commission = parseStatementAmount(v('Commission'), currency);
  const fee = parseStatementAmount(v('Payments Service Fee'), currency);
  const net = parseStatementAmount(v('Net'), currency);
  if (gross === null) return { ok: false, error: `Amount "${v('Amount')}" is not an amount.` };
  if (commission === null) return { ok: false, error: `Commission "${v('Commission')}" is not an amount.` };
  if (fee === null) return { ok: false, error: `Payments Service Fee "${v('Payments Service Fee')}" is not an amount.` };
  if (net === null) return { ok: false, error: `Net "${v('Net')}" is not an amount.` };
  if (gross < 0) return { ok: false, error: 'Amount is negative on a reservation row; that shape has not been validated.' };
  // Costs arrive signed negative. A positive one on a reservation row would
  // be a refund of commission — plausible, never observed, not guessed at.
  if (commission > 0) return { ok: false, error: 'Commission is positive; the export signs costs negative. Not imported until understood.' };
  if (fee > 0) return { ok: false, error: 'Payments Service Fee is positive; the export signs costs negative. Not imported until understood.' };
  const drift = gross + commission + fee - net;
  if (Math.abs(drift) > ROW_IDENTITY_TOLERANCE_CENTS) {
    return { ok: false, error: `Amount + Commission + Payments Service Fee (${gross} ${commission} ${fee} cents) does not equal Net (${net} cents); off by ${drift} cents. Not repaired.` };
  }

  const payoutId = v('Payout ID');
  if (!payoutId) return { ok: false, error: 'Payout ID is empty: the row is not settled yet. Import it again from an export made after the payout.' };
  if (!PAYOUT_ID.test(payoutId)) return { ok: false, error: 'Payout ID contains characters a payout reference does not have.' };
  const payoutDate = parseDateLoose(v('Payout date'));
  if (!payoutDate) return { ok: false, error: 'Payout date is not a date.' };

  return {
    ok: true,
    line: {
      rowType, bookingNumber, checkIn, checkOut, paymentsServiceProvider: provider ? provider.slice(0, 120) : null, reservationStatus, currency,
      paymentStatus: paymentStatusRaw ? paymentStatusRaw.toLowerCase() : null,
      grossCents: gross, commissionCents: -commission, paymentServiceFeeCents: -fee, netCents: net,
      sourceCommissionCents: commission, sourcePaymentServiceFeeCents: fee, payoutId, payoutDate,
    },
  };
}

/**
 * The LOGICAL identity of a settlement line: which reservation, in which
 * payout, as which kind of row. Stable across overlapping exports — the
 * September rows of a January–September file and of a September–October file
 * have the same identity — and free of personal data.
 */
export function settlementIdentityKey(l: Pick<StatementLine, 'bookingNumber' | 'payoutId' | 'rowType'>): string {
  return `booking_com|${l.bookingNumber}|${l.payoutId}|${l.rowType.toLowerCase()}`;
}

/**
 * The CONTENT a logical line asserts. Same identity + same content = the same
 * fact seen again (skip). Same identity + different content = Booking.com has
 * amended the line: kept as evidence, never silently overwritten.
 */
export function settlementContentString(l: StatementLine): string {
  return [settlementIdentityKey(l), l.checkIn, l.checkOut, l.currency, l.grossCents, l.sourceCommissionCents, l.sourcePaymentServiceFeeCents, l.netCents, l.payoutDate, l.reservationStatus, l.paymentStatus ?? ''].join('|');
}
