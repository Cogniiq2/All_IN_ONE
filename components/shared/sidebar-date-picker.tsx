'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

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
function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function nightsBetween(a: string, b: string) {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000);
}
export function formatShort(k: string, locale: string) {
  const [y, m, d] = k.split('-').map(Number);
  const months = locale === 'de' ? MONTHS_DE : MONTHS_EN;
  return `${d}. ${months[m - 1].slice(0, 3)} ${y}`;
}

interface SidebarDatePickerProps {
  locale: string;
  maxGuests: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  onCheckIn: (v: string) => void;
  onCheckOut: (v: string) => void;
  onGuests: (v: number) => void;
}

export function SidebarDatePicker({
  locale,
  maxGuests,
  checkIn,
  checkOut,
  guests,
  onCheckIn,
  onCheckOut,
  onGuests,
}: SidebarDatePickerProps) {
  const today = new Date();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<'in' | 'out'>('in');
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const months = locale === 'de' ? MONTHS_DE : MONTHS_EN;
  const days = locale === 'de' ? DAYS_DE : DAYS_EN;

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const openFor = (field: 'in' | 'out') => {
    setSelecting(field);
    setOpen(true);
  };

  const handleSelect = useCallback((key: string) => {
    if (selecting === 'in') {
      onCheckIn(key);
      if (checkOut && key >= checkOut) onCheckOut('');
      setSelecting('out');
    } else {
      if (checkIn && key <= checkIn) {
        onCheckIn(key);
        onCheckOut('');
        setSelecting('out');
      } else {
        onCheckOut(key);
        setOpen(false);
      }
    }
  }, [selecting, checkIn, checkOut, onCheckIn, onCheckOut]);

  const clearDates = () => {
    onCheckIn('');
    onCheckOut('');
    setSelecting('in');
    setOpen(true);
  };

  const labelIn = locale === 'de' ? 'Anreise' : 'Check-in';
  const labelOut = locale === 'de' ? 'Abreise' : 'Check-out';
  const placeholder = locale === 'de' ? 'Datum wählen' : 'Select date';

  return (
    <div>
      <div
        className="rounded-sm overflow-hidden"
        style={{ border: '1px solid hsl(var(--border) / 0.7)' }}
      >
        <div className="grid grid-cols-2 divide-x divide-border/70">
          <button
            onClick={() => openFor('in')}
            className={`text-left px-3 py-3 transition-colors ${
              open && selecting === 'in'
                ? 'bg-champagne/8'
                : 'hover:bg-secondary/60'
            }`}
            style={open && selecting === 'in' ? { background: 'hsl(38 42% 62% / 0.06)' } : {}}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
              {labelIn}
            </p>
            <p className={`text-xs font-medium leading-none ${checkIn ? 'text-foreground' : 'text-muted-foreground/40'}`}>
              {checkIn ? formatShort(checkIn, locale) : placeholder}
            </p>
          </button>
          <button
            onClick={() => openFor('out')}
            className={`text-left px-3 py-3 transition-colors ${
              open && selecting === 'out' ? '' : 'hover:bg-secondary/60'
            }`}
            style={open && selecting === 'out' ? { background: 'hsl(38 42% 62% / 0.06)' } : {}}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
              {labelOut}
            </p>
            <p className={`text-xs font-medium leading-none ${checkOut ? 'text-foreground' : 'text-muted-foreground/40'}`}>
              {checkOut ? formatShort(checkOut, locale) : placeholder}
            </p>
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              key="cal"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden', borderTop: '1px solid hsl(var(--border) / 0.5)' }}
            >
              <div className="p-3 select-none">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={prevMonth}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-semibold">
                    {months[viewMonth]} {viewYear}
                  </span>
                  <button
                    onClick={nextMonth}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-7 mb-1">
                  {days.map((d) => (
                    <div key={d} className="text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 py-0.5">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} className="h-8" />;

                    const key = toKey(viewYear, viewMonth, day);
                    const isPast = key < todayKey;
                    const isIn = key === checkIn;
                    const isOut = key === checkOut;
                    const inRange = !!(checkIn && checkOut && key > checkIn && key < checkOut);
                    const isToday = key === todayKey;
                    const isStart = isIn && !!checkOut;
                    const isEnd = isOut && !!checkIn;

                    return (
                      <div
                        key={key}
                        className={`
                          relative flex items-center justify-center h-8
                          ${inRange ? '' : ''}
                        `}
                        style={
                          inRange
                            ? { background: 'hsl(38 42% 62% / 0.08)' }
                            : isStart
                            ? { background: 'linear-gradient(to right, transparent 50%, hsl(38 42% 62% / 0.08) 50%)' }
                            : isEnd
                            ? { background: 'linear-gradient(to left, transparent 50%, hsl(38 42% 62% / 0.08) 50%)' }
                            : {}
                        }
                      >
                        <button
                          disabled={isPast}
                          onClick={() => !isPast && handleSelect(key)}
                          className={`
                            relative w-8 h-8 flex items-center justify-center text-xs rounded-full transition-all duration-100
                            ${isPast ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}
                            ${!isPast && !isIn && !isOut ? 'hover:bg-secondary' : ''}
                          `}
                          style={
                            isIn || isOut
                              ? { background: 'hsl(38 42% 52%)', color: 'white' }
                              : {}
                          }
                        >
                          <span
                            className={
                              isIn || isOut
                                ? 'font-semibold'
                                : inRange
                                ? 'text-foreground/90'
                                : isToday
                                ? 'font-semibold'
                                : 'text-foreground/75'
                            }
                          >
                            {day}
                          </span>
                          {isToday && !isIn && !isOut && (
                            <span
                              className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                              style={{ background: 'hsl(38 42% 62%)' }}
                            />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground/60">
                    {selecting === 'in'
                      ? (locale === 'de' ? 'Anreise wählen' : 'Select check-in')
                      : (locale === 'de' ? 'Abreise wählen' : 'Select check-out')}
                  </p>
                  {(checkIn || checkOut) && (
                    <button
                      onClick={clearDates}
                      className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 transition-colors"
                    >
                      {locale === 'de' ? 'Zurücksetzen' : 'Reset'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className="flex items-center justify-between mt-2 px-3 py-3 rounded-sm"
        style={{ border: '1px solid hsl(var(--border) / 0.7)' }}
      >
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
            {locale === 'de' ? 'Gäste' : 'Guests'}
          </p>
          <p className="text-xs font-medium text-foreground">
            {guests} {locale === 'de' ? (guests === 1 ? 'Gast' : 'Gäste') : (guests === 1 ? 'guest' : 'guests')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onGuests(Math.max(1, guests - 1))}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-border/60 hover:border-border hover:bg-secondary transition-all"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-sm font-semibold w-4 text-center">{guests}</span>
          <button
            onClick={() => onGuests(Math.min(maxGuests, guests + 1))}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-border/60 hover:border-border hover:bg-secondary transition-all"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
