'use client';

/**
 * The long-term rental area.
 *
 * A second, separate business: properties let under an individual rental
 * agreement, to private tenants or to businesses. Nothing on this page is
 * bookable, priced, or expressed in nights, and the page says plainly — twice,
 * once in the intro and once in the process section — that an enquiry is not a
 * tenancy.
 *
 * Residential and commercial are separated because they are not the same
 * thing legally: a Wohnraummietvertrag and a Gewerbemietvertrag give the two
 * sides different rights, and presenting a shop unit and a flat as one product
 * would blur that.
 *
 * Everything shown is driven by `rentalModes` and `status` in
 * lib/content/apartments.ts. Adding a building or a unit is a data change.
 */

import Link from 'next/link';
import { ArrowRight, Building2, Home, MessageCircle, Phone } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  lettableUnits,
  upcomingLettableUnits,
} from '@/lib/content/apartments';
import { brand, contact } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { RentalUnitCard } from '@/components/rental/rental-unit-card';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { label } from '@/components/ui-kit/cta';

/** How a tenancy actually comes about. Four steps, the last one off-site. */
const steps = [
  {
    de: { title: 'Anfrage', body: 'Sie schreiben uns, woran Sie interessiert sind und wofür Sie die Fläche nutzen möchten.' },
    en: { title: 'Enquiry', body: 'You tell us what you are interested in and what you would use the space for.' },
  },
  {
    de: { title: 'Gespräch', body: 'Wir melden uns persönlich, klären Ihre Fragen und sagen offen, ob das Objekt passt.' },
    en: { title: 'Conversation', body: 'We reply personally, answer your questions and say openly whether the property fits.' },
  },
  {
    de: { title: 'Besichtigung', body: 'Wenn es passt, sehen Sie sich die Räume vor Ort an — mit uns, nicht mit einem Makler.' },
    en: { title: 'Viewing', body: 'If it fits, you see the rooms in person — with us, not with an agent.' },
  },
  {
    de: { title: 'Mietvertrag', body: 'Erst danach besprechen wir Konditionen und Vertrag. Das geschieht persönlich und nicht über diese Website.' },
    en: { title: 'Rental agreement', body: 'Only then do we discuss terms and the contract. That happens in person, not through this website.' },
  },
];

/** One card should not sit in half a two-column grid with a hole beside it. */
function gridFor(count: number): string {
  return count > 1 ? 'grid gap-6 lg:grid-cols-2 lg:gap-8' : 'grid gap-6 max-w-[720px]';
}

