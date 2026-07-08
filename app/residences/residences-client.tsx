'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { residences } from '@/lib/residences';
import { ResidenceCard } from '@/components/shared/residence-card';
import { SectionReveal } from '@/components/shared/section-reveal';
import { Users, Car, Landmark } from 'lucide-react';

type CollectionFilter = 'all' | 'sternplatz' | 'innenstadt';

const filterMeta = {
  all: {
    de: { label: 'Alle', sub: 'Fünf Residenzen' },
    en: { label: 'All', sub: 'Five residences' },
  },
  sternplatz: {
    de: { label: 'Sternplatz', sub: '3 Residenzen' },
    en: { label: 'Sternplatz', sub: '3 residences' },
  },
  innenstadt: {
    de: { label: 'Innenstadt', sub: '2 Residenzen' },
    en: { label: 'City Center', sub: '2 residences' },
  },
};

export default function ResidencesClient() {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [balconyOnly, setBalconyOnly] = useState(false);

  const filtered = residences
    .filter((r) => filter === 'all' || r.collection === filter)
    .filter((r) => !balconyOnly || r.hasBalcony);

  const filterKeys: CollectionFilter[] = ['all', 'sternplatz', 'innenstadt'];

  return (
    <div className="py-12 lg:py-20">
      <div className="container-luxury">
        <SectionReveal>
          <div className="relative text-center mb-14">
            {/* Ultra-minimal sketch skyline background */}
            <div
              className="pointer-events-none select-none absolute -inset-x-16 -bottom-8 top-0 flex items-end justify-center overflow-visible"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 1200 220"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full max-w-5xl opacity-[0.12]"
                preserveAspectRatio="xMidYMax meet"
              >
                {/* House 1 — narrow townhouse far left */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="60" y="110" width="58" height="90" />
                  <polyline points="60,110 89,72 118,110" />
                  <line x1="89" y1="72" x2="89" y2="58" />
                  <line x1="84" y1="58" x2="94" y2="58" />
                  <rect x="78" y="148" width="22" height="30" />
                  <rect x="68" y="120" width="14" height="14" />
                  <rect x="96" y="120" width="14" height="14" />
                  <line x1="75" y1="127" x2="75" y2="127" />
                </g>

                {/* House 2 — wider classic building */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="145" y="95" width="90" height="105" />
                  <polyline points="145,95 190,50 235,95" />
                  <line x1="190" y1="50" x2="190" y2="34" />
                  <line x1="184" y1="34" x2="196" y2="34" />
                  <rect x="170" y="148" width="40" height="42" />
                  <rect x="154" y="108" width="18" height="20" />
                  <rect x="203" y="108" width="18" height="20" />
                  <line x1="163" y1="108" x2="163" y2="128" strokeDasharray="2 3" />
                  <line x1="212" y1="108" x2="212" y2="128" strokeDasharray="2 3" />
                  <line x1="154" y1="118" x2="172" y2="118" />
                  <line x1="203" y1="118" x2="221" y2="118" />
                </g>

                {/* House 3 — tall narrow tower */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="262" y="60" width="44" height="140" />
                  <polyline points="262,60 284,22 306,60" />
                  <line x1="284" y1="22" x2="284" y2="8" />
                  <line x1="278" y1="8" x2="290" y2="8" />
                  <rect x="275" y="148" width="18" height="32" />
                  <rect x="265" y="72" width="13" height="16" />
                  <rect x="286" y="72" width="13" height="16" />
                  <rect x="265" y="102" width="13" height="16" />
                  <rect x="286" y="102" width="13" height="16" />
                  <rect x="265" y="130" width="13" height="13" />
                  <rect x="286" y="130" width="13" height="13" />
                </g>

                {/* House 4 — main large residence (center focal) */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="340" y="80" width="130" height="120" />
                  <polyline points="340,80 405,30 470,80" />
                  <line x1="405" y1="30" x2="405" y2="12" />
                  <line x1="397" y1="12" x2="413" y2="12" />
                  <rect x="376" y="155" width="58" height="45" />
                  <rect x="350" y="94" width="22" height="26" />
                  <rect x="388" y="94" width="22" height="26" />
                  <rect x="426" y="94" width="22" height="26" />
                  <rect x="350" y="134" width="22" height="18" />
                  <rect x="426" y="134" width="22" height="18" />
                  <line x1="361" y1="94" x2="361" y2="120" strokeDasharray="2 3" />
                  <line x1="399" y1="94" x2="399" y2="120" strokeDasharray="2 3" />
                  <line x1="437" y1="94" x2="437" y2="120" strokeDasharray="2 3" />
                  <line x1="350" y1="107" x2="372" y2="107" />
                  <line x1="388" y1="107" x2="410" y2="107" />
                  <line x1="426" y1="107" x2="448" y2="107" />
                  {/* ornate pediment details */}
                  <line x1="355" y1="80" x2="355" y2="75" />
                  <line x1="375" y1="80" x2="375" y2="70" />
                  <line x1="395" y1="80" x2="395" y2="66" />
                  <line x1="415" y1="80" x2="415" y2="66" />
                  <line x1="435" y1="80" x2="435" y2="70" />
                  <line x1="455" y1="80" x2="455" y2="75" />
                </g>

                {/* House 5 — medium classical */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="502" y="88" width="78" height="112" />
                  <polyline points="502,88 541,46 580,88" />
                  <line x1="541" y1="46" x2="541" y2="30" />
                  <line x1="535" y1="30" x2="547" y2="30" />
                  <rect x="522" y="155" width="38" height="45" />
                  <rect x="508" y="100" width="17" height="20" />
                  <rect x="557" y="100" width="17" height="20" />
                  <rect x="508" y="133" width="17" height="18" />
                  <rect x="557" y="133" width="17" height="18" />
                  <line x1="516" y1="100" x2="516" y2="120" strokeDasharray="2 3" />
                  <line x1="565" y1="100" x2="565" y2="120" strokeDasharray="2 3" />
                </g>

                {/* House 6 — narrow gabled */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="606" y="102" width="52" height="98" />
                  <polyline points="606,102 632,64 658,102" />
                  <line x1="632" y1="64" x2="632" y2="52" />
                  <line x1="627" y1="52" x2="637" y2="52" />
                  <rect x="621" y="155" width="22" height="38" />
                  <rect x="611" y="114" width="14" height="17" />
                  <rect x="641" y="114" width="14" height="17" />
                  <rect x="611" y="140" width="14" height="13" />
                  <rect x="641" y="140" width="14" height="13" />
                </g>

                {/* House 7 — wide manor far right-center */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="685" y="72" width="110" height="128" />
                  <polyline points="685,72 740,28 795,72" />
                  <line x1="740" y1="28" x2="740" y2="14" />
                  <line x1="733" y1="14" x2="747" y2="14" />
                  <rect x="713" y="158" width="54" height="42" />
                  <rect x="692" y="86" width="20" height="24" />
                  <rect x="760" y="86" width="20" height="24" />
                  <rect x="727" y="86" width="24" height="24" />
                  <rect x="692" y="124" width="20" height="18" />
                  <rect x="760" y="124" width="20" height="18" />
                  <line x1="702" y1="86" x2="702" y2="110" strokeDasharray="2 3" />
                  <line x1="770" y1="86" x2="770" y2="110" strokeDasharray="2 3" />
                  <line x1="739" y1="86" x2="739" y2="110" strokeDasharray="2 3" />
                  <line x1="692" y1="98" x2="712" y2="98" />
                  <line x1="760" y1="98" x2="780" y2="98" />
                  <line x1="727" y1="98" x2="751" y2="98" />
                </g>

                {/* House 8 — slim tower right */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="836" y="78" width="40" height="122" />
                  <polyline points="836,78 856,42 876,78" />
                  <line x1="856" y1="42" x2="856" y2="26" />
                  <line x1="850" y1="26" x2="862" y2="26" />
                  <rect x="847" y="158" width="18" height="42" />
                  <rect x="839" y="90" width="12" height="16" />
                  <rect x="865" y="90" width="12" height="16" />
                  <rect x="839" y="118" width="12" height="14" />
                  <rect x="865" y="118" width="12" height="14" />
                  <rect x="839" y="143" width="12" height="13" />
                  <rect x="865" y="143" width="12" height="13" />
                </g>

                {/* House 9 — classical with steps far right */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="910" y="90" width="86" height="110" />
                  <polyline points="910,90 953,48 996,90" />
                  <line x1="953" y1="48" x2="953" y2="34" />
                  <line x1="947" y1="34" x2="959" y2="34" />
                  <rect x="933" y="158" width="40" height="42" />
                  <rect x="917" y="104" width="18" height="22" />
                  <rect x="971" y="104" width="18" height="22" />
                  <rect x="917" y="140" width="18" height="17" />
                  <rect x="971" y="140" width="18" height="17" />
                  <line x1="926" y1="104" x2="926" y2="126" strokeDasharray="2 3" />
                  <line x1="980" y1="104" x2="980" y2="126" strokeDasharray="2 3" />
                  <line x1="917" y1="115" x2="935" y2="115" />
                  <line x1="971" y1="115" x2="989" y2="115" />
                  {/* steps */}
                  <line x1="928" y1="200" x2="978" y2="200" />
                  <line x1="922" y1="206" x2="984" y2="206" />
                  <line x1="916" y1="212" x2="990" y2="212" />
                </g>

                {/* House 10 — narrow far right */}
                <g stroke="hsl(38 42% 38%)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1030" y="110" width="50" height="90" />
                  <polyline points="1030,110 1055,74 1080,110" />
                  <line x1="1055" y1="74" x2="1055" y2="60" />
                  <line x1="1049" y1="60" x2="1061" y2="60" />
                  <rect x="1044" y="155" width="22" height="34" />
                  <rect x="1034" y="122" width="13" height="16" />
                  <rect x="1063" y="122" width="13" height="16" />
                  <rect x="1034" y="146" width="13" height="13" />
                  <rect x="1063" y="146" width="13" height="13" />
                </g>

                {/* Ground line */}
                <line x1="40" y1="200" x2="1160" y2="200" strokeWidth="0.8" stroke="hsl(38 42% 38%)" strokeDasharray="4 8" />
              </svg>
            </div>
            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-4">
              {locale === 'de' ? 'Bayreuth · Zentrum' : 'Bayreuth · City Center'}
            </span>
            <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-4">
              {t('residencesPage.title')}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {t('residencesPage.subtitle')}
            </p>
          </div>
        </SectionReveal>

        <SectionReveal>
          <FilterBar
            filter={filter}
            setFilter={setFilter}
            balconyOnly={balconyOnly}
            setBalconyOnly={setBalconyOnly}
            locale={locale}
          />
        </SectionReveal>

        <SectionReveal>
          <div className="flex items-center justify-center gap-6 mb-12">
            <div className="h-px flex-1 bg-border/30 max-w-[80px]" />
            <div className="flex items-center gap-6 text-xs text-muted-foreground/60">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {t('residencesPage.sleepsFour')}
              </span>
              <span className="w-px h-3 bg-border/40" />
              <span className="flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" />
                {t('residencesPage.garageIncluded')}
              </span>
            </div>
            <div className="h-px flex-1 bg-border/30 max-w-[80px]" />
          </div>
        </SectionReveal>

        <AnimatePresence mode="sync">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-center py-20 text-muted-foreground"
            >
              <p className="font-serif text-lg">
                {locale === 'de' ? 'Keine Residenzen entsprechen Ihren Filtern.' : 'No residences match your filters.'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={`${filter}-${balconyOnly}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filtered.map((r) => (
                <ResidenceCard key={r.slug} residence={r} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterBar({
  filter,
  setFilter,
  balconyOnly,
  setBalconyOnly,
  locale,
}: {
  filter: CollectionFilter;
  setFilter: (f: CollectionFilter) => void;
  balconyOnly: boolean;
  setBalconyOnly: (v: boolean) => void;
  locale: string;
}) {
  const de = locale === 'de';
  const filterKeys: CollectionFilter[] = ['all', 'sternplatz', 'innenstadt'];
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="flex flex-col items-center gap-5 mb-10">

      {/* COLLECTION SELECTOR */}
      <div className="relative">
        {/* top micro-line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: 'left', height: 1, background: 'linear-gradient(90deg, transparent, hsl(38 42% 52% / 0.35), transparent)', marginBottom: 0 }}
        />

        <div className="flex items-stretch">
          {filterKeys.map((key, i) => {
            const meta = filterMeta[key][locale as 'de' | 'en'];
            const isActive = filter === key;
            const isLast = i === filterKeys.length - 1;

            return (
              <div key={key} className="flex items-stretch">
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.55, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => setFilter(key)}
                  className="relative group flex flex-col items-center justify-center px-10 lg:px-14 py-5 focus:outline-none"
                  style={{ minWidth: 140 }}
                >
                  {/* active bottom indicator line */}
                  <motion.div
                    layoutId="filter-line"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '20%',
                      right: '20%',
                      height: 1,
                      background: 'hsl(38 42% 52%)',
                      opacity: isActive ? 1 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />

                  {/* hover glow */}
                  <div
                    className="absolute inset-0 transition-opacity duration-300"
                    style={{
                      background: 'radial-gradient(ellipse 70% 60% at 50% 100%, hsl(38 42% 52% / 0.06) 0%, transparent 70%)',
                      opacity: isActive ? 1 : 0,
                      pointerEvents: 'none',
                    }}
                  />

                  {/* index number */}
                  <motion.span
                    animate={{ opacity: isActive ? 0 : 0.25, y: isActive ? -3 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="absolute top-3 right-4 font-mono text-[9px] tracking-widest"
                    style={{ color: 'hsl(38 42% 52%)' }}
                  >
                    0{i + 1}
                  </motion.span>

                  <motion.span
                    animate={{
                      color: isActive ? '#1c1f24' : '#6b7280',
                      letterSpacing: isActive ? '0.22em' : '0.16em',
                    }}
                    transition={{ duration: 0.3 }}
                    className="text-[10px] font-bold uppercase block"
                  >
                    {meta.label}
                  </motion.span>

                  <motion.span
                    animate={{
                      opacity: isActive ? 0.5 : 0.28,
                      color: isActive ? 'hsl(38 42% 52%)' : '#6b7280',
                    }}
                    transition={{ duration: 0.3 }}
                    className="text-[8px] uppercase tracking-[0.14em] mt-1 font-medium"
                  >
                    {meta.sub}
                  </motion.span>
                </motion.button>

                {/* vertical divider between items */}
                {!isLast && (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={inView ? { scaleY: 1 } : {}}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
                    style={{ width: 1, alignSelf: 'stretch', background: 'hsl(var(--border) / 0.35)', transformOrigin: 'top', margin: '12px 0' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* bottom micro-line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: 'right', height: 1, background: 'linear-gradient(90deg, transparent, hsl(38 42% 52% / 0.35), transparent)', marginTop: 0 }}
        />
      </div>

      {/* BALCONY TOGGLE — minimal pill */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.4 }}
        onClick={() => setBalconyOnly(!balconyOnly)}
        className="relative group flex items-center gap-3 focus:outline-none"
        style={{ padding: '8px 20px' }}
      >
        {/* left ornament line */}
        <motion.div
          animate={{ width: balconyOnly ? 20 : 10, opacity: balconyOnly ? 1 : 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ height: 1, background: 'hsl(38 42% 52%)', flexShrink: 0 }}
        />

        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ scale: balconyOnly ? 1 : 0.85, opacity: balconyOnly ? 1 : 0.4 }}
            transition={{ duration: 0.25 }}
          >
            <Landmark className="w-3 h-3" style={{ color: 'hsl(38 42% 52%)' }} />
          </motion.div>

          <motion.span
            animate={{
              color: balconyOnly ? '#1c1f24' : '#6b7280',
              letterSpacing: balconyOnly ? '0.2em' : '0.15em',
            }}
            transition={{ duration: 0.25 }}
            className="text-[9px] font-bold uppercase"
          >
            {de ? 'Nur mit Panorama-Balkon' : 'Panoramic balcony only'}
          </motion.span>

          {/* active dot */}
          <AnimatePresence>
            {balconyOnly && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.2, type: 'spring', stiffness: 400 }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'hsl(38 42% 52%)' }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* right ornament line */}
        <motion.div
          animate={{ width: balconyOnly ? 20 : 10, opacity: balconyOnly ? 1 : 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ height: 1, background: 'hsl(38 42% 52%)', flexShrink: 0 }}
        />
      </motion.button>

    </div>
  );
}
