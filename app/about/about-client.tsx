'use client';

import { Home, KeyRound, MessageCircle, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { Monogram } from '@/components/brand/logo';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';

/**
 * About.
 *
 * ── What this page no longer does ────────────────────────────────────────
 * The previous version named five family members — including three children —
 * gave each a job title and a professional biography, and claimed a 9.4/10
 * rating and service in four languages. Names, ages, biographies and
 * photographs are not published here until the family releases them, and the
 * children are not presented as staff.
 *
 * The layout below is final. `teamSlot`, `storySlot` and `secondChapterSlot`
 * are where the real content lands.
 */

const storySlot: { de: string; en: string } | null = null;
// NEEDS CONFIRMATION — how the family came to Bayreuth, why these apartments,
// whether they renovated them themselves.

const teamSlot: { role: { de: string; en: string }; scope: { de: string; en: string } }[] | null = null;
// NEEDS CONFIRMATION — which adults run which part of the operation, and
// whether they may be named. Roles only, no children.

const secondChapterSlot: { de: string; en: string } | null = null;
// NEEDS CONFIRMATION — the family also owns a café in Niš, Serbia. Whether it
// belongs on this website at all is the owners' decision, so nothing about it
// is published yet.

const principles = [
  {
    icon: Home,
    de: {
      title: 'Es sind unsere eigenen Wohnungen',
      body: 'Wir verwalten nichts für Dritte. Die Apartments gehören der Familie — was darin steht, haben wir ausgesucht.',
    },
    en: {
      title: 'They are our own apartments',
      body: 'We manage nothing on behalf of third parties. The apartments belong to the family — what is in them, we chose.',
    },
  },
  {
    icon: MessageCircle,
    de: {
      title: 'Sie sprechen mit uns',
      body: 'Kein Callcenter, kein Ticketsystem. Wer schreibt oder anruft, erreicht jemanden aus der Familie.',
    },
    en: {
      title: 'You speak to us',
      body: 'No call centre, no ticket system. Whoever writes or calls reaches someone in the family.',
    },
  },
  {
    icon: KeyRound,
    de: {
      title: 'Wir bereiten jeden Aufenthalt selbst vor',
      body: 'Die Wohnung wird nicht abgehakt, sondern hergerichtet — von Menschen, die sie kennen.',
    },
    en: {
      title: 'We prepare every stay ourselves',
      body: 'The apartment is not ticked off a list, it is made ready — by people who know it.',
    },
  },
  {
    icon: ShieldCheck,
    de: {
      title: 'Wir sagen, was wir wissen',
      body: 'Angaben, die wir noch nicht geprüft haben, stehen hier nicht. Fragen Sie uns — Sie bekommen eine konkrete Antwort.',
    },
    en: {
      title: 'We say what we know',
      body: 'Details we have not verified do not appear here. Ask us — you will get a specific answer.',
    },
  },
];

export default function AboutClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Über uns' : 'About us'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[16ch]">
              {de ? 'Ein Name aus drei Namen' : 'One name from three names'}
            </h1>
            <p className="lede mt-6">
              {de
                ? `${brand.name} setzt sich aus den Namen unserer drei Kinder zusammen. Mehr verraten wir hier noch nicht — aber der Name ist der Grund, warum dieses Unternehmen so heißt und nicht nach einer Straße oder einer Immobilie.`
                : `${brand.name} is made up of the names of our three children. We are not saying more than that here yet — but the name is the reason this company is called what it is, rather than after a street or a building.`}
            </p>
          </Reveal>
        </div>
      </header>

      <section className="section-pad">
        <div className="container-luxury">
          <div className="mx-auto max-w-[720px] text-center">
            <Reveal>
              <div className="flex justify-center mb-8">
                <Monogram size="xl" />
              </div>
              <p className="text-[17px] leading-relaxed text-muted-foreground">
                {de
                  ? 'Wir sind eine Familie in Bayreuth. Wir besitzen zwei Wohnungen in der Innenstadt, vermieten sie an Gäste und renovieren gerade eine dritte. Das ist der ganze Umfang — und genau deshalb können wir uns um jeden Aufenthalt persönlich kümmern.'
                  : 'We are a family in Bayreuth. We own two apartments in the town centre, let them to guests, and are renovating a third. That is the whole extent of it — and precisely why we can look after every stay personally.'}
              </p>

              {storySlot && (
                <p className="mt-6 text-[17px] leading-relaxed text-muted-foreground">
                  {storySlot[locale]}
                </p>
              )}
            </Reveal>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:gap-8">
            {principles.map((principle, i) => {
              const copy = de ? principle.de : principle.en;
              return (
                <Reveal key={copy.title} delay={i * 0.06}>
                  <div
                    className="h-full p-7"
                    style={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <principle.icon
                      className="w-5 h-5 mb-4"
                      style={{ color: 'hsl(var(--champagne-dark))' }}
                      aria-hidden="true"
                    />
                    <h2 className="text-[16px] font-semibold">{copy.title}</h2>
                    <p className="body-copy mt-2.5 text-[14px]">{copy.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Team roles — rendered only when the family releases them. */}
          {teamSlot && (
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {teamSlot.map((member) => (
                <div key={member.role.de} className="p-6" style={{ border: '1px solid hsl(var(--border))' }}>
                  <p className="text-[15px] font-semibold">{member.role[locale]}</p>
                  <p className="body-copy mt-2 text-[14px]">{member.scope[locale]}</p>
                </div>
              ))}
            </div>
          )}

          {/* A second chapter beyond Bayreuth, if the owners want it public. */}
          {secondChapterSlot && (
            <div className="mt-16 mx-auto max-w-[720px]">
              <p className="body-copy">{secondChapterSlot[locale]}</p>
            </div>
          )}
        </div>
      </section>

      <section className="section-pad-sm" style={{ background: 'hsl(var(--secondary) / 0.5)' }}>
        <div className="container-luxury text-center">
          <Reveal>
            <h2 className="display-2 mx-auto max-w-[20ch]">
              {de ? 'Fragen Sie uns einfach' : 'Just ask us'}
            </h2>
            <p className="lede mx-auto mt-5">
              {de
                ? 'Am schnellsten geht es direkt. Sagen Sie uns Ihren Zeitraum — wir antworten persönlich.'
                : 'Directly is quickest. Tell us your dates — we answer personally.'}
            </p>
            <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
              <EnquiryButton withArrow />
              <CtaLink href="/contact" variant="secondary">
                {label('contactUs', locale)}
              </CtaLink>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
