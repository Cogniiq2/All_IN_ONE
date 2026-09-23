'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Locale = 'de' | 'en';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

import { translations } from '@/lib/translations';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('de');

  useEffect(() => {
    // Storage can be unavailable (private mode, blocked site data) and then
    // throws; the language falls back to German rather than breaking the page.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('bolagio-locale');
    } catch {
      saved = null;
    }
    if (saved === 'de' || saved === 'en') {
      setLocaleState(saved);
      // The document language must follow the text on screen (WCAG 3.1.1),
      // including a preference restored on load — not only a fresh toggle.
      document.documentElement.lang = saved;
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('bolagio-locale', newLocale);
    } catch {
      // Not remembered across visits; the switch itself still works.
    }
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let value: Record<string, unknown> | string = translations[locale] as Record<string, unknown>;
      for (const k of keys) {
        if (typeof value === 'object' && value !== null && k in value) {
          value = value[k] as Record<string, unknown> | string;
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
