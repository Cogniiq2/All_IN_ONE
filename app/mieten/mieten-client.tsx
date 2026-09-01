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
  apartments,
  commercialUnits,
  countWord,
  countWordInline,
  streetCount,
  supportsLongTerm,
  type RentalUnit,
} from '@/lib/content/apartments';
import { brand, contact } from '@/lib/content/brand';
import { Reveal } from '@/components/ui-kit/reveal';
import { UnitCard, UNIT_GRID } from '@/components/units/unit-card';
import { useUnitFlow } from '@/components/units/unit-flow-context';
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

export function MietenClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const { openDetail } = useUnitFlow();

  /*
    Every unit that may be let on a contract, grouped by what that contract
    would actually be — a Wohnraummietvertrag or a Gewerbemietvertrag. Units in
    preparation stay in their group rather than being exiled to a separate
    block: the card's badge and its detail view already say they are not
    available, and grouping by readiness would scatter the buildings.
  */
  const residential: RentalUnit[] = apartments.filter(supportsLongTerm);
  const commercial: RentalUnit[] = commercialUnits.filter(supportsLongTerm);
  const openRent = (unit: RentalUnit) => openDetail(unit, 'rent');

  // Counted, never stated: the intro sentences below follow the inventory.
  const total = residential.length + commercial.length;
  const buildings = streetCount([...residential, ...commercial]);

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
                ? `${countWord(total, 'de')} Objekte in ${countWordInline(buildings, 'de')} ${buildings === 1 ? 'Haus' : 'Häusern'} in der Bayreuther Innenstadt: ${countWordInline(residential.length, 'de')} ${residential.length === 1 ? 'Wohnung' : 'Wohnungen'} und ${countWordInline(commercial.length, 'de')} ${commercial.length === 1 ? 'Gewerbefläche' : 'Gewerbeflächen'} im Erdgeschoss. Vermietet wird hier über einen regulären Mietvertrag, an Privatpersonen wie an Unternehmen. Das ist ein anderer Weg als eine Buchung: Sie fragen an, wir sprechen miteinander, Sie sehen sich die Räume an.`
                : `${countWord(total, 'en')} properties in ${countWordInline(buildings, 'en')} ${buildings === 1 ? 'building' : 'buildings'} in central Bayreuth: ${countWordInline(residential.length, 'en')} ${residential.length === 1 ? 'apartment' : 'apartments'} and ${countWordInline(commercial.length, 'en')} ground-floor commercial ${commercial.length === 1 ? 'unit' : 'units'}. What is let here is let under a conventional rental agreement, to private tenants and to businesses. This is a different path from a booking: you enquire, we talk, you view the rooms.`}
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
                {de ? 'Langzeitmiete auf Anfrage' : 'Long-term rental on request'}
              </h2>
              <p className="lede mt-5">
                {de
                  ? `Unsere ${countWordInline(residential.length, 'de')} Wohnungen sind Unterkünfte für Aufenthalte auf Zeit — sie stehen nicht als freie Mietwohnungen zur Verfügung. Eine dauerhafte Vermietung über einen Wohnraummietvertrag prüfen wir im Einzelfall auf Anfrage. Ob sie für Ihren Zeitraum möglich ist, sagen wir Ihnen persönlich.`
                  : `Our ${countWordInline(residential.length, 'en')} apartments are accommodation for stays — they are not standing vacant as flats on the rental market. A tenancy under a residential rental agreement is something we consider individually on request. Whether it is possible for your period is something we tell you personally.`}
              </p>
            </Reveal>

            <div className={`mt-12 ${UNIT_GRID}`}>
              {residential.map((unit, i) => (
                <Reveal key={unit.slug} delay={i * 0.08} className="h-full">
                  <UnitCard unit={unit} mode="rent" priority={i === 0} onOpen={openRent} />
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
                  ? 'In beiden Häusern liegt im Erdgeschoss eine Fläche mit Schaufenstern zur Straße. Sie werden ausschließlich über einen Gewerbemietvertrag vermietet und stehen nicht als Unterkunft zur Verfügung. Welche Nutzung jeweils zulässig ist, klären wir vor einem Vertrag gemeinsam.'
                  : 'Both buildings have a ground-floor unit with display windows onto the street. They are let exclusively under a commercial rental agreement and are not available as accommodation. Which use is permissible in each case is established together before any contract.'}
              </p>
            </Reveal>

            <div className={`mt-12 ${UNIT_GRID}`}>
              {commercial.map((unit, i) => (
                <Reveal key={unit.slug} delay={i * 0.08} className="h-full">
                  <UnitCard unit={unit} mode="rent" onOpen={openRent} />
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
                borderRadius: 'var(--radius-lg)',
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
