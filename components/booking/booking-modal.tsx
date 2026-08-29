'use client';

/**
 * The short-term booking dialog.
 *
 * Five steps, selection-first: guests, dates, contact, payment method, done.
 * Only three fields are ever typed — name, email, phone — everything else is a
 * tap. Values already collected upstream (hero bar → detail view) arrive
 * pre-filled, so a visitor who set their dates on the homepage lands on step 1
 * with steps 1 and 2 already answered.
 *
 * ── What is real and what is a shell ─────────────────────────────────────
 * Real: the whole flow, the state, the payload, the submission to the existing
 * enquiry endpoint.
 *
 * Not real, and never claimed to be: live availability (no PMS — see
 * lib/booking/availability.ts) and live payment (PAYMENT_ENABLED is false).
 * Step 4 therefore records a *preferred* payment method and says plainly that
 * nothing is being charged; step 5 confirms a booking request that a person
 * confirms, not a completed reservation. When the PMS and the payment provider
 * are connected, step 4 gains the provider handoff and step 5's wording follows
 * `canBookOnline()` — the steps around them do not move.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Banknote, Check, CreditCard, Loader as Loader2, Minus, Plus, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, ENQUIRY_ENDPOINT } from '@/lib/content/brand';
import { canBookOnline, nightsBetween } from '@/lib/booking/availability';
import { useStay } from '@/lib/booking/stay-context';
import { DialogModal, Step } from '@/components/ui-kit/modal';
import { StayCalendar } from '@/components/booking/stay-calendar';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { CtaButton } from '@/components/ui-kit/cta';
import { ContactFields, EMAIL_PATTERN, SubmitError } from '@/components/enquiry/enquiry-fields';

type Status = 'idle' | 'sending' | 'success' | 'error';

/** The payment providers the flow is built to hand off to. */
const METHODS = [
  { id: 'card', icon: CreditCard, de: 'Kreditkarte', en: 'Card', note: { de: 'über Stripe', en: 'via Stripe' } },
  { id: 'paypal', icon: Wallet, de: 'PayPal', en: 'PayPal', note: { de: 'über PayPal', en: 'via PayPal' } },
  { id: 'transfer', icon: Banknote, de: 'Überweisung', en: 'Bank transfer', note: { de: 'auf Rechnung', en: 'on invoice' } },
] as const;
type MethodId = (typeof METHODS)[number]['id'];

const LAST_STEP = 4;

