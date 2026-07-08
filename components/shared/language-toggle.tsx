'use client';

import { useI18n } from '@/lib/i18n';

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === 'de' ? 'en' : 'de')}
      className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium tracking-wide uppercase transition-colors hover:bg-secondary"
      aria-label={locale === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
    >
      <span className={locale === 'de' ? 'text-foreground' : 'text-muted-foreground'}>DE</span>
      <span className="text-champagne">|</span>
      <span className={locale === 'en' ? 'text-foreground' : 'text-muted-foreground'}>EN</span>
    </button>
  );
}
