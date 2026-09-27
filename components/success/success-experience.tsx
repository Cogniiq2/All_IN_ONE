'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE SUCCESS EXPERIENCE — one choreography, twelve moments.
 *
 * Every confirmation page on the site renders through this component with a
 * scene from lib/content/success.ts. The words differ per moment; the way
 * the page unfolds does not, so a guest who books twice recognises it.
 *
 * ── The choreography (≈2 s, once, never looping except the "now" beacon) ──
 *   0.00  the seal: a ring draws itself, a single echo ring leaves it, then
 *         the mark settles in the centre
 *   0.45  eyebrow, then the gold rule draws from the left
 *   0.65  the personal greeting, in the serif italic
 *   0.75  the title rises word by word out of a mask
 *   0.35  in parallel, the visual: the apartment photograph uncovers from
 *         the bottom and settles from a slow 1.1× zoom — or, with no
 *         apartment, an arched Altbau window draws itself line by line
 *   1.15  the stay ticket slides up over the photograph
 *   1.30  lede, note and actions
 *   1.50  "what happens now": the line draws, the steps light in order, the
 *         current one keeps a slow, quiet pulse
 *
 * Luxury here is restraint: one ease curve, no bounce, no confetti, no
 * parallax. `prefers-reduced-motion` renders the finished state immediately.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────
 * The component shows what its caller hands it and nothing else. A ticket row
 * without a value is omitted, never filled with a placeholder. Provisional
 * photography carries the site's "Referenzbild" marker exactly as it does
 * everywhere else.
 * ══════════════════════════════════════════════════════════════════════════
 */

