'use client';

import Link from 'next/link';
import { ArrowRight, Home, KeyRound, MessageCircle, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { brand } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { PortfolioProcession } from '@/components/about/portfolio-procession';
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

/**
 * Deliberately not a mission statement. Each row is a commitment the rest of
 * the site already keeps, so a reader can check it rather than believe it.
 */
const expectations = [
  {
    de: { title: 'Eine Antwort von einem Menschen', body: 'Anfragen landen bei der Familie, nicht in einem Ticketsystem. Meist antworten wir am selben Tag.' },
    en: { title: 'An answer from a person', body: 'Enquiries reach the family, not a ticket system. We usually reply the same day.' },
  },
  {
    de: { title: 'Preise im Gespräch, nicht im Kleingedruckten', body: 'Wir nennen Preis und Verfügbarkeit, sobald wir Ihren Zeitraum kennen — statt einen Tarif zu veröffentlichen, der für Ihren Aufenthalt gar nicht gilt.' },
    en: { title: 'Prices in conversation, not in small print', body: 'We quote price and availability once we know your dates, rather than publishing a rate that would not apply to your stay.' },
  },
  {
    de: { title: 'Was noch nicht fertig ist, steht auch so da', body: 'Unsere Wohnung in der Opernstraße wird renoviert und ist als „in Vorbereitung" gekennzeichnet. Wir zeigen sie, aber wir vermieten sie nicht, bevor sie fertig ist.' },
    en: { title: 'What is not ready says so', body: 'Our Opernstraße apartment is being renovated and is marked "in preparation". We show it, but we do not let it before it is finished.' },
  },
  {
    de: { title: 'Fotos, die zeigen, was es gibt', body: 'Wo noch keine eigenen Aufnahmen vorliegen, steht „Referenzbild" am Bild. Die Originalfotos folgen, sobald wir sie haben.' },
    en: { title: 'Photographs that show what exists', body: 'Where our own photography does not exist yet, the image is marked "reference image". The originals follow once we have them.' },
  },
];

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
                      borderRadius: 'var(--radius-lg)',
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

      {/* ── What a guest can actually expect ───────────────────────────
          Trust, stated as verifiable specifics rather than adjectives. Each
          line corresponds to something the site genuinely does: the units are
          owned, the reply comes from a person, prices are quoted rather than
          published, and unfinished things are labelled unfinished. */}
      <section className="section-pad-sm border-t border-border/70" aria-labelledby="erwarten">
        <div className="container-luxury">
          <div className="mx-auto max-w-[760px]">
            <Reveal>
              <p className="eyebrow">{de ? 'Was Sie erwarten können' : 'What you can expect'}</p>
              <h2 id="erwarten" className="display-2 mt-4">
                {de ? 'Woran Sie uns messen können' : 'What you can hold us to'}
              </h2>
            </Reveal>

            <dl className="mt-9 flex flex-col">
              {expectations.map((item, i) => {
                const copy = de ? item.de : item.en;
                return (
                  <Reveal key={copy.title} delay={i * 0.06}>
                    <div className="flex flex-col gap-1.5 border-t border-border/70 py-5 sm:flex-row sm:gap-8">
                      <dt className="text-[15px] font-semibold sm:w-[38%] sm:shrink-0">{copy.title}</dt>
                      <dd className="body-copy text-[14.5px]">{copy.body}</dd>
                    </div>
                  </Reveal>
                );
              })}
            </dl>

            {/* Two quiet routes onward, so the page is not a cul-de-sac. */}
            <Reveal delay={0.12}>
              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                <Link href="/apartments" className="link-quiet">
                  {label('exploreApartments', locale)}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <Link href="/bayreuth-2026" className="link-quiet">
                  {de ? 'Bayreuth entdecken' : 'Discover Bayreuth'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* The buildings themselves, after the promises and before the ask. */}
      <PortfolioProcession />

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
