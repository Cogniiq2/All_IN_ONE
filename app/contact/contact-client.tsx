'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  MessageCircle, Phone, Mail, Send, Check, ChevronRight,
  ArrowUpRight, Sparkles,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SidebarDatePicker } from '@/components/shared/sidebar-date-picker';

type FormData = {
  name: string;
  email: string;
  phone: string;
  company: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  stayType: string;
  residence: string;
  message: string;
};

const INITIAL_FORM: FormData = {
  name: '',
  email: '',
  phone: '',
  company: '',
  checkIn: '',
  checkOut: '',
  guests: 2,
  stayType: '',
  residence: '',
  message: '',
};

function AnimatedLine({ delay = 0 }: { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="h-px bg-border/40 overflow-hidden">
      <motion.div
        className="h-full"
        style={{ background: 'linear-gradient(to right, transparent, hsl(38 42% 62% / 0.5), transparent)' }}
        initial={{ scaleX: 0, originX: 0 }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function LuxurySelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative" style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}>
      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 pt-4 pb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full pb-3 flex items-center justify-between gap-3 text-left focus:outline-none group"
      >
        <span
          className="text-sm transition-colors"
          style={{ color: value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.35)' }}
        >
          {value || placeholder}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronRight
            className="w-3.5 h-3.5 flex-shrink-0 rotate-90 transition-colors"
            style={{ color: open ? 'hsl(38 42% 52%)' : 'hsl(var(--muted-foreground) / 0.3)' }}
          />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scaleY: 0.94 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              transformOrigin: 'top',
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 200,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(38 42% 62% / 0.18)',
              borderRadius: '0.5rem',
              boxShadow: '0 16px 48px -8px hsl(220 12% 13% / 0.18), 0 0 0 1px hsl(38 42% 62% / 0.06)',
              overflow: 'hidden',
            }}
          >
            {options.map((opt, i) => {
              const selected = value === opt;
              return (
                <motion.button
                  key={opt}
                  type="button"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors"
                  style={{
                    background: selected ? 'hsl(38 42% 62% / 0.08)' : 'transparent',
                    color: selected ? 'hsl(38 42% 38%)' : 'hsl(var(--foreground) / 0.75)',
                    borderBottom: i < options.length - 1 ? '1px solid hsl(var(--border) / 0.25)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'hsl(38 42% 62% / 0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span>{opt}</span>
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'hsl(38 42% 46%)', color: 'white' }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const CHANNEL_VARIANTS = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { duration: 0.55, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] },
  }),
};


export default function ContactClient() {
  const { locale } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const de = locale === 'de';

  const residenceOptions = de
    ? ['Keine Präferenz', 'Maison Sternplatz', 'Loge am Sternplatz', 'Atelier Opernstraße', 'Penthouse Belvédère', 'Design Loft Innenstadt']
    : ['No preference', 'Maison Sternplatz', 'Loge am Sternplatz', 'Atelier Opernstraße', 'Penthouse Belvédère', 'Design Loft Innenstadt'];

  const stayTypes = de
    ? ['Wochenende / Kurzaufenthalt', 'Geschäftsreise', 'Langzeitaufenthalt (7+ Nächte)', 'Festspielzeit 2026', 'Sonstiges']
    : ['Weekend / short stay', 'Business trip', 'Long stay (7+ nights)', 'Festival season 2026', 'Other'];

  const steps = [
    { label: de ? 'Kontakt' : 'Contact', fields: ['name', 'email', 'phone', 'company'] },
    { label: de ? 'Aufenthalt' : 'Stay', fields: ['checkIn', 'checkOut', 'guests', 'stayType', 'residence'] },
    { label: de ? 'Nachricht' : 'Message', fields: ['message'] },
  ];

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message || sending) return;
    setSending(true);
    setSendError(false);
    try {
      const res = await fetch('https://n8n.cogniiq.co/webhook/contact-allinone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          company: form.company || null,
          check_in: form.checkIn || null,
          check_out: form.checkOut || null,
          guests: form.guests,
          stay_type: form.stayType || null,
          residence: form.residence || null,
          message: form.message,
          locale,
          submitted_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmitted(true);
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  const channels = [
    {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: '+49 160 1832917',
      note: de ? 'Meist sofort' : 'Usually instant',
      href: 'https://wa.me/491601832917',
      color: '#25D366',
      colorBg: 'rgba(37,211,102,0.08)',
      colorBorder: 'rgba(37,211,102,0.2)',
    },
    {
      icon: Phone,
      label: de ? 'Telefon' : 'Phone',
      value: '+49 160 1832917',
      note: de ? 'Mo–Sa, 9–20 Uhr' : 'Mon–Sat, 9am–8pm',
      href: 'tel:+491601832917',
      color: 'hsl(38 42% 52%)',
      colorBg: 'hsl(38 42% 62% / 0.06)',
      colorBorder: 'hsl(38 42% 62% / 0.18)',
    },
    {
      icon: Mail,
      label: 'E-Mail',
      value: 'info@allinone-residences.de',
      note: de ? '< 24 Stunden' : '< 24 hours',
      href: 'mailto:info@allinone-residences.de',
      color: 'hsl(38 42% 52%)',
      colorBg: 'hsl(38 42% 62% / 0.06)',
      colorBorder: 'hsl(38 42% 62% / 0.18)',
    },
  ];

  const languages = ['Deutsch', 'English', 'Français', 'Srpski'];

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 80% 30%, hsl(38 42% 62% / 0.06) 0%, transparent 70%)',
          }}
        />

        <div className="container-luxury pt-20 pb-8 lg:pt-28 lg:pb-12">
          <FadeUp>
            <div className="flex items-center gap-3 mb-6">
              <div
                className="h-px w-8"
                style={{ background: 'linear-gradient(to right, transparent, hsl(38 42% 62%))' }}
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/70">
                {de ? 'Persönlicher Kontakt' : 'Personal Contact'}
              </span>
            </div>
            <h1 className="font-serif text-5xl lg:text-7xl font-semibold leading-[1.05] mb-6 tracking-tight">
              {de ? (
                <>
                  Ihr persönlicher<br />
                  <em className="not-italic" style={{ color: 'hsl(38 42% 52%)' }}>Ansprechpartner.</em>
                </>
              ) : (
                <>
                  Your personal<br />
                  <em className="not-italic" style={{ color: 'hsl(38 42% 52%)' }}>point of contact.</em>
                </>
              )}
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-lg">
              {de
                ? 'Wir antworten persönlich — auf Deutsch, Englisch, Französisch und Serbisch. Keine Bots, kein Call-Center.'
                : 'We respond personally — in German, English, French, and Serbian. No bots, no call centers.'}
            </p>
          </FadeUp>
        </div>

        <AnimatedLine />
      </div>

      <div className="container-luxury py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-20">

          <div className="lg:col-span-4 space-y-10">
            <FadeUp delay={0.05}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/50 mb-5">
                {de ? 'Direkt erreichen' : 'Reach us directly'}
              </p>
              <div className="space-y-3">
                {channels.map((ch, i) => (
                  <motion.a
                    key={ch.label}
                    href={ch.href}
                    target={ch.href.startsWith('https') ? '_blank' : undefined}
                    rel={ch.href.startsWith('https') ? 'noopener noreferrer' : undefined}
                    custom={i}
                    variants={CHANNEL_VARIANTS}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    whileHover={{ x: 4 }}
                    className="flex items-center gap-4 p-4 rounded-lg group transition-colors"
                    style={{
                      background: ch.colorBg,
                      border: `1px solid ${ch.colorBorder}`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: `${ch.color}18` }}
                    >
                      <ch.icon className="w-4.5 h-4.5" style={{ color: ch.color, width: 18, height: 18 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: ch.color }}>
                          {ch.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 font-medium">{ch.note}</span>
                      </div>
                      <p className="text-sm text-foreground/80 truncate mt-0.5">{ch.value}</p>
                    </div>
                    <ArrowUpRight
                      className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0"
                    />
                  </motion.a>
                ))}
              </div>
            </FadeUp>

            <AnimatedLine />

            <FadeUp delay={0.15}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/50 mb-4">
                {de ? 'Sprachen' : 'Languages'}
              </p>
              <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                {languages.map((lang) => (
                  <div key={lang} className="flex items-center gap-2">
                    <div
                      className="w-1 h-1 rounded-full flex-shrink-0"
                      style={{ background: 'hsl(38 42% 62%)' }}
                    />
                    <span className="text-sm text-muted-foreground">{lang}</span>
                  </div>
                ))}
              </div>
            </FadeUp>

            <AnimatedLine />

            <FadeUp delay={0.2}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/50 mb-4">
                {de ? 'Antwortzeiten' : 'Response times'}
              </p>
              <div className="space-y-3">
                {[
                  { label: 'WhatsApp', time: de ? 'Meist sofort' : 'Usually instant', pct: 95 },
                  { label: de ? 'Telefon' : 'Phone', time: de ? 'Mo–Sa 9–20 Uhr' : 'Mon–Sat 9–8pm', pct: 80 },
                  { label: 'E-Mail', time: de ? 'Innerhalb 24 Std.' : 'Within 24h', pct: 60 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="text-[11px] font-medium text-foreground/60">{row.time}</span>
                    </div>
                    <div className="h-px bg-border/30 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(to right, hsl(38 42% 62%), hsl(38 42% 46%))' }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${row.pct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </FadeUp>

            <AnimatedLine />

            <FadeUp delay={0.25}>
              <div
                className="rounded-lg p-5"
                style={{
                  background: 'linear-gradient(135deg, hsl(38 42% 62% / 0.07) 0%, hsl(38 42% 46% / 0.04) 100%)',
                  border: '1px solid hsl(38 42% 62% / 0.15)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'hsl(38 42% 52%)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'hsl(38 42% 52%)' }}>
                    {de ? 'Direktbuchungs-Vorteil' : 'Direct booking benefit'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {de
                    ? 'Bei Buchung über uns erwartet Sie ein kuratierter Willkommenswein — persönlich ausgewählt.'
                    : 'Book directly and a curated welcome wine awaits your arrival — personally selected.'}
                </p>
              </div>
            </FadeUp>
          </div>

          <div className="lg:col-span-8">
            <FadeUp delay={0.1}>
              <div
                className="rounded-2xl overflow-visible"
                style={{
                  border: '1px solid hsl(var(--border) / 0.5)',
                  background: 'hsl(var(--card))',
                  boxShadow: '0 0 0 1px hsl(38 42% 62% / 0.06), 0 24px 80px -12px hsl(220 12% 13% / 0.12)',
                }}
              >
                <AnimatePresence mode="wait">
                  {submitted ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center py-28 px-8 text-center"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 18 }}
                        className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                        style={{ background: 'hsl(38 42% 62% / 0.12)', border: '1px solid hsl(38 42% 62% / 0.25)' }}
                      >
                        <Check className="w-7 h-7" style={{ color: 'hsl(38 42% 46%)' }} />
                      </motion.div>
                      <motion.h3
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="font-serif text-2xl font-semibold mb-3"
                      >
                        {de ? 'Anfrage erhalten.' : 'Inquiry received.'}
                      </motion.h3>
                      <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35 }}
                        className="text-muted-foreground max-w-xs leading-relaxed"
                      >
                        {de
                          ? 'Vielen Dank. Wir melden uns persönlich — in Ihrer bevorzugten Sprache.'
                          : 'Thank you. We will reach out personally — in your preferred language.'}
                      </motion.p>
                    </motion.div>
                  ) : (
                    <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div
                        className="px-7 py-6 flex items-center justify-between"
                        style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
                      >
                        <div>
                          <h2 className="font-serif text-xl font-semibold mb-0.5">
                            {de ? 'Anfrage stellen' : 'Send an inquiry'}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            {de
                              ? 'Geschäftsreisen, Langzeitaufenthalte, Sonderwünsche & mehr'
                              : 'Business trips, long stays, special requests & more'}
                          </p>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5">
                          {steps.map((s, i) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => setActiveStep(i)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
                              style={
                                activeStep === i
                                  ? { background: 'hsl(38 42% 62% / 0.12)', color: 'hsl(38 42% 40%)', border: '1px solid hsl(38 42% 62% / 0.3)' }
                                  : { background: 'transparent', color: 'hsl(var(--muted-foreground))', border: '1px solid transparent' }
                              }
                            >
                              <span
                                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                                style={
                                  activeStep === i
                                    ? { background: 'hsl(38 42% 46%)', color: 'white' }
                                    : { background: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
                                }
                              >
                                {i + 1}
                              </span>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="px-7 py-8">
                          <AnimatePresence mode="wait">
                            {activeStep === 0 && (
                              <motion.div
                                key="step0"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-0"
                              >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                                  {[
                                    { id: 'name', label: de ? 'Vollständiger Name' : 'Full name', type: 'text', required: true, placeholder: de ? 'Ihr Name' : 'Your name' },
                                    { id: 'email', label: 'E-Mail', type: 'email', required: true, placeholder: de ? 'ihre@email.de' : 'your@email.com' },
                                    { id: 'phone', label: de ? 'Telefon' : 'Phone', type: 'tel', required: false, placeholder: '+49 ...' },
                                    { id: 'company', label: de ? 'Unternehmen' : 'Company', type: 'text', required: false, placeholder: de ? 'Optional' : 'Optional' },
                                  ].map((field) => (
                                    <div
                                      key={field.id}
                                      className="relative py-1"
                                      style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
                                    >
                                      <label
                                        htmlFor={field.id}
                                        className="block text-[10px] font-bold uppercase tracking-[0.18em] pt-4 pb-1 transition-colors"
                                        style={{ color: focusedField === field.id ? 'hsl(38 42% 46%)' : 'hsl(var(--muted-foreground) / 0.6)' }}
                                      >
                                        {field.label}{field.required && <span style={{ color: 'hsl(38 42% 52%)' }}> *</span>}
                                      </label>
                                      <input
                                        id={field.id}
                                        type={field.type}
                                        required={field.required}
                                        placeholder={field.placeholder}
                                        value={(form as Record<string, string | number>)[field.id] as string}
                                        onChange={(e) => setForm({ ...form, [field.id]: e.target.value })}
                                        onFocus={() => setFocusedField(field.id)}
                                        onBlur={() => setFocusedField(null)}
                                        className="w-full pb-3 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/25 text-foreground"
                                      />
                                      <motion.div
                                        className="absolute bottom-0 left-0 h-px"
                                        style={{ background: 'hsl(38 42% 52%)' }}
                                        initial={{ width: 0 }}
                                        animate={{ width: focusedField === field.id ? '100%' : 0 }}
                                        transition={{ duration: 0.25 }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}

                            {activeStep === 1 && (
                              <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-6"
                              >
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">
                                    {de ? 'Reisezeitraum & Gäste' : 'Travel period & guests'}
                                  </p>
                                  <SidebarDatePicker
                                    locale={locale}
                                    maxGuests={4}
                                    checkIn={form.checkIn}
                                    checkOut={form.checkOut}
                                    guests={form.guests}
                                    onCheckIn={(v) => setForm({ ...form, checkIn: v })}
                                    onCheckOut={(v) => setForm({ ...form, checkOut: v })}
                                    onGuests={(v) => setForm({ ...form, guests: v })}
                                  />
                                </div>

                                <div
                                  className="h-px"
                                  style={{ background: 'hsl(var(--border) / 0.4)' }}
                                />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
                                  <LuxurySelect
                                    label={de ? 'Art des Aufenthalts' : 'Type of stay'}
                                    value={form.stayType}
                                    options={stayTypes}
                                    placeholder={de ? 'Wählen' : 'Select'}
                                    onChange={(v) => setForm({ ...form, stayType: v })}
                                  />
                                  <LuxurySelect
                                    label={de ? 'Bevorzugte Residenz' : 'Preferred residence'}
                                    value={form.residence}
                                    options={residenceOptions}
                                    placeholder={de ? 'Wählen' : 'Select'}
                                    onChange={(v) => setForm({ ...form, residence: v })}
                                  />
                                </div>
                              </motion.div>
                            )}

                            {activeStep === 2 && (
                              <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                              >
                                <div
                                  className="relative"
                                  style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
                                >
                                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 pt-4 pb-1">
                                    {de ? 'Ihre Nachricht' : 'Your message'} <span style={{ color: 'hsl(38 42% 52%)' }}>*</span>
                                  </label>
                                  <textarea
                                    required
                                    rows={7}
                                    value={form.message}
                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                    onFocus={() => setFocusedField('message')}
                                    onBlur={() => setFocusedField(null)}
                                    placeholder={de
                                      ? 'Beschreiben Sie Ihr Anliegen, Ihre Wünsche oder besondere Anforderungen...'
                                      : 'Describe your request, wishes, or any special requirements...'}
                                    className="w-full pb-3 bg-transparent text-sm focus:outline-none resize-none placeholder:text-muted-foreground/25 text-foreground"
                                  />
                                  <motion.div
                                    className="absolute bottom-0 left-0 h-px"
                                    style={{ background: 'hsl(38 42% 52%)' }}
                                    initial={{ width: 0 }}
                                    animate={{ width: focusedField === 'message' ? '100%' : 0 }}
                                    transition={{ duration: 0.25 }}
                                  />
                                </div>

                                {form.name && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-6 p-4 rounded-lg"
                                    style={{
                                      background: 'hsl(38 42% 62% / 0.05)',
                                      border: '1px solid hsl(38 42% 62% / 0.12)',
                                    }}
                                  >
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-2.5">
                                      {de ? 'Zusammenfassung' : 'Summary'}
                                    </p>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                                      {form.name && <div className="text-muted-foreground">{form.name}</div>}
                                      {form.email && <div className="text-muted-foreground">{form.email}</div>}
                                      {form.checkIn && form.checkOut && (
                                        <div className="text-muted-foreground col-span-2">
                                          {form.checkIn} → {form.checkOut} · {form.guests} {de ? (form.guests === 1 ? 'Gast' : 'Gäste') : (form.guests === 1 ? 'guest' : 'guests')}
                                        </div>
                                      )}
                                      {form.stayType && <div className="text-muted-foreground col-span-2">{form.stayType}</div>}
                                    </div>
                                  </motion.div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div
                          className="px-7 py-5 flex items-center justify-between"
                          style={{ borderTop: '1px solid hsl(var(--border) / 0.35)' }}
                        >
                          <div className="flex items-center gap-2">
                            {activeStep > 0 && (
                              <button
                                type="button"
                                onClick={() => setActiveStep(s => s - 1)}
                                className="px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border/50 rounded-sm hover:border-border transition-colors"
                              >
                                {de ? 'Zurück' : 'Back'}
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="hidden sm:flex items-center gap-1.5">
                              {steps.map((_, i) => (
                                <div
                                  key={i}
                                  className="rounded-full transition-all duration-300"
                                  style={{
                                    width: activeStep === i ? 16 : 5,
                                    height: 5,
                                    background: activeStep === i
                                      ? 'hsl(38 42% 46%)'
                                      : i < activeStep
                                      ? 'hsl(38 42% 62%)'
                                      : 'hsl(var(--border))',
                                  }}
                                />
                              ))}
                            </div>

                            {activeStep < steps.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => setActiveStep(s => s + 1)}
                                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-sm text-xs font-semibold tracking-wide transition-all hover:opacity-90 active:scale-[0.98]"
                                style={{ background: 'hsl(var(--foreground))', color: 'hsl(var(--primary-foreground))' }}
                              >
                                {de ? 'Weiter' : 'Continue'}
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <div className="flex flex-col items-end gap-2">
                                {sendError && (
                                  <p className="text-[11px] text-red-400">
                                    {de ? 'Fehler beim Senden. Bitte versuchen Sie es erneut.' : 'Failed to send. Please try again.'}
                                  </p>
                                )}
                                <button
                                  type="button"
                                  onClick={handleSubmit}
                                  disabled={!form.name || !form.email || !form.message || sending}
                                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-sm text-xs font-semibold tracking-wide transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={{ background: 'hsl(var(--foreground))', color: 'hsl(var(--primary-foreground))' }}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  {sending ? (de ? 'Senden...' : 'Sending...') : (de ? 'Anfrage senden' : 'Send inquiry')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </FadeUp>

            <FadeUp delay={0.2}>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { num: '5', label: de ? 'Residenzen' : 'Residences' },
                  { num: '9.4', label: de ? 'Bewertung' : 'Rating' },
                  { num: '4', label: de ? 'Sprachen' : 'Languages' },
                ].map((stat) => (
                  <div
                    key={stat.num}
                    className="rounded-lg p-4 text-center"
                    style={{
                      background: 'hsl(var(--secondary) / 0.4)',
                      border: '1px solid hsl(var(--border) / 0.4)',
                    }}
                  >
                    <p className="font-serif text-2xl font-semibold mb-0.5" style={{ color: 'hsl(38 42% 46%)' }}>
                      {stat.num}
                    </p>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>
        </div>
      </div>
    </div>
  );
}
