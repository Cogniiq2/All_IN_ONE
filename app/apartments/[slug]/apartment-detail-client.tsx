'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BedDouble,
  ChevronRight,
  Hammer,
  MapPin,
  Maximize,
  MessageCircle,
  Users,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  galleryFor,
  getApartment,
  hasVerifiedDetails,
  STATUS_LABEL,
  supportsLongTerm,
  type Apartment,
} from '@/lib/content/apartments';
import { brand, contact } from '@/lib/content/brand';
import { faqs } from '@/lib/faq';
import { Gallery } from '@/components/apartments/gallery';
import { Reveal } from '@/components/ui-kit/reveal';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { EnquiryButton } from '@/components/enquiry/enquiry-button';
import { StickyEnquiryBar } from '@/components/enquiry/sticky-cta';

/**
 * Apartment detail template.
 *
 * Every factual block below is conditional. When the owners supply verified
 * sizes, sleeping layouts, amenities, floor plans and suitability notes, those
 * sections appear in place — no redesign required. Until then the page is
 * short and honest rather than padded with invented specifications, and the
 * missing detail becomes the reason to talk to us.
 *
 * Apartments with status 'in-preparation' never render a booking or
 * availability CTA.
 */

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <section className="py-9 border-t border-border/70">
        <h2 className="display-3 mb-5">{title}</h2>
        {children}
      </section>
    </Reveal>
  );
}

