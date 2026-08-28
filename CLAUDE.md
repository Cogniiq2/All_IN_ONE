# CLAUDE.md — BoLaGio Website

**This repository root is the BoLaGio website.** There is no `bolagio/` subdirectory — the
Next.js App Router application at the root *is* the site (Cloudflare worker `bolagio-preview`).

---

## Project

- **Company:** BoLaGio GmbH
- **Location:** Bayreuth, Bavaria, Germany
- **Business:** premium furnished accommodation and property rental
- **Primary use case:** short-term / daily accommodation
- **Secondary use cases:**
  - business stays
  - extended stays
  - monthly stays
  - selected longer-term residential or commercial rental enquiries

---

## Current website

| Aspect | Detail |
|---|---|
| Framework | Next.js 14.2 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Deployment | Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) |
| Worker name | `bolagio-preview` (`wrangler.jsonc`) |

### Layout of the codebase

```
app/                      App Router routes. Each route: page.tsx (server, metadata)
                          delegating to *-client.tsx (interactive body).
  layout.tsx              Root layout — fonts (next/font), global metadata, JSON-LD
  globals.css             Design tokens (HSL custom properties) + base layer
  sitemap.ts, robots.ts, icon.tsx, apple-icon.tsx, opengraph-image.tsx, not-found.tsx
  _archive/               Private folder — NOT routed, not compiled into the site
components/
  layout/                 navbar, footer, client-layout (I18n + enquiry providers)
  home/                   homepage sections (hero, apartments, bayreuth, family, direct, closing)
  apartments/             apartment-card, gallery
  enquiry/                enquiry dialog, context, button, sticky CTA
  shared/                 json-ld, language-toggle, section-reveal
  ui-kit/                 section / reveal / cta primitives (BoLaGio-specific)
  ui/                     shadcn/ui primitives — generated, edit sparingly
lib/
  content/apartments.ts   Property data — single source of truth
  content/brand.ts        Brand, contact, SITE_URL, ENQUIRY_ENDPOINT, PAYMENT_ENABLED
  content/media.ts        Image registry (paths + alt text). Components never hardcode paths.
  articles.ts             Journal article content
  faq.ts                  FAQ content
  translations.ts         DE/EN strings
  i18n.tsx                I18nProvider + t() (client-side, localStorage-persisted)
public/images/            Local image assets
next.config.js            Redirect map (route migration), images.unoptimized
wrangler.jsonc            Cloudflare Worker config
open-next.config.ts       OpenNext adapter config
netlify.toml              Legacy secondary deploy target
```

### Routes

`/` · `/apartments` · `/apartments/[slug]` · `/about` · `/contact` · `/book-direct` ·
`/bayreuth-2026` · `/faq` · `/journal` · `/journal/[slug]` · `/impressum` · `/datenschutz` · `/agb`

Legal and public routes already exist — preserve them.

### Commands

```bash
npm run dev         # local dev
npm run build       # next build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run cf:build    # opennextjs-cloudflare build
npm run cf:preview  # build + local worker preview
npm run cf:deploy   # build + deploy to Cloudflare
```

Note: `next.config.js` sets `eslint.ignoreDuringBuilds: true`, so a green `build` does **not**
imply lint is clean. Run `typecheck` and `lint` separately.

---

## DO NOT TOUCH

Unless explicitly instructed:

- `archive/admin-app/` — an unrelated archived Vite/React admin application with its own
  `package.json`. It is never built or served by the website.
- `supabase/` — migrations belonging to that archived/admin application, not to the website.

Neither is part of the BoLaGio website build. Do not change them for website work.

---

## Design standard

BoLaGio must feel like a **premium international boutique hospitality / luxury residence brand**.

The visual goal is: luxurious · architectural · editorial · calm · sophisticated · modern ·
premium · high-trust.

**Avoid:** generic SaaS design · cheap gradients · excessive rounded cards · excessive
glassmorphism · visual clutter · gimmicky animations · template-looking layouts · cheesy luxury
wording · unnecessary UI libraries.

**Use:** strong typography · generous whitespace · excellent photography · restrained motion ·
refined transitions · clear hierarchy · strong mobile design.

Luxury should feel **controlled, not flashy**.

In practice: take colours, radii and spacing from the tokens in `app/globals.css` and
`tailwind.config.ts` rather than introducing new ad-hoc values; the small radius and warm
neutral palette are deliberate.

---

## Conversion

Every public-facing change should consider whether it helps users:

- understand the offer faster
- find a suitable apartment
- check or request availability
- trust BoLaGio
- contact BoLaGio
- book directly in the future
- return for future stays

Do not introduce unnecessary friction.

Short-term bookings should eventually be **fast and transactional**. Long-stay, company and
commercial enquiries may use a more detailed **guided enquiry flow**.

