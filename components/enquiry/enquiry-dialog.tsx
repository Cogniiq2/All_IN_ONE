'use client';

/**
 * The enquiry dialog shell.
 *
 * It holds the chrome — heading, description, close — and hands the body to
 * one of two forms. The two journeys never share a form: an accommodation
 * guest and a prospective tenant are asked different questions, told different
 * things about what their submission means, and reach different people.
 *
 *   'short-term' → ShortTermEnquiryForm  (nights, guests, dates)
 *   'long-term'  → LongTermEnquiryForm   (rental agreement, consultation)
 *
 * ── Accessibility ────────────────────────────────────────────────────────
 * Built on Radix Dialog, which provides dialog semantics, focus trapping,
 * Escape-to-close, focus restoration to the trigger and background scroll
 * locking.
 */

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand } from '@/lib/content/brand';
import { useEnquiry, type EnquiryContextData, type EnquiryKind } from '@/components/enquiry/enquiry-context';
import { ShortTermEnquiryForm } from '@/components/enquiry/short-term-form';
import { LongTermEnquiryForm } from '@/components/enquiry/long-term-form';
import { label } from '@/components/ui-kit/cta';

const COPY: Record<EnquiryKind, { eyebrow: { de: string; en: string }; title: { de: string; en: string }; description: { de: string; en: string } }> = {
  'short-term': {
    eyebrow: { de: 'Aufenthalt', en: 'Stay' },
    title: { de: 'Jetzt buchen', en: 'Book now' },
    /*
      The honest frame around that title, in the dialog's own subheading rather
      than hidden in small print at the bottom: the visitor books here, and a
      person confirms the dates and the price before anything binds. Nothing is
      charged on this screen (PAYMENT_ENABLED) and no calendar is consulted
      (lib/booking/availability.ts) — both facts are stated again by the form
      itself at the point of submission.
    */
    description: {
      de: 'Sagen Sie uns Ihren Zeitraum — wir bestätigen Ihnen Verfügbarkeit und Preis persönlich, bevor etwas verbindlich wird.',
      en: 'Tell us your dates — we confirm availability and price personally before anything becomes binding.',
    },
  },
  'long-term': {
    eyebrow: { de: 'Mietanfrage', en: 'Rental enquiry' },
    title: { de: 'Mieten — unverbindlich anfragen', en: 'Renting — a non-binding enquiry' },
    description: {
      de: 'Für eine dauerhafte Vermietung über einen Mietvertrag. Sagen Sie uns kurz, worum es geht — den Rest besprechen wir persönlich.',
      en: 'For a conventional tenancy under a rental agreement. Tell us briefly what you have in mind — we discuss the rest personally.',
    },
  },
};

export function EnquiryDialog() {
  const { locale } = useI18n();
  const { open, kind, data, closeEnquiry } = useEnquiry();
  const reduce = useReducedMotion();

  /**
   * The forms are uncontrolled once mounted, so the dialog remounts them on
   * each open via `formKey`. That resets fields, status and validation between
   * visits without either form having to reset itself.
   */
  const [formKey, setFormKey] = useState(0);
  const [snapshot, setSnapshot] = useState<EnquiryContextData>({});

  useEffect(() => {
    if (open) {
      setSnapshot(data);
      setFormKey((n) => n + 1);
    }
    // `data` is replaced wholesale by openEnquiry, so this runs once per open.
  }, [open, data]);

  const copy = COPY[kind];

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
              style={{ borderRadius: 'var(--radius-xl)', border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-border/70">
                <div>
                  <p className="eyebrow">
                    {brand.name} · {copy.eyebrow[locale]}
                  </p>
                  <Dialog.Title className="display-3 mt-2">{copy.title[locale]}</Dialog.Title>
                  <Dialog.Description className="body-copy mt-2 text-[14px]">
                    {copy.description[locale]}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    className="shrink-0 w-10 h-10 -mr-2 -mt-1 flex items-center justify-center rounded-xs
                               text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    aria-label={label('close', locale)}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {kind === 'long-term' ? (
                  <LongTermEnquiryForm
                    key={`long-${formKey}`}
                    unitSlug={snapshot.unitSlug}
                    onClose={closeEnquiry}
                  />
                ) : (
                  <ShortTermEnquiryForm
                    key={`short-${formKey}`}
                    unitSlug={snapshot.unitSlug}
                    stay={{
                      arrival: snapshot.arrival,
                      departure: snapshot.departure,
                      guests: snapshot.guests,
                    }}
                    onClose={closeEnquiry}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
