'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Users, Check, Calendar, Minus, Plus, CircleAlert as AlertCircle, Loader as Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Residence } from '@/lib/residences';

interface BookingModalProps {
  residence: Residence;
  open: boolean;
  onClose: () => void;
}

const MONTHS_DE = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember',
];
const MONTHS_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS_DE = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const DAYS_EN = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function nightsBetween(a: string, b: string) {
  const diff = parseKey(b).getTime() - parseKey(a).getTime();
  return Math.round(diff / 86400000);
}
function formatDisplayDate(k: string, locale: string) {
  const [y, m, d] = k.split('-').map(Number);
  const months = locale === 'de' ? MONTHS_DE : MONTHS_EN;
  return `${d}. ${months[m - 1]} ${y}`;
}

function InlineCalendar({
  checkIn,
  checkOut,
  onSelect,
  locale,
}: {
  checkIn: string;
  checkOut: string;
  onSelect: (date: string) => void;
  locale: string;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const months = locale === 'de' ? MONTHS_DE : MONTHS_EN;
  const days = locale === 'de' ? DAYS_DE : DAYS_EN;

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold">
          {months[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {days.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;

          const key = dateKey(viewYear, viewMonth, day);
          const isPast = key < todayKey;
          const isCheckIn = key === checkIn;
          const isCheckOut = key === checkOut;
          const isInRange =
            checkIn && checkOut && key > checkIn && key < checkOut;
          const isRangeStart = isCheckIn && checkOut;
          const isRangeEnd = isCheckOut && checkIn;
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`
                relative flex items-center justify-center h-9
                ${isInRange ? 'bg-foreground/[0.05]' : ''}
                ${isRangeStart ? 'rounded-l-full' : ''}
                ${isRangeEnd ? 'rounded-r-full' : ''}
              `}
            >
              <button
                disabled={isPast}
                onClick={() => !isPast && onSelect(key)}
                className={`
                  relative w-9 h-9 flex items-center justify-center text-sm rounded-full transition-all duration-150
                  ${isPast ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer hover:bg-secondary'}
                  ${isCheckIn || isCheckOut
                    ? 'text-primary-foreground font-semibold'
                    : isInRange
                    ? 'text-foreground'
                    : isToday
                    ? 'font-semibold'
                    : 'text-foreground/80'}
                `}
                style={
                  isCheckIn || isCheckOut
                    ? { background: 'hsl(38 42% 62%)', color: 'hsl(var(--background))' }
                    : {}
                }
              >
                {day}
                {isToday && !isCheckIn && !isCheckOut && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'hsl(38 42% 62%)' }}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PayPal logo SVG — official brand mark
function PayPalLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M7.077 21.338H4.65a.4.4 0 01-.396-.463L6.34 5.194a.479.479 0 01.473-.407h4.637c2.578 0 4.363.954 5.15 2.762.377.87.49 1.786.332 2.798-.607 3.794-3.02 5.576-6.855 5.576H8.034l-.957 5.415z"
        fill="#009EE3"
      />
      <path
        d="M19.73 8.86c-.03.176-.064.356-.103.54-1.033 5.294-4.57 7.12-9.083 7.12H8.034L6.818 23h3.39a.42.42 0 00.415-.355l.017-.09.828-5.237.053-.29a.42.42 0 01.415-.354h.261c2.99 0 5.333-1.215 6.017-4.728.287-1.47.138-2.697-.484-3.586z"
        fill="#113984"
      />
      <path
        d="M18.975 8.556a6.5 6.5 0 00-.44-.098 7.917 7.917 0 00-1.258-.097h-3.812a.42.42 0 00-.415.354l-.968 6.133-.028.178a.48.48 0 01.473-.407h2.017c3.836 0 6.249-1.782 6.856-5.576.185-.89.144-1.65-.125-2.342-.1.108-.198.2-.3.285z"
        fill="#172C70"
      />
    </svg>
  );
}

function StripeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 468 222.5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#ffffff"
        d="M414 113.4c0-25.6-12.4-45.8-36.1-45.8-23.8 0-38.2 20.2-38.2 45.6 0 30.1 17 45.3 41.4 45.3 11.9 0 20.9-2.7 27.7-6.5v-20c-6.8 3.4-14.6 5.5-24.5 5.5-9.7 0-18.3-3.4-19.4-15.2h48.9c0-1.3.2-6.5.2-8.9zm-49.4-9.5c0-11.3 6.9-16 13.2-16 6.1 0 12.6 4.7 12.6 16h-25.8zM301.1 67.6c-9.8 0-16.1 4.6-19.6 7.8l-1.3-6.2h-22v116.6l25-5.3.1-28.3c3.6 2.6 9 6.3 17.9 6.3 18.1 0 34.6-14.6 34.6-46.6-.1-29.3-16.8-44.3-34.7-44.3zm-6.1 68.2c-5.9 0-9.4-2.1-11.8-4.7l-.1-37.1c2.6-2.9 6.2-4.9 11.9-4.9 9.1 0 15.4 10.2 15.4 23.3 0 13.4-6.2 23.4-15.4 23.4zM223.8 61.7l25.1-5.4V36l-25.1 5.3zM223.8 69.2h25.1v87.5h-25.1zM196.9 76.7l-1.6-7.5h-21.6v87.5h25V97.5c5.9-7.7 15.9-6.3 19-5.2v-23c-3.2-1.2-14.9-3.4-20.8 7.4zM146.9 47.6l-24.4 5.2-.1 80.1c0 14.8 11.1 25.7 25.9 25.7 8.2 0 14.2-1.5 17.5-3.3V135c-3.2 1.3-19 5.9-19-8.9V90.6h19V69.2h-19l.1-21.6zM79.3 94.7c0-3.9 3.2-5.4 8.5-5.4 7.6 0 17.2 2.3 24.8 6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C67.5 67.6 54 78.2 54 95.9c0 27.6 38 23.2 38 35.1 0 4.6-4 6.1-9.6 6.1-8.3 0-18.9-3.4-27.3-8v23.8c9.3 4 18.7 5.7 27.3 5.7 20.8 0 35.1-10.3 35.1-28.2-.1-29.8-38.2-24.5-38.2-35.7z"
      />
    </svg>
  );
}

