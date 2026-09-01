/**
 * ══════════════════════════════════════════════════════════════════════════
 * CALENDAR EXPORT — only for things that are actually confirmed.
 *
 * Two exports exist here and both are deliberately hard to reach:
 *
 *   a stay        an all-day event from arrival to departure, offered on the
 *                 booking confirmation;
 *   an appointment a timed event, offered on the rental confirmation.
 *
 * ── The rule this file exists to enforce ─────────────────────────────────
 * A calendar entry is a promise. Once it is in someone's calendar it outlives
 * the page it came from, and nothing on it says "we still have to confirm
 * this". So an event is built ONLY from a confirmation that came back from the
 * backend — never from what the visitor typed, and never because a form
 * submitted successfully.
 *
 * Today neither flow produces one:
 *   • a booking is a *request*. No availability source and no live payment
 *     stand behind it (AVAILABILITY_SOURCE is 'none', PAYMENT_ENABLED is
 *     false), so a person confirms it afterwards, off the website. The
 *     confirmation screen therefore shows no calendar action at all.
 *   • a rental enquiry asks for an appointment; BoLaGio still has to answer
 *     with a time. There is no appointment to add until then.
 *
 * Both `readConfirmedStay` and `readConfirmedAppointment` read a confirmation
 * out of the enquiry endpoint's own response. When the PMS and the payment
 * provider are connected and that endpoint starts answering with a confirmed
 * booking — or when the rental side starts answering with a fixed appointment
 * time — the "add to calendar" action appears on its own. Nothing in the UI
 * needs to change for that, and nothing here can be made to appear by editing
 * a flag by hand.
 *
 * ── What an event may contain ────────────────────────────────────────────
 * The apartment or unit name, the dates, the city, and how to reach us.
 * Deliberately NOT: the guest's name, email or phone, any price, any payment
 * detail, any booking reference or internal identifier. A calendar entry is
 * frequently synced to third-party servers and shared with colleagues and
 * family; it is not a place to put personal data that is not needed to keep
 * the appointment.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Locale } from '@/lib/content/apartments';
import { brand, contact } from '@/lib/content/brand';
import { toIsoDate } from '@/lib/booking/availability';

/** A stay that the backend has actually confirmed. ISO `YYYY-MM-DD`. */
export interface ConfirmedStay {
  arrival: string;
  departure: string;
}

/** An appointment that BoLaGio has actually fixed. ISO 8601 date-time. */
export interface ConfirmedAppointment {
  start: string;
  /** Optional end. One hour is assumed when it is absent. */
  end?: string;
}

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  /** `YYYY-MM-DD` for an all-day event, ISO date-time otherwise. */
  start: string;
  end: string;
  allDay: boolean;
}

/* ── Reading a confirmation ─────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isoDateTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * A confirmed stay, or `undefined`.
 *
 * The backend has to say so explicitly — `confirmed: true` plus both dates.
 * A successful POST is not a confirmation, and neither is the visitor's own
 * date selection, so neither can reach this function's return value.
 */
export function readConfirmedStay(payload: unknown): ConfirmedStay | undefined {
  if (!isRecord(payload)) return undefined;
  const booking = isRecord(payload.booking) ? payload.booking : undefined;
  if (!booking || booking.confirmed !== true) return undefined;

  const arrival = toIsoDate(typeof booking.arrival === 'string' ? booking.arrival : undefined);
  const departure = toIsoDate(typeof booking.departure === 'string' ? booking.departure : undefined);
  if (!arrival || !departure || departure <= arrival) return undefined;

  return { arrival, departure };
}

/**
 * A confirmed appointment, or `undefined`.
 *
 * Same rule: `confirmed: true` and a real start time, sent back by the
 * backend. An enquiry that merely went through is not an appointment, and the
 * confirmation screen says exactly that instead.
 */
export function readConfirmedAppointment(payload: unknown): ConfirmedAppointment | undefined {
  if (!isRecord(payload)) return undefined;
  const appointment = isRecord(payload.appointment) ? payload.appointment : undefined;
  if (!appointment || appointment.confirmed !== true) return undefined;

  const start = isoDateTime(appointment.start);
  if (!start) return undefined;

  const end = isoDateTime(appointment.end);
  return end && end > start ? { start, end } : { start };
}

