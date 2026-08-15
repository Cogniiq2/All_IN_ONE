'use client';

/**
 * The availability enquiry — the primary conversion action of the site.
 *
 * ── Why this replaces the old booking modal ───────────────────────────────
 * The previous modal let a guest pay in full, by card or PayPal, for any date
 * they liked. No availability source exists anywhere in this project, so that
 * flow could confirm and charge for a week already sold on another platform.
 * Payment is therefore not reachable from the frontend (see PAYMENT_ENABLED in
 * lib/content/brand.ts). The Stripe, PayPal and n8n configuration itself was
 * not modified — only the frontend path into it was removed.
 *
 * ── Accessibility ────────────────────────────────────────────────────────
 * Built on Radix Dialog, which provides dialog semantics, focus trapping,
 * Escape-to-close, focus restoration to the trigger and background scroll
 * locking. Dates use native inputs so keyboard and screen-reader behaviour is
 * the platform's, and so no custom calendar implies availability we cannot
 * confirm.
 */

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Check, CircleAlert, Loader as Loader2, MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { apartments, bookableApartments } from '@/lib/content/apartments';
import { contact, ENQUIRY_ENDPOINT, brand } from '@/lib/content/brand';
import { useEnquiry } from '@/components/enquiry/enquiry-context';
import { CtaButton, label } from '@/components/ui-kit/cta';

type Status = 'idle' | 'sending' | 'success' | 'error';

const emptyForm = {
  apartment: '',
  arrival: '',
  departure: '',
  guests: '2',
  name: '',
  email: '',
  phone: '',
  message: '',
};

export function EnquiryDialog() {
  const { locale } = useI18n();
  const { open, apartmentSlug, closeEnquiry } = useEnquiry();
  const reduce = useReducedMotion();
  const de = locale === 'de';

  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<Status>('idle');
  const [touched, setTouched] = useState(false);

  // Pre-select the apartment the visitor came from, and reset between visits.
  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, apartment: apartmentSlug ?? '' });
      setStatus('idle');
      setTouched(false);
    }
  }, [open, apartmentSlug]);

  const set = (key: keyof typeof emptyForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
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

  const inputClass =
    'w-full min-h-[46px] px-3.5 py-2.5 bg-secondary/40 border border-border rounded-sm text-[15px] ' +
    'text-foreground placeholder:text-muted-foreground/60 transition-colors ' +
    'focus:outline-none focus:border-champagne focus:bg-secondary/70';

  const labelClass = 'block label-sm font-semibold text-foreground mb-1.5';
  const errorClass = 'mt-1.5 text-[12px]';

  const options = bookableApartments();

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && closeEnquiry()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            style={{ background: 'hsl(var(--ink) / 0.55)', backdropFilter: 'blur(3px)' }}
          />
        </Dialog.Overlay>

        {/*
          Content is a full-screen flex wrapper rather than a transform-centred
          box: Framer Motion writes `transform` inline, which would override a
          Tailwind -translate-x-1/2 / -translate-y-1/2 centring and push the
          card off-screen. The wrapper is pointer-events-none so clicks beside
          the card still reach the overlay and dismiss it.
        */}
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.985 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto w-full max-w-[520px] max-h-full
                         overflow-y-auto bg-background shadow-2xl"
              style={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
            >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-border/70">
              <div>
                <p className="eyebrow">{brand.name} · {brand.city}</p>
                <Dialog.Title className="display-3 mt-2">
                  {de ? 'Verfügbarkeit anfragen' : 'Request availability'}
                </Dialog.Title>
                <Dialog.Description className="body-copy mt-2 text-[14px]">
                  {de
                    ? 'Sagen Sie uns Ihren Zeitraum — wir prüfen persönlich und melden uns mit Verfügbarkeit und Preis zurück.'
                    : 'Tell us your dates — we check personally and reply with availability and price.'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  className="shrink-0 w-10 h-10 -mr-2 -mt-1 flex items-center justify-center rounded-sm
                             text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label={label('close', locale)}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {status === 'success' ? (
                <motion.div
                  key="success"
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
                  <h3 className="display-3">{de ? 'Anfrage ist bei uns' : 'Your enquiry has arrived'}</h3>
                  <p className="body-copy mx-auto mt-3 text-[14px]">
                    {de
                      ? `Danke, ${form.name.split(' ')[0]}. ${contact.responseWindow.de}`
                      : `Thank you, ${form.name.split(' ')[0]}. ${contact.responseWindow.en}`}
                  </p>
                  <div className="mt-8">
                    <CtaButton onClick={closeEnquiry} variant="secondary">
                      {label('close', locale)}
                    </CtaButton>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={false}
                  onSubmit={handleSubmit}
                  className="px-6 py-6 space-y-5"
                  noValidate
                >
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
                        min={form.arrival || undefined}
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

                  <div>
                    <label htmlFor="enq-name" className={labelClass}>
                      {de ? 'Name' : 'Name'} <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="enq-name"
                      type="text"
                      autoComplete="name"
                      required
                      aria-required="true"
                      aria-invalid={touched && !nameValid}
                      aria-describedby={touched && !nameValid ? 'enq-name-error' : undefined}
                      value={form.name}
                      onChange={(e) => set('name')(e.target.value)}
                      className={inputClass}
                    />
                    {touched && !nameValid && (
                      <p id="enq-name-error" className={errorClass} style={{ color: 'hsl(var(--destructive))' }}>
                        {de ? 'Bitte tragen Sie Ihren Namen ein.' : 'Please enter your name.'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="enq-email" className={labelClass}>
                      {de ? 'E-Mail' : 'Email'} <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="enq-email"
                      type="email"
                      autoComplete="email"
                      required
                      aria-required="true"
                      aria-invalid={touched && !emailValid}
                      aria-describedby={touched && !emailValid ? 'enq-email-error' : undefined}
                      value={form.email}
                      onChange={(e) => set('email')(e.target.value)}
                      className={inputClass}
                    />
                    {touched && !emailValid && (
                      <p id="enq-email-error" className={errorClass} style={{ color: 'hsl(var(--destructive))' }}>
                        {de ? 'Bitte prüfen Sie Ihre E-Mail-Adresse.' : 'Please check your email address.'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="enq-phone" className={labelClass}>
                      {de ? 'Telefon' : 'Phone'}{' '}
                      <span className="font-normal text-muted-foreground">({de ? 'optional' : 'optional'})</span>
                    </label>
                    <input
                      id="enq-phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => set('phone')(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="enq-message" className={labelClass}>
                      {de ? 'Ihre Nachricht' : 'Your message'}{' '}
                      <span className="font-normal text-muted-foreground">({de ? 'optional' : 'optional'})</span>
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

                  {status === 'error' && (
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
                          {de
                            ? 'Die Anfrage konnte nicht gesendet werden.'
                            : 'We could not send your enquiry.'}
                        </p>
                        <a
                          href={contact.whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-quiet mt-2"
                        >
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          {label('writeWhatsApp', locale)}
                        </a>
                      </div>
                    </div>
                  )}

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
              )}
            </AnimatePresence>
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