import Image from 'next/image';
import { type ReactNode } from 'react';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import {
  Bell,
  Building2,
  CalendarCheck,
  Check,
  Clock,
  KeyRound,
  Leaf,
  Mail,
  MessageSquare,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { Locale, RentalUnit } from '@/lib/content/apartments';
import { brand } from '@/lib/content/brand';
import { REFERENCE_IMAGE_LABEL } from '@/lib/content/media';
import { coverFor } from '@/lib/content/property-media';
import { STEPS_HEADING, type SceneMark, type SuccessScene } from '@/lib/content/success';

const EASE = [0.22, 1, 0.36, 1] as const;

const MARKS: Record<SceneMark, LucideIcon> = {
  check: Check,
  key: KeyRound,
  clock: Clock,
  mail: Mail,
  calendar: CalendarCheck,
  bell: Bell,
  message: MessageSquare,
  building: Building2,
  sparkle: Sparkles,
  leaf: Leaf,
};

export interface TicketRow {
  label: string;
  value: string;
  /** Rendered in the reference type: tracked, small caps. */
  emphasis?: boolean;
}

export function SuccessExperience({
  scene,
  locale,
  greeting,
  unit,
  ticket,
  ticketHeading,
  actions,
  aside,
  live,
}: {
  scene: SuccessScene;
  locale: Locale;
  /** The personal line above the title, already formatted. */
  greeting?: string;
  /** The apartment or unit this moment is about, when there is one. */
  unit?: RentalUnit;
  /** The facts of the stay or request. Empty rows are the caller's to omit. */
  ticket?: TicketRow[];
  /** The ticket's small heading — "Ihr Aufenthalt", "Ihre Anfrage", … */
  ticketHeading?: string;
  /** The CTAs. */
  actions?: ReactNode;
  /** Something that belongs beside the actions, e.g. "add to calendar". */
  aside?: ReactNode;
  /** A polite live status line, for pages that are still watching something. */
  live?: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const dark = scene.tone === 'ink';
  const de = locale === 'de';

  const fg = dark ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))';
  const muted = dark ? 'hsl(var(--on-dark-muted))' : 'hsl(var(--muted-foreground))';
  const gold = dark ? 'hsl(var(--on-dark-gold))' : 'hsl(var(--champagne-dark))';

  const rise = (delay: number, distance = 14) => ({
    initial: reduce ? false : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.8, ease: EASE } as Transition,
  });

  const hasTicket = Boolean(ticket && ticket.length > 0);

  return (
    <section
      className="relative overflow-hidden"
      style={{ background: dark ? 'hsl(var(--ink))' : 'hsl(var(--background))', color: fg }}
      data-success-scene={scene.id}
    >
      {/* One soft pool of light behind the seal on the dark scenes. */}
      {dark && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-[20%] -top-[30%] h-[70vh] w-[70vh] rounded-full opacity-[0.16] blur-3xl"
          style={{ background: 'radial-gradient(closest-side, hsl(var(--champagne)), transparent)' }}
        />
      )}

      <div className="container-luxury relative py-14 sm:py-20 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* ── The words ─────────────────────────────────────────── */}
          <div className="min-w-0">
            <Seal mark={scene.mark} colour={gold} reduce={reduce} />

            <motion.p className="mt-9" {...rise(0.45, 8)}>
              <span className={dark ? 'eyebrow-on-dark' : 'eyebrow'}>{scene.eyebrow[locale]}</span>
            </motion.p>
            <motion.div
              aria-hidden="true"
              className="rule-gold mt-4"
              style={{ transformOrigin: '0% 50%' }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.55, duration: 0.9, ease: EASE }}
            />

            {greeting && (
              <motion.p
                className="mt-7 text-[1.35rem] italic leading-snug sm:text-[1.6rem]"
                style={{ color: gold, fontFamily: 'var(--font-serif), Georgia, serif' }}
                {...rise(0.65, 10)}
              >
                {greeting}
              </motion.p>
            )}

            <MaskedTitle
              text={scene.title[locale]}
              colour={fg}
              reduce={reduce}
              className={greeting ? 'mt-2' : 'mt-7'}
            />

            <motion.p className="lede mt-6" style={{ color: muted }} {...rise(1.25)}>
              {scene.lede[locale]}
            </motion.p>

            {live && (
              <motion.p
                role="status"
                aria-live="polite"
                className="mt-5 inline-flex items-center gap-2.5 text-[12.5px]"
                style={{ color: muted }}
                {...rise(1.35, 6)}
              >
                <Beacon colour={gold} reduce={reduce} />
                {live}
              </motion.p>
            )}

            {(actions || aside) && (
              <motion.div className="mt-9 flex flex-wrap items-center gap-3" {...rise(1.4)}>
                {actions}
                {aside}
              </motion.div>
            )}

            {scene.note && (
              <motion.p
                className="mt-7 max-w-[52ch] text-[12.5px] leading-relaxed"
                style={{ color: muted }}
                {...rise(1.5, 6)}
              >
                {scene.note[locale]}
              </motion.p>
            )}
          </div>

          {/* ── The picture ───────────────────────────────────────── */}
          <div className="relative min-w-0">
            {unit ? (
              <UnitVisual unit={unit} locale={locale} reduce={reduce} dark={dark} />
            ) : (
              <DrawnVisual reduce={reduce} dark={dark} />
            )}

            {hasTicket && (
              <motion.div
                className="relative z-10 mx-4 -mt-16 sm:mx-8 lg:-ml-10 lg:mr-10"
                initial={reduce ? false : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.15, duration: 0.9, ease: EASE }}
              >
                <Ticket
                  rows={ticket!}
                  heading={ticketHeading ?? (de ? 'Ihr Aufenthalt' : 'Your stay')}
                  unitName={unit?.name[locale]}
                  dark={dark}
                />
              </motion.div>
            )}
          </div>
        </div>

        <Timeline scene={scene} locale={locale} reduce={reduce} dark={dark} />
      </div>
    </section>
  );
}

/* ── The seal ─────────────────────────────────────────────────────────── */