const PAYPAL_WEBHOOK_URL = 'https://n8n.cogniiq.co/webhook/paypal-all-in-one';
const STRIPE_WEBHOOK_URL = 'https://n8n.cogniiq.co/webhook/create-checkout-all-in-one';

export function BookingModal({ residence, open, onClose }: BookingModalProps) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [paypalError, setPaypalError] = useState('');
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [selectingField, setSelectingField] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [form, setForm] = useState({
    checkIn: '',
    checkOut: '',
    guests: 2,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
  });

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(0);
      setConfirmed(false);
      setPaypalLoading(false);
      setPaypalError('');
      setStripeLoading(false);
      setStripeError('');
      setSelectingField('checkIn');
      setForm({ checkIn: '', checkOut: '', guests: 2, firstName: '', lastName: '', email: '', phone: '', notes: '' });
    }, 300);
  };

  const handleDateSelect = useCallback((key: string) => {
    if (selectingField === 'checkIn') {
      setForm(f => ({ ...f, checkIn: key, checkOut: key > f.checkOut ? '' : f.checkOut }));
      setSelectingField('checkOut');
    } else {
      if (form.checkIn && key <= form.checkIn) {
        setForm(f => ({ ...f, checkIn: key, checkOut: '' }));
        setSelectingField('checkOut');
      } else {
        setForm(f => ({ ...f, checkOut: key }));
        setSelectingField('checkIn');
      }
    }
  }, [selectingField, form.checkIn]);

  const nights = form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0;
  const subtotal = nights * residence.priceFrom;
  const cleaningFee = 60;
  const total = subtotal + cleaningFee;

  const handlePayPal = async () => {
    setPaypalLoading(true);
    setPaypalError('');

    const payload = {
      residence: {
        name: residence.name,
        slug: residence.slug,
        pricePerNight: residence.priceFrom,
        collection: residence.collectionLabel?.[locale] ?? '',
        size: residence.size ?? '',
      },
      booking: {
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        checkInFormatted: formatDisplayDate(form.checkIn, locale),
        checkOutFormatted: formatDisplayDate(form.checkOut, locale),
        nights,
        guests: form.guests,
        subtotal,
        cleaningFee,
        total,
        currency: 'EUR',
      },
      guest: {
        firstName: form.firstName,
        lastName: form.lastName,
        fullName: `${form.firstName} ${form.lastName}`.trim(),
        email: form.email,
        phone: form.phone,
        notes: form.notes,
        locale,
      },
      meta: {
        source: 'website-direct',
        submittedAt: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : '',
      },
    };

    try {
      console.log('[PayPal] Sending payload to n8n webhook:', payload);

      const response = await fetch(PAYPAL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`PayPal order creation failed — status ${response.status}`);
      }

      const data = await response.json();
      console.log('[PayPal] n8n webhook response:', data);

      if (!data?.approve || typeof data.approve !== 'string') {
        console.error('[PayPal] Missing approve URL in response:', data);
        throw new Error('PayPal approval link missing');
      }

      console.log('[PayPal] Redirecting to approve URL:', data.approve);

      sessionStorage.setItem('pendingResidenceBooking', JSON.stringify(payload));
      sessionStorage.setItem('paypalOrderId', data.id ?? '');

      window.location.href = data.approve;
    } catch {
      setPaypalError(
        locale === 'de'
          ? 'Verbindungsfehler. Bitte versuchen Sie es erneut oder schreiben Sie uns per WhatsApp.'
          : 'Connection error. Please try again or contact us via WhatsApp.'
      );
    } finally {
      setPaypalLoading(false);
    }
  };

  const handleStripe = async () => {
    setStripeLoading(true);
    setStripeError('');

    const payload = {
      residence: {
        name: residence.name,
        slug: residence.slug,
        pricePerNight: residence.priceFrom,
        collection: residence.collectionLabel?.[locale] ?? '',
        size: residence.size ?? '',
      },
      booking: {
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        checkInFormatted: formatDisplayDate(form.checkIn, locale),
        checkOutFormatted: formatDisplayDate(form.checkOut, locale),
        nights,
        guests: form.guests,
        subtotal,
        cleaningFee,
        total,
        currency: 'EUR',
      },
      guest: {
        firstName: form.firstName,
        lastName: form.lastName,
        fullName: `${form.firstName} ${form.lastName}`.trim(),
        email: form.email,
        phone: form.phone,
        notes: form.notes,
        locale,
      },
      meta: {
        source: 'website-direct',
        submittedAt: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : '',
      },
    };

    try {
      const response = await fetch(STRIPE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Stripe checkout creation failed — status ${response.status}`);

      const data = await response.json();

      if (!data?.url || typeof data.url !== 'string') {
        throw new Error('Stripe checkout URL missing');
      }

      sessionStorage.setItem('pendingResidenceBooking', JSON.stringify(payload));
      window.location.href = data.url;
    } catch {
      setStripeError(
        locale === 'de'
          ? 'Verbindungsfehler. Bitte versuchen Sie es erneut oder schreiben Sie uns per WhatsApp.'
          : 'Connection error. Please try again or contact us via WhatsApp.'
      );
    } finally {
      setStripeLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-secondary/50 border border-border/60 rounded-sm text-sm focus:outline-none focus:border-champagne/60 focus:bg-secondary transition-all placeholder:text-muted-foreground/40';

  if (!open) return null;

  const steps = [
    { key: 'dates', label: locale === 'de' ? 'Reisedaten' : 'Dates', icon: Calendar },
    { key: 'details', label: locale === 'de' ? 'Angaben' : 'Details', icon: Users },
    { key: 'confirm', label: locale === 'de' ? 'Bestätigung' : 'Confirm', icon: Check },
  ];

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={handleClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="bg-background rounded-lg shadow-[0_32px_80px_rgba(0,0,0,0.22)] w-full max-w-md max-h-[94vh] flex flex-col overflow-hidden"
          style={{ border: '1px solid hsl(38 42% 76% / 0.12)' }}
        >
          <div className="flex items-start justify-between px-6 pt-6 pb-5 border-b border-border/40">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                {residence.collectionLabel[locale]}
              </p>
              <h2 className="font-serif text-xl font-semibold leading-tight">{residence.name}</h2>
              {residence.size && (
                <p className="text-xs text-muted-foreground mt-0.5">{residence.size}</p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!confirmed && (
            <div className="flex items-center gap-0 px-6 py-4 border-b border-border/30">
              {steps.map((s, i) => {
                const Icon = s.icon;
                const isActive = i === step;
                const isDone = i < step;
                return (
                  <div key={s.key} className="flex items-center gap-0 flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                        style={{
                          background: isActive
                            ? 'hsl(38 42% 62%)'
                            : isDone
                            ? 'hsl(38 42% 76% / 0.2)'
                            : 'hsl(var(--secondary))',
                          color: isActive
                            ? 'hsl(var(--background))'
                            : isDone
                            ? 'hsl(38 42% 52%)'
                            : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {isDone ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                      </div>
                      <span
                        className={`text-xs font-medium truncate transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 shrink-0 mx-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="overflow-y-auto flex-1">
            <AnimatePresence mode="wait">
              {confirmed ? (
                <motion.div
                  key="confirmed"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center text-center px-8 py-12"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                    style={{ background: 'hsl(38 42% 76% / 0.15)' }}
                  >
                    <Check className="w-7 h-7" style={{ color: 'hsl(38 42% 52%)' }} />
                  </motion.div>
                  <h3 className="font-serif text-2xl font-semibold mb-2">
                    {locale === 'de' ? 'Anfrage gesendet' : 'Request sent'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
                    {locale === 'de'
                      ? `Vielen Dank, ${form.firstName}. Wir melden uns persönlich innerhalb von 2 Stunden per E-Mail.`
                      : `Thank you, ${form.firstName}. We'll personally confirm your stay by email within 2 hours.`}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mb-8">
                    {form.checkIn && form.checkOut
                      ? `${formatDisplayDate(form.checkIn, locale)} — ${formatDisplayDate(form.checkOut, locale)}`
                      : ''}
                  </p>
                  <button
                    onClick={handleClose}
                    className="px-8 py-3 bg-foreground text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {locale === 'de' ? 'Schließen' : 'Close'}
                  </button>
                </motion.div>
              ) : step === 0 ? (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="px-6 pt-5 pb-6"
                >
                  <div className="flex gap-3 mb-6">
                    <button
                      onClick={() => setSelectingField('checkIn')}
                      className={`flex-1 text-left px-4 py-3 rounded-sm border transition-all duration-200 ${
                        selectingField === 'checkIn'
                          ? 'border-champagne/60 bg-champagne/5'
                          : 'border-border/60 bg-secondary/30 hover:border-border'
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {t('detail.checkIn')}
                      </p>
                      <p className={`text-sm font-medium ${form.checkIn ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                        {form.checkIn ? formatDisplayDate(form.checkIn, locale) : (locale === 'de' ? 'Datum wählen' : 'Select date')}
                      </p>
                    </button>
                    <button
                      onClick={() => setSelectingField('checkOut')}
                      className={`flex-1 text-left px-4 py-3 rounded-sm border transition-all duration-200 ${
                        selectingField === 'checkOut'
                          ? 'border-champagne/60 bg-champagne/5'
                          : 'border-border/60 bg-secondary/30 hover:border-border'
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {t('detail.checkOut')}
                      </p>
                      <p className={`text-sm font-medium ${form.checkOut ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                        {form.checkOut ? formatDisplayDate(form.checkOut, locale) : (locale === 'de' ? 'Datum wählen' : 'Select date')}
                      </p>
                    </button>
                  </div>

                  <InlineCalendar
                    checkIn={form.checkIn}
                    checkOut={form.checkOut}
                    onSelect={handleDateSelect}
                    locale={locale}
                  />

                  {nights > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-5 px-4 py-3 rounded-sm text-sm"
                      style={{ background: 'hsl(38 42% 76% / 0.08)', borderLeft: '2px solid hsl(38 42% 62%)' }}
                    >
                      <span className="font-medium">{nights} {locale === 'de' ? (nights === 1 ? 'Nacht' : 'Nächte') : (nights === 1 ? 'night' : 'nights')}</span>
                      <span className="text-muted-foreground">
                        {' '}&middot; &euro;{residence.priceFrom}/{locale === 'de' ? 'Nacht' : 'night'} &rarr; <strong>&euro;{subtotal}</strong>
                      </span>
                    </motion.div>
                  )}

                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('detail.guests')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setForm(f => ({ ...f, guests: Math.max(1, f.guests - 1) }))}
                        className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 hover:border-border hover:bg-secondary transition-all"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-base font-semibold w-6 text-center">{form.guests}</span>
                      <button
                        onClick={() => setForm(f => ({ ...f, guests: Math.min(residence.guests, f.guests + 1) }))}
                        className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 hover:border-border hover:bg-secondary transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm text-muted-foreground">
                        {locale === 'de' ? `bis ${residence.guests} Gäste` : `max ${residence.guests} guests`}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setStep(1)}
                    disabled={!form.checkIn || !form.checkOut || nights < 1}
                    className="mt-6 w-full py-3.5 bg-foreground text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {t('booking.continue')}
                  </button>
                </motion.div>
              ) : step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="px-6 pt-5 pb-6 space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {t('booking.firstName')}
                      </label>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {t('booking.lastName')}
                      </label>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t('booking.email')}
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t('booking.phone')} <span className="normal-case tracking-normal text-muted-foreground/50">({locale === 'de' ? 'optional' : 'optional'})</span>
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t('booking.notes')} <span className="normal-case tracking-normal text-muted-foreground/50">({locale === 'de' ? 'optional' : 'optional'})</span>
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      placeholder={locale === 'de' ? 'Besondere Wünsche, Anreisezeitpunkt…' : 'Special requests, arrival time…'}
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setStep(0)}
                      className="flex-1 py-3 border border-border/60 rounded-sm text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      {t('booking.back')}
                    </button>
                    <button
                      onClick={() => setStep(2)}
                      disabled={!form.firstName || !form.email}
                      className="flex-1 py-3 bg-foreground text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {t('booking.continue')}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="px-6 pt-5 pb-6"
                >
                  {/* Booking summary */}
                  <div
                    className="rounded-sm p-5 mb-4 space-y-3"
                    style={{ background: 'hsl(var(--secondary) / 0.4)', border: '1px solid hsl(var(--border) / 0.4)' }}
                  >
                    <div className="flex items-start justify-between pb-3 border-b border-border/30">
                      <div>
                        <p className="font-semibold text-sm">{residence.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {form.checkIn && formatDisplayDate(form.checkIn, locale)} &rarr; {form.checkOut && formatDisplayDate(form.checkOut, locale)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {form.guests} {locale === 'de' ? (form.guests === 1 ? 'Gast' : 'Gäste') : (form.guests === 1 ? 'guest' : 'guests')}
                      </p>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {nights} {locale === 'de' ? (nights === 1 ? 'Nacht' : 'Nächte') : (nights === 1 ? 'night' : 'nights')} &times; &euro;{residence.priceFrom}
                      </span>
                      <span>&euro;{subtotal}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('detail.cleaningFee')}</span>
                      <span>&euro;{cleaningFee}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-3 border-t border-border/30">
                      <span>{t('detail.total')}</span>
                      <span style={{ color: 'hsl(38 42% 52%)' }}>&euro;{total}</span>
                    </div>
                  </div>

                  {/* Guest summary */}
                  <div className="mb-5 p-4 rounded-sm bg-secondary/20 border border-border/30">
                    <p className="text-xs font-semibold mb-1">{form.firstName} {form.lastName}</p>
                    <p className="text-xs text-muted-foreground">{form.email}</p>
                    {form.phone && <p className="text-xs text-muted-foreground">{form.phone}</p>}
                    {form.notes && <p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{form.notes}&rdquo;</p>}
                  </div>

                  {/* Divider */}
                  <div className="relative flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-border/40" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 shrink-0">
                      {locale === 'de' ? 'Zahlung' : 'Payment'}
                    </span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>

                  {/* Stripe button — primary */}
                  <motion.button
                    onClick={handleStripe}
                    disabled={stripeLoading || paypalLoading}
                    whileHover={stripeLoading || paypalLoading ? {} : { scale: 1.018, y: -1.5 }}
                    whileTap={stripeLoading || paypalLoading ? {} : { scale: 0.982 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-md font-semibold text-[13px] transition-all duration-200 disabled:cursor-not-allowed mb-1.5 relative overflow-hidden"
                    style={{
                      background: stripeLoading
                        ? '#5851ea'
                        : 'linear-gradient(135deg, #7a73ff 0%, #635BFF 45%, #4f46e5 100%)',
                      color: 'white',
                      boxShadow: stripeLoading
                        ? 'none'
                        : '0 6px 24px rgba(99, 91, 255, 0.45), 0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.15)',
                      border: 'none',
                    }}
                  >
                    {/* Shimmer sweep */}
                    {!stripeLoading && (
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)',
                          backgroundSize: '250% 100%',
                        }}
                        animate={{ backgroundPosition: ['250% 0', '-50% 0'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2.5 }}
                      />
                    )}

                    {stripeLoading ? (
                      <div className="flex items-center justify-center gap-2.5 w-full">
                        <Loader2 className="w-4 h-4 animate-spin opacity-80" />
                        <span className="text-white/90">{locale === 'de' ? 'Verbinde mit Stripe…' : 'Connecting to Stripe…'}</span>
                      </div>
                    ) : (
                      <>
                        {/* Left: logo + label */}
                        <div className="flex items-center gap-3 relative z-10">
                          <div
                            className="flex items-center justify-center rounded-sm shrink-0"
                            style={{
                              background: 'rgba(255,255,255,0.15)',
                              width: 32,
                              height: 28,
                              backdropFilter: 'blur(4px)',
                            }}
                          >
                            <StripeLogo className="w-12 h-auto" />
                          </div>
                          <div className="flex flex-col items-start leading-none">
                            <span className="text-white font-bold text-[13px] tracking-tight">
                              {locale === 'de' ? 'Jetzt sicher bezahlen' : 'Pay securely now'}
                            </span>
                            <span className="text-white/55 text-[10px] font-normal mt-0.5 tracking-wide">
                              {locale === 'de' ? 'Karte · Apple Pay · Google Pay' : 'Card · Apple Pay · Google Pay'}
                            </span>
                          </div>
                        </div>

                        {/* Right: amount + lock */}
                        <div className="flex items-center gap-2 relative z-10 shrink-0">
                          <span className="text-white font-bold text-[15px] tracking-tight">€{total}</span>
                          <div
                            className="flex items-center justify-center rounded-full"
                            style={{
                              background: 'rgba(255,255,255,0.15)',
                              width: 24,
                              height: 24,
                            }}
                          >
                            <svg width="11" height="12" viewBox="0 0 11 12" fill="none" aria-hidden="true">
                              <rect x="1" y="5" width="9" height="7" rx="1.5" fill="white" opacity="0.9"/>
                              <path d="M3 5V3.5C3 2.12 4.12 1 5.5 1C6.88 1 8 2.12 8 3.5V5" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.9"/>
                            </svg>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.button>

                  {/* Stripe trust badge */}
                  {!stripeLoading && (
                    <div className="flex items-center justify-center gap-1.5 mb-4">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1L7.5 4.5H11L8.5 6.8L9.5 10.5L6 8.5L2.5 10.5L3.5 6.8L1 4.5H4.5L6 1Z" fill="#635BFF" opacity="0.5"/>
                      </svg>
                      <p className="text-[10px] text-muted-foreground/45 tracking-wide">
                        {locale === 'de' ? 'Verschlüsselt & gesichert durch Stripe' : 'Encrypted & secured by Stripe'}
                      </p>
                    </div>
                  )}

                  {/* Stripe error */}
                  <AnimatePresence>
                    {stripeError && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="mb-4 flex items-start gap-2.5 p-3.5 rounded-sm"
                        style={{ background: 'hsl(0 72% 50% / 0.06)', border: '1px solid hsl(0 72% 50% / 0.18)' }}
                      >
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'hsl(0 72% 44%)' }} />
                        <p className="text-xs leading-relaxed" style={{ color: 'hsl(0 72% 38%)' }}>{stripeError}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* OR divider */}
                  <div className="relative flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-[10px] font-medium text-muted-foreground/35 shrink-0">
                      {locale === 'de' ? 'oder' : 'or'}
                    </span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>

                  {/* PayPal button */}
                  <motion.button
                    onClick={handlePayPal}
                    disabled={paypalLoading || stripeLoading}
                    whileHover={paypalLoading || stripeLoading ? {} : { scale: 1.015, y: -1 }}
                    whileTap={paypalLoading || stripeLoading ? {} : { scale: 0.985 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="w-full flex items-center justify-center gap-3 py-3.5 rounded-sm font-semibold text-[13px] transition-all duration-200 disabled:cursor-not-allowed mb-3 relative overflow-hidden"
                    style={{
                      background: paypalLoading
                        ? '#f0c040'
                        : 'linear-gradient(135deg, #FFD140 0%, #F5BC00 50%, #FFD140 100%)',
                      color: '#1a3c6e',
                      boxShadow: paypalLoading
                        ? 'none'
                        : '0 4px 18px rgba(245, 188, 0, 0.38), 0 1px 4px rgba(0,0,0,0.08)',
                    }}
                  >
                    {!paypalLoading && (
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 65%)',
                          backgroundSize: '200% 100%',
                        }}
                        animate={{ backgroundPosition: ['200% 0', '-100% 0'] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 1.6 }}
                      />
                    )}
                    {paypalLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{locale === 'de' ? 'Verbinde mit PayPal…' : 'Connecting to PayPal…'}</span>
                      </>
                    ) : (
                      <>
                        <PayPalLogo className="w-5 h-5" />
                        <span>
                          {locale === 'de'
                            ? `Mit PayPal bezahlen — €${total}`
                            : `Pay with PayPal — €${total}`}
                        </span>
                      </>
                    )}
                  </motion.button>

                  {/* PayPal error state */}
                  <AnimatePresence>
                    {paypalError && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="mb-4 flex items-start gap-2.5 p-3.5 rounded-sm"
                        style={{
                          background: 'hsl(0 72% 50% / 0.06)',
                          border: '1px solid hsl(0 72% 50% / 0.18)',
                        }}
                      >
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'hsl(0 72% 44%)' }} />
                        <p className="text-xs leading-relaxed" style={{ color: 'hsl(0 72% 38%)' }}>
                          {paypalError}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Divider */}
                  <div className="relative flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="text-[10px] font-medium text-muted-foreground/40 shrink-0">
                      {locale === 'de' ? 'oder' : 'or'}
                    </span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>

                  {/* Fallback: send request without payment */}
                  <p className="text-[11px] text-muted-foreground/55 text-center mb-3 leading-relaxed">
                    {locale === 'de'
                      ? 'Lieber per Rechnung zahlen? Senden Sie die Anfrage und wir melden uns.'
                      : 'Prefer to pay by invoice? Send the request and we\'ll reach out.'}
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 border border-border/60 rounded-sm text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      {t('booking.back')}
                    </button>
                    <button
                      onClick={() => setConfirmed(true)}
                      disabled={paypalLoading || stripeLoading}
                      className="flex-1 py-3 rounded-sm text-[12px] font-medium transition-all hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed border border-border/50 text-muted-foreground hover:bg-secondary"
                    >
                      {locale === 'de' ? 'Nur anfragen' : 'Request only'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
