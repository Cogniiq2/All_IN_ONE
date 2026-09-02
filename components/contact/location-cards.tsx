'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * WHERE WE ARE — the two BoLaGio buildings, on the Contact page.
 *
 * One card per entry in lib/content/locations.ts. No address, no arrival step
 * and no map URL is written here; the card renders whatever that file holds,
 * and a third building would need no change in this component.
 *
 * ── Map privacy: why nothing loads on its own ────────────────────────────
 * A Google Maps iframe contacts Google the moment the page renders and carries
 * the visitor's IP address and cookies with it. Under the DSGVO and § 25 TDDDG
 * that is a transfer that needs consent BEFORE it happens, and this site has no
 * consent-management platform to obtain it. Three options were open:
 *
 *   1. an unconditional iframe                       — not lawful here;
 *   2. a static map image from a provider            — same transfer, just for
 *                                                      an image;
 *   3. click-to-load ("Zwei-Klick-Lösung")           — chosen.
 *
 * So the preview below is drawn locally, in SVG, from the design tokens. It
 * makes no network request of any kind, to Google or to anyone else. The
 * interactive map is mounted only after the visitor presses "Karte laden",
 * having been told in that same panel who receives the request. Nothing is
 * remembered between visits, because remembering the choice would itself be
 * storage that needs a legal basis; each card is loaded on its own.
 *
 * The two map buttons are ordinary outbound links. They transfer nothing until
 * they are followed, which is the visitor's decision, and `rel="noreferrer"`
 * keeps this page's URL out of the request when they are.
 *
 * No geolocation is requested anywhere, no maps SDK is added, and no analytics
 * or tracking is attached to any of it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { Apple, ExternalLink, MapPin, Navigation } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Reveal } from '@/components/ui-kit/reveal';
import {
  addressLine,
  appleMapsUrl,
  googleMapsEmbedUrl,
  googleMapsUrl,
  LOCATIONS,
  type BuildingLocation,
} from '@/lib/content/locations';

