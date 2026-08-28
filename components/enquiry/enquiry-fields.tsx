'use client';

/**
 * Shared form furniture for both enquiry forms.
 *
 * The short-term and long-term enquiries ask different questions, but they are
 * the same brand speaking, so the field styling, the error treatment and the
 * confirmation state live here once.
 */

import { Check, CircleAlert, MessageCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Locale } from '@/lib/content/apartments';
import { contact } from '@/lib/content/brand';
import { CtaButton, label } from '@/components/ui-kit/cta';

export const inputClass =
  'w-full min-h-[46px] px-3.5 py-2.5 bg-secondary/40 border border-border rounded-sm text-[15px] ' +
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
}: {
  locale: Locale;
  idPrefix: string;
  values: { name: string; email: string; phone: string };
  onChange: (key: 'name' | 'email' | 'phone', value: string) => void;
  touched: boolean;
}) {
  const de = locale === 'de';
  const nameValid = values.name.trim().length >= 2;
  const emailValid = EMAIL_PATTERN.test(values.email.trim());

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
          {de ? 'Telefon' : 'Phone'} <OptionalHint locale={locale} />
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          className={inputClass}
        />
      </div>
    </>
  );
}

/** Send failure, with the WhatsApp fallback so the visitor is never stranded. */
export function SubmitError({ locale }: { locale: Locale }) {
  const de = locale === 'de';
  return (
    <div
      role="alert"
      className="flex items-start gap-3 p-3.5 rounded-sm"
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

/** The confirmation state, shared by both enquiries. */
export function EnquirySuccess({
  locale,
  firstName,
  title,
  onClose,
}: {
  locale: Locale;
  firstName: string;
  title: string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const de = locale === 'de';

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-6 py-12 text-center"
    >
      <div
        className="w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center"
        style={{ background: 'hsl(var(--champagne) / 0.25)' }}
      >
        <Check className="w-6 h-6" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
      </div>
      <h3 className="display-3">{title}</h3>
      <p className="body-copy mx-auto mt-3 text-[14px]">
        {de
          ? `Danke, ${firstName}. ${contact.responseWindow.de}`
          : `Thank you, ${firstName}. ${contact.responseWindow.en}`}
      </p>
      <div className="mt-8">
        <CtaButton onClick={onClose} variant="secondary">
          {label('close', locale)}
        </CtaButton>
      </div>
    </motion.div>
  );
}
