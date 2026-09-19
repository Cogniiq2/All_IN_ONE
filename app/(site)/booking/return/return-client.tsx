'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE RETURN FROM PAYMENT.
 *
 * Four honest outcomes, and the page never guesses between them:
 *
 *   confirmed         the backend says so. Only an authenticated callback
 *                     from n8n can put a booking in that state.
 *   still settling    paid, or awaiting the provider's word. The page polls
 *                     quietly for a short while rather than declaring either
 *                     way — a payment webhook can land a second after the
 *                     browser does.
 *   not completed     cancelled, failed or expired. It says so plainly, and
 *                     says that nothing has been charged.
 *   unknown           no readable reference. It offers a route to a person.
 *
 * The word "confirmed" appears on exactly one branch, and that branch is
 * driven by `isConfirmedStatus`, not by the presence of a query parameter.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Clock, CircleAlert, Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, contact } from '@/lib/content/brand';
import { fetchBookingStatus, formatMoney } from '@/lib/booking/client';
import { isBookingReference } from '@/lib/booking/reference';
import { formatDateOrDash } from '@/lib/booking/date-format';
import { track } from '@/lib/booking/analytics';
import { isConfirmedStatus, type BookingIntentView } from '@/lib/booking/types';
import { CtaLink } from '@/components/ui-kit/cta';
import { Section } from '@/components/ui-kit/section';

/**
 * Statuses that are still moving. The page waits on these, briefly.
 *
 * `paid`, `finalizing` and `paid_unfinalized` are in here deliberately: the
 * money has arrived and the reservation is not confirmed yet. That is an
 * ordinary state — Beds24 can be slow, and the reconciliation engine finishes
 * the job — and the honest thing to show is "we are confirming", not a
 * confirmation and not a failure.
 */
const SETTLING = new Set([
  'draft', 'quoted', 'locking', 'hold_created', 'payment_session_created',
  'awaiting_payment', 'payment_pending', 'paid', 'finalizing',
  'paid_unfinalized', 'finalization_failed', 'manual_review',
]);

/** Six polls at five seconds. Long enough for a webhook, short of a hang. */
const POLL_MS = 5_000;
const MAX_POLLS = 6;

