/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PUBLIC LEGAL SURFACE — what a visitor sees, and what loads before
 * anybody has agreed to anything.
 *
 *   • Impressum: no invented fact, visible gaps, no dead EU-ODR reference
 *   • Datenschutz: names every service the code uses, covers guests whose
 *     data arrived from a booking platform (Art. 14), states the objection
 *     right and the supervisory authority
 *   • No tracking before consent: no analytics or tag script anywhere in the
 *     site; the PayPal SDK only in the payment button; the map iframe only
 *     after the click
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { I18nProvider } from '@/lib/i18n';
import ImpressumClient from '@/app/(site)/impressum/impressum-client';
import DatenschutzClient from '@/app/(site)/datenschutz/datenschutz-client';
import AGBClient from '@/app/(site)/agb/agb-client';
import { LocationCards } from '@/components/contact/location-cards';
import { DATA_SERVICES } from '@/lib/legal/processors';

function render(component: ComponentType): string {
  return renderToStaticMarkup(createElement(I18nProvider, null, createElement(component)));
}

describe('the Impressum', () => {
  const html = render(ImpressumClient);

  it('names the company and shows every unverified fact as a visible gap', () => {
    expect(html).toContain('BoLaGio GmbH');
    expect(html).toContain('data-legal-pending="true"');
    expect((html.match(/data-legal-pending/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('publishes no placeholder that looks like a real fact', () => {
    expect(html).not.toMatch(/Musterstra(ß|ss)e|XXX|HRB 0|DE ?000/);
  });

  it('no longer refers to the EU online dispute resolution platform (closed 20 July 2025)', () => {
    expect(html).not.toMatch(/ec\.europa\.eu\/consumers\/odr|Online-Streitbeilegung|online dispute resolution/i);
  });
});

describe('the privacy notice', () => {
  const html = render(DatenschutzClient);

  it('names every external service the code uses', () => {
    for (const service of DATA_SERVICES) expect(html).toContain(service.name.replace(/&/g, '&amp;'));
  });

  it('covers guests whose data came from a booking platform (Art. 14 GDPR)', () => {
    expect(html).toMatch(/Art\. 14 DSGVO/);
    expect(html).toMatch(/Booking\.com, Airbnb/);
    expect(html).toMatch(/keine Einwilligung in Werbung/);
  });

  it('covers browser storage, the privileges consent and its withdrawal', () => {
    expect(html).toContain('bolagio-locale');
    expect(html).toMatch(/§ 25 Abs\. 2 Nr\. 2 TDDDG/);
    expect(html).toMatch(/Residence Privileges/);
    expect(html).toMatch(/Abmeldelink/);
  });

  it('states the objection right and the supervisory authority', () => {
    expect(html).toMatch(/Widerspruchsrecht \(Art\. 21 DSGVO\)/);
    expect(html).toMatch(/BayLDA/);
  });

  it('shows the facts it does not have as gaps, and says it is a draft', () => {
    expect(html).toContain('data-legal-pending="true"');
    expect(html).toMatch(/Entwurf vom 23\.09\.2026/);
  });
});

describe('the AGB', () => {
  const html = render(AGBClient);

  it('names the contracting company and shows the unapproved cancellation terms as a gap, not as a policy', () => {
    expect(html).toContain('BoLaGio GmbH');
    expect(html).toMatch(/Stornierung/);
    expect(html).toContain('data-legal-pending="true"');
  });
});

/* ── No tracking before consent ─────────────────────────────────────────── */

const ROOT = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === '_archive' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

/** Code only: block comments and whole-line comments removed (strings stay intact). */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

const PUBLIC_SOURCES = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components')), ...sourceFiles(path.join(ROOT, 'lib'))];

describe('no tracking before consent (§ 25 TDDDG)', () => {
  const TRACKERS = /googletagmanager|google-analytics|gtag\(|analytics\.js|plausible\.io|matomo|hotjar|connect\.facebook\.net|fbq\(|clarity\.ms|segment\.(io|com)|mixpanel|posthog|fonts\.googleapis\.com/i;

  it('no source file loads an analytics, tag-manager, pixel or external font script', () => {
    const offenders = PUBLIC_SOURCES.filter((f) => TRACKERS.test(code(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('injects third-party script only in the PayPal button, which mounts only at the payment step', () => {
    const injectors = PUBLIC_SOURCES.filter((f) => /createElement\(\s*['"]script['"]\s*\)|<Script\b|next\/script/.test(code(f)));
    expect(injectors.map((f) => path.relative(ROOT, f))).toEqual([path.join('components', 'booking', 'paypal-button.tsx')]);
  });

  it('renders the contact map without the Google iframe until the visitor clicks', () => {
    const html = render(LocationCards);
    expect(html).not.toMatch(/<iframe/);
    expect(html).not.toMatch(/google\.com\/maps\/embed/);
  });
});

describe('public prices (§ 3 PAngV)', () => {
  it('no apartment can show an "ab" price without the note stating what it includes and what comes on top', async () => {
    const { apartments } = await import('@/lib/content/apartments');
    const bare = apartments.filter((a) => a.priceFromEur !== undefined && !a.priceFromNote);
    expect(bare.map((a) => a.slug)).toEqual([]);
  });

  it('the rating badge attributes reviews to Booking.com and claims no verification of its own', () => {
    const source = code(path.join(ROOT, 'components', 'ui-kit', 'booking-trust.tsx'));
    expect(source).not.toMatch(/verifizierte Bewertungen|verified reviews/);
    expect(source).toMatch(/Bewertungen auf Booking\.com/);
  });
});
