'use client';

/**
 * The long-term rental enquiry — a prospective tenant, not a guest.
 *
 * ── What this form is, and is not ────────────────────────────────────────
 * It opens a conversation about a conventional rental agreement. It does not
 * reserve anything, does not price anything, and does not create a tenancy.
 * The wording under the submit button says so, because a visitor who reads
 * "Anfrage senden" on a hospitality site may reasonably expect a booking.
 *
 * The full multi-step qualification flow is a later, dedicated task. What is
 * here is the minimum that lets the rental journey work end to end while
 * capturing enough context to have a useful first phone call:
 * which unit, residential or commercial, private person or company, when they
 * would want to start, and roughly for how long.
 *
 * ── Deliberately NOT asked ───────────────────────────────────────────────
 * Income, employer, SCHUFA, existing tenancy, household size, nationality,
 * date of birth, family or marital status. Under DSGVO Art. 5(1)(c) an initial
 * enquiry may only collect what is needed to answer it, and several of those
 * questions are inadmissible before a viewing under German tenancy-law
 * practice. None of them may be added without explicit legal review.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  getRentalUnit,
  lettableUnits,
  LONG_TERM_MODE_LABEL,
  LONG_TERM_MODES,
  longTermModesOf,
  type LongTermMode,
} from '@/lib/content/apartments';
import { brand, ENQUIRY_ENDPOINT } from '@/lib/content/brand';
import { todayIso } from '@/lib/booking/availability';
import { CtaButton } from '@/components/ui-kit/cta';
import {
  ContactFields,
  EMAIL_PATTERN,
  EnquirySuccess,
  inputClass,
  labelClass,
  OptionalHint,
  SubmitError,
} from '@/components/enquiry/enquiry-fields';

type Status = 'idle' | 'sending' | 'success' | 'error';

/** Who is enquiring. Determines which legal framework a tenancy would fall
 *  under, which is why it is asked — not as a qualification filter. */
const PARTY_TYPES = ['private', 'company'] as const;
type PartyType = (typeof PARTY_TYPES)[number];

const PARTY_LABEL: Record<PartyType, { de: string; en: string }> = {
  private: { de: 'Privatperson', en: 'Private individual' },
  company: { de: 'Unternehmen', en: 'Company' },
};

/** Coarse duration bands — enough to route the conversation, nothing more. */
const DURATIONS = ['undecided', 'under-1-year', '1-2-years', 'over-2-years'] as const;
type Duration = (typeof DURATIONS)[number];

const DURATION_LABEL: Record<Duration, { de: string; en: string }> = {
  undecided: { de: 'Noch offen', en: 'Not yet decided' },
  'under-1-year': { de: 'Bis zu einem Jahr', en: 'Up to one year' },
  '1-2-years': { de: 'Ein bis zwei Jahre', en: 'One to two years' },
  'over-2-years': { de: 'Länger als zwei Jahre', en: 'Longer than two years' },
};

const REQUESTS = ['consultation', 'viewing', 'information'] as const;
type RequestType = (typeof REQUESTS)[number];

const REQUEST_LABEL: Record<RequestType, { de: string; en: string }> = {
  consultation: { de: 'Persönliches Gespräch', en: 'A personal conversation' },
  viewing: { de: 'Besichtigungstermin', en: 'A viewing appointment' },
  information: { de: 'Zunächst nur Informationen', en: 'Information for now' },
};