export function MietenClient() {
  const { locale } = useI18n();
  const de = locale === 'de';

  const residential = lettableUnits('long-term-residential');
  const commercial = lettableUnits('long-term-commercial');
  const upcoming = upcomingLettableUnits();

  return (
    <>
      <header className="section-pad-sm border-b border-border/70">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow">{de ? 'Mieten' : 'Long-term rental'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h1 className="display-1 max-w-[19ch]">
              {de
                ? 'Wohnraum und Gewerbeflächen in Bayreuth'
                : 'Residential and commercial space in Bayreuth'}
            </h1>
            <p className="lede mt-6">
              {de
                ? `Neben unseren Apartments für Aufenthalte auf Zeit vermieten wir ausgewählte Objekte in der Bayreuther Innenstadt auch dauerhaft — über einen regulären Mietvertrag, an Privatpersonen wie an Unternehmen. Das ist ein anderer Weg als eine Buchung: Sie fragen an, wir sprechen miteinander, Sie sehen sich die Räume an.`
                : `Alongside our apartments for short stays, we also let selected properties in central Bayreuth on a long-term basis — under a conventional rental agreement, to private tenants and to businesses. This is a different path from a booking: you enquire, we talk, you view the rooms.`}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <EnquiryButton kind="long-term" withArrow />
              <Link href="/apartments" className="cta-secondary group">
                {de ? 'Sie suchen eine Unterkunft?' : 'Looking for accommodation?'}
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </header>

      {/* ── Residential ──────────────────────────────────────────────── */}
      {residential.length > 0 && (
        <section className="section-pad" aria-labelledby="wohnraum">
          <div className="container-luxury">
            <Reveal>
              <p className="eyebrow inline-flex items-center gap-2">
                <Home className="w-3.5 h-3.5" aria-hidden="true" />
                {de ? 'Wohnraum' : 'Residential'}
              </p>
              <h2 id="wohnraum" className="display-2 mt-4">
                {de ? 'Wohnungen zur Miete' : 'Apartments to rent'}
              </h2>
              <p className="lede mt-5">
                {de
                  ? 'Unsere Wohnungen in der Schulstraße sind in erster Linie Unterkünfte für Aufenthalte auf Zeit. Für längere Zeiträume ist eine reguläre Vermietung grundsätzlich denkbar — ob und ab wann sie möglich ist, hängt vom Zeitraum ab und wird persönlich besprochen.'
                  : 'Our apartments on Schulstraße are primarily accommodation for short stays. For longer periods a conventional tenancy is possible in principle — whether and from when depends on the period, and is discussed personally.'}
              </p>
            </Reveal>

            <div className={`mt-12 ${gridFor(residential.length)}`}>
              {residential.map((unit, i) => (
                <Reveal key={unit.slug} delay={i * 0.08}>
                  <RentalUnitCard unit={unit} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Commercial ───────────────────────────────────────────────── */}
      {commercial.length > 0 && (
        <section className="section-pad bg-secondary/45" aria-labelledby="gewerbe">
          <div className="container-luxury">
            <Reveal>
              <p className="eyebrow inline-flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                {de ? 'Gewerbe' : 'Commercial'}
              </p>
              <h2 id="gewerbe" className="display-2 mt-4">
                {de ? 'Gewerbeflächen zur Miete' : 'Commercial space to rent'}
              </h2>
              <p className="lede mt-5">
                {de
                  ? 'Im Erdgeschoss unserer Häuser liegen Flächen mit Schaufenstern zur Straße. Sie werden ausschließlich über einen Gewerbemietvertrag vermietet und stehen nicht als Unterkunft zur Verfügung.'
                  : 'The ground floors of our buildings hold units with display windows onto the street. They are let exclusively under a commercial rental agreement and are not available as accommodation.'}
              </p>
            </Reveal>

            <div className={`mt-12 ${gridFor(commercial.length)}`}>
              {commercial.map((unit, i) => (
                <Reveal key={unit.slug} delay={i * 0.08}>
                  <RentalUnitCard unit={unit} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── In preparation ───────────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <section className="section-pad-sm" aria-labelledby="vorbereitung">
          <div className="container-luxury">
            <Reveal>
              <h2 id="vorbereitung" className="display-3 mb-6">
                {de ? 'In Vorbereitung' : 'In preparation'}
              </h2>
              <p className="body-copy mb-8">
                {de
                  ? 'Diese Objekte gehören uns, stehen aber noch nicht zur Vermietung. Wir führen sie hier auf, damit Sie wissen, was kommt — nicht, damit Sie sie schon anfragen.'
                  : 'These properties are ours, but they are not yet available to let. They are listed here so you know what is coming — not so they can be enquired about yet.'}
              </p>
            </Reveal>
            <div className={gridFor(upcoming.length)}>
              {upcoming.map((unit, i) => (
                <Reveal key={unit.slug} delay={i * 0.06}>
                  <RentalUnitCard unit={unit} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="section-pad" style={{ background: 'hsl(var(--ink))' }} aria-labelledby="ablauf">
        <div className="container-luxury">
          <Reveal>
            <p className="eyebrow-on-dark">{de ? 'Ablauf' : 'How it works'}</p>
            <div className="rule-gold mt-4 mb-6" aria-hidden="true" />
            <h2 id="ablauf" className="display-2" style={{ color: 'hsl(var(--on-dark))' }}>
              {de ? 'Vom ersten Kontakt zum Mietvertrag' : 'From first contact to a rental agreement'}
            </h2>
          </Reveal>

          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
            {steps.map((step, i) => {
              const copy = de ? step.de : step.en;
              return (
                <Reveal key={copy.title} as="li" delay={i * 0.07}>
                  <span
                    className="font-serif text-[28px]"
                    style={{ color: 'hsl(var(--on-dark-gold))' }}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3
                    className="display-3 mt-3 text-[19px]"
                    style={{ color: 'hsl(var(--on-dark))' }}
                  >
                    {copy.title}
                  </h3>
                  <p
                    className="mt-3 text-[14px] leading-relaxed"
                    style={{ color: 'hsl(var(--on-dark-muted))' }}
                  >
                    {copy.body}
                  </p>
                </Reveal>
              );
            })}
          </ol>

          <Reveal delay={0.1}>
            <p
              className="mt-12 max-w-[68ch] text-[13px] leading-relaxed"
              style={{ color: 'hsl(var(--on-dark-muted) / 0.85)' }}
            >
              {de
                ? 'Eine Anfrage über diese Website ist unverbindlich. Sie begründet kein Mietverhältnis, ist keine Reservierung und kein Anspruch auf Abschluss eines Mietvertrags. Angaben zu Flächen sind ungefähre Werte; Konditionen nennen wir erst im persönlichen Gespräch, wenn wir wissen, worum es geht.'
                : 'An enquiry through this website is non-binding. It does not create a tenancy, is not a reservation, and gives no entitlement to a rental agreement. Floor areas are approximate; we name terms only in conversation, once we know what is being asked.'}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <section className="section-pad-sm bg-secondary/45">
        <div className="container-luxury">
          <Reveal>
            <div
              className="px-7 py-12 text-center lg:px-16 lg:py-16"
              style={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
            >
              <p className="eyebrow">{de ? 'Nächster Schritt' : 'Next step'}</p>
              <h2 className="display-2 mt-5 mx-auto max-w-[20ch]">
                {de ? 'Sprechen wir darüber' : 'Let us talk it through'}
              </h2>
              <p className="lede mx-auto mt-5">
                {de
                  ? `Sagen Sie uns kurz, was Sie suchen und wofür. ${brand.name} ist ein Familienbetrieb — Sie sprechen mit den Eigentümern, nicht mit einer Verwaltung.`
                  : `Tell us briefly what you are looking for and what for. ${brand.name} is a family business — you speak to the owners, not to a management company.`}
              </p>

              <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
                <EnquiryButton kind="long-term" withArrow />
                <Link href="/contact" className="cta-secondary">
                  {label('contactUs', locale)}
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
                <a href={contact.phoneHref} className="link-quiet">
                  <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                  {contact.phone}
                </a>
                <a
                  href={contact.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-quiet"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  {label('writeWhatsApp', locale)}
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