export function LocationCards() {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <section className="mt-14 lg:mt-16" aria-labelledby="locations-heading">
      <Reveal>
        <p className="eyebrow">{de ? 'Standorte' : 'Where we are'}</p>
        <div className="rule-gold mt-4 mb-5" aria-hidden="true" />
        <h2 id="locations-heading" className="display-3">
          {de ? 'Unsere Häuser in Bayreuth' : 'Our buildings in Bayreuth'}
        </h2>
      </Reveal>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
        {LOCATIONS.map((location, i) => (
          <Reveal key={location.id} delay={i * 0.07}>
            <LocationCard location={location} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function LocationCard({ location }: { location: BuildingLocation }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const [mapLoaded, setMapLoaded] = useState(false);
  const address = addressLine(location);

  return (
    <article
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* ── Map panel ──────────────────────────────────────────────────── */}
      <div className="relative aspect-[16/9] w-full">
        {mapLoaded ? (
          <iframe
            title={de ? `Karte: ${address}` : `Map: ${address}`}
            src={googleMapsEmbedUrl(location)}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <MapPreview address={address} onLoad={() => setMapLoaded(true)} />
        )}
      </div>

      {/* ── Address ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-7 lg:p-8">
        <div className="flex items-start gap-3">
          <MapPin
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: 'hsl(var(--champagne-dark))' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {location.name[locale]}
            </h3>
            <address className="mt-1.5 text-[16px] font-semibold not-italic leading-snug">
              {location.street}
              <br />
              {location.postalCode ? `${location.postalCode} ${location.city}` : location.city}
            </address>
            <p className="body-copy mt-2.5 text-[14px]">{location.summary[locale]}</p>
          </div>
        </div>

        {/* ── Map buttons ──────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap gap-2.5">
          <MapLink href={googleMapsUrl(location)} label="Google Maps" icon={Navigation} />
          <MapLink href={appleMapsUrl(location)} label="Apple Maps" icon={Apple} />
        </div>

        {location.arrival && (
          <div className="mt-7 border-t border-border/70 pt-6">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {location.arrival.title[locale]}
            </h4>
            <ol className="mt-4 flex flex-col gap-3.5">
              {location.arrival.steps.map((step, i) => (
                <li key={step.de} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-px flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-semibold tabular-nums"
                    style={{
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid hsl(var(--champagne) / 0.6)',
                      background: 'hsl(var(--champagne) / 0.14)',
                      color: 'hsl(var(--champagne-dark))',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[14px] leading-relaxed text-muted-foreground">
                    {step[locale]}
                  </span>
                </li>
              ))}
            </ol>
            {/*
              Always visible, never collapsed: the signage on site is the
              authority, not this list.
            */}
            <p
              className="mt-5 px-3.5 py-2.5 text-[13px] font-medium leading-relaxed"
              style={{
                borderRadius: 'var(--radius-xs)',
                border: '1px solid hsl(var(--champagne) / 0.5)',
                background: 'hsl(var(--champagne) / 0.1)',
              }}
            >
              {location.arrival.note[locale]}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/** A quiet secondary button. Deliberately not a provider-branded one. */
function MapLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Navigation;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-secondary"
      style={{
        borderRadius: 'var(--radius-sm)',
        border: '1px solid hsl(var(--border))',
        background: 'hsl(var(--secondary) / 0.5)',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
      <span>{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-45" aria-hidden="true" />
    </a>
  );
}

/**
 * The placeholder shown until the visitor asks for a map.
 *
 * Drawn here, in the site's own colours, so it costs one element and no
 * request. It is decorative and marked as such — the address beneath it is the
 * information, this is the frame around it.
 */
function MapPreview({ address, onLoad }: { address: string; onLoad: () => void }) {
  const { locale } = useI18n();
  const de = locale === 'de';

  return (
    <div className="absolute inset-0" style={{ background: 'hsl(var(--secondary))' }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <g stroke="hsl(var(--border))" strokeWidth="1.4" fill="none" opacity="1">
          <path d="M-20 58 L200 12 L360 46" />
          <path d="M-20 132 L120 108 L360 150" />
          <path d="M92 -20 L118 200" />
          <path d="M214 -20 L196 200" />
        </g>
        <g stroke="hsl(var(--border))" strokeWidth="0.6" fill="none" opacity="0.55">
          <path d="M-20 96 L360 84" />
          <path d="M152 -20 L160 200" />
          <path d="M262 -20 L252 200" />
        </g>
        <g fill="hsl(var(--muted) / 0.6)">
          <rect x="24" y="70" width="52" height="24" rx="2" />
          <rect x="132" y="30" width="46" height="20" rx="2" />
          <rect x="228" y="100" width="58" height="26" rx="2" />
        </g>
        <circle cx="160" cy="72" r="30" fill="hsl(var(--champagne) / 0.2)" />
        <circle cx="160" cy="72" r="16" fill="hsl(var(--champagne) / 0.34)" />
        <circle cx="160" cy="72" r="4.5" fill="hsl(var(--champagne-dark))" />
      </svg>

      {/* The notice and the button sit at the foot of the panel so the drawn
          pin above them stays readable. */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 px-5 pb-5 pt-10 text-center"
        style={{
          background:
            'linear-gradient(to top, hsl(var(--secondary)) 45%, hsl(var(--secondary) / 0))',
        }}
      >
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {de
            ? 'Die Karte wird erst auf Ihren Klick geladen. Dabei werden Daten an Google übertragen.'
            : 'The map loads only when you ask for it. Doing so transfers data to Google.'}
        </p>
        <button
          type="button"
          onClick={onLoad}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors"
          style={{
            borderRadius: 'var(--radius-sm)',
            border: '1px solid hsl(var(--champagne) / 0.65)',
            background: 'hsl(var(--card))',
          }}
        >
          <MapPin className="h-3.5 w-3.5" style={{ color: 'hsl(var(--champagne-dark))' }} aria-hidden="true" />
          <span>{de ? 'Karte laden' : 'Load map'}</span>
          <span className="sr-only">{` — ${address}`}</span>
        </button>
      </div>
    </div>
  );
}
