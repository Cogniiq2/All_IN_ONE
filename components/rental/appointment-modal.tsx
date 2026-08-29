'use client';

/**
 * The long-term appointment request.
 *
 * Four steps, then a confirmation: who is asking, roughly when, how to reach
 * them, send. Selection-first like the booking dialog — the only typed fields
 * are first name, surname, email and mobile.
 *
 * ── What this is not ─────────────────────────────────────────────────────
 * Not a booking. There is no calendar of nights, no price, no payment, and no
 * step that could be mistaken for reserving the unit. It asks for a
 * conversation and says, at the point of submission and again on the
 * confirmation, that it creates no tenancy and no entitlement to one.
 *
 * Nothing legally sensitive is asked: no income, employer, SCHUFA, existing
 * tenancy, household size, nationality or date of birth. Adding any of those
 * needs explicit legal review — an initial enquiry may only collect what it
 * takes to answer it.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Briefcase, Check, Loader as Loader2, User } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, ENQUIRY_ENDPOINT } from '@/lib/content/brand';
import { todayIso } from '@/lib/booking/availability';
import { isCommercial, longTermModesOf } from '@/lib/content/apartments';
import { DialogModal, Step } from '@/components/ui-kit/modal';
import { useUnitFlow } from '@/components/units/unit-flow-context';
import { CtaButton } from '@/components/ui-kit/cta';
import { EMAIL_PATTERN, SubmitError, inputClass, labelClass } from '@/components/enquiry/enquiry-fields';

type Status = 'idle' | 'sending' | 'success' | 'error';

/** Who is asking. This decides the legal framework a tenancy would sit in. */
const PARTIES = [
  {
    id: 'private',
    icon: User,
    de: { title: 'Privatperson', body: 'Ich suche Wohnraum für mich oder meine Familie.' },
    en: { title: 'Private individual', body: 'I am looking for a home for myself or my family.' },
  },
  {
    id: 'company',
    icon: Briefcase,
    de: { title: 'Gewerbe / Unternehmen', body: 'Ich suche Fläche für ein Unternehmen oder eine Tätigkeit.' },
    en: { title: 'Business / company', body: 'I am looking for space for a company or a trade.' },
  },
] as const;
type PartyId = (typeof PARTIES)[number]['id'];

const TIMING = [
  { id: 'asap', de: 'So bald wie möglich', en: 'As soon as possible' },
  { id: '3-months', de: 'In den nächsten drei Monaten', en: 'Within three months' },
  { id: '6-months', de: 'In den nächsten sechs Monaten', en: 'Within six months' },
  { id: 'flexible', de: 'Zeitlich flexibel', en: 'Flexible on timing' },
] as const;
type TimingId = (typeof TIMING)[number]['id'];

const DURATION = [
  { id: 'undecided', de: 'Noch offen', en: 'Not yet decided' },
  { id: 'under-1-year', de: 'Bis 1 Jahr', en: 'Up to 1 year' },
  { id: '1-2-years', de: '1–2 Jahre', en: '1–2 years' },
  { id: 'over-2-years', de: 'Über 2 Jahre', en: 'Over 2 years' },
] as const;
type DurationId = (typeof DURATION)[number]['id'];

const LAST_STEP = 3;

