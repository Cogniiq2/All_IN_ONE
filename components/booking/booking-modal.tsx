'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE SHORT-TERM BOOKING DIALOG.
 *
 * Same five screens, same order, same premium furniture: guests, dates,
 * contact, payment, done. What changed is what stands behind them.
 *
 * ── Two modes, decided by data, never by a flag ──────────────────────────
 *
 *   BOOKABLE     the residence is connected to the channel manager. The
 *                calendar shows real reserved nights, the price is a live
 *                Beds24 offer, submitting creates a BoLaGio booking intent,
 *                blocks the inventory, and hands off to Stripe or PayPal.
 *
 *   ENQUIRY      the residence has no connected source — the Opernstraße
 *                flats today, and every unit until its Beds24 mapping exists.
 *                Exactly the previous behaviour, unchanged: a booking request
 *                to the existing endpoint, confirmed by a person afterwards.
 *
 * The switch is `calendar.unsourced`, which the server computes. There is no
 * developer toggle and no way to make a residence look bookable that is not.
 *
 * ── What this component is not allowed to do ─────────────────────────────
 * Compute a total. Decide whether dates are free. Decide whether a booking is
 * confirmed. All three are read from server responses — see lib/booking/client.
 * The confirmation screen says "confirmed" only when the backend status says
 * so, and that status only ever moves through an authenticated callback.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Banknote, Check, CreditCard, Loader as Loader2, Minus, Plus, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, ENQUIRY_ENDPOINT } from '@/lib/content/brand';
import { nightsBetween } from '@/lib/booking/availability';
import { clampGuestsFor, maxGuestsFor, MIN_GUESTS } from '@/lib/booking/occupancy';
import { formatDateOrDash } from '@/lib/booking/date-format';
import { PayPalButton } from '@/components/booking/paypal-button';
import {
  BookingRequestError,
  createBookingIntent,
  fetchAvailability,
  fetchQuote,
  formatMoney,
} from '@/lib/booking/client';
import { track } from '@/lib/booking/analytics';
import type {
  AvailabilityCalendar,
  BookingErrorCode,
  BookingQuote,
  InventoryDay,
} from '@/lib/booking/types';
import {
  readConfirmedStay,
  readResponsePayload,
  stayEvent,
  type ConfirmedStay,
} from '@/lib/booking/calendar';
import { useStay } from '@/lib/booking/stay-context';
import { DialogModal, Step, StepActions } from '@/components/ui-kit/modal';
import { StayCalendar } from '@/components/booking/stay-calendar';
import { BookingNotice } from '@/components/booking/booking-notice';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { CtaButton } from '@/components/ui-kit/cta';
import { ContactFields, EMAIL_PATTERN } from '@/components/enquiry/enquiry-fields';
import { AddToCalendar } from '@/components/booking/add-to-calendar';
import { CheckoutSummary, checkoutReady, ORDER_BUTTON_LABEL } from '@/components/booking/checkout-summary';
import { versionsOf } from '@/lib/legal/booking-terms';

/**
 * `paying` is the state where the inventory is HELD and the PayPal button is
 * on screen. It is distinct from `success` because a held booking is not a
 * paid one, and the modal must not show a confirmation screen for either
 * until the server says so.
 */
type Status = 'idle' | 'sending' | 'paying' | 'success' | 'error';

/**
 * The payment providers.
 *
 * `handoff` marks the ones that can actually be EXECUTED against a live
 * inventory hold. Today that is PayPal alone, implemented server-side in this
 * repository — see lib/payments/paypal.
 *
 * Card is deliberately not `paypal` in disguise. It will be Stripe, through
 * the same `PaymentProviderAdapter` seam, and until that adapter exists it is
 * offered only in enquiry mode as a stated preference. Showing a card button
 * that opens a PayPal page would be a small lie at the most trust-sensitive
 * moment of the journey.
 *
 * Bank transfer is enquiry-only for a different reason: a fifteen-minute
 * inventory hold and a two-day transfer contradict each other.
 */
const METHODS = [
  { id: 'paypal', handoff: 'paypal', icon: Wallet, de: 'PayPal', en: 'PayPal', note: { de: 'sicher über PayPal', en: 'securely via PayPal' } },
  { id: 'card', handoff: null, icon: CreditCard, de: 'Kreditkarte', en: 'Card', note: { de: 'auf Anfrage', en: 'on request' } },
  { id: 'transfer', handoff: null, icon: Banknote, de: 'Überweisung', en: 'Bank transfer', note: { de: 'auf Rechnung', en: 'on invoice' } },
] as const;
type MethodId = (typeof METHODS)[number]['id'];

const LAST_STEP = 4;