function Seal({ mark, colour, reduce }: { mark: SceneMark; colour: string; reduce: boolean }) {
  const Icon = MARKS[mark];
  return (
    <div className="relative h-[76px] w-[76px]" aria-hidden="true">
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: `1px solid ${colour}` }}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
          transition={{ delay: 0.85, duration: 1.4, ease: EASE }}
        />
      )}
      <svg viewBox="0 0 76 76" className="absolute inset-0 h-full w-full">
        <motion.circle
          cx="38"
          cy="38"
          r="36"
          fill="none"
          stroke={colour}
          strokeWidth="1.25"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: EASE }}
          style={{ rotate: -90, transformOrigin: '50% 50%' }}
        />
      </svg>
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6, ease: EASE }}
      >
        <Icon className="h-7 w-7" strokeWidth={1.4} style={{ color: colour }} />
      </motion.div>
    </div>
  );
}

/* ── The title, word by word out of a mask ────────────────────────────── */

function MaskedTitle({
  text,
  colour,
  reduce,
  className,
}: {
  text: string;
  colour: string;
  reduce: boolean;
  className: string;
}) {
  const words = text.split(' ');
  return (
    // The accessible name is the plain sentence; the animated words are
    // presentation only, so no screen reader hears it in fragments.
    <h1
      className={`display-1 ${className}`}
      // A touch under display-1's ceiling: the longest German compound in a
      // title ("Buchungsanfrage") must fit one line of a phone and of the
      // left column, since a word here never breaks.
      style={{ color: colour, fontSize: 'clamp(2rem, 4.4vw + 0.5rem, 3.75rem)' }}
      aria-label={text}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: '105%' }}
            animate={{ y: '0%' }}
            transition={{ delay: 0.75 + i * 0.07, duration: 0.95, ease: EASE }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 && ' '}
        </span>
      ))}
    </h1>
  );
}

/* ── The apartment, uncovered ─────────────────────────────────────────── */

