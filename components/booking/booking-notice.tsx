'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FAILURE, in BoLaGio's voice.
 *
 * Every way a booking can fail has one sentence here, in both languages, and
 * the booking flow renders this component rather than any text of its own.
 *
 * ── What a guest is never shown ──────────────────────────────────────────
 * A Beds24 message. A database error. A stack trace. An n8n response. A
 * provider id. The server already guarantees that none of those leave it
 * (lib/booking/http.ts); this file is the other half — a closed set of codes
 * in, a written sentence out, and no path where an unexpected code renders raw
 * text on a premium surface.
 *
 * ── Tone ─────────────────────────────────────────────────────────────────
 * Two things matter to someone who has just lost their dates: knowing what
 * happened, and knowing whether they have been charged. So the conflict
 * sentence says the residence was taken — not "an error occurred" — and every
 * payment-related failure says in its own words that no money has moved. The
 * treatment is the site's existing quiet alert: a hairline, a tinted ground,
 * no red panel and no exclamation mark.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { CircleAlert, Clock, MessageCircle } from 'lucide-react';
import type { Locale } from '@/lib/content/apartments';
import { contact } from '@/lib/content/brand';
import { label } from '@/components/ui-kit/cta';
import type { BookingErrorCode } from '@/lib/booking/types';

type Copy = { de: string; en: string };

/**
 * The wording, by code.
 *
 * `availability_conflict` is the one that matters most: it is not an error,
 * it is news. Someone booked the residence through Booking.com or Airbnb while
 * this guest was choosing, and the sentence says exactly that without blaming
 * anything on a system.
 */
const MESSAGES: Record<BookingErrorCode, Copy> = {
  availability_conflict: {
    de: 'Diese Residenz wurde für den gewählten Zeitraum soeben reserviert. Ihre Angaben bleiben erhalten — bitte wählen Sie andere Daten.',
    en: 'This residence has just been reserved for the selected dates. Your details are kept — please choose different dates.',
  },
  stay_rules: {
    de: 'Für diesen Zeitraum gilt eine abweichende Mindest- oder Höchstaufenthaltsdauer.',
    en: 'A different minimum or maximum stay applies to these dates.',
  },
  occupancy: {
    de: 'Diese Residenz ist für weniger Gäste ausgelegt. Bitte passen Sie die Personenzahl an.',
    en: 'This residence sleeps fewer guests. Please adjust the party size.',
  },
  invalid_dates: {
    de: 'Bitte wählen Sie einen gültigen Zeitraum mit mindestens einer Nacht.',
    en: 'Please choose a valid period of at least one night.',
  },
  invalid_input: {
    de: 'Bitte prüfen Sie Ihre Angaben.',
    en: 'Please check your details.',
  },
  quote_expired: {
    de: 'Ihr Preis ist nicht mehr aktuell. Wir prüfen den Zeitraum erneut.',
    en: 'Your price is no longer current. We will check the dates again.',
  },
  hold_expired: {
    de: 'Ihre Reservierung ist abgelaufen. Wir prüfen den gewählten Zeitraum erneut.',
    en: 'Your reservation hold has expired. We will check the selected dates again.',
  },
  provider_unavailable: {
    de: 'Die Live-Verfügbarkeit ist derzeit nicht erreichbar. Bitte versuchen Sie es in Kürze erneut.',
    en: 'Live availability is temporarily unavailable. Please try again shortly.',
  },
  not_bookable: {
    de: 'Diese Residenz ist derzeit nicht online buchbar. Sprechen Sie uns gerne persönlich an.',
    en: 'This residence cannot be booked online at the moment. Please speak to us directly.',
  },
  payment_handoff_failed: {
    de: 'Die sichere Zahlungsseite konnte nicht geöffnet werden. Es wurde nichts abgebucht.',
    en: 'We could not open the secure payment page. No payment has been taken.',
  },
  rate_limited: {
    de: 'Einen Moment bitte — versuchen Sie es gleich noch einmal.',
    en: 'One moment please — try again in a few seconds.',
  },
  booking_disabled: {
    de: 'Die Online-Buchung ist noch nicht freigeschaltet. Schreiben Sie uns — wir bestätigen Ihre Daten persönlich.',
    en: 'Online booking is not open yet. Write to us and we will confirm your dates personally.',
  },
  /*
   * The careful one. The guest must WAIT and must not press the button again:
   * a retry is exactly what would double-book or double-charge them. So the
   * wording promises a person rather than inviting an action, and says
   * plainly that nothing is lost.
   */
  pending_verification: {
    de: 'Wir prüfen gerade den Stand Ihrer Buchung. Bitte versuchen Sie es nicht erneut — es geht nichts verloren, und wir melden uns in Kürze bei Ihnen.',
    en: 'We are checking the status of your booking. Please do not try again — nothing is lost, and we will come back to you shortly.',
  },
  unexpected: {
    de: 'Das hat leider nicht funktioniert. Es wurde nichts abgebucht.',
    en: 'That did not work. No payment has been taken.',
  },
};

/**
 * Codes where the most useful next step is a person rather than a retry.
 * They get the WhatsApp line the enquiry forms already use.
 */
const OFFER_CONTACT = new Set<BookingErrorCode>([
  'not_bookable',
  'booking_disabled',
  'pending_verification',
  'payment_handoff_failed',
  'unexpected',
]);

export function BookingNotice({
  code,
  locale,
  meta,
}: {
  code: BookingErrorCode;
  locale: Locale;
  meta?: Record<string, number | string | boolean>;
}) {
  const de = locale === 'de';
  const copy = MESSAGES[code] ?? MESSAGES.unexpected;

  // A minimum stay is genuinely useful to know, so it is added as a second
  // line when the server supplied it. Nothing else from `meta` is rendered.
  const minNights = typeof meta?.minNights === 'number' ? meta.minNights : undefined;
  const maxGuests = typeof meta?.maxGuests === 'number' ? meta.maxGuests : undefined;

  // An expiry is a matter of time passing, not a fault; it gets the softer
  // clock mark rather than the alert mark.
  const temporal = code === 'hold_expired' || code === 'quote_expired';
  const Icon = temporal ? Clock : CircleAlert;
  const tone = temporal ? 'hsl(var(--champagne-dark))' : 'hsl(var(--destructive))';

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md p-3.5"
      style={{
        background: temporal ? 'hsl(var(--champagne) / 0.12)' : 'hsl(var(--destructive) / 0.07)',
        border: `1px solid ${temporal ? 'hsl(var(--champagne-dark) / 0.3)' : 'hsl(var(--destructive) / 0.25)'}`,
      }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone }} aria-hidden="true" />
      <div>
        <p className="text-[13px] leading-relaxed" style={{ color: tone }}>
          {copy[locale]}
        </p>

        {minNights !== undefined && (
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de
              ? `Mindestaufenthalt: ${minNights} ${minNights === 1 ? 'Nacht' : 'Nächte'}.`
              : `Minimum stay: ${minNights} ${minNights === 1 ? 'night' : 'nights'}.`}
          </p>
        )}
        {maxGuests !== undefined && (
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de ? `Maximal ${maxGuests} Personen.` : `Up to ${maxGuests} guests.`}
          </p>
        )}

        {OFFER_CONTACT.has(code) && (
          <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="link-quiet mt-2">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {label('writeWhatsApp', locale)}
          </a>
        )}
      </div>
    </div>
  );
}