export function BookingModal() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { unit, stage, backToDetail, close } = useUnitFlow();
  const { stay, setStay } = useStay();

  const open = stage === 'booking' && Boolean(unit);
  const upcoming = unit?.status === 'in-preparation';
  const maxGuests = maxGuestsFor(unit);

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  const [guests, setGuests] = useState(clampGuestsFor(stay.guests, maxGuests) ?? 2);
  const [dates, setDates] = useState({ arrival: stay.arrival, departure: stay.departure });
  const [method, setMethod] = useState<MethodId>('card');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });

  /** Real inventory for this residence, or an `unsourced` answer. */
  const [calendar, setCalendar] = useState<AvailabilityCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  /** The live Beds24 offer. The only source of a price anywhere on screen. */
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  /** Whatever went wrong last, as a code the notice component has copy for. */
  const [notice, setNotice] = useState<{ code: BookingErrorCode; meta?: Record<string, number | string | boolean> } | null>(null);

  /** Set only when the backend confirms. Never inferred from a successful POST. */
  const [confirmed, setConfirmed] = useState<ConfirmedStay | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  /**
   * The booking status the SERVER returned after a capture.
   *
   * Distinct from `confirmed`, which only the backend's own confirmation
   * fills. A guest who has paid but whose Beds24 finalization has not landed
   * yet is `paid`, not `confirmed`, and must be told the first thing rather
   * than the second — see the settling branch in SuccessState.
   */
  const [settledStatus, setSettledStatus] = useState<string | null>(null);

  /**
   * One id per opening of the dialog.
   *
   * It rides along on the booking request so the server can tell a deliberate
   * retry from a double-click. The idempotency guarantee itself is the unique
   * index on the server; this is the part the client can usefully contribute.
   */
  const attemptId = useRef<string>('');

  const bookable = Boolean(calendar && !calendar.unsourced) && !upcoming;
  const days: InventoryDay[] = calendar?.days ?? [];

  // In bookable mode only executable providers are offered, so the selection
  // must be one of them: a hold that ends on the success screen without a
  // payment route would be a booking nobody pays for.
  useEffect(() => {
    if (!bookable) return;
    if (!METHODS.find((m) => m.id === method)?.handoff) {
      const first = METHODS.find((m) => m.handoff);
      if (first) setMethod(first.id);
    }
  }, [bookable, method]);

  // Adopt whatever the hero bar and detail view already know, on each open —
  // and ONLY on open. `book()` and `requestBooking()` write the chosen stay
  // back to the shared context mid-flight; re-running this reset then would
  // throw the guest back to step one with a hold already taken.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setGuests(clampGuestsFor(stay.guests, maxGuests) ?? 2);
    setDates({ arrival: stay.arrival, departure: stay.departure });
    setStep(1);
    setDirection(1);
    setStatus('idle');
    setTouched(false);
    setConfirmed(null);
    setReference(null);
    setQuote(null);
    setNotice(null);
    attemptId.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
  }, [open, stay.arrival, stay.departure, stay.guests, maxGuests]);

  /**
   * Load the calendar once per opening.
   *
   * From the Supabase cache, so paging through months afterwards costs
   * nothing — the whole horizon arrives in one response and the calendar
   * component pages through it locally.
   */
  useEffect(() => {
    if (!open || !unit || upcoming) return;
    const controller = new AbortController();
    setCalendarLoading(true);
    track('booking_calendar_opened', { unitSlug: unit.slug });

    fetchAvailability(unit.slug, {}, controller.signal)
      .then(setCalendar)
      .catch((cause) => {
        if (controller.signal.aborted) return;
        // A calendar that could not load is NOT an empty calendar. It falls
        // back to the enquiry behaviour, which claims nothing.
        setCalendar(null);
        if (cause instanceof BookingRequestError && cause.code === 'provider_unavailable') {
          setNotice({ code: 'provider_unavailable' });
        }
      })
      .finally(() => !controller.signal.aborted && setCalendarLoading(false));

    return () => controller.abort();
  }, [open, unit, upcoming]);

  const nights = nightsBetween(dates.arrival, dates.departure);
  const complete = Boolean(dates.arrival && dates.departure && nights);

  /**
   * Re-quote whenever the stay changes.
   *
   * Live, server-side, every time. A stale total is never carried forward and
   * the browser never adjusts one — change the party size by one and this runs
   * again rather than multiplying anything locally.
   */
  const loadQuote = useCallback(
    (signal?: AbortSignal) => {
      if (!unit || !bookable || !dates.arrival || !dates.departure) return;
      setQuoteLoading(true);
      setNotice(null);
      fetchQuote(
        {
          unitSlug: unit.slug,
          checkIn: dates.arrival,
          checkOut: dates.departure,
          adults: guests,
          children: 0,
        },
        signal
      )
        .then((next) => {
          setQuote(next);
          track('booking_quote_loaded', {
            unitSlug: unit.slug,
            nights: next.nights,
            guests,
            amountCents: next.totalCents,
            currency: next.currency,
          });
        })
        .catch((cause) => {
          if (signal?.aborted) return;
          setQuote(null);
          setNotice(toNotice(cause));
        })
        .finally(() => !signal?.aborted && setQuoteLoading(false));
    },
    [unit, bookable, dates.arrival, dates.departure, guests]
  );

  useEffect(() => {
    if (!open || !complete || !bookable) return;
    const controller = new AbortController();
    loadQuote(controller.signal);
    return () => controller.abort();
  }, [open, complete, bookable, loadQuote]);

  const nameValid = contact.name.trim().length >= 2;
  const emailValid = EMAIL_PATTERN.test(contact.email.trim());
  const contactValid = nameValid && emailValid && contact.phone.trim().length >= 5;

  const canAdvance = useMemo(() => {
    if (step === 1) return guests >= MIN_GUESTS && guests <= maxGuests;
    if (step === 2) return complete;
    if (step === 3) return contactValid;
    return true;
  }, [step, guests, maxGuests, complete, contactValid]);

  const go = (delta: 1 | -1) => {
    if (delta === 1 && !canAdvance) { setTouched(true); return; }
    if (delta === 1 && step === 2 && unit) {
      track('booking_dates_selected', { unitSlug: unit.slug, nights: nights ?? undefined, guests });
    }
    if (delta === 1 && step === 3 && unit) {
      track('guest_details_completed', { unitSlug: unit.slug });
    }
    setDirection(delta);
    setStep((s) => Math.min(LAST_STEP, Math.max(1, s + delta)));
    setTouched(false);
  };

  /**
   * ── The booking path ─────────────────────────────────────────────────
   *
   *  1. create the intent — the server revalidates availability LIVE at
   *     Beds24, prices it, and blocks the inventory before any money moves;
   *  2. render the PayPal button, which asks OUR server for an order;
   *  3. on approval, OUR server captures and PayPal decides.
   *
   * The guest does not leave the page. Nothing here concludes that a payment
   * succeeded: `onSettled` receives the SERVER's view, and even that is only
   * rendered as a status — the word "confirmed" comes from the booking status,
   * never from having got this far.
   *
   * If the dates went while the guest was typing, step 1 comes back as a
   * conflict and the guest is returned to the calendar with everything they
   * typed still in place.
   */
  const book = async () => {
    // Fail closed: no approved terms on screen, no booking. The button is
    // already withheld; this is the second line, not the first.
    if (!unit || !checkoutReady(quote)) return;
    setStatus('sending');
    setNotice(null);
    setStay({ arrival: dates.arrival, departure: dates.departure, guests });

    const { firstName, lastName } = splitName(contact.name);
    const chosen = METHODS.find((m) => m.id === method);

    try {
      track('payment_method_selected', { unitSlug: unit.slug, paymentProvider: chosen?.handoff ?? 'none' });

      const { intent } = await createBookingIntent({
        unitSlug: unit.slug,
        checkIn: dates.arrival!,
        checkOut: dates.departure!,
        adults: guests,
        children: 0,
        guest: {
          firstName,
          lastName,
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          locale,
        },
        attemptId: attemptId.current,
        // Exactly the versions rendered above the button. The server refuses
        // the booking if they are no longer the ones in force, and stores
        // them with the booking as evidence of what the guest agreed to.
        acceptedTerms: versionsOf(quote.terms),
      });

      setReference(intent.reference);

      /*
       * The server priced the stay again, live, before holding it. If that
       * price differs from the one on screen, the guest must see the new
       * total and press the button again — never pay an amount they were not
       * shown. The hold stands; pressing again replays the same attempt.
       */
      if (intent.totalCents !== null && intent.totalCents !== quote.totalCents) {
        setQuote({ ...quote, totalCents: intent.totalCents, components: intent.components.length > 0 ? intent.components : quote.components });
        setNotice({ code: 'quote_expired' });
        setStatus('idle');
        return;
      }

      track('booking_started', {
        unitSlug: unit.slug,
        nights: intent.nights,
        guests,
        amountCents: intent.totalCents ?? undefined,
        currency: intent.currency,
      });

      if (!chosen?.handoff) {
        // Not reachable in bookable mode — only executable providers are
        // offered there — but a hold with no payment route is still a held
        // booking, so it ends on the honest confirmation screen.
        setStatus('success');
        setDirection(1);
        return;
      }

      track('payment_started', { unitSlug: unit.slug, paymentProvider: chosen.handoff });
      // The nights are held. The PayPal button renders in place of the submit
      // button; the guest stays on this page.
      setStatus('paying');
    } catch (cause) {
      setNotice(toNotice(cause));
      setStatus('idle');

      // An availability conflict sends the guest back to the calendar with
      // their contact details intact — losing a filled-in form because someone
      // else booked first would be a second insult.
      if (cause instanceof BookingRequestError && cause.code === 'availability_conflict') {
        setQuote(null);
        setDates((d) => ({ arrival: d.arrival, departure: undefined }));
        setDirection(-1);
        setStep(2);
      }
      // The terms changed under the guest: fetch the current ones so they are
      // what is on screen when the button is pressed again.
      if (cause instanceof BookingRequestError && (cause.code === 'terms_changed' || cause.code === 'terms_unavailable')) {
        loadQuote();
      }
    }
  };

  /**
   * ── The enquiry path ─────────────────────────────────────────────────
   * Unchanged from before this integration. A residence with no connected
   * source cannot be reserved, so nothing pretends otherwise: this is a
   * request, a person answers it, and the confirmation screen says so.
   */
  const requestBooking = async () => {
    setStatus('sending');
    setStay({ arrival: dates.arrival, departure: dates.departure, guests });

    try {
      const response = await fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'booking-request',
          apartment: unit ? { slug: unit.slug, name: unit.name.de } : null,
          stay: {
            arrival: dates.arrival ?? null,
            departure: dates.departure ?? null,
            nights: nights ?? null,
            guests: clampGuestsFor(guests, maxGuests) ?? MIN_GUESTS,
          },
          payment: {
            // A stated preference, not a transaction. No provider is contacted
            // on this path.
            preferredMethod: method,
            captured: false,
          },
          guest: {
            name: contact.name.trim(),
            email: contact.email.trim(),
            phone: contact.phone.trim(),
            locale,
          },
          meta: { source: 'website-booking', brand: brand.name },
        }),
      });
      if (!response.ok) throw new Error(`Booking request failed with ${response.status}`);
      setConfirmed(readConfirmedStay(await readResponsePayload(response)) ?? null);
      setDirection(1);
      setStatus('success');
    } catch {
      setNotice({ code: 'unexpected' });
      setStatus('idle');
    }
  };

  const submit = () => (bookable && quote ? book() : requestBooking());

  if (!unit) return null;

  // A unit in preparation cannot be booked. It reaches this dialog only via
  // "Informiert werden", which is a note, not a reservation.
  const title = upcoming
    ? de ? 'Informiert werden' : 'Keep me posted'
    : de ? 'Buchung' : 'Booking';

  return (
    <DialogModal
      open={open}
      onOpenChange={(next) => !next && close()}
      eyebrow={`${brand.name} · ${unit.name[locale]}`}
      title={title}
      description={
        status === 'success'
          ? undefined
          : upcoming
          ? de ? 'Wir sagen Ihnen Bescheid, sobald dieses Apartment buchbar ist.'
              : 'We will let you know as soon as this apartment can be booked.'
          : bookable
          // § 312j Abs. 1 BGB: the accepted means of payment, stated at the
          // start of the ordering process rather than discovered at the end.
          ? de ? 'Vier Schritte. Bezahlung sicher per PayPal.'
              : 'Four steps. Payment securely via PayPal.'
          : de ? 'Vier Schritte. Alles außer Ihren Kontaktdaten wählen Sie aus.'
              : 'Four steps. Everything but your contact details is a choice.'
      }
    >
      {status !== 'success' && !upcoming && <Progress step={step} />}

      <div className="px-6 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {status === 'success' ? (
            <SuccessState
              key="done"
              firstName={contact.name.split(' ')[0]}
              upcoming={upcoming}
              confirmed={confirmed}
              reference={reference}
              unitName={unit.name[locale]}
              settledStatus={settledStatus}
              onClose={close}
            />
          ) : upcoming ? (
            <Step key="notify" direction={1}>
              <ContactFields
                locale={locale}
                idPrefix="notify"
                values={contact}
                onChange={(k, v) => setContact((c) => ({ ...c, [k]: v }))}
                touched={touched}
              />
              {notice && <div className="mt-5"><BookingNotice code={notice.code} meta={notice.meta} locale={locale} /></div>}
              <div className="mt-7">
                <CtaButton
                  full
                  disabled={status === 'sending'}
                  onClick={() => (nameValid && emailValid ? requestBooking() : setTouched(true))}
                >
                  {status === 'sending' ? <Sending /> : de ? 'Benachrichtigen' : 'Notify me'}
                </CtaButton>
              </div>
            </Step>
          ) : (
            <Step key={step} direction={direction}>
              {step === 1 && <StepGuests guests={guests} setGuests={setGuests} maxGuests={maxGuests} />}
              {step === 2 && (
                <StepDates
                  arrival={dates.arrival}
                  departure={dates.departure}
                  nights={nights}
                  days={days}
                  loading={calendarLoading}
                  quote={quote}
                  quoteLoading={quoteLoading}
                  onSelect={(next) => setDates((d) => ({ ...d, ...next }))}
                />
              )}
              {step === 3 && (
                <StepContact
                  contact={contact}
                  setContact={setContact}
                  touched={touched}
                  valid={contactValid}
                  bookable={bookable}
                />
              )}
              {step === 4 && (
                <StepPayment
                  method={method}
                  setMethod={setMethod}
                  unitName={unit.name[locale]}
                  arrival={dates.arrival}
                  departure={dates.departure}
                  nights={nights}
                  guests={guests}
                  quote={quote}
                  quoteLoading={quoteLoading}
                  bookable={bookable}
                />
              )}

              {notice && <div className="mt-5"><BookingNotice code={notice.code} meta={notice.meta} locale={locale} /></div>}

              <StepActions>
                <div className="flex items-center gap-3">
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={() => go(-1)}
                      className="cta-secondary !min-h-[48px] !px-4"
                      aria-label={de ? 'Zurück' : 'Back'}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {step === LAST_STEP && status === 'paying' && reference ? (
                    /*
                     * The nights are held and the guest is paying. The submit
                     * button is gone — pressing it again is the double-charge
                     * the whole idempotency chain exists to prevent, and the
                     * simplest way to make that impossible is not to render it.
                     */
                    <PayPalButton
                      reference={reference}
                      onSettled={(result) => {
                        // What the SERVER says, not what PayPal told the
                        // browser. The confirmation screen reads the status:
                        // only a server-reported `confirmed` fills the
                        // confirmed stay; `paid` and the rest stay honest.
                        setSettledStatus(result.status);
                        if (result.status === 'confirmed' && dates.arrival && dates.departure) {
                          setConfirmed({ arrival: dates.arrival, departure: dates.departure });
                        }
                        setStatus('success');
                        setDirection(1);
                      }}
                      onCancel={() => {
                        // The hold stands. The lease check verifies there is no
                        // payment before anything is released, so an abandoned
                        // checkout costs the guest nothing and loses nothing.
                        setStatus('idle');
                        setNotice(null);
                      }}
                      onError={(cause) => {
                        setNotice(toNotice(cause));
                        setStatus('idle');
                      }}
                    />
                  ) : step < LAST_STEP ? (
                    <CtaButton full withArrow onClick={() => go(1)}>
                      {de ? 'Weiter' : 'Continue'}
                    </CtaButton>
                  ) : (
                    <CtaButton
                      full
                      // Disabled while a quote is in flight so nobody can
                      // submit against a price that is being replaced. The
                      // real duplicate-submit guarantee is the server's
                      // idempotency key, not this attribute.
                      // Withheld, not merely styled, while there is no quote
                      // with approved terms: no cancellation terms on screen
                      // means no booking and no payment. The server refuses
                      // independently (lib/legal/readiness.ts).
                      disabled={status === 'sending' || (bookable && (quoteLoading || !checkoutReady(quote)))}
                      onClick={submit}
                    >
                      {status === 'sending'
                        ? <Sending />
                        : bookable
                        ? ORDER_BUTTON_LABEL[locale]
                        : de ? 'Buchung anfragen' : 'Request booking'}
                    </CtaButton>
                  )}
                </div>
              </StepActions>

              {step === LAST_STEP && (
                <p className="mt-4 text-center text-[12px] leading-relaxed"
                   style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {bookable
                    ? de
                      ? 'Nach „Zahlungspflichtig buchen“ reservieren wir Ihren Zeitraum, und Sie bezahlen den Gesamtpreis sicher über PayPal.'
                      : 'After “Book and pay” we hold your dates and you pay the total price securely via PayPal.'
                    : de
                    ? 'Mit dem Absenden entsteht noch kein Vertrag und es wird nichts abgebucht. Wir prüfen Ihren Zeitraum und schicken Ihnen Bestätigung und Zahlungsweg.'
                    : 'Submitting creates no contract and charges nothing. We check your dates and send you confirmation and the payment details.'}
                </p>
              )}
            </Step>
          )}
        </AnimatePresence>

        {step > 1 && step <= LAST_STEP && status !== 'success' && !upcoming && (
          <button
            type="button"
            onClick={backToDetail}
            className="mx-auto mt-6 block text-[12px] underline-offset-4 hover:underline"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {de ? 'Zurück zum Apartment' : 'Back to the apartment'}
          </button>
        )}
      </div>
    </DialogModal>
  );
}