---

## Booking / availability architecture

BoLaGio will operate across its own website, **Booking.com** and **Airbnb**. A PMS / channel
manager will later become the central source of truth for availability.

- **Do NOT** build a permanent proprietary booking calendar as the source of truth.
- **Do NOT** directly couple the UI to Booking.com or Airbnb.

Target architecture:

```
UI → availability / booking service abstraction → PMS / channel manager
   → Booking.com + Airbnb + BoLaGio website
```

Until that system is connected:

- do not fabricate availability
- do not show mock availability as real
- use enquiry-based flows where needed
- keep booking-related components reusable for the future integration

Current state: `PAYMENT_ENABLED = false` in `lib/content/brand.ts` and the enquiry flow in
`components/enquiry/` stands in for booking. Respect that guard.

---

## SEO

SEO is a **core product requirement, not an afterthought**. Preserve or improve:

semantic HTML · clean heading hierarchy · metadata · canonical URLs · sitemap · robots ·
internal linking · crawlability · descriptive URLs · structured data · image alt text ·
Local SEO · Bayreuth relevance · apartment-specific landing pages · journal content clusters ·
Core Web Vitals.

Avoid keyword stuffing. Use natural, high-quality copy.

Concretely: new routes need metadata in their `page.tsx`, an entry in `app/sitemap.ts`, and a
redirect in `next.config.js` if they replace an old URL. Structured data goes through
`components/shared/json-ld.tsx`.

---

## GEO / AI search

Structure content so search engines and AI systems can clearly understand:

- what BoLaGio is
- where it operates
- which properties are offered
- what each apartment provides
- who each stay type is for
- booking options
- amenities
- location advantages
- relevant FAQs

---

## Performance

Protect Core Web Vitals.

Avoid unnecessary: JavaScript · dependencies · animation libraries · heavy 3D assets ·
render-blocking resources.

Optimize: images · fonts · lazy loading · bundle size · layout stability · animation performance.

Fonts are self-hosted via `next/font` in `app/layout.tsx` — do **not** reintroduce an external
font `@import` (it leaks visitor IPs pre-consent and blocks first paint).

3D and advanced motion may be used, but only where they materially improve brand experience and
do not harm mobile UX, performance, accessibility or SEO.

---

## Mobile

Treat mobile as a **first-class experience**. Always verify:

navigation · typography · forms · galleries · booking CTAs · touch targets · sticky elements ·
overflow · spacing · performance.

**No horizontal overflow.**

---

## Technical quality

Before changing code:

1. inspect the relevant existing implementation
2. understand current patterns
3. reuse good existing components
4. avoid unnecessary rewrites

Prefer: reusable components · strict TypeScript · centralized data · clean separation of data
and presentation · minimal duplication · predictable architecture.

Do not over-engineer. Do not install new libraries unless clearly justified.

House patterns already in place, to follow rather than reinvent:

- Server `page.tsx` holds metadata; a sibling `*-client.tsx` holds the interactive body.
- All copy is bilingual — `Localized = { de: string; en: string }` for content data,
  `lib/translations.ts` + `t()` for UI strings. Never hardcode user-facing text in a component.
- Image paths live in `lib/content/media.ts`, never inline in components.

---

## Property data

Property and apartment data lives in `lib/content/apartments.ts` and must remain **scalable**.

The architecture should support additional apartments · buildings · properties · cities ·
short-stay units · long-stay units.

Avoid hardcoding logic around only the current two active apartments. Drive behaviour off the
`status` field and other data properties, not off specific slugs.

Fields that have not been verified by the owners are optional and left `undefined`; the UI omits
the section entirely rather than rendering a placeholder. **Do not invent a fact to fill a gap.**
Search for `NEEDS CONFIRMATION` to find what is still outstanding.

---

## Legal / compliance

BoLaGio operates in Germany. When adding functionality that affects forms · personal data ·
analytics · cookies · tracking · payments · booking · cancellations · prices · legal notices ·
third-party embeds, consider German/EU requirements including:

DSGVO / GDPR · TDDDG · DDG · pricing transparency · consumer information requirements ·
privacy notices · consent requirements.

Do not silently assume legal certainty. If a development decision depends on unresolved legal
information, **flag it**.

---

## Workflow

For meaningful changes:

1. inspect relevant files
2. make a concise implementation plan
3. implement
4. preserve existing working behavior
5. verify desktop
6. verify mobile
7. verify SEO impact
8. verify performance impact
9. run available build/type/lint checks (`npm run typecheck`, `npm run lint`, `npm run build`)
10. fix errors caused by your changes

**Never stop after merely writing code.**

At the end of each substantial task, summarize:

- files changed
- behavior changed
- architectural changes
- validation performed
- anything intentionally left untouched