/** Parses a response body without letting a malformed one break the flow. */
export async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
}

/* ── Building the event ─────────────────────────────────────────────────── */

/** The night after an ISO date — a DTEND for an all-day range is exclusive. */
function dayAfter(iso: string): string {
  const next = new Date(`${iso}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * The event for a confirmed stay: all-day, arrival through departure.
 *
 * "BoLaGio – Apartment Schulstraße I", so it is recognisable in a month view
 * months later without opening it.
 */
export function stayEvent(
  stay: ConfirmedStay,
  unitName: string,
  locale: Locale
): CalendarEvent {
  const de = locale === 'de';
  return {
    title: `${brand.name} – ${unitName}`,
    description: de
      ? `Ihr bestätigter Aufenthalt bei ${brand.name} in ${brand.city}. Fragen? ${contact.phone}`
      : `Your confirmed stay with ${brand.name} in ${brand.city}. Questions? ${contact.phone}`,
    location: `${unitName}, ${brand.city}, ${brand.country}`,
    start: stay.arrival,
    // Exclusive, per RFC 5545 and Google's own format: a stay ending on the
    // 12th must not paint the 12th as occupied.
    end: dayAfter(stay.departure),
    allDay: true,
  };
}

/** The event for a confirmed viewing or consultation appointment. */
export function appointmentEvent(
  appointment: ConfirmedAppointment,
  unitName: string,
  locale: Locale
): CalendarEvent {
  const de = locale === 'de';
  const start = new Date(appointment.start);
  const end = appointment.end
    ? new Date(appointment.end)
    : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    title: de
      ? `${brand.name} – Termin ${unitName}`
      : `${brand.name} – Appointment ${unitName}`,
    description: de
      ? `Ihr bestätigter Termin mit ${brand.name} zu ${unitName}. Fragen? ${contact.phone}`
      : `Your confirmed appointment with ${brand.name} about ${unitName}. Questions? ${contact.phone}`,
    location: `${unitName}, ${brand.city}, ${brand.country}`,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
  };
}

/* ── Export formats ─────────────────────────────────────────────────────── */

/** `YYYYMMDD` for an all-day event, `YYYYMMDDTHHMMSSZ` for a timed one. */
function stamp(value: string, allDay: boolean): string {
  if (allDay) return value.replace(/-/g, '');
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * A Google Calendar "add event" link.
 *
 * Opens Google's own pre-filled event form in a new tab; the visitor still
 * presses save, so nothing is written to their calendar without them.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.start, event.allDay)}/${stamp(event.end, event.allDay)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapes a value for an iCalendar property, per RFC 5545 §3.3.11. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds a content line to the 75-octet limit of RFC 5545 §3.1.
 *
 * A continuation is a CRLF followed by one space. Counted in UTF-8 bytes, not
 * characters — "Opernstraße" is longer on the wire than it looks, and a fold
 * placed mid-character corrupts it.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // First line takes 75 octets, every continuation 74 plus its leading space.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);

  return parts.join('\r\n ');
}

/**
 * An RFC 5545 .ics file — what Apple Calendar, Outlook and everything else
 * that is not Google reads.
 *
 * Lines are joined with CRLF and folded to 75 octets, both of which the
 * specification requires and which Outlook in particular is strict about. The
 * file ends with a CRLF as well.
 */
export function icsFor(event: CalendarEvent): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // Stable enough to let a re-import update rather than duplicate the entry,
  // and derived only from the event itself — no booking reference, no
  // identifier that means anything outside this file.
  const uid = `${stamp(event.start, event.allDay)}-${event.title.replace(/\W+/g, '-').toLowerCase()}@bolagio`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${brand.name}//Website//DE`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    event.allDay
      ? `DTSTART;VALUE=DATE:${stamp(event.start, true)}`
      : `DTSTART:${stamp(event.start, false)}`,
    event.allDay
      ? `DTEND;VALUE=DATE:${stamp(event.end, true)}`
      : `DTEND:${stamp(event.end, false)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** A filename for the downloaded .ics, safe on every platform. */
export function icsFileName(event: CalendarEvent): string {
  const slug = event.title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'termin'}.ics`;
}
