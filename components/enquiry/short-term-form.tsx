'use client';

/**
 * The short-term availability enquiry — the primary conversion action of the
 * accommodation journey.
 *
 * ── Why this is an enquiry and not a booking ─────────────────────────────
 * The previous modal let a guest pay in full, by card or PayPal, for any date
 * they liked. No availability source exists anywhere in this project (see
 * lib/booking/availability.ts), so that flow could confirm and charge for a
 * week already sold on another platform. Payment is therefore not reachable
 * from the frontend (see PAYMENT_ENABLED in lib/content/brand.ts). The Stripe,
 * PayPal and n8n configuration itself was not modified — only the frontend
 * path into it was removed.
 *
 * When the PMS is connected, `checkAvailability` starts returning real answers
 * and this form gains a result step. Its fields already carry exactly what the
 * booking service will need.
 *
 * Dates use native inputs so keyboard and screen-reader behaviour is the
 * platform's, and so no custom calendar implies availability we cannot confirm.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { apartments, bookableApartments } from '@/lib/content/apartments';
import { brand, ENQUIRY_ENDPOINT } from '@/lib/content/brand';
import { nextDayIso, todayIso, type StayQuery } from '@/lib/booking/availability';
import { CtaButton, label } from '@/components/ui-kit/cta';
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

export function ShortTermEnquiryForm({
  unitSlug,
  stay,
  onClose,
}: {
  unitSlug?: string;
  stay?: StayQuery;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const de = locale === 'de';

  const [form, setForm] = useState({
    apartment: unitSlug ?? '',
    arrival: stay?.arrival ?? '',
    departure: stay?.departure ?? '',
    guests: String(stay?.guests ?? 2),
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const emailValid = EMAIL_PATTERN.test(form.email.trim());
  const nameValid = form.name.trim().length >= 2;
  const canSubmit = nameValid && emailValid && status !== 'sending';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    setStatus('sending');

    const selected = apartments.find((a) => a.slug === form.apartment);

    try {
      const response = await fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'availability-enquiry',
          apartment: selected ? { slug: selected.slug, name: selected.name.de } : null,
          stay: {
            arrival: form.arrival || null,
            departure: form.departure || null,
            guests: Number(form.guests) || null,
          },
          guest: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || null,
            message: form.message.trim() || null,
            locale,
          },
          meta: {
            source: 'website-enquiry',
            brand: brand.name,
          },
        }),
      });

      if (!response.ok) throw new Error(`Enquiry failed with status ${response.status}`);
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
        title={de ? 'Anfrage ist bei uns' : 'Your enquiry has arrived'}
        onClose={onClose}
      />
    );
  }

  // Only units that declare the 'short-term' mode and are ready today. A
  // commercial unit can never appear in this list.
  const options = bookableApartments();

  return (
    <motion.form initial={false} onSubmit={handleSubmit} className="px-6 py-6 space-y-5" noValidate>
      {options.length > 0 && (
        <div>
          <label htmlFor="enq-apartment" className={labelClass}>
            {de ? 'Apartment' : 'Apartment'}
          </label>
          <select
            id="enq-apartment"
            value={form.apartment}
            onChange={(e) => set('apartment')(e.target.value)}
            className={inputClass}
          >
            <option value="">{de ? 'Noch offen — bitte beraten' : 'Undecided — please advise'}</option>
            {options.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name[locale]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="enq-arrival" className={labelClass}>
            {de ? 'Anreise' : 'Arrival'}
          </label>
          <input
            id="enq-arrival"
            type="date"
            min={todayIso()}
            value={form.arrival}
            onChange={(e) => set('arrival')(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="enq-departure" className={labelClass}>
            {de ? 'Abreise' : 'Departure'}
          </label>
          <input
            id="enq-departure"
            type="date"
            min={nextDayIso(form.arrival) ?? todayIso()}
            value={form.departure}
            onChange={(e) => set('departure')(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="enq-guests" className={labelClass}>
          {de ? 'Personen' : 'Guests'}
        </label>
        <input
          id="enq-guests"
          type="number"
          min={1}
          max={12}
          inputMode="numeric"
          value={form.guests}
          onChange={(e) => set('guests')(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="rule-hair" aria-hidden="true" />

      <ContactFields
        locale={locale}
        idPrefix="enq"
        values={{ name: form.name, email: form.email, phone: form.phone }}
        onChange={(key, value) => set(key)(value)}
        touched={touched}
      />

      <div>
        <label htmlFor="enq-message" className={labelClass}>
          {de ? 'Ihre Nachricht' : 'Your message'} <OptionalHint locale={locale} />
        </label>
        <textarea
          id="enq-message"
          rows={3}
          value={form.message}
          onChange={(e) => set('message')(e.target.value)}
          placeholder={
            de
              ? 'Anlass der Reise, Fragen zur Ausstattung, gewünschte Anreisezeit …'
              : 'Reason for travel, questions about the apartment, preferred arrival time …'
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
          ) : (
            label('send', locale)
          )}
        </CtaButton>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground text-center">
          {de
            ? 'Eine Anfrage ist noch keine Buchung. Wir bestätigen Verfügbarkeit und Preis persönlich, bevor etwas verbindlich wird.'
            : 'An enquiry is not yet a booking. We confirm availability and price personally before anything becomes binding.'}
        </p>
      </div>
    </motion.form>
  );
}
