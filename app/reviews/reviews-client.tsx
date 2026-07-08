'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Star, TrendingUp, Heart, MapPin, Key, ArrowRight, Quote } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { reviews, overallRating, totalReviews, repeatGuestRate } from '@/lib/reviews';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function ReviewsClient() {
  const { locale } = useI18n();
  const shouldReduce = useReducedMotion();

  const highlights = locale === 'de'
    ? [
        { icon: MapPin, label: 'Zentrale Lage', count: '94%', desc: 'der Gäste loben die Lage im Herzen von Bayreuth' },
        { icon: Key, label: 'Reibungsloser Check-in', count: '98%', desc: 'der Gäste bewerten den Self Check-in als unkompliziert' },
        { icon: Heart, label: 'Weiterempfehlung', count: '96%', desc: 'der Gäste würden All in One Residences empfehlen' },
      ]
    : [
        { icon: MapPin, label: 'Central location', count: '94%', desc: 'of guests praise the location in the heart of Bayreuth' },
        { icon: Key, label: 'Smooth check-in', count: '98%', desc: 'of guests rate the self check-in as seamless' },
        { icon: Heart, label: 'Recommendation rate', count: '96%', desc: 'of guests would recommend All in One Residences' },
      ];

  return (
    <div className="py-12 lg:py-24">
      <div className="container-luxury">

        {/* Hero header */}
        <SectionReveal>
          <div className="max-w-2xl mb-16 lg:mb-20">
            <div className="flex items-center gap-3 mb-7">
              <div className="section-header-accent" />
              <span className="text-eyebrow-gold">
                {locale === 'de' ? 'Was unsere Gäste sagen' : 'What our guests say'}
              </span>
            </div>
            <h1
              className="font-serif font-semibold leading-tight tracking-tight mb-6"
              style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4rem)', letterSpacing: '-0.025em' }}
            >
              {locale === 'de' ? (
                <>Echte Stimmen.<br />
                <span style={{ color: 'hsl(var(--champagne-dark))' }}>Echte Gäste.</span></>
              ) : (
                <>Real voices.<br />
                <span style={{ color: 'hsl(var(--champagne-dark))' }}>Real guests.</span></>
              )}
            </h1>
            <p className="text-muted-foreground text-[15px] leading-relaxed max-w-lg">
              {locale === 'de'
                ? 'Ungefilterte Eindrücke von Gästen, die All in One Residences erlebt haben — von Festspielbesuchern, Geschäftsreisenden und Familien aus ganz Europa.'
                : 'Unfiltered impressions from guests who have experienced All in One Residences — from festival visitors, business travelers, and families from across Europe.'}
            </p>
          </div>
        </SectionReveal>

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16 lg:mb-20">
          {[
            {
              icon: Star,
              value: `${overallRating}`,
              suffix: '/10',
              label: locale === 'de' ? `Ø aus ${totalReviews}+ Bewertungen` : `Avg. from ${totalReviews}+ reviews`,
              stars: true,
            },
            {
              icon: TrendingUp,
              value: `${repeatGuestRate}`,
              suffix: '%',
              label: locale === 'de' ? 'Wiederkehrende Gäste' : 'Returning guests',
            },
            {
              icon: Heart,
              value: '96',
              suffix: '%',
              label: locale === 'de' ? 'Würden uns weiterempfehlen' : 'Would recommend us',
            },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="p-8 text-center"
              style={{
                background: 'white',
                border: '1px solid hsl(38 44% 74% / 0.22)',
                borderRadius: 'var(--radius)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
              }}
            >
              {stat.stars && (
                <div className="flex items-center justify-center gap-1 mb-3">
                  {[...Array(5)].map((_, idx) => (
                    <Star key={idx} className="w-3.5 h-3.5 fill-current" style={{ color: 'hsl(38 44% 60%)' }} />
                  ))}
                </div>
              )}
              {!stat.stars && (
                <div
                  className="w-9 h-9 flex items-center justify-center mx-auto mb-4"
                  style={{
                    background: 'hsl(38 44% 74% / 0.1)',
                    border: '1px solid hsl(38 44% 74% / 0.22)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <stat.icon className="w-4 h-4" style={{ color: 'hsl(34 40% 48%)' }} />
                </div>
              )}
              <div className="font-serif leading-none mb-2" style={{ fontSize: '2.8rem' }}>
                <span style={{ color: 'hsl(34 40% 44%)' }}>{stat.value}</span>
                <span className="text-[1.4rem] text-muted-foreground">{stat.suffix}</span>
              </div>
              <p className="text-[12.5px] text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Highlight bars */}
        <SectionReveal>
          <div
            className="mb-16 lg:mb-20 p-8 lg:p-10"
            style={{
              background: 'hsl(36 14% 96% / 0.6)',
              border: '1px solid hsl(34 16% 85% / 0.5)',
              borderRadius: 'var(--radius)',
            }}
          >
            <h2 className="font-serif text-[1.4rem] font-semibold mb-7 tracking-tight">
              {locale === 'de' ? 'Was Gäste besonders schätzen' : 'What guests appreciate most'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {highlights.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: shouldReduce ? 0 : 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-start gap-4"
                >
                  <div
                    className="w-9 h-9 flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      background: 'hsl(38 44% 74% / 0.1)',
                      border: '1px solid hsl(38 44% 74% / 0.22)',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <h.icon className="w-3.5 h-3.5" style={{ color: 'hsl(34 40% 48%)' }} />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span
                        className="font-serif text-[2rem] font-semibold leading-none"
                        style={{ color: 'hsl(34 40% 44%)' }}
                      >
                        {h.count}
                      </span>
                      <span className="font-semibold text-[13px]">{h.label}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{h.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionReveal>

        {/* Review cards */}
        <div className="max-w-4xl mx-auto space-y-5 mb-20 lg:mb-28">
          {reviews.map((review, i) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: shouldReduce ? 0 : 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: Math.min(i * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
              className="transition-all duration-350"
              style={{
                background: 'white',
                border: '1px solid hsl(34 16% 85% / 0.6)',
                borderRadius: 'var(--radius)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.28)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.6)';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              <div className="p-7 lg:p-8">
                <div className="flex items-start justify-between mb-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div
                        className="w-8 h-8 flex items-center justify-center font-serif font-semibold text-sm flex-shrink-0"
                        style={{
                          background: 'hsl(38 44% 74% / 0.1)',
                          border: '1px solid hsl(38 44% 74% / 0.25)',
                          borderRadius: '50%',
                          color: 'hsl(34 40% 44%)',
                        }}
                      >
                        {review.guestName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[13.5px] leading-none mb-0.5">{review.guestName}</h3>
                        <p className="text-[11px] text-muted-foreground">
                          {review.guestLocation[locale]} · {review.date}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, idx) => (
                          <Star
                            key={idx}
                            className={`w-3 h-3 ${idx < review.rating / 2 ? 'fill-current' : 'opacity-20'}`}
                            style={{ color: idx < review.rating / 2 ? 'hsl(38 44% 60%)' : undefined }}
                          />
                        ))}
                      </div>
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color: 'hsl(34 40% 46%)' }}
                      >
                        {review.rating}/10
                      </span>
                    </div>
                  </div>
                  {review.highlight && (
                    <span
                      className="text-[9.5px] font-semibold uppercase tracking-[0.15em] px-3 py-1.5 flex-shrink-0"
                      style={{
                        background: 'hsl(38 44% 74% / 0.1)',
                        border: '1px solid hsl(38 44% 74% / 0.25)',
                        borderRadius: 'var(--radius)',
                        color: 'hsl(34 40% 44%)',
                      }}
                    >
                      {review.highlight[locale]}
                    </span>
                  )}
                </div>

                <div className="relative pl-5">
                  <Quote
                    className="absolute -left-0.5 top-0 w-4 h-4 opacity-25"
                    style={{ color: 'hsl(38 44% 60%)' }}
                  />
                  <p className="text-[13.5px] text-muted-foreground leading-relaxed italic">
                    {review.quote[locale]}
                  </p>
                </div>

                {review.residence && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid hsl(34 16% 85% / 0.35)' }}>
                    <Link
                      href={`/residences/${review.residence.toLowerCase().replace(/\s+/g, '-').replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c] ?? c))}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
                      style={{ color: 'hsl(34 40% 50%)' }}
                    >
                      {locale === 'de' ? 'Residenz' : 'Residence'}: {review.residence}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <SectionReveal>
          <div
            className="relative overflow-hidden p-10 lg:p-16 text-center max-w-2xl mx-auto mb-16"
            style={{
              background: 'linear-gradient(135deg, hsl(218 22% 7%), hsl(218 18% 11%))',
              borderRadius: 'var(--radius)',
              border: '1px solid hsl(38 44% 52% / 0.15)',
            }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-40 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, hsl(38 44% 60% / 0.09), transparent 70%)' }}
            />
            <div className="relative z-10">
              <h2 className="font-serif text-[1.9rem] font-semibold text-white mb-3 tracking-tight">
                {locale === 'de' ? 'Bereit für Ihren Aufenthalt?' : 'Ready for your stay?'}
              </h2>
              <p className="mb-8 max-w-sm mx-auto text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {locale === 'de'
                  ? 'Erleben Sie selbst, warum Gäste immer wieder zurückkehren. Direkt buchen — persönlich, ohne Portal.'
                  : 'Experience for yourself why guests keep coming back. Book direct — personal, no platform.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/residences"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-350"
                  style={{
                    background: 'hsl(36 22% 97%)',
                    color: 'hsl(218 18% 9%)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.28)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                    (e.currentTarget as HTMLElement).style.transform = '';
                  }}
                >
                  {locale === 'de' ? 'Residenzen entdecken' : 'Explore residences'}
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/book-direct"
                  className="group inline-flex items-center justify-center gap-2 px-8 py-4 text-[11px] font-medium transition-all duration-350"
                  style={{
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.7)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.35)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
                  }}
                >
                  {locale === 'de' ? 'Direkt buchen' : 'Book direct'}
                </Link>
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* Related residences quick links */}
        <SectionReveal>
          <div className="pt-12" style={{ borderTop: '1px solid hsl(34 16% 85% / 0.4)' }}>
            <p
              className="text-[9.5px] uppercase tracking-[0.22em] mb-6 text-center font-medium"
              style={{ color: 'hsl(218 8% 52%)' }}
            >
              {locale === 'de' ? 'Unsere Residenzen' : 'Our residences'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { href: '/residences/maison-sternplatz', label: 'Maison Sternplatz', sub: locale === 'de' ? 'Ab €129/Nacht' : 'From €129/night' },
                { href: '/residences/belvedere-penthouse', label: 'Penthouse Belvédère', sub: locale === 'de' ? 'Ab €139/Nacht · Balkon' : 'From €139/night · Balcony' },
                { href: '/residences/atelier-opernstrasse', label: 'Atelier Opernstraße', sub: locale === 'de' ? 'Ab €109/Nacht' : 'From €109/night' },
                { href: '/residences/designloft-innenstadt', label: 'Design Loft Innenstadt', sub: locale === 'de' ? 'Ab €119/Nacht' : 'From €119/night' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group p-4 transition-all duration-300"
                  style={{
                    border: '1px solid hsl(34 16% 85% / 0.5)',
                    borderRadius: 'var(--radius)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(38 44% 74% / 0.32)';
                    (e.currentTarget as HTMLElement).style.background = 'white';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.05)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(34 16% 85% / 0.5)';
                    (e.currentTarget as HTMLElement).style.background = '';
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                  }}
                >
                  <p className="font-medium text-[12.5px] mb-1 transition-colors" style={{ color: 'hsl(218 12% 22%)' }}>
                    {item.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </SectionReveal>

      </div>
    </div>
  );
}