function UnitVisual({
  unit,
  locale,
  reduce,
  dark,
}: {
  unit: RentalUnit;
  locale: Locale;
  reduce: boolean;
  dark: boolean;
}) {
  const cover = coverFor(unit, locale);
  if (!cover) return <DrawnVisual reduce={reduce} dark={dark} />;

  return (
    <motion.figure
      className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[5/4] lg:aspect-[4/5]"
      style={{ borderRadius: 'var(--radius-lg)', background: 'hsl(var(--secondary))' }}
      initial={reduce ? false : { clipPath: 'inset(100% 0% 0% 0%)' }}
      animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      transition={{ delay: 0.35, duration: 1.3, ease: EASE }}
    >
      <motion.div
        className="absolute inset-0"
        initial={reduce ? false : { scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.35, duration: 2.6, ease: EASE }}
      >
        <Image
          src={cover.image.src}
          alt={cover.alt}
          fill
          sizes="(min-width: 1024px) 520px, 100vw"
          className="object-cover"
          priority
        />
      </motion.div>
      {/* A quiet floor under the caption so it reads on any photograph. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{ background: 'linear-gradient(to top, hsl(var(--ink) / 0.62), transparent)' }}
      />
      <figcaption className="absolute left-5 top-5 right-5 flex items-start justify-between gap-3">
        <span className="eyebrow-on-dark" style={{ textShadow: '0 1px 12px hsl(var(--ink) / 0.5)' }}>
          {brand.name} · {brand.city}
        </span>
        {!cover.verified && <span className="ref-badge">{REFERENCE_IMAGE_LABEL[locale]}</span>}
      </figcaption>
    </motion.figure>
  );
}

/**
 * No apartment in this moment — a general question, a privileges page. A tall
 * arched window of the kind Bayreuth's Altbau streets are full of draws
 * itself in gold: architectural, calm, and nothing it could misrepresent.
 */
function DrawnVisual({ reduce, dark }: { reduce: boolean; dark: boolean }) {
  const stroke = dark ? 'hsl(var(--on-dark-gold))' : 'hsl(var(--champagne-dark))';
  const faint = dark ? 'hsl(var(--on-dark) / 0.14)' : 'hsl(var(--champagne-dark) / 0.22)';
  const draw = (delay: number, duration = 1.6) => ({
    initial: reduce ? false : { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { delay, duration, ease: EASE } as Transition,
  });

  return (
    <motion.div
      className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden sm:aspect-[5/4] lg:aspect-[4/5]"
      style={{
        borderRadius: 'var(--radius-lg)',
        background: dark ? 'hsl(var(--ink-light))' : 'hsl(var(--secondary) / 0.55)',
        border: `1px solid ${dark ? 'hsl(var(--on-dark) / 0.08)' : 'hsl(var(--border))'}`,
      }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.25, duration: 1, ease: EASE }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 280" className="h-[72%] w-auto" fill="none" strokeLinecap="round">
        {/* Outer frame and arch */}
        <motion.path d="M40 262 V110 A60 60 0 0 1 160 110 V262" stroke={stroke} strokeWidth="1.2" {...draw(0.4, 1.8)} />
        {/* Inner frame */}
        <motion.path d="M52 262 V112 A48 48 0 0 1 148 112 V262" stroke={faint} strokeWidth="1" {...draw(0.7, 1.8)} />
        {/* Mullion and transom */}
        <motion.path d="M100 64 V262" stroke={stroke} strokeWidth="1" {...draw(1.1, 1.2)} />
        <motion.path d="M52 150 H148" stroke={stroke} strokeWidth="1" {...draw(1.3, 1)} />
        {/* Fanlight rays */}
        <motion.path d="M100 112 L66 78 M100 112 L134 78 M100 112 L100 64" stroke={faint} strokeWidth="1" {...draw(1.5, 1)} />
        {/* Sill */}
        <motion.path d="M28 262 H172" stroke={stroke} strokeWidth="1.2" {...draw(1.7, 0.9)} />
      </svg>
      <p className={`absolute bottom-5 left-5 ${dark ? 'eyebrow-on-dark' : 'eyebrow'}`}>
        {brand.name} · {brand.city}
      </p>
    </motion.div>
  );
}

/* ── The ticket ───────────────────────────────────────────────────────── */

function Ticket({
  rows,
  heading,
  unitName,
  dark,
}: {
  rows: TicketRow[];
  heading: string;
  unitName?: string;
  dark: boolean;
}) {
  // The notches are "cut" by painting them in the ground the card sits on.
  const ground = dark ? 'hsl(var(--ink))' : 'hsl(var(--background))';
  return (
    <div
      className="relative p-6 sm:p-7"
      style={{
        background: 'hsl(var(--card))',
        color: 'hsl(var(--foreground))',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 30px 70px -40px hsl(var(--ink) / 0.55)',
      }}
    >
      <p className="eyebrow">{heading}</p>
      {unitName && <p className="display-3 mt-2">{unitName}</p>}

      {/* The perforation: a hairline with a notch cut into each edge. */}
      <div className="relative my-5" aria-hidden="true">
        <div className="border-t border-dashed" style={{ borderColor: 'hsl(var(--border))' }} />
        <span
          className="absolute -left-[31px] -top-[7px] h-[14px] w-[14px] rounded-full sm:-left-[35px]"
          style={{ background: ground }}
        />
        <span
          className="absolute -right-[31px] -top-[7px] h-[14px] w-[14px] rounded-full sm:-right-[35px]"
          style={{ background: ground }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        {rows.map((row) => (
          <div key={row.label} className={row.emphasis ? 'col-span-2' : 'min-w-0'}>
            <dt className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {row.label}
            </dt>
            <dd
              className={row.emphasis ? 'mt-1 font-mono text-[14px] tracking-[0.16em]' : 'mt-1 text-[14.5px] font-medium'}
              style={row.emphasis ? { color: 'hsl(var(--champagne-dark))' } : undefined}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── What happens now ─────────────────────────────────────────────────── */

function Timeline({
  scene,
  locale,
  reduce,
  dark,
}: {
  scene: SuccessScene;
  locale: Locale;
  reduce: boolean;
  dark: boolean;
}) {
  const gold = dark ? 'hsl(var(--on-dark-gold))' : 'hsl(var(--champagne-dark))';
  const line = dark ? 'hsl(var(--on-dark) / 0.16)' : 'hsl(var(--border))';
  const muted = dark ? 'hsl(var(--on-dark-muted))' : 'hsl(var(--muted-foreground))';
  const count = scene.steps.length;
  const START = 1.5;

  return (
    <div className="mt-16 lg:mt-24">
      <motion.p
        className={dark ? 'eyebrow-on-dark' : 'eyebrow'}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: START - 0.1, duration: 0.6 }}
      >
        {STEPS_HEADING[locale]}
      </motion.p>

      <ol
        className={`relative mt-7 grid gap-8 md:gap-10 ${count === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}
      >
        {/* The line: down on a phone, across from md up. */}
        <motion.span
          aria-hidden="true"
          className="absolute bottom-2 left-[7px] top-2 w-px md:hidden"
          style={{ background: line, transformOrigin: '50% 0%' }}
          initial={reduce ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: START, duration: 1.2, ease: EASE }}
        />
        <motion.span
          aria-hidden="true"
          className="absolute left-0 right-0 top-[7px] hidden h-px md:block"
          style={{ background: line, transformOrigin: '0% 50%' }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: START, duration: 1.2, ease: EASE }}
        />

        {scene.steps.map((step, i) => {
          const delay = START + 0.25 + i * 0.22;
          const done = step.state === 'done';
          const active = step.state === 'active';
          return (
            <motion.li
              key={step.title.en}
              className="relative pl-9 md:pl-0 md:pt-9"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay, duration: 0.7, ease: EASE }}
              aria-current={active ? 'step' : undefined}
            >
              <span className="absolute left-0 top-0 flex h-[15px] w-[15px] items-center justify-center" aria-hidden="true">
                {active && !reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: gold }}
                    animate={{ scale: [1, 2.2], opacity: [0.35, 0] }}
                    transition={{ delay: delay + 0.4, duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <span
                  className="relative block h-[15px] w-[15px] rounded-full"
                  style={{
                    background: done || active ? gold : dark ? 'hsl(var(--ink))' : 'hsl(var(--background))',
                    border: `1px solid ${done || active ? gold : line}`,
                  }}
                >
                  {done && (
                    <Check className="absolute inset-0 m-auto h-[9px] w-[9px]" strokeWidth={3} style={{ color: dark ? 'hsl(var(--ink))' : 'hsl(var(--background))' }} />
                  )}
                </span>
              </span>
              <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: active ? gold : muted }}>
                {labelFor(step.state, locale)}
              </p>
              <p className="mt-2 text-[16px] font-semibold">{step.title[locale]}</p>
              <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed" style={{ color: muted }}>
                {step.body[locale]}
              </p>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function labelFor(state: 'done' | 'active' | 'next', locale: Locale): string {
  const de = locale === 'de';
  if (state === 'done') return de ? 'Erledigt' : 'Done';
  if (state === 'active') return de ? 'Jetzt' : 'Now';
  return de ? 'Danach' : 'Next';
}

/** A small breathing dot for a page that is still listening for news. */
function Beacon({ colour, reduce }: { colour: string; reduce: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden="true">
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: colour }}
          animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className="relative inline-block h-2 w-2 rounded-full" style={{ background: colour }} />
    </span>
  );
}

/** The blank stage shown for the instant before a page knows its visitor. */
export function SuccessStage({ tone }: { tone: 'ink' | 'ivory' }) {
  return (
    <section
      aria-busy="true"
      className="min-h-[70vh]"
      style={{ background: tone === 'ink' ? 'hsl(var(--ink))' : 'hsl(var(--background))' }}
    />
  );
}
