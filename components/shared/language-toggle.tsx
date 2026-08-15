'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Two languages, because two languages actually work. The previous site
 * advertised German, English, French and Serbian; only German and English
 * were ever implemented.
 */
export function LanguageToggle({ invert = false }: { invert?: boolean }) {
  const { locale, setLocale } = useI18n();

  const activeColor = invert ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))';
  const idleColor = invert ? 'hsl(var(--on-dark) / 0.6)' : 'hsl(var(--muted-foreground))';
  const borderColor = invert ? 'hsl(var(--on-dark) / 0.24)' : 'hsl(var(--border))';

  return (
    <div
      className="inline-flex items-center rounded-sm overflow-hidden"
      style={{ border: `1px solid ${borderColor}` }}
      role="group"
      aria-label={locale === 'de' ? 'Sprache wählen' : 'Choose language'}
    >
      {(['de', 'en'] as const).map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors min-h-[38px]"
            style={{
              color: active ? activeColor : idleColor,
              background: active
                ? invert
                  ? 'hsl(var(--on-dark) / 0.14)'
                  : 'hsl(var(--secondary))'
                : 'transparent',
            }}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