export function BookingModal() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { unit, stage, backToDetail, close } = useUnitFlow();
  const { stay, setStay } = useStay();
  const reduce = useReducedMotion();

  const open = stage === 'booking' && Boolean(unit);
  const upcoming = unit?.status === 'in-preparation';

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  const [guests, setGuests] = useState(stay.guests ?? 2);
  const [dates, setDates] = useState({ arrival: stay.arrival, departure: stay.departure });
  const [method, setMethod] = useState<MethodId>('card');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });

  // Adopt whatever the hero bar and detail view already know, on each open.
  useEffect(() => {
    if (!open) return;
    setGuests(stay.guests ?? 2);
    setDates({ arrival: stay.arrival, departure: stay.departure });
    setStep(1);
    setDirection(1);
    setStatus('idle');
    setTouched(false);
  }, [open, stay.arrival, stay.departure, stay.guests]);

  const nights = nightsBetween(dates.arrival, dates.departure);
  const nameValid = contact.name.trim().length >= 2;
  const emailValid = EMAIL_PATTERN.test(contact.email.trim());
  const contactValid = nameValid && emailValid && contact.phone.trim().length >= 5;

  const canAdvance = useMemo(() => {
    if (step === 1) return guests >= 1;
    if (step === 2) return Boolean(dates.arrival && dates.departure);
    if (step === 3) return contactValid;
    return true;
  }, [step, guests, dates, contactValid]);

  const go = (delta: 1 | -1) => {
    if (delta === 1 && !canAdvance) { setTouched(true); return; }
    setDirection(delta);
    setStep((s) => Math.min(LAST_STEP, Math.max(1, s + delta)));
    setTouched(false);
  };

  const submit = async () => {
    setStatus('sending');
    // Push the choices back up, so a visitor who closes and reopens keeps them.
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
            guests,
          },
          payment: {
            // A stated preference, not a transaction. No provider is contacted
            // from the frontend while PAYMENT_ENABLED is false.
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
      setDirection(1);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

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
          : de ? 'Vier Schritte. Alles außer Ihren Kontaktdaten wählen Sie aus.'
              : 'Four steps. Everything but your contact details is a choice.'
      }
    >
      {status !== 'success' && !upcoming && <Progress step={step} />}

      <div className="px-6 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {status === 'success' ? (
            <SuccessState key="done" firstName={contact.name.split(' ')[0]} upcoming={upcoming} onClose={close} />
          ) : upcoming ? (
            <Step key="notify" direction={1}>
              <ContactFields
                locale={locale}
                idPrefix="notify"
                values={contact}
                onChange={(k, v) => setContact((c) => ({ ...c, [k]: v }))}
                touched={touched}
              />
              {status === 'error' && <div className="mt-5"><SubmitError locale={locale} /></div>}
              <div className="mt-7">
                <CtaButton
                  full
                  disabled={status === 'sending'}
                  onClick={() => (nameValid && emailValid ? submit() : setTouched(true))}
                >
                  {status === 'sending' ? <Sending /> : de ? 'Benachrichtigen' : 'Notify me'}
                </CtaButton>
              </div>
            </Step>
          ) : (
            <Step key={step} direction={direction}>
              {step === 1 && <StepGuests guests={guests} setGuests={setGuests} />}
              {step === 2 && (
                <StepDates
                  arrival={dates.arrival}
                  departure={dates.departure}
                  nights={nights}
                  onSelect={(next) => setDates((d) => ({ ...d, ...next }))}
                />
              )}
              {step === 3 && (
                <StepContact
                  contact={contact}
                  setContact={setContact}
                  touched={touched}
                  valid={contactValid}
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
                />
              )}

              {status === 'error' && <div className="mt-5"><SubmitError locale={locale} /></div>}

              <div className="mt-8 flex items-center gap-3">
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
                {step < LAST_STEP ? (
                  <CtaButton full withArrow onClick={() => go(1)}>
                    {de ? 'Weiter' : 'Continue'}
                  </CtaButton>
                ) : (
                  <CtaButton full disabled={status === 'sending'} onClick={submit}>
                    {status === 'sending'
                      ? <Sending />
                      : de ? 'Buchung anfragen' : 'Request booking'}
                  </CtaButton>
                )}
              </div>

              {step === LAST_STEP && (
                <p className="mt-4 text-center text-[12px] leading-relaxed"
                   style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {de
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

function Sending() {
  const { locale } = useI18n();
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {locale === 'de' ? 'Wird gesendet …' : 'Sending …'}
    </span>
  );
}

/** A hairline rail, not a badge row — the step count should not shout. */
function Progress({ step }: { step: number }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const labels = de
    ? ['Personen', 'Zeitraum', 'Kontakt', 'Zahlung']
    : ['Guests', 'Dates', 'Contact', 'Payment'];

  return (
    <div className="border-b border-border/70 px-6 py-4">
      <div className="flex items-center gap-2">
        {labels.map((l, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={l} className="flex flex-1 flex-col gap-1.5">
              <span
                className="h-[2px] w-full transition-colors duration-500"
                style={{
                  background: done || active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))',
                }}
              />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-500"
                style={{ color: active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--muted-foreground) / 0.75)' }}
              >
                {l}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

function StepGuests({ guests, setGuests }: { guests: number; setGuests: (n: number) => void }) {
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
        <StepperButton onClick={() => setGuests(Math.max(1, guests - 1))} disabled={guests <= 1}
                       label={de ? 'Weniger' : 'Fewer'}><Minus className="h-4 w-4" /></StepperButton>
        <div className="text-center" style={{ minWidth: 92 }}>
          <p className="font-serif text-[52px] leading-none" style={{ color: 'hsl(var(--foreground))' }}>
            {guests}
          </p>
          <p className="mt-2 text-[12px] uppercase tracking-[0.14em]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de ? (guests === 1 ? 'Person' : 'Personen') : guests === 1 ? 'Guest' : 'Guests'}
          </p>
        </div>
        <StepperButton onClick={() => setGuests(Math.min(12, guests + 1))} disabled={guests >= 12}
                       label={de ? 'Mehr' : 'More'}><Plus className="h-4 w-4" /></StepperButton>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {[2, 3, 4, 6].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setGuests(n)}
            className="min-h-[44px] px-4 text-[13px] font-medium transition-colors"
            style={{
              borderRadius: 'var(--radius)',
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
      style={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
    >
      {children}
    </button>
  );
}

function StepDates({
  arrival, departure, nights, onSelect,
}: {
  arrival?: string; departure?: string; nights?: number;
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
        <StayCalendar arrival={arrival} departure={departure} onSelect={onSelect} />
      </div>
    </div>
  );
}

function StepContact({
  contact, setContact, touched, valid,
}: {
  contact: { name: string; email: string; phone: string };
  setContact: (fn: (c: { name: string; email: string; phone: string }) => { name: string; email: string; phone: string }) => void;
  touched: boolean;
  valid: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wie erreichen wir Sie?' : 'How do we reach you?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {de
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
        />
      </div>
      {touched && !valid && (
        <p className="mt-3 text-[12px]" style={{ color: 'hsl(var(--destructive))' }}>
          {de ? 'Bitte ergänzen Sie Name, E-Mail und Telefonnummer.' : 'Please add your name, email and phone number.'}
        </p>
      )}
    </div>
  );
}

function StepPayment({
  method, setMethod, unitName, arrival, departure, nights, guests,
}: {
  method: MethodId; setMethod: (m: MethodId) => void;
  unitName: string; arrival?: string; departure?: string; nights?: number; guests: number;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const fmt = (d?: string) =>
    d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(de ? 'de-DE' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wie möchten Sie zahlen?' : 'How would you like to pay?'}</h3>

      {/* No total. No nightly rate. No rate has been supplied to this site. */}
      <div className="mt-5 p-4" style={{ background: 'hsl(var(--secondary) / 0.55)', borderRadius: 'var(--radius)' }}>
        <dl className="space-y-1.5 text-[13.5px]">
          <Row label={de ? 'Apartment' : 'Apartment'} value={unitName} />
          <Row label={de ? 'Zeitraum' : 'Dates'} value={`${fmt(arrival)} – ${fmt(departure)}`} />
          <Row label={de ? 'Nächte' : 'Nights'} value={nights ? String(nights) : '—'} />
          <Row label={de ? 'Personen' : 'Guests'} value={String(guests)} />
          <Row label={de ? 'Preis' : 'Price'} value={de ? 'auf Anfrage' : 'on request'} muted />
        </dl>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {METHODS.map((m) => {
          const active = method === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className="flex min-h-[56px] items-center gap-3.5 px-4 py-3 text-left transition-colors"
              style={{
                borderRadius: 'var(--radius)',
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

      {/*
        The one sentence that keeps this step honest while the providers are not
        connected. It disappears on its own once canBookOnline() is true.
      */}
      {!canBookOnline() && (
        <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Hier wird noch nicht bezahlt. Sie wählen nur, wie Sie später zahlen möchten — den Zahlungsweg schicken wir Ihnen mit der Bestätigung.'
            : 'Nothing is paid here. You are only choosing how you would like to pay later — we send the payment details with your confirmation.'}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</dt>
      <dd className="text-right font-medium"
          style={{ color: muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}>
        {value}
      </dd>
    </div>
  );
}

/* ── Confirmation ───────────────────────────────────────────────────────── */

function SuccessState({
  firstName, upcoming, onClose,
}: { firstName: string; upcoming: boolean; onClose: () => void }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();

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
          : de ? 'Ihre Buchungsanfrage ist bei uns' : 'Your booking request has arrived'}
      </h3>
      <p className="body-copy mx-auto mt-3 text-[14.5px]">
        {upcoming
          ? de
            ? `Danke, ${firstName}. Wir sagen Ihnen Bescheid, sobald dieses Apartment buchbar ist.`
            : `Thank you, ${firstName}. We will let you know as soon as this apartment can be booked.`
          : de
          ? `Danke, ${firstName}. Wir prüfen Ihren Zeitraum persönlich und melden uns mit Bestätigung, Preis und Zahlungsweg — meist am selben Tag.`
          : `Thank you, ${firstName}. We check your dates personally and come back with confirmation, price and payment details — usually the same day.`}
      </p>
      {!upcoming && (
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