export function AppointmentModal() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { unit, stage, backToDetail, close } = useUnitFlow();

  const open = stage === 'appointment' && Boolean(unit);

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  const [party, setParty] = useState<PartyId>('private');
  const [timing, setTiming] = useState<TimingId>('asap');
  const [duration, setDuration] = useState<DurationId>('undecided');
  const [start, setStart] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  // The unit answers the first question when it can only be one thing.
  useEffect(() => {
    if (!open || !unit) return;
    const modes = longTermModesOf(unit);
    setParty(modes.length === 1 && modes[0] === 'long-term-commercial' ? 'company' : 'private');
    setStep(1);
    setDirection(1);
    setStatus('idle');
    setTouched(false);
  }, [open, unit]);

  const firstValid = form.firstName.trim().length >= 2;
  const lastValid = form.lastName.trim().length >= 2;
  const emailValid = EMAIL_PATTERN.test(form.email.trim());
  const phoneValid = form.phone.trim().length >= 5;
  const contactValid = firstValid && lastValid && emailValid && phoneValid;

  const canAdvance = step === 3 ? contactValid : true;

  const go = (delta: 1 | -1) => {
    if (delta === 1 && !canAdvance) { setTouched(true); return; }
    setDirection(delta);
    setStep((s) => Math.min(LAST_STEP, Math.max(1, s + delta)));
    setTouched(false);
  };

  const submit = async () => {
    if (!contactValid) { setTouched(true); return; }
    setStatus('sending');
    try {
      const response = await fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'long-term-rental-enquiry',
          unit: unit ? { slug: unit.slug, name: unit.name.de, kind: unit.kind ?? 'apartment' } : null,
          tenancy: {
            interest: party === 'company' ? 'long-term-commercial' : 'long-term-residential',
            partyType: party,
            desiredStart: start || null,
            timing,
            expectedDuration: duration,
            request: 'appointment',
          },
          contact: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            name: `${form.firstName.trim()} ${form.lastName.trim()}`,
            email: form.email.trim(),
            phone: form.phone.trim(),
            locale,
          },
          meta: { source: 'website-rental-appointment', brand: brand.name },
        }),
      });
      if (!response.ok) throw new Error(`Appointment request failed with ${response.status}`);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (!unit) return null;
  const commercial = isCommercial(unit);

  return (
    <DialogModal
      open={open}
      onOpenChange={(next) => !next && close()}
      eyebrow={`${brand.name} · ${unit.name[locale]}`}
      title={de ? 'Termin anfragen' : 'Request an appointment'}
      description={
        status === 'success'
          ? undefined
          : de
          ? 'Drei kurze Schritte. Wir melden uns persönlich mit einem Terminvorschlag.'
          : 'Three short steps. We come back personally with a suggested time.'
      }
    >
      {status !== 'success' && <Progress step={step} />}

      <div className="px-6 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {status === 'success' ? (
            <SuccessState key="done" firstName={form.firstName} onClose={close} />
          ) : (
            <Step key={step} direction={direction}>
              {step === 1 && <StepParty party={party} setParty={setParty} commercial={commercial} />}
              {step === 2 && (
                <StepTiming
                  timing={timing} setTiming={setTiming}
                  duration={duration} setDuration={setDuration}
                  start={start} setStart={setStart}
                />
              )}
              {step === 3 && (
                <StepContact form={form} setForm={setForm} touched={touched} valid={contactValid} />
              )}

              {status === 'error' && <div className="mt-5"><SubmitError locale={locale} /></div>}

              <div className="mt-8 flex items-center gap-3">
                {step > 1 && (
                  <button type="button" onClick={() => go(-1)}
                          className="cta-secondary !min-h-[48px] !px-4"
                          aria-label={de ? 'Zurück' : 'Back'}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                {step < LAST_STEP ? (
                  <CtaButton full withArrow onClick={() => go(1)}>{de ? 'Weiter' : 'Continue'}</CtaButton>
                ) : (
                  <CtaButton full disabled={status === 'sending'} onClick={submit}>
                    {status === 'sending' ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {de ? 'Wird gesendet …' : 'Sending …'}
                      </span>
                    ) : de ? 'Termin anfragen' : 'Request appointment'}
                  </CtaButton>
                )}
              </div>

              {step === LAST_STEP && (
                <p className="mt-4 text-center text-[12px] leading-relaxed"
                   style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {de
                    ? 'Die Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis und keinen Anspruch auf Abschluss eines Mietvertrags.'
                    : 'The enquiry is non-binding. It creates no tenancy and no entitlement to a rental agreement.'}
                </p>
              )}
            </Step>
          )}
        </AnimatePresence>

        {step > 1 && status !== 'success' && (
          <button type="button" onClick={backToDetail}
                  className="mx-auto mt-6 block text-[12px] underline-offset-4 hover:underline"
                  style={{ color: 'hsl(var(--muted-foreground))' }}>
            {de ? 'Zurück zum Objekt' : 'Back to the property'}
          </button>
        )}
      </div>
    </DialogModal>
  );
}

