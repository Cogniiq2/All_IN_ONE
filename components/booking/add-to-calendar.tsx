'use client';

/**
 * "Zum Kalender hinzufügen" — shared by both confirmation states.
 *
 * One premium CTA that reveals the two destinations that actually matter:
 * Google Calendar, and a standard .ics file for Apple Calendar, Outlook and
 * everything else. No provider SDK, no new dependency, nothing loaded from a
 * third party — the Google link is a plain URL and the .ics is built in the
 * browser (lib/booking/calendar.ts).
 *
 * ── When this renders ────────────────────────────────────────────────────
 * Never on its own judgement. A caller passes an `event`, and an event only
 * exists when the backend has confirmed a real stay or a real appointment.
 * While a booking is still a request and an appointment time has not been
 * agreed, the callers pass nothing and this component is not on the page at
 * all. See the rule at the top of lib/booking/calendar.ts.
 *
 * Buttons are the site's existing CTA system at its existing dimensions; no
 * new button style is introduced.
 */

import { useState } from 'react';
import { CalendarPlus, Download } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import {
  googleCalendarUrl,
  icsFileName,
  icsFor,
  type CalendarEvent,
} from '@/lib/booking/calendar';
import { CtaButton } from '@/components/ui-kit/cta';

export function AddToCalendar({ event }: { event: CalendarEvent }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  /**
   * The .ics is generated and handed over as a Blob, so the file never leaves
   * the visitor's browser and no request is made to fetch it.
   */
  const downloadIcs = () => {
    const blob = new Blob([icsFor(event)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = icsFileName(event);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Given back on the next tick; revoking immediately cancels the download
    // in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <CtaButton
        variant="secondary"
        onClick={() => setOpen((current) => !current)}
        ariaLabel={de ? 'Zum Kalender hinzufügen' : 'Add to calendar'}
      >
        <span className="inline-flex items-center gap-2">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {de ? 'Zum Kalender hinzufügen' : 'Add to calendar'}
        </span>
      </CtaButton>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center"
          >
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="cta-secondary"
            >
              Google Calendar
            </a>
            <button type="button" onClick={downloadIcs} className="cta-secondary">
              <Download className="h-4 w-4" aria-hidden="true" />
              {de ? 'Apple Kalender / .ics' : 'Apple Calendar / .ics'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
