'use client';

/**
 * Shared form furniture for both enquiry forms.
 *
 * The short-term and long-term enquiries ask different questions, but they are
 * the same brand speaking, so the field styling and the error treatment live
 * here once. Their confirmations are pages of their own (/thank-you/*).
 */

import { CircleAlert, MessageCircle } from 'lucide-react';
import type { Locale } from '@/lib/content/apartments';
import { contact } from '@/lib/content/brand';
import { label } from '@/components/ui-kit/cta';

export const inputClass =
  'w-full min-h-[46px] px-3.5 py-2.5 bg-secondary/40 border border-border rounded-md text-[15px] ' +
  'text-foreground placeholder:text-muted-foreground/60 transition-colors ' +
  'focus:outline-none focus:border-champagne focus:bg-secondary/70';

export const labelClass = 'block label-sm font-semibold text-foreground mb-1.5';
export const errorClass = 'mt-1.5 text-[12px]';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className={errorClass} style={{ color: 'hsl(var(--destructive))' }}>
      {children}
    </p>
  );
}

/** Optional-field suffix, so "(optional)" is written the same way everywhere. */
export function OptionalHint({ locale }: { locale: Locale }) {
  return (
    <span className="font-normal text-muted-foreground">
      ({locale === 'de' ? 'optional' : 'optional'})
    </span>
  );
}

/**
 * Name / email / phone. Identical in both enquiries — a prospective tenant and
 * a guest are reached the same way.
 */
export function ContactFields({
  locale,
  idPrefix,
  values,
  onChange,
  touched,
  phoneRequired = false,
}: {
  locale: Locale;
  idPrefix: string;
  values: { name: string; email: string; phone: string };
  onChange: (key: 'name' | 'email' | 'phone', value: string) => void;
  touched: boolean;
  /**
   * The direct booking needs a phone number (the reservation is refused
   * without one); an enquiry does not. The label, the required state and the
   * error message must say the same thing the validation does.
   */
  phoneRequired?: boolean;
}) {
  const de = locale === 'de';
  const nameValid = values.name.trim().length >= 2;
  const emailValid = EMAIL_PATTERN.test(values.email.trim());
  const phoneValid = !phoneRequired || values.phone.trim().length >= 5;

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          {de ? 'Name' : 'Name'} <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          autoComplete="name"
          required
          aria-required="true"
          aria-invalid={touched && !nameValid}
          aria-describedby={touched && !nameValid ? `${idPrefix}-name-error` : undefined}
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          className={inputClass}
        />
        {touched && !nameValid && (
          <FieldError id={`${idPrefix}-name-error`}>
            {de ? 'Bitte tragen Sie Ihren Namen ein.' : 'Please enter your name.'}
          </FieldError>
        )}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-email`} className={labelClass}>
          {de ? 'E-Mail' : 'Email'} <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-invalid={touched && !emailValid}
          aria-describedby={touched && !emailValid ? `${idPrefix}-email-error` : undefined}
          value={values.email}
          onChange={(e) => onChange('email', e.target.value)}
          className={inputClass}
        />
        {touched && !emailValid && (
          <FieldError id={`${idPrefix}-email-error`}>
            {de ? 'Bitte prüfen Sie Ihre E-Mail-Adresse.' : 'Please check your email address.'}
          </FieldError>
        )}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-phone`} className={labelClass}>
          {de ? 'Telefon' : 'Phone'}{' '}
          {phoneRequired ? <span aria-hidden="true">*</span> : <OptionalHint locale={locale} />}
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          autoComplete="tel"
          required={phoneRequired}
          aria-required={phoneRequired || undefined}
          aria-invalid={touched && !phoneValid}
          aria-describedby={touched && !phoneValid ? `${idPrefix}-phone-error` : undefined}
          value={values.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          className={inputClass}
        />
        {touched && !phoneValid && (
          <FieldError id={`${idPrefix}-phone-error`}>
            {de ? 'Bitte tragen Sie Ihre Telefonnummer ein.' : 'Please enter your phone number.'}
          </FieldError>
        )}
      </div>
    </>
  );
}

/**
 * The privacy line under every form that collects personal data (Art. 13
 * GDPR: the information is given at the time of collection, so the notice
 * must be one click away from the submit button, not only in the footer).
 */
export function PrivacyNotice({ locale, className = '' }: { locale: Locale; className?: string }) {
  const de = locale === 'de';
  return (
    <p className={`text-[12px] leading-relaxed text-muted-foreground ${className}`}>
      {de
        ? 'Wir verwenden Ihre Angaben nur, um Ihre Anfrage zu bearbeiten. Mehr dazu in unserer '
        : 'We use your details only to handle your enquiry. More in our '}
      <a href="/datenschutz" className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
        {de ? 'Datenschutzerklärung' : 'privacy notice'}
      </a>
      .
    </p>
  );
}

/** Send failure, with the WhatsApp fallback so the visitor is never stranded. */
export function SubmitError({ locale }: { locale: Locale }) {
  const de = locale === 'de';
  return (
    <div
      role="alert"
      className="flex items-start gap-3 p-3.5 rounded-md"
      style={{
        background: 'hsl(var(--destructive) / 0.07)',
        border: '1px solid hsl(var(--destructive) / 0.25)',
      }}
    >
      <CircleAlert
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{ color: 'hsl(var(--destructive))' }}
        aria-hidden="true"
      />
      <div>
        <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(var(--destructive))' }}>
          {de ? 'Die Anfrage konnte nicht gesendet werden.' : 'We could not send your enquiry.'}
        </p>
        <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="link-quiet mt-2">
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {label('writeWhatsApp', locale)}
        </a>
      </div>
    </div>
  );
}