/**
 * A thrown value, reduced to something the notice component has copy for.
 * Anything unrecognised becomes `unexpected` — no raw message ever surfaces.
 */
function toNotice(cause: unknown): { code: BookingErrorCode; meta?: Record<string, number | string | boolean> } {
  if (cause instanceof BookingRequestError) return { code: cause.code, meta: cause.meta };
  // The PayPal SDK itself could not be loaded or rendered: the hold stands,
  // nothing was charged, and the copy for a payment page that would not open
  // says exactly that.
  if (cause instanceof Error && /^paypal_sdk_/.test(cause.message)) return { code: 'payment_handoff_failed' };
  return { code: 'unexpected' };
}

/**
 * One typed name into the two fields a reservation needs.
 *
 * The contact form asks for a name in one field, which is what the site has
 * always done and is less friction than two. The last whitespace-separated
 * token is taken as the surname, the rest as the given name — which is right
 * for the overwhelming majority of German and international guests, and wrong
 * in a way that is corrected on arrival rather than blocking a booking. A
 * single token becomes the surname, because that is the name a reservation is
 * looked up under.
 */
function splitName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function Sending() {
  const { locale } = useI18n();
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {locale === 'de' ? 'Wird gesendet …' : 'Sending …'}
    </span>
  );
}

/**
 * The step rail: one unbroken line, with a gold fill that travels along it.
 *
 * It was four separate segments with gaps between them, which read as four
 * unrelated marks rather than one journey. Now a single hairline spans the
 * whole width and the gold advances across it as the visitor moves — a
 * continuous movement from where it was to where it now is, not a jump.
 *
 * ── How it moves ─────────────────────────────────────────────────────────
 * One CSS transform on one element: `scaleX` from a left origin, so the
 * browser animates it on the compositor and nothing lays out again. The
 * easing is the site's own curve and the duration is long enough to read as
 * deliberate rather than as a loading bar.
 *
 * ── Not colour alone ─────────────────────────────────────────────────────
 * The rail is decoration (`aria-hidden`); the state a screen reader gets is
 * the list beneath it, where the current step carries `aria-current="step"`
 * and every label spells out whether it is done, current or still to come.
 * Sighted users get the same distinction in weight and in a small mark on the
 * completed labels, so the gold is never the only signal.
 */
