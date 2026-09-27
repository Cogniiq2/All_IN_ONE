'use client';

/**
 * A general question — the one journey that had no form of its own.
 *
 * Staying and renting each have a dedicated flow, and the router on /contact
 * still points at them first. This is for everything else: a question about
 * the city, an invoice, a partnership, a lost item. It asks for the minimum
 * needed to answer (Art. 5(1)(c) DSGVO): a name, an address to answer to, an
 * optional phone number and the question.
 *
 * It posts to the same endpoint as every enquiry, with its own `type`, so a
 * question is never counted as a booking or a tenancy enquiry. On success the
 * visitor lands on /thank-you/message.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand, ENQUIRY_ENDPOINT } from '@/lib/content/brand';
import { CtaButton } from '@/components/ui-kit/cta';
import {
  ContactFields,
  EMAIL_PATTERN,
  FieldError,
  inputClass,
  labelClass,
  PrivacyNotice,
  SubmitError,
} from '@/components/enquiry/enquiry-fields';
import { firstNameOf, saveReceipt } from '@/lib/success/receipt';

type Status = 'idle' | 'sending' | 'error';

const MIN_MESSAGE = 10;

export function GeneralQuestionForm() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const router = useRouter();

  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  const nameValid = form.name.trim().length >= 2;
  const emailValid = EMAIL_PATTERN.test(form.email.trim());
  const messageValid = form.message.trim().length >= MIN_MESSAGE;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!nameValid || !emailValid || !messageValid || status === 'sending') return;
    setStatus('sending');
    try {
      const response = await fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'general-question',
          contact: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || null,
            message: form.message.trim(),
            locale,
          },
          meta: { source: 'website-contact', brand: brand.name },
        }),
      });
      if (!response.ok) throw new Error(`Question failed with status ${response.status}`);
      saveReceipt('message', { firstName: firstNameOf(form.name) });
      router.push('/thank-you/message');
    } catch {
      setStatus('error');
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
      <ContactFields
        locale={locale}
        idPrefix="question"
        values={{ name: form.name, email: form.email, phone: form.phone }}
        onChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
        touched={touched}
      />

      <div className="sm:col-span-2">
        <label htmlFor="question-message" className={labelClass}>
          {de ? 'Ihre Frage' : 'Your question'} <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="question-message"
          rows={5}
          required
          aria-required="true"
          aria-invalid={touched && !messageValid}
          aria-describedby={touched && !messageValid ? 'question-message-error' : undefined}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className={`${inputClass} resize-y`}
        />
        {touched && !messageValid && (
          <FieldError id="question-message-error">
            {de ? 'Bitte schreiben Sie uns ein paar Worte.' : 'Please write us a few words.'}
          </FieldError>
        )}
      </div>

      {status === 'error' && (
        <div className="sm:col-span-2">
          <SubmitError locale={locale} />
        </div>
      )}

      <div className="flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <PrivacyNotice locale={locale} className="max-w-[52ch]" />
        <CtaButton type="submit" disabled={status === 'sending'} className="shrink-0">
          {status === 'sending' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {de ? 'Wird gesendet …' : 'Sending …'}
            </span>
          ) : de ? (
            'Nachricht senden'
          ) : (
            'Send message'
          )}
        </CtaButton>
      </div>
    </form>
  );
}
