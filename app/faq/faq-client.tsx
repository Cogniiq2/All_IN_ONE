'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { faqs } from '@/lib/faq';
import { Reveal } from '@/components/ui-kit/reveal';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

export default function FaqClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof faqs>();
    for (const faq of faqs) {
      const key = faq.category[locale];
      map.set(key, [...(map.get(key) ?? []), faq]);
    }
    return Array.from(map.entries());
  }, [locale]);

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Häufige Fragen' : 'Common questions'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[16ch]">
              {de ? 'Was Gäste uns fragen' : 'What guests ask us'}
            </h1>
            <p className="lede mt-6">
              {de
                ? 'Wo wir etwas noch nicht abschließend geprüft haben, sagen wir das — und beantworten es Ihnen persönlich.'
                : 'Where we have not finally verified something, we say so — and answer it personally instead.'}
            </p>
          </Reveal>
        </div>
      </header>

      <section className="section-pad">
        <div className="container-narrow">
          {grouped.map(([category, items], groupIndex) => (
            <div key={category} className={groupIndex > 0 ? 'mt-14' : ''}>
              <Reveal>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-5">
                  {category}
                </h2>
              </Reveal>

              <div style={{ borderTop: '1px solid hsl(var(--border))' }}>
                {items.map((faq) => {
                  const isOpen = openId === faq.id;
                  return (
                    <div key={faq.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                      <h3>
                        <button
                          onClick={() => setOpenId(isOpen ? null : faq.id)}
                          aria-expanded={isOpen}
                          aria-controls={`faq-panel-${faq.id}`}
                          id={`faq-button-${faq.id}`}
                          className="flex w-full items-start justify-between gap-6 py-5 text-left transition-colors hover:text-[hsl(var(--champagne-dark))]"
                        >
                          <span className="text-[16px] font-semibold">{faq.question[locale]}</span>
                          <ChevronDown
                            className={`w-4 h-4 mt-1 shrink-0 transition-transform duration-300 ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      </h3>
                      <div
                        id={`faq-panel-${faq.id}`}
                        role="region"
                        aria-labelledby={`faq-button-${faq.id}`}
                        hidden={!isOpen}
                      >
                        <p className="body-copy pb-6 pr-8 text-[15px]">{faq.answer[locale]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <Reveal>
            <div
              className="mt-14 p-7 text-center lg:p-9"
              style={{
                background: 'hsl(var(--secondary) / 0.6)',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
            >
              <h2 className="display-3">
                {de ? 'Ihre Frage war nicht dabei?' : 'Your question was not here?'}
              </h2>
              <p className="body-copy mx-auto mt-3 text-[14px]">
                {de
                  ? 'Schreiben Sie sie uns einfach mit Ihrer Anfrage — wir beantworten sie persönlich.'
                  : 'Send it along with your enquiry — we will answer it personally.'}
              </p>
              <div className="mt-6 flex justify-center">
                <EnquiryButton withArrow />
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
