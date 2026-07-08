'use client';

import { useState } from 'react';
import { IceCreamBowl as IceCream, Mail, Users, Instagram, Check, Leaf, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SectionReveal } from '@/components/shared/section-reveal';

export default function GelateriaMichelePage() {
  const { locale } = useI18n();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
    setEmail('');
  };

  const qualities = locale === 'de'
    ? [
        { icon: IceCream, label: 'Handgemachtes Gelato', desc: 'Täglich frisch nach authentischen italienischen Rezepturen zubereitet.' },
        { icon: Leaf, label: 'Saisonale Zutaten', desc: 'Ausgewählte, saisonale und wenn möglich lokale Rohstoffe — keine Kompromisse.' },
        { icon: Sparkles, label: 'Ein Ort der Begegnung', desc: 'Mehr als ein Eisladen — ein Ort für Genuss, Gespräche und echte Qualität.' },
      ]
    : [
        { icon: IceCream, label: 'Handmade gelato', desc: 'Made fresh daily using authentic Italian recipes.' },
        { icon: Leaf, label: 'Seasonal ingredients', desc: 'Selected, seasonal and where possible local ingredients — no compromises.' },
        { icon: Sparkles, label: 'A place of connection', desc: 'More than an ice cream shop — a place for indulgence, conversation, and real quality.' },
      ];

  return (
    <div className="py-16 lg:py-24">
      <div className="container-luxury">
        <div className="max-w-2xl mx-auto">
          <SectionReveal>
            <div className="text-center mb-12">
              <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.25em] text-champagne mb-5">
                {locale === 'de' ? 'Demnächst in Bayreuth' : 'Coming soon to Bayreuth'}
              </span>

              <div className="w-16 h-16 rounded-full bg-champagne/10 border border-champagne/20 flex items-center justify-center mx-auto mb-6">
                <IceCream className="w-7 h-7 text-champagne" />
              </div>

              <h1 className="font-serif text-4xl lg:text-5xl font-semibold mb-4">
                Gelateria Michele
              </h1>

              <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto">
                {locale === 'de'
                  ? 'Handgemachtes Gelato nach italienischer Tradition — sorgfältig zubereitet, saisonal und mit Liebe zum Detail. Bald in Bayreuth.'
                  : 'Handmade gelato in the Italian tradition — carefully crafted, seasonal, and made with love for detail. Coming soon to Bayreuth.'}
              </p>
            </div>
          </SectionReveal>

          <SectionReveal delay={0.1}>
            <div className="grid grid-cols-1 gap-4 mb-12">
              {qualities.map((q, i) => (
                <div key={i} className="flex items-start gap-4 p-5 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="w-10 h-10 rounded-full bg-champagne/10 flex items-center justify-center flex-shrink-0">
                    <q.icon className="w-5 h-5 text-champagne" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{q.label}</h3>
                    <p className="text-sm text-muted-foreground">{q.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionReveal>

          <SectionReveal delay={0.15}>
            <div className="bg-card rounded-lg border border-border/60 p-7 mb-10">
              <h2 className="font-serif text-xl font-semibold mb-2">
                {locale === 'de' ? 'Benachrichtigt werden' : 'Get notified'}
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                {locale === 'de'
                  ? 'Tragen Sie sich ein und erfahren Sie als Erste(r), wann wir öffnen.'
                  : 'Sign up and be among the first to know when we open.'}
              </p>

              {subscribed ? (
                <div className="flex items-center gap-3 p-4 bg-secondary/40 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-champagne/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-champagne" />
                  </div>
                  <p className="text-sm">
                    {locale === 'de' ? 'Vielen Dank — wir melden uns!' : 'Thank you — we will be in touch!'}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex gap-3">
                  <input
                    type="email"
                    required
                    placeholder={locale === 'de' ? 'Ihre E-Mail-Adresse' : 'Your email address'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-champagne"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-foreground text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    {locale === 'de' ? 'Benachrichtigen' : 'Notify me'}
                  </button>
                </form>
              )}
            </div>
          </SectionReveal>

          <SectionReveal delay={0.2}>
            <div className="divider-champagne mb-8" />
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer">
                <Users className="w-4 h-4 text-champagne" />
                <span>
                  {locale === 'de' ? 'Wir suchen Verstärkung — Interesse?' : 'We are hiring — interested?'}
                </span>
              </div>
              <div className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer">
                <Instagram className="w-4 h-4 text-champagne" />
                <span>
                  {locale === 'de' ? 'Folgen Sie uns auf Instagram' : 'Follow us on Instagram'}
                </span>
              </div>
            </div>
          </SectionReveal>
        </div>
      </div>
    </div>
  );
}
