'use client';

/**
 * The one date control on the public site.
 *
 * Every user-facing date selector — the hero stay panel, both enquiry forms and
 * the rental appointment dialog — is this component, so the field styling, the
 * label treatment and the written format hint cannot drift apart into several
 * slightly different date implementations.
 *
 * ── Why it stays a native input ──────────────────────────────────────────
 * `<input type="date">` gives the visitor the platform's own picker, keyboard
 * entry, autofill and assistive-technology support for free. Its *rendered*
 * value follows the browser and operating-system locale and is not stylable;
 * forcing a particular visual format would mean replacing the control with a
 * text field and losing all of the above. So the format is stated in words
 * beside the field (`DATE_FORMAT_HINT`) rather than faked inside it, and every
 * date the site renders *itself* is printed by `formatDate` in the same shape.
 *
 * The site's own range calendar (components/booking/stay-calendar.tsx) is a
 * different control for a different job — picking two dates at once inside the
 * booking dialog — and is deliberately left alone.
 */

import { useId } from 'react';
import { useI18n } from '@/lib/i18n';
import { DATE_FORMAT_HINT } from '@/lib/booking/date-format';
import { labelClass } from '@/components/enquiry/enquiry-fields';

/**
 * One fixed control height for the whole family of fields.
 *
 * A native date input, a number input and a CTA each have a different
 * intrinsic height, which is what left the hero panel's labels and boxes a
 * couple of pixels out of line with one another. Pinning the height is what
 * makes a row of them align exactly.
 */
export const CONTROL_HEIGHT = 'h-[50px]';

/**
 * The date input's own class, deliberately NOT the shared `inputClass` with a
 * height bolted on. Two differences matter, and both are bug fixes:
 *
 *   py-0        a native date input lays its own spin/segment boxes out inside
 *               the content box. Fixed height PLUS vertical padding leaves that
 *               inner control taller than the space it is given, and engines
 *               that do not overflow it visibly instead render the field looking
 *               clipped or empty. The height alone centres it; the padding is
 *               what has to go.
 *
 *   min-w-0     a date input has a wide intrinsic minimum width — wider than a
 *               grid track may want to be. Without this the input refuses to
 *               shrink, pushes its track past the size the grid assigned, and
 *               the fields either overlap or shunt the CTA out of the panel.
 *               `min-w-0` on the wrapper is not enough: the floor lives on the
 *               input itself.
 *
 * Everything else — background, border, radius, focus treatment, type size — is
 * character for character the shared field style.
 */
export const dateInputClass =
  `block w-full min-w-0 ${CONTROL_HEIGHT} px-3.5 py-0 bg-secondary/40 border border-border ` +
  'rounded-md text-[15px] text-foreground transition-colors ' +
  'focus:outline-none focus:border-champagne focus:bg-secondary/70';

export function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  optional = false,
  /** Overrides the shared label style where a surface has its own. */
  labelClassName = labelClass,
  className = '',
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  optional?: boolean;
  labelClassName?: string;
  className?: string;
}) {
  const { locale } = useI18n();
  const generated = useId();
  const fieldId = id ?? `${generated}-date`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={fieldId} className={labelClassName}>
        {label}
        {optional && (
          <>
            {' '}
            <span className="font-normal text-muted-foreground">
              ({locale === 'de' ? 'optional' : 'optional'})
            </span>
          </>
        )}{' '}
        {/*
          The convention, in words, carried by the label itself. Screen readers
          announce it with the field; sighted visitors read it above it. It adds
          no row of its own, so a line of these fields still aligns exactly with
          the controls beside it — and it is a statement of the convention, not
          a claim about how the browser will render the value it holds.
        */}
        <span id={hintId} className="font-normal normal-case tracking-normal text-muted-foreground">
          {DATE_FORMAT_HINT[locale]}
        </span>
      </label>
      <input
        id={fieldId}
        type="date"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
        className={dateInputClass}
      />
    </div>
  );
}
