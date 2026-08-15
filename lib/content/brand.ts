/**
 * BoLaGio — central brand, contact and legal constants.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CONTENT TOKENS
 *
 * Every value tagged `NEEDS CONFIRMATION` is provisional and must be replaced
 * with verified information from the owners before this site goes to
 * production. Nothing outside this file should hardcode a brand fact.
 *
 * Values that are still unknown are exported as `null`. Components must treat
 * `null` as "do not render this at all" — never as "render an empty slot" and
 * never as an invitation to invent a value.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const brand = {
  /** Legal + display name. Capitalisation is deliberate: Bo · La · Gio. */
  name: 'BoLaGio',
  /** The three letters of the monogram. Their meaning is intentionally not
   *  stated anywhere in the UI until the owners supply the real story. */
  monogram: ['B', 'L', 'G'] as const,
  city: 'Bayreuth',
  region: 'Oberfranken, Bayern',
  country: 'Deutschland',
} as const;

/**
 * NEEDS CONFIRMATION — the production domain is not yet decided.
 * Used for canonical URLs, sitemap and Open Graph. Change in one place.
 */
export const SITE_URL = 'https://bolagio.de';

/**
 * Contact channels.
 *
 * `email` is intentionally `null`: no verified address exists yet, and an
 * invented one would bounce. Every surface that would show an email address
 * falls back to the enquiry form or WhatsApp instead.
 */
export const contact = {
  /** NEEDS CONFIRMATION — carried over from the previous site. */
  phone: '+49 160 1832917',
  /** NEEDS CONFIRMATION — same number, E.164 without separators. */
  phoneHref: 'tel:+491601832917',
  /** NEEDS CONFIRMATION — is this the business WhatsApp? */
  whatsapp: 'https://wa.me/491601832917',
  /** NEEDS CONFIRMATION — no verified address yet. Keep `null` until supplied. */
  email: null as string | null,
  /** Street is known; the house number is deliberately not published pre-booking. */
  street: 'Schulstraße',
  postalCode: '95444',
  responseWindow: {
    de: 'Wir antworten persönlich, meist am selben Tag.',
    en: 'We reply personally, usually the same day.',
  },
} as const;

/**
 * Enquiry submission.
 *
 * This reuses the contact webhook that already existed in the repository —
 * no new backend surface was created for this frontend pass, and no payment
 * provider is contacted from anywhere in the redesigned frontend.
 *
 * NEEDS CONFIRMATION — is this n8n endpoint live and monitored?
 */
export const ENQUIRY_ENDPOINT = 'https://n8n.cogniiq.co/webhook/contact-allinone';

/**
 * Hard guard for this staging implementation.
 *
 * The previous frontend could open a live Stripe or PayPal checkout with no
 * availability source behind it. Payment is disabled at the frontend level
 * until a real availability system exists; the enquiry flow replaces it.
 * The external Stripe / PayPal / n8n payment configuration itself was not
 * touched.
 */
export const PAYMENT_ENABLED = false as const;

/**
 * Languages the interface genuinely supports today. The previous site
 * advertised four; only these two are implemented.
 */
export const SUPPORTED_LOCALES = ['de', 'en'] as const;
