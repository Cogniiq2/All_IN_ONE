'use client';

import { Star, Car, Key, Users, Heart, Globe } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';

export function ProofStrip() {
  const { locale } = useI18n();
  const shouldReduce = useReducedMotion();

  const rowA = locale === 'de'
    ? [
        { icon: Star, value: '9.4 / 10', sub: '48+ Gästebewertungen' },
        { icon: Car, value: 'Garage inklusive', sub: 'Jede Residenz' },
        { icon: Heart, value: 'Familiengeführt', sub: 'Persönlicher Service' },
      ]
    : [
        { icon: Star, value: '9.4 / 10', sub: '48+ guest reviews' },
        { icon: Car, value: 'Garage included', sub: 'Every residence' },
        { icon: Heart, value: 'Family-run', sub: 'Personal service' },
      ];

  const rowB = locale === 'de'
    ? [
        { icon: Users, value: 'Bis zu 4 Gäste', sub: 'Pro Apartment' },
        { icon: Key, value: 'Self Check-in', sub: '24 Stunden · 7 Tage' },
        { icon: Globe, value: 'DE · EN · FR · SR', sub: 'Multilinguale Betreuung' },
      ]
    : [
        { icon: Users, value: 'Up to 4 guests', sub: 'Per apartment' },
        { icon: Key, value: 'Self check-in', sub: '24 hours · 7 days' },
        { icon: Globe, value: 'DE · EN · FR · SR', sub: 'Multilingual support' },
      ];

  const doubledA = [...rowA, ...rowA, ...rowA, ...rowA];
  const doubledB = [...rowB, ...rowB, ...rowB, ...rowB];

  return (
    <div
      className="relative overflow-hidden py-8"
      style={{
        borderTop: '1px solid hsl(34 16% 85% / 0.5)',
        borderBottom: '1px solid hsl(34 16% 85% / 0.5)',
        background: 'hsl(36 18% 95% / 0.6)',
        perspective: '800px',
      }}
    >
      {/* Left / right fades */}
      <div
        className="absolute left-0 top-0 bottom-0 w-28 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, hsl(36 18% 95% / 0.98), transparent)' }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-28 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(270deg, hsl(36 18% 95% / 0.98), transparent)' }}
      />

      {/* Row A — forward */}
      <div className="marquee-track mb-5">
        {doubledA.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center gap-9 px-10 flex-shrink-0">
              <div className="flex items-center gap-3 group cursor-default">
                <div
                  className="w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all duration-400 group-hover:scale-110"
                  style={{
                    background: 'linear-gradient(135deg, hsl(38 44% 74% / 0.14), hsl(41 58% 58% / 0.08))',
                    border: '1px solid hsl(38 44% 74% / 0.22)',
                  }}
                >
                  <Icon className="w-3 h-3" style={{ color: 'hsl(34 40% 50%)' }} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold leading-tight text-foreground whitespace-nowrap">{item.value}</p>
                  <p className="text-[9px] mt-0.5 text-muted-foreground leading-tight whitespace-nowrap">{item.sub}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 opacity-20">
                <div className="w-6 h-px" style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--champagne-dark)))' }} />
                <div className="w-1 h-1 rotate-45 flex-shrink-0" style={{ background: 'hsl(var(--champagne-dark))' }} />
                <div className="w-6 h-px" style={{ background: 'linear-gradient(270deg, transparent, hsl(var(--champagne-dark)))' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Row B — reverse */}
      <div className="marquee-track-reverse">
        {doubledB.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center gap-9 px-10 flex-shrink-0">
              <div className="flex items-center gap-3 group cursor-default">
                <div
                  className="w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all duration-400 group-hover:scale-110"
                  style={{
                    background: 'linear-gradient(135deg, hsl(38 44% 74% / 0.10), hsl(41 58% 58% / 0.06))',
                    border: '1px solid hsl(38 44% 74% / 0.18)',
                  }}
                >
                  <Icon className="w-3 h-3" style={{ color: 'hsl(34 40% 52%)' }} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold leading-tight text-foreground whitespace-nowrap">{item.value}</p>
                  <p className="text-[9px] mt-0.5 text-muted-foreground leading-tight whitespace-nowrap">{item.sub}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 opacity-15">
                <div className="w-6 h-px" style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--champagne-dark)))' }} />
                <div className="w-1 h-1 rotate-45 flex-shrink-0" style={{ background: 'hsl(var(--champagne-dark))' }} />
                <div className="w-6 h-px" style={{ background: 'linear-gradient(270deg, transparent, hsl(var(--champagne-dark)))' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