function Progress({ step }: { step: number }) {
  const { locale } = useI18n();
  const labels = locale === 'de' ? ['Anliegen', 'Zeitraum', 'Kontakt'] : ['Interest', 'Timing', 'Contact'];
  return (
    <div className="border-b border-border/70 px-6 py-4">
      <div className="flex items-center gap-2">
        {labels.map((l, i) => {
          const active = i + 1 === step;
          const done = i + 1 < step;
          return (
            <div key={l} className="flex flex-1 flex-col gap-1.5">
              <span className="h-[2px] w-full transition-colors duration-500"
                    style={{ background: done || active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))' }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-500"
                    style={{ color: active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--muted-foreground) / 0.75)' }}>
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

function StepParty({
  party, setParty, commercial,
}: { party: PartyId; setParty: (p: PartyId) => void; commercial: boolean }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Worum geht es?' : 'What is this about?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {commercial
          ? de ? 'Diese Fläche wird über einen Gewerbemietvertrag vermietet.'
               : 'This unit is let under a commercial rental agreement.'
          : de ? 'Das entscheidet, worüber wir im Gespräch sprechen.'
               : 'This decides what we talk about when we speak.'}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {PARTIES.map((p) => {
          const active = party === p.id;
          const copy = p[locale];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setParty(p.id)}
              aria-pressed={active}
              className="flex min-h-[72px] items-start gap-4 p-4 text-left transition-colors"
              style={{
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
                background: active ? 'hsl(var(--champagne) / 0.14)' : 'transparent',
              }}
            >
              <p.icon className="mt-0.5 h-5 w-5 shrink-0"
                      style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
              <span>
                <span className="block text-[15px] font-semibold">{copy.title}</span>
                <span className="mt-1 block text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {copy.body}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepTiming({
  timing, setTiming, duration, setDuration, start, setStart,
}: {
  timing: TimingId; setTiming: (t: TimingId) => void;
  duration: DurationId; setDuration: (d: DurationId) => void;
  start: string; setStart: (s: string) => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const [today, setToday] = useState<string | undefined>(undefined);
  // Computed after mount: "today" depends on the visitor's timezone and would
  // otherwise differ between server and client and break hydration.
  useEffect(() => setToday(todayIso()), []);

  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Ab wann, und wie lange?' : 'From when, and for how long?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {de ? 'Eine grobe Richtung genügt.' : 'A rough sense is enough.'}
      </p>

      <div className="mt-6">
        <p className={labelClass}>{de ? 'Gewünschter Beginn' : 'Preferred start'}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {TIMING.map((t) => {
            const active = timing === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTiming(t.id)} aria-pressed={active}
                      className="min-h-[52px] px-3.5 py-2.5 text-left text-[13.5px] transition-colors"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
                        background: active ? 'hsl(var(--champagne) / 0.14)' : 'transparent',
                      }}>
                {t[locale]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="appt-start" className={labelClass}>
          {de ? 'Konkretes Datum' : 'A specific date'}{' '}
          <span className="font-normal text-muted-foreground">({de ? 'optional' : 'optional'})</span>
        </label>
        <input id="appt-start" type="date" min={today} value={start}
               onChange={(e) => setStart(e.target.value)} className={inputClass} />
      </div>

      <div className="mt-6">
        <p className={labelClass}>{de ? 'Voraussichtliche Mietdauer' : 'Expected duration'}</p>
        <div className="flex flex-wrap gap-2">
          {DURATION.map((d) => {
            const active = duration === d.id;
            return (
              <button key={d.id} type="button" onClick={() => setDuration(d.id)} aria-pressed={active}
                      className="min-h-[44px] px-3.5 text-[13px] transition-colors"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
                        background: active ? 'hsl(var(--champagne) / 0.14)' : 'transparent',
                      }}>
                {d[locale]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepContact({
  form, setForm, touched, valid,
}: {
  form: { firstName: string; lastName: string; email: string; phone: string };
  setForm: (fn: (f: { firstName: string; lastName: string; email: string; phone: string }) =>
    { firstName: string; lastName: string; email: string; phone: string }) => void;
  touched: boolean; valid: boolean;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <h3 className="display-3 text-[20px]">{de ? 'Wie erreichen wir Sie?' : 'How do we reach you?'}</h3>
      <p className="body-copy mt-2 text-[14px]">
        {de ? 'Wir melden uns persönlich mit einem Terminvorschlag.' : 'We come back personally with a suggested time.'}
      </p>

      <div className="mt-6 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="appt-first" className={labelClass}>
              {de ? 'Vorname' : 'First name'} <span aria-hidden="true">*</span>
            </label>
            <input id="appt-first" type="text" autoComplete="given-name" value={form.firstName}
                   onChange={(e) => set('firstName')(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="appt-last" className={labelClass}>
              {de ? 'Nachname' : 'Surname'} <span aria-hidden="true">*</span>
            </label>
            <input id="appt-last" type="text" autoComplete="family-name" value={form.lastName}
                   onChange={(e) => set('lastName')(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="appt-email" className={labelClass}>
            {de ? 'E-Mail' : 'Email'} <span aria-hidden="true">*</span>
          </label>
          <input id="appt-email" type="email" autoComplete="email" value={form.email}
                 onChange={(e) => set('email')(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="appt-phone" className={labelClass}>
            {de ? 'Handynummer' : 'Mobile number'} <span aria-hidden="true">*</span>
          </label>
          <input id="appt-phone" type="tel" autoComplete="tel" value={form.phone}
                 onChange={(e) => set('phone')(e.target.value)} className={inputClass} />
        </div>
      </div>

      {touched && !valid && (
        <p className="mt-3 text-[12px]" style={{ color: 'hsl(var(--destructive))' }}>
          {de
            ? 'Bitte füllen Sie Vorname, Nachname, E-Mail und Handynummer aus.'
            : 'Please complete first name, surname, email and mobile number.'}
        </p>
      )}
    </div>
  );
}

function SuccessState({ firstName, onClose }: { firstName: string; onClose: () => void }) {
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

      <h3 className="display-3 mt-7">{de ? 'Vielen Dank für Ihre Anfrage' : 'Thank you for your enquiry'}</h3>
      <p className="body-copy mx-auto mt-3 text-[14.5px]">
        {de
          ? `${firstName ? `${firstName}, wir` : 'Wir'} melden uns in Kürze persönlich mit einem Terminvorschlag.`
          : `${firstName ? `${firstName}, we` : 'We'} will be in touch shortly with a suggested time.`}
      </p>
      <p className="mx-auto mt-4 max-w-[42ch] text-[12px] leading-relaxed"
         style={{ color: 'hsl(var(--muted-foreground))' }}>
        {de
          ? 'Mit dieser Anfrage ist noch kein Mietverhältnis entstanden.'
          : 'This enquiry has not created a tenancy.'}
      </p>
      <div className="mt-8">
        <CtaButton variant="secondary" onClick={onClose}>{de ? 'Schließen' : 'Close'}</CtaButton>
      </div>
    </motion.div>
  );
}