export default function BookingReturnClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const params = useSearchParams();

  const reference = params?.get('ref') ?? '';
  const cancelled = params?.get('cancelled') === '1';
  const valid = isBookingReference(reference);

  const [booking, setBooking] = useState<BookingIntentView | null>(null);
  const [loading, setLoading] = useState(valid);
  const [failed, setFailed] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    if (!valid) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = async () => {
      try {
        const next = await fetchBookingStatus(reference);
        if (!active) return;
        setBooking(next);
        setLoading(false);
        if (isConfirmedStatus(next.status)) {
          track('booking_confirmed', {
            unitSlug: next.unitSlug,
            nights: next.nights,
            amountCents: next.totalCents ?? undefined,
            currency: next.currency,
          });
          return;
        }
        // Keep asking only while the booking is genuinely still in motion.
        if (SETTLING.has(next.status) && polls.current < MAX_POLLS) {
          polls.current += 1;
          timer = setTimeout(read, POLL_MS);
        }
      } catch {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      }
    };

    read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reference, valid]);

  const state = useMemo(() => {
    if (!valid || failed) return 'unknown' as const;
    if (loading || !booking) return 'loading' as const;
    if (isConfirmedStatus(booking.status)) return 'confirmed' as const;
    /*
     * The payment column decides this branch, not the booking column.
     *
     * A booking can be `payment_failed` while the money is in fact ours — a
     * denied first attempt followed by a capture that has not been processed
     * yet. Telling that guest their payment did not go through would be wrong
     * and would invite them to pay twice. So a booking whose payment is
     * settled or still in motion is always "we are confirming".
     */
    if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'capture_pending') {
      return 'settling' as const;
    }
    if (booking.status === 'payment_failed') return 'failed' as const;
    if (booking.status === 'cancelled' || booking.status === 'expired' || booking.status === 'released') {
      return 'stopped' as const;
    }
    return 'settling' as const;
  }, [valid, failed, loading, booking]);

  return (
    <Section>
      <div className="container-narrow text-center">
        <Mark state={state} />

        <p className="eyebrow mt-8">{brand.name}</p>
        <h1 className="display-2 mt-4">{heading(state, de, cancelled)}</h1>
        <p className="lede mx-auto mt-5">{body(state, de, cancelled)}</p>

        {/*
          The stay, but only once the backend has actually described it. It is
          never reconstructed from the URL.
        */}
        {booking && (
          <dl
            className="mx-auto mt-10 max-w-[28rem] space-y-2 p-5 text-left text-[13.5px]"
            style={{ background: 'hsl(var(--secondary) / 0.55)', borderRadius: 'var(--radius-md)' }}
          >
            <Row label={de ? 'Referenz' : 'Reference'} value={booking.reference} />
            <Row
              label={de ? 'Zeitraum' : 'Dates'}
              value={`${formatDateOrDash(booking.checkIn)} – ${formatDateOrDash(booking.checkOut)}`}
            />
            <Row label={de ? 'Nächte' : 'Nights'} value={String(booking.nights)} />
            <Row
              label={de ? 'Personen' : 'Guests'}
              value={String(booking.adults + booking.children)}
            />
            {booking.totalCents !== null && (
              <Row
                label={de ? 'Gesamt' : 'Total'}
                value={formatMoney(booking.totalCents, booking.currency, locale)}
              />
            )}
          </dl>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <CtaLink href="/apartments" variant={state === 'confirmed' ? 'secondary' : 'primary'}>
            {de ? 'Apartments ansehen' : 'View apartments'}
          </CtaLink>
          {state !== 'confirmed' && (
            <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="link-quiet">
              {de ? 'Persönlich klären' : 'Speak to us'}
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}

function Mark({ state }: { state: 'loading' | 'confirmed' | 'settling' | 'failed' | 'stopped' | 'unknown' }) {
  const Icon =
    state === 'confirmed' ? Check : state === 'loading' ? Loader2 : state === 'settling' ? Clock : CircleAlert;
  const colour =
    state === 'confirmed' || state === 'loading' || state === 'settling'
      ? 'hsl(var(--champagne-dark))'
      : 'hsl(var(--destructive))';

  return (
    <div
      className="mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-full"
      style={{ border: `1.25px solid ${colour}` }}
    >
      <Icon
        className={`h-7 w-7 ${state === 'loading' ? 'animate-spin' : ''}`}
        style={{ color: colour }}
        aria-hidden="true"
      />
    </div>
  );
}

function heading(state: string, de: boolean, cancelled: boolean): string {
  if (state === 'confirmed') return de ? 'Ihre Reservierung ist bestätigt' : 'Your reservation is confirmed';
  if (state === 'loading') return de ? 'Einen Moment' : 'One moment';
  if (state === 'settling') return de ? 'Wir schließen Ihre Buchung ab' : 'We are completing your booking';
  if (state === 'failed') return de ? 'Die Zahlung ist nicht durchgegangen' : 'The payment did not go through';
  if (state === 'stopped') {
    return cancelled
      ? de ? 'Sie haben die Zahlung abgebrochen' : 'You cancelled the payment'
      : de ? 'Diese Buchung wurde nicht abgeschlossen' : 'This booking was not completed';
  }
  return de ? 'Wir konnten diese Buchung nicht finden' : 'We could not find this booking';
}

function body(state: string, de: boolean, cancelled: boolean): string {
  if (state === 'confirmed') {
    return de
      ? 'Alle Anreisedetails schicken wir Ihnen per E-Mail. Ihre Referenz gilt als Reservierungsnummer.'
      : 'We are sending you all the arrival details by email. Your reference is your reservation number.';
  }
  if (state === 'loading') {
    return de ? 'Wir prüfen den Stand Ihrer Buchung.' : 'We are checking the status of your booking.';
  }
  if (state === 'settling') {
    // Deliberately does not say "confirmed" and does not say "failed".
    return de
      ? 'Ihre Zahlung wird noch vom Zahlungsdienst bestätigt. Sobald sie angekommen ist, erhalten Sie Ihre Bestätigung per E-Mail — Sie müssen hier nichts weiter tun.'
      : 'Your payment is still being confirmed by the payment provider. As soon as it arrives you will receive your confirmation by email — there is nothing further to do here.';
  }
  if (state === 'failed' || state === 'stopped') {
    return cancelled
      ? de
        ? 'Es wurde nichts abgebucht und Ihr Zeitraum wurde wieder freigegeben. Sie können jederzeit erneut buchen.'
        : 'Nothing has been charged and your dates have been released. You are welcome to book again at any time.'
      : de
      ? 'Es wurde nichts abgebucht. Ihr Zeitraum wurde wieder freigegeben — bitte versuchen Sie es erneut oder sprechen Sie uns an.'
      : 'Nothing has been charged. Your dates have been released — please try again or speak to us.';
  }
  return de
    ? 'Bitte prüfen Sie den Link aus Ihrer Bestätigung, oder melden Sie sich kurz bei uns.'
    : 'Please check the link from your confirmation, or get in touch with us.';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