export function ApartmentDetailClient({ slug }: { slug: string }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const apartment = getApartment(slug) as Apartment;
  const images = galleryFor(slug);
  const upcoming = apartment.status === 'in-preparation';
  const detailed = hasVerifiedDetails(apartment);
  /**
   * Whether this flat may *also* be discussed as a conventional tenancy. Read
   * from `rentalModes`, never from the slug. It is offered as a quiet
   * alternative below the availability card, never as a competing CTA: the
   * primary use of this page is a stay.
   */
  const alsoLongTerm = !upcoming && supportsLongTerm(apartment);

  const quickFacts = [
    apartment.sizeSqm && { icon: Maximize, text: `${apartment.sizeSqm} m²` },
    apartment.maxGuests && {
      icon: Users,
      text: de ? `bis ${apartment.maxGuests} Gäste` : `up to ${apartment.maxGuests} guests`,
    },
    apartment.bedrooms?.length && {
      icon: BedDouble,
      text: de ? `${apartment.bedrooms.length} Schlafzimmer` : `${apartment.bedrooms.length} bedrooms`,
    },
    { icon: MapPin, text: `${apartment.street}, ${brand.city}` },
  ].filter(Boolean) as { icon: typeof Users; text: string }[];

  // A small, relevant FAQ subset — not the whole catalogue.
  const relevantFaqs = faqs.slice(0, 4);

  return (
    <>
      <div className="section-pad-sm">
        <div className="container-luxury">
          {/* Breadcrumb */}
          <nav aria-label={de ? 'Brotkrumen-Navigation' : 'Breadcrumb'} className="mb-8">
            <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors">
                  {de ? 'Start' : 'Home'}
                </Link>
              </li>
              <ChevronRight className="w-3 h-3 opacity-50" aria-hidden="true" />
              <li>
                <Link href="/apartments" className="hover:text-foreground transition-colors">
                  Apartments
                </Link>
              </li>
              <ChevronRight className="w-3 h-3 opacity-50" aria-hidden="true" />
              <li aria-current="page" className="text-foreground">
                {apartment.name[locale]}
              </li>
            </ol>
          </nav>

          <Reveal>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-sm"
                style={{
                  background: upcoming ? 'hsl(var(--ink))' : 'hsl(var(--accent))',
                  color: upcoming ? 'hsl(var(--on-dark))' : 'hsl(var(--foreground))',
                }}
              >
                {upcoming && <Hammer className="w-3.5 h-3.5" aria-hidden="true" />}
                {STATUS_LABEL[apartment.status][locale]}
              </span>
              <span className="text-[13px] font-medium" style={{ color: 'hsl(var(--champagne-dark))' }}>
                {apartment.positioning[locale]}
              </span>
            </div>

            <h1 className="display-1">{apartment.name[locale]}</h1>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-14">
            {/* ── Main column ─────────────────────────────────────── */}
            <div>
              <Reveal>
                <Gallery images={images} />
              </Reveal>

              <Reveal>
                <div className="py-9">
                  <p className="text-[17px] leading-relaxed text-muted-foreground max-w-[62ch]">
                    {apartment.intro[locale]}
                  </p>

                  {quickFacts.length > 0 && (
                    <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
                      {quickFacts.map((fact) => (
                        <li key={fact.text} className="inline-flex items-center gap-2 text-[14px]">
                          <fact.icon
                            className="w-4 h-4 shrink-0"
                            style={{ color: 'hsl(var(--champagne-dark))' }}
                            aria-hidden="true"
                          />
                          {fact.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Reveal>

              {/* Rooms & sleeping — only with confirmed data */}
              {apartment.bedrooms && apartment.bedrooms.length > 0 && (
                <Block title={de ? 'Räume & Schlafplätze' : 'Rooms & sleeping'}>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {apartment.bedrooms.map((room) => (
                      <li
                        key={room.label.de}
                        className="p-4"
                        style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                      >
                        <p className="text-[14px] font-semibold">{room.label[locale]}</p>
                        <p className="text-[13px] text-muted-foreground mt-1">{room.beds[locale]}</p>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {/* Amenities — only with confirmed data */}
              {apartment.amenityGroups && apartment.amenityGroups.length > 0 && (
                <Block title={de ? 'Ausstattung' : 'Amenities'}>
                  <div className="grid gap-8 sm:grid-cols-2">
                    {apartment.amenityGroups.map((group) => (
                      <div key={group.title.de}>
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                          {group.title[locale]}
                        </h3>
                        <ul className="space-y-2">
                          {group.items.map((item) => (
                            <li key={item.de} className="text-[14px] text-muted-foreground">
                              {item[locale]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Block>
              )}

              {/* Floor plan — only when a drawing exists */}
              {apartment.floorPlan && (
                <Block title={de ? 'Grundriss' : 'Floor plan'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={apartment.floorPlan}
                    alt={de ? `Grundriss ${apartment.name.de}` : `Floor plan of ${apartment.name.en}`}
                    className="w-full h-auto"
                    style={{ borderRadius: 'var(--radius)' }}
                  />
                </Block>
              )}

              {/* Suitability — the honest half matters more than the flattering half */}
              {(apartment.goodFit?.length || apartment.notSuitable?.length) && (
                <Block title={de ? 'Passt gut / passt weniger' : 'Good fit / less suitable'}>
                  <div className="grid gap-8 sm:grid-cols-2">
                    {apartment.goodFit && apartment.goodFit.length > 0 && (
                      <div>
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: 'hsl(var(--champagne-dark))' }}>
                          {de ? 'Passt gut für' : 'A good fit for'}
                        </h3>
                        <ul className="space-y-2">
                          {apartment.goodFit.map((item) => (
                            <li key={item.de} className="text-[14px] text-muted-foreground">
                              {item[locale]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {apartment.notSuitable && apartment.notSuitable.length > 0 && (
                      <div>
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                          {de ? 'Weniger geeignet für' : 'Less suitable for'}
                        </h3>
                        <ul className="space-y-2">
                          {apartment.notSuitable.map((item) => (
                            <li key={item.de} className="text-[14px] text-muted-foreground">
                              {item[locale]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Block>
              )}

              {/* Shown while specifications are still being confirmed. This is
                  not a placeholder for a visitor — it is a real offer. */}
              {!detailed && !upcoming && (
                <Block title={de ? 'Details besprechen wir persönlich' : 'We go through the details personally'}>
                  <p className="body-copy">
                    {de
                      ? 'Grundriss, Ausstattung, Schlafplätze und Preis stimmen wir individuell mit Ihnen ab — je nachdem, wann Sie kommen, wie lange Sie bleiben und mit wie vielen Personen Sie anreisen. Schreiben Sie uns Ihren Zeitraum, dann bekommen Sie alles Konkrete von uns.'
                      : 'Layout, furnishings, sleeping arrangements and price are agreed with you individually — depending on when you come, how long you stay and how many of you there are. Send us your dates and you will get everything specific from us.'}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <EnquiryButton apartmentSlug={apartment.slug} withArrow />
                    <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="cta-secondary">
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                      {label('writeWhatsApp', locale)}
                    </a>
                  </div>
                </Block>
              )}

              {/* Location — no distances or times: none are verified */}
              <Block title={de ? 'Lage' : 'Location'}>
                <p className="body-copy">
                  {de
                    ? `Die Wohnung liegt in der ${apartment.street} in der Bayreuther Innenstadt. Bayreuth ist eine Stadt, in der sich das Meiste zu Fuß erledigen lässt — Innenstadt, Gastronomie, Kultur. Die genaue Adresse und alle Anreisedetails erhalten Sie von uns, sobald Ihr Aufenthalt feststeht.`
                    : `The apartment is on ${apartment.street} in central Bayreuth. Bayreuth is a town where most things are done on foot — the centre, the restaurants, the culture. You receive the exact address and all arrival details from us once your stay is confirmed.`}
                </p>
              </Block>

              {/* FAQ */}
              {!upcoming && (
                <Block title={de ? 'Häufige Fragen' : 'Common questions'}>
                  <dl className="space-y-6">
                    {relevantFaqs.map((faq) => (
                      <div key={faq.id}>
                        <dt className="text-[15px] font-semibold">{faq.question[locale]}</dt>
                        <dd className="body-copy mt-2 text-[14px]">{faq.answer[locale]}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-6">
                    <Link href="/faq" className="link-quiet">
                      {de ? 'Alle Fragen' : 'All questions'}
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </Block>
              )}
            </div>

            {/* ── Sidebar ─────────────────────────────────────────── */}
            <aside className="lg:sticky lg:top-[104px] lg:self-start">
              <div
                className="p-6 lg:p-7"
                style={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                }}
              >
                {upcoming ? (
                  <>
                    <h2 className="display-3">{de ? 'Noch nicht buchbar' : 'Not yet bookable'}</h2>
                    <p className="body-copy mt-3 text-[14px]">
                      {de
                        ? 'Dieses Apartment wird gerade renoviert. Wir können es noch nicht vermieten — melden uns aber gern, sobald es so weit ist.'
                        : 'This apartment is being renovated. We cannot let it yet — but we are happy to let you know as soon as it is ready.'}
                    </p>
                    <div className="mt-6 flex flex-col gap-3">
                      <CtaLink href="/contact" full>
                        {label('keepMePosted', locale)}
                      </CtaLink>
                      <CtaLink href="/apartments" variant="secondary" full>
                        {de ? 'Buchbare Apartments' : 'Available apartments'}
                      </CtaLink>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="display-3">{de ? 'Verfügbarkeit anfragen' : 'Request availability'}</h2>
                    <p className="body-copy mt-3 text-[14px]">
                      {de
                        ? 'Sagen Sie uns Ihren Zeitraum. Wir prüfen persönlich und antworten mit Verfügbarkeit und Preis.'
                        : 'Tell us your dates. We check personally and reply with availability and price.'}
                    </p>

                    {/* Price appears only once real rates exist. */}
                    {apartment.priceFromEur && (
                      <p className="mt-5 text-[15px]">
                        <span className="font-semibold">ab €{apartment.priceFromEur}</span>{' '}
                        <span className="text-muted-foreground">/ {de ? 'Nacht' : 'night'}</span>
                      </p>
                    )}

                    <div className="mt-6 flex flex-col gap-3">
                      <EnquiryButton apartmentSlug={apartment.slug} full />
                      <a
                        href={contact.whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cta-secondary w-full"
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden="true" />
                        {label('writeWhatsApp', locale)}
                      </a>
                    </div>

                    <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
                      {de
                        ? 'Anfragen sind unverbindlich. Es wird nichts online abgerechnet — wir bestätigen alles persönlich.'
                        : 'Enquiries are non-binding. Nothing is charged online — we confirm everything personally.'}
                    </p>
                  </>
                )}

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid hsl(var(--border))' }}>
                  <p className="text-[13px] text-muted-foreground">
                    {de ? contact.responseWindow.de : contact.responseWindow.en}
                  </p>
                </div>
              </div>

              {alsoLongTerm && (
                <div
                  className="mt-4 p-6 lg:p-7"
                  style={{
                    background: 'hsl(var(--secondary) / 0.6)',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <p className="eyebrow">{de ? 'Andere Frage' : 'A different question'}</p>
                  <h2 className="display-3 mt-3 text-[19px]">
                    {de ? 'Länger als ein Aufenthalt?' : 'Longer than a stay?'}
                  </h2>
                  <p className="body-copy mt-3 text-[14px]">
                    {de
                      ? 'Diese Wohnung vermieten wir in erster Linie tageweise. Für eine dauerhafte Vermietung über einen Mietvertrag gibt es einen eigenen Weg — keine Buchung, sondern ein Gespräch.'
                      : 'We let this apartment primarily by the day. A conventional tenancy under a rental agreement follows its own path — not a booking, a conversation.'}
                  </p>
                  <div className="mt-5">
                    <Link href="/mieten" className="link-quiet">
                      {de ? 'Mieten statt übernachten' : 'Renting instead of staying'}
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {!upcoming && <StickyEnquiryBar apartmentSlug={apartment.slug} />}
    </>
  );
}