function Progress({ step }: { step: number }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();

  const labels = de
    ? ['Personen', 'Zeitraum', 'Kontakt', 'Zahlung']
    : ['Guests', 'Dates', 'Contact', 'Payment'];

  const state = de
    ? { done: 'abgeschlossen', current: 'aktueller Schritt', todo: 'offen' }
    : { done: 'completed', current: 'current step', todo: 'not started' };

  // The fill reaches the centre of the step it is on, so the gold ends under
  // the active label rather than short of it or past it.
  const progress = (step - 0.5) / labels.length;

  return (
    <div className="border-b border-border/70 px-6 py-4">
      <div className="relative" aria-hidden="true">
        {/* One continuous base line, corner to corner. */}
        <span
          className="absolute left-0 right-0 top-0 block h-[2px]"
          style={{ background: 'hsl(var(--border))' }}
        />
        {/* The gold, travelling along it. */}
        <span
          className="absolute left-0 top-0 block h-[2px] origin-left"
          style={{
            width: '100%',
            transform: `scaleX(${progress})`,
            background:
              'linear-gradient(90deg, hsl(var(--champagne-dark)) 0%, hsl(var(--gold)) 60%, hsl(var(--gold-bright)) 100%)',
            transition: reduce
              ? 'none'
              : 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        {/* The labels sit under the line, one per logical position. */}
        <div className="flex items-start pt-2.5">
          {labels.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <span
                key={label}
                className="flex-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-500"
                style={{
                  color: active
                    ? 'hsl(var(--champagne-dark))'
                    : done
                    ? 'hsl(var(--foreground))'
                    // Full muted tone: at 75% opacity these 10px labels fell to
                    // 3.9:1, below the WCAG AA 4.5:1 for small text.
                    : 'hsl(var(--muted-foreground))',
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>

      {/* What assistive technology reads: the same four steps, in words. */}
      <ol className="sr-only">
        {labels.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          return (
            <li key={label} aria-current={active ? 'step' : undefined}>
              {`${n}. ${label} — ${active ? state.current : n < step ? state.done : state.todo}`}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

function StepGuests({
  guests, setGuests, maxGuests,
}: { guests: number; setGuests: (n: number) => void; maxGuests: number }) {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wie viele Personen reisen an?' : 'How many of you are coming?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {de
          ? 'Die genaue Belegung stimmen wir mit Ihnen ab — sagen Sie uns fürs Erste, mit wie vielen Sie planen.'
          : 'We agree the exact occupancy with you — for now, tell us how many you are planning for.'}
      </p>

      <div className="mt-8 flex items-center justify-center gap-7">
        <StepperButton onClick={() => setGuests(Math.max(MIN_GUESTS, guests - 1))} disabled={guests <= MIN_GUESTS}
                       label={de ? 'Weniger' : 'Fewer'}><Minus className="h-4 w-4" /></StepperButton>
        <div className="text-center" style={{ minWidth: 92 }}>
          <p className="font-serif text-[52px] leading-none" style={{ color: 'hsl(var(--foreground))' }} aria-live="polite">
            {guests}
          </p>
          <p className="mt-2 text-[12px] uppercase tracking-[0.14em]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de ? (guests === 1 ? 'Person' : 'Personen') : guests === 1 ? 'Guest' : 'Guests'}
          </p>
        </div>
        <StepperButton onClick={() => setGuests(Math.min(maxGuests, guests + 1))} disabled={guests >= maxGuests}
                       label={de ? 'Mehr' : 'More'}><Plus className="h-4 w-4" /></StepperButton>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {/* Every party size this residence takes. Read from the unit, not from
            a constant — see lib/booking/occupancy.ts. */}
        {Array.from({ length: maxGuests - MIN_GUESTS + 1 }, (_, i) => MIN_GUESTS + i).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setGuests(n)}
            className="min-h-[44px] px-4 text-[13px] font-medium transition-colors"
            style={{
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${guests === n ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
              background: guests === n ? 'hsl(var(--champagne) / 0.16)' : 'transparent',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepperButton({
  onClick, disabled, label, children,
}: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center transition-colors disabled:opacity-30"
      style={{ borderRadius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))' }}
    >
      {children}
    </button>
  );
}

function StepDates({
  arrival, departure, nights, days, loading, quote, quoteLoading, onSelect,
}: {
  arrival?: string; departure?: string; nights?: number;
  days: InventoryDay[];
  loading: boolean;
  quote: BookingQuote | null;
  quoteLoading: boolean;
  onSelect: (n: { arrival?: string; departure?: string }) => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wann möchten Sie kommen?' : 'When would you like to come?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {nights
          ? de ? `${nights} ${nights === 1 ? 'Nacht' : 'Nächte'} gewählt.` : `${nights} ${nights === 1 ? 'night' : 'nights'} selected.`
          : de ? 'Wählen Sie Anreise und Abreise.' : 'Choose your arrival and departure.'}
      </p>
      <div className="mt-6">
        <StayCalendar
          arrival={arrival}
          departure={departure}
          onSelect={onSelect}
          days={days}
          loading={loading}
        />
      </div>

      {/*
        The price, the moment the stay is complete. It is the live offer and
        nothing else — while it is loading the row says so rather than showing
        a stale number, and if there is no offer there is no price on screen.
      */}
      {nights && (quote || quoteLoading) && (
        <div
          className="mt-6 flex items-baseline justify-between gap-4 p-4"
          style={{ background: 'hsl(var(--secondary) / 0.55)', borderRadius: 'var(--radius-md)' }}
        >
          <span className="text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de ? 'Gesamtpreis' : 'Total'}
          </span>
          <span className="font-serif text-[22px] leading-none" style={{ color: 'hsl(var(--foreground))' }}>
            {quoteLoading || !quote ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              formatMoney(quote.totalCents, quote.currency, locale)
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function StepContact({
  contact, setContact, touched, valid, bookable,
}: {
  contact: { name: string; email: string; phone: string };
  setContact: (fn: (c: { name: string; email: string; phone: string }) => { name: string; email: string; phone: string }) => void;
  touched: boolean;
  valid: boolean;
  bookable: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wie erreichen wir Sie?' : 'How do we reach you?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {bookable
          ? de
            ? 'Wir schicken Ihnen Bestätigung und Anreisedetails an diese Adresse.'
            : 'We send your confirmation and arrival details to this address.'
          : de
          ? 'Wir melden uns persönlich mit Bestätigung und Preis — meist am selben Tag.'
          : 'We reply personally with confirmation and price — usually the same day.'}
      </p>
      <div className="mt-6 space-y-5">
        <ContactFields
          locale={locale}
          idPrefix="bk"
          values={contact}
          onChange={(k, v) => setContact((c) => ({ ...c, [k]: v }))}
          touched={touched}
          phoneRequired
        />
      </div>
      {touched && !valid && (
        <p role="alert" className="mt-3 text-[12px]" style={{ color: 'hsl(var(--destructive))' }}>
          {de ? 'Bitte ergänzen Sie Name, E-Mail und Telefonnummer.' : 'Please add your name, email and phone number.'}
        </p>
      )}
      {/* Art. 13 GDPR: the notice is reachable at the point of collection. */}
      <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {de
          ? 'Wir verwenden Ihre Angaben, um Ihre Buchung bzw. Anfrage zu bearbeiten. Mehr dazu in unserer '
          : 'We use your details to process your booking or enquiry. More in our '}
        <a href="/datenschutz" className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
          {de ? 'Datenschutzerklärung' : 'privacy notice'}
        </a>
        .
      </p>
    </div>
  );
}

function StepPayment({
  method, setMethod, unitName, arrival, departure, nights, guests, quote, quoteLoading, bookable,
}: {
  method: MethodId; setMethod: (m: MethodId) => void;
  unitName: string; arrival?: string; departure?: string; nights?: number; guests: number;
  quote: BookingQuote | null;
  quoteLoading: boolean;
  bookable: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  // One date shape across the whole site — see lib/booking/date-format.ts.
  const fmt = (d?: string) => formatDateOrDash(d);

  // Only the providers that can actually be executed are offered against a
  // live inventory hold. See the note on METHODS.
  const methods = bookable ? METHODS.filter((m) => m.handoff) : METHODS;

  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wie möchten Sie zahlen?' : 'How would you like to pay?'}</h3>

      <div className="mt-5">
        <CheckoutSummary
          locale={locale}
          unitName={unitName}
          arrival={arrival}
          departure={departure}
          nights={nights}
          guests={guests}
          quote={quote}
          quoteLoading={quoteLoading}
          bookable={bookable}
        />
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {methods.map((m) => {
          const active = method === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className="flex min-h-[56px] items-center gap-3.5 px-4 py-3 text-left transition-colors"
              style={{
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
                background: active ? 'hsl(var(--champagne) / 0.14)' : 'transparent',
              }}
              aria-pressed={active}
            >
              <m.icon className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{de ? m.de : m.en}</span>
                <span className="block text-[12px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {m.note[locale]}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{
                  border: `1px solid ${active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
                  background: active ? 'hsl(var(--champagne-dark))' : 'transparent',
                }}
              />
            </button>
          );
        })}
      </div>

      {!bookable && (
        <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Hier wird noch nicht bezahlt. Sie wählen nur, wie Sie später zahlen möchten — den Zahlungsweg schicken wir Ihnen mit der Bestätigung.'
            : 'Nothing is paid here. You are only choosing how you would like to pay later — we send the payment details with your confirmation.'}
        </p>
      )}
    </div>
  );
}

/* ── Confirmation ───────────────────────────────────────────────────────── */

function SuccessState({
  firstName, upcoming, confirmed, reference, unitName, settledStatus, onClose,
}: {
  firstName: string;
  upcoming: boolean;
  /** A booking the backend actually confirmed, or null. Never inferred here. */
  confirmed: ConfirmedStay | null;
  /**
   * The status the server reported after a capture, when one happened.
   *
   * `paid` means the money is ours and the reservation is not yet confirmed at
   * the channel manager. That is a real, ordinary state — Beds24 can be slow,
   * and the reconciliation engine finishes the job — and the guest is told
   * exactly that instead of a confirmation we cannot stand behind.
   */
  settledStatus: string | null;
  /** The BoLaGio reference, when one was created. Never a Beds24 id. */
  reference: string | null;
  unitName: string;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();

  /*
   * Paid, and not yet confirmed. The word "confirmed" is reserved for a
   * reservation the channel manager has actually accepted, so this branch says
   * what is true: the money arrived and the dates are held.
   */
  const settled = !confirmed && settledStatus !== null && settledStatus !== 'confirmed';

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="py-8 text-center"
    >
      <Seal />
      <h3 className="display-3 mt-7">
        {upcoming
          ? de ? 'Wir melden uns' : 'We will be in touch'
          : confirmed
          ? de ? 'Ihre Buchung ist bestätigt' : 'Your booking is confirmed'
          : settled
          ? de ? 'Zahlung erhalten' : 'Payment received'
          : de ? 'Ihre Buchungsanfrage ist bei uns' : 'Your booking request has arrived'}
      </h3>
      <p className="body-copy mx-auto mt-3 text-[14.5px]">
        {upcoming
          ? de
            ? `Danke, ${firstName}. Wir sagen Ihnen Bescheid, sobald dieses Apartment buchbar ist.`
            : `Thank you, ${firstName}. We will let you know as soon as this apartment can be booked.`
          : confirmed
          ? de
            ? `Danke, ${firstName}. Ihr Aufenthalt vom ${formatDateOrDash(confirmed.arrival)} bis ${formatDateOrDash(confirmed.departure)} ist bestätigt. Alle Anreisedetails schicken wir Ihnen per E-Mail.`
            : `Thank you, ${firstName}. Your stay from ${formatDateOrDash(confirmed.arrival)} to ${formatDateOrDash(confirmed.departure)} is confirmed. We are sending you all the arrival details by email.`
          : settled
          ? de
            ? `Danke, ${firstName}. Ihre Zahlung ist bei uns eingegangen und Ihr Zeitraum ist für Sie reserviert. Die endgültige Bestätigung schicken wir Ihnen per E-Mail, sobald sie vorliegt — meist innerhalb weniger Minuten.`
            : `Thank you, ${firstName}. Your payment has reached us and your dates are reserved for you. We will email you the final confirmation as soon as it is ready — usually within a few minutes.`
          : de
          ? `Danke, ${firstName}. Wir prüfen Ihren Zeitraum persönlich und melden uns mit Bestätigung, Preis und Zahlungsweg — meist am selben Tag.`
          : `Thank you, ${firstName}. We check your dates personally and come back with confirmation, price and payment details — usually the same day.`}
      </p>

      {/* BoLaGio's own reservation number. Never a provider identifier. */}
      {reference && (
        <p className="mt-4 text-[12px] uppercase tracking-[0.14em]" style={{ color: 'hsl(var(--champagne-dark))' }}>
          {de ? 'Referenz' : 'Reference'} · {reference}
        </p>
      )}

      {/*
        The calendar entry belongs to a confirmed stay and to nothing else. A
        request that a person still has to answer gets the sentence below
        instead, which says exactly where it stands.
      */}
      {!upcoming && confirmed && (
        <div className="mt-7 flex justify-center">
          <AddToCalendar event={stayEvent(confirmed, unitName, locale)} />
        </div>
      )}

      {!upcoming && !confirmed && (
        <p className="mx-auto mt-4 max-w-[42ch] text-[12px] leading-relaxed"
           style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Ihre Buchung ist damit noch nicht bestätigt und es wurde nichts abgebucht.'
            : 'Your booking is not confirmed yet, and nothing has been charged.'}
        </p>
      )}
      <div className="mt-8">
        <CtaButton variant="secondary" onClick={onClose}>{de ? 'Schließen' : 'Close'}</CtaButton>
      </div>
    </motion.div>
  );
}

/**
 * The confirmation mark: a ring that draws itself once, then the check.
 * Restrained on purpose — a satisfying beat, not a celebration.
 */
function Seal() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto h-[74px] w-[74px]">
      <svg viewBox="0 0 74 74" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <motion.circle
          cx="37" cy="37" r="35" fill="none"
          stroke="hsl(var(--champagne-dark))" strokeWidth="1.25"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ rotate: -90, transformOrigin: '50% 50%' }}
        />
      </svg>
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={reduce ? false : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Check className="h-7 w-7" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
      </motion.div>
    </div>
  );
}