export function LongTermEnquiryForm({
  unitSlug,
  onClose,
}: {
  unitSlug?: string;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';

  const units = lettableUnits();
  const preselected = unitSlug ? getRentalUnit(unitSlug) : undefined;

  /** A unit that is offered in exactly one mode answers the question itself. */
  const modeOf = (slug: string): LongTermMode | '' => {
    const unit = slug ? getRentalUnit(slug) : undefined;
    const modes = unit ? longTermModesOf(unit) : [];
    return modes.length === 1 ? modes[0] : '';
  };

  const [form, setForm] = useState({
    unit: preselected?.slug ?? '',
    interest: (preselected ? modeOf(preselected.slug) : '') as LongTermMode | '',
    party: 'private' as PartyType,
    company: '',
    start: '',
    duration: 'undecided' as Duration,
    request: 'consultation' as RequestType,
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onUnitChange = (slug: string) =>
    setForm((f) => ({ ...f, unit: slug, interest: modeOf(slug) || f.interest }));

  const emailValid = EMAIL_PATTERN.test(form.email.trim());
  const nameValid = form.name.trim().length >= 2;
  const canSubmit = nameValid && emailValid && status !== 'sending';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    setStatus('sending');
    const unit = form.unit ? getRentalUnit(form.unit) : undefined;

    try {
      const response = await fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // A distinct type, so a tenancy enquiry is never processed as, or
          // counted as, an accommodation booking request.
          type: 'long-term-rental-enquiry',
          unit: unit ? { slug: unit.slug, name: unit.name.de, kind: unit.kind ?? 'apartment' } : null,
          tenancy: {
            interest: form.interest || null,
            partyType: form.party,
            company: form.party === 'company' ? form.company.trim() || null : null,
            desiredStart: form.start || null,
            expectedDuration: form.duration,
            request: form.request,
          },
          contact: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || null,
            message: form.message.trim() || null,
            locale,
          },
          meta: {
            source: 'website-rental-enquiry',
            brand: brand.name,
          },
        }),
      });

      if (!response.ok) throw new Error(`Rental enquiry failed with status ${response.status}`);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <EnquirySuccess
        locale={locale}
        firstName={form.name.split(' ')[0]}
        title={de ? 'Ihre Mietanfrage ist bei uns' : 'Your rental enquiry has arrived'}
        onClose={onClose}
      />
    );
  }

  return (
    <motion.form initial={false} onSubmit={handleSubmit} className="px-6 py-6 space-y-5" noValidate>
      <div>
        <label htmlFor="rent-interest" className={labelClass}>
          {de ? 'Ich interessiere mich für' : 'I am interested in'}
        </label>
        <select
          id="rent-interest"
          value={form.interest}
          onChange={(e) => set('interest')(e.target.value)}
          className={inputClass}
        >
          <option value="">{de ? 'Noch offen' : 'Not yet decided'}</option>
          {LONG_TERM_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === 'long-term-residential'
                ? de
                  ? 'Wohnraum zur Miete'
                  : 'Residential space to rent'
                : de
                ? 'Gewerbefläche zur Miete'
                : 'Commercial space to rent'}
            </option>
          ))}
        </select>
      </div>

      {units.length > 0 && (
        <div>
          <label htmlFor="rent-unit" className={labelClass}>
            {de ? 'Objekt' : 'Property'} <OptionalHint locale={locale} />
          </label>
          <select
            id="rent-unit"
            value={form.unit}
            onChange={(e) => onUnitChange(e.target.value)}
            className={inputClass}
          >
            <option value="">{de ? 'Noch offen — bitte beraten' : 'Undecided — please advise'}</option>
            {units.map((unit) => (
              <option key={unit.slug} value={unit.slug}>
                {unit.name[locale]} ·{' '}
                {longTermModesOf(unit)
                  .map((mode) => LONG_TERM_MODE_LABEL[mode][locale])
                  .join(' / ')}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset>
        <legend className={labelClass}>{de ? 'Ich frage an als' : 'I am enquiring as'}</legend>
        <div className="grid grid-cols-2 gap-3">
          {PARTY_TYPES.map((party) => {
            const active = form.party === party;
            return (
              <label
                key={party}
                className="flex min-h-[46px] cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-[14px] transition-colors"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${active ? 'hsl(var(--champagne-dark))' : 'hsl(var(--border))'}`,
                  background: active ? 'hsl(var(--champagne) / 0.14)' : 'hsl(var(--secondary) / 0.4)',
                }}
              >
                <input
                  type="radio"
                  name="rent-party"
                  value={party}
                  checked={active}
                  onChange={() => set('party')(party)}
                  className="accent-[hsl(var(--champagne-dark))]"
                />
                {PARTY_LABEL[party][locale]}
              </label>
            );
          })}
        </div>
      </fieldset>

      {form.party === 'company' && (
        <div>
          <label htmlFor="rent-company" className={labelClass}>
            {de ? 'Unternehmen' : 'Company'} <OptionalHint locale={locale} />
          </label>
          <input
            id="rent-company"
            type="text"
            autoComplete="organization"
            value={form.company}
            onChange={(e) => set('company')(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rent-start" className={labelClass}>
            {de ? 'Gewünschter Mietbeginn' : 'Preferred start'} <OptionalHint locale={locale} />
          </label>
          <input
            id="rent-start"
            type="date"
            min={todayIso()}
            value={form.start}
            onChange={(e) => set('start')(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="rent-duration" className={labelClass}>
            {de ? 'Voraussichtliche Mietdauer' : 'Expected duration'}
          </label>
          <select
            id="rent-duration"
            value={form.duration}
            onChange={(e) => set('duration')(e.target.value)}
            className={inputClass}
          >
            {DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {DURATION_LABEL[duration][locale]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="rent-request" className={labelClass}>
          {de ? 'Was möchten Sie als Nächstes?' : 'What would you like next?'}
        </label>
        <select
          id="rent-request"
          value={form.request}
          onChange={(e) => set('request')(e.target.value)}
          className={inputClass}
        >
          {REQUESTS.map((request) => (
            <option key={request} value={request}>
              {REQUEST_LABEL[request][locale]}
            </option>
          ))}
        </select>
      </div>

      <div className="rule-hair" aria-hidden="true" />

      <ContactFields
        locale={locale}
        idPrefix="rent"
        values={{ name: form.name, email: form.email, phone: form.phone }}
        onChange={(key, value) => set(key)(value)}
        touched={touched}
      />

      <div>
        <label htmlFor="rent-message" className={labelClass}>
          {de ? 'Geplante Nutzung, Fragen, Anmerkungen' : 'Intended use, questions, notes'}{' '}
          <OptionalHint locale={locale} />
        </label>
        <textarea
          id="rent-message"
          rows={3}
          value={form.message}
          onChange={(e) => set('message')(e.target.value)}
          placeholder={
            de
              ? 'Wofür möchten Sie die Fläche nutzen? Was ist Ihnen wichtig?'
              : 'What would you use the space for? What matters to you?'
          }
          className={`${inputClass} resize-none`}
        />
      </div>

      {status === 'error' && <SubmitError locale={locale} />}

      <div className="pt-1">
        <CtaButton type="submit" full disabled={status === 'sending'}>
          {status === 'sending' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {de ? 'Wird gesendet …' : 'Sending …'}
            </span>
          ) : de ? (
            'Mietanfrage senden'
          ) : (
            'Send rental enquiry'
          )}
        </CtaButton>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground text-center">
          {de
            ? 'Diese Anfrage ist unverbindlich. Sie begründet kein Mietverhältnis und keinen Anspruch auf Abschluss eines Mietvertrags. Wir melden uns persönlich und besprechen alles Weitere im Gespräch.'
            : 'This enquiry is non-binding. It does not create a tenancy and gives no entitlement to a rental agreement. We reply personally and discuss everything else in conversation.'}
        </p>
      </div>
    </motion.form>
  );
}
