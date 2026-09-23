/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BOOKING TERMS — what a guest is shown, and agrees to, before paying.
 *
 * Every text a guest must see before a paid direct booking lives here, as an
 * APPROVED, VERSIONED record — or not at all:
 *
 *   CANCELLATION_POLICIES    the cancellation and cancellation-cost terms
 *   WITHDRAWAL_NOTICES       the statutory notice that NO right of withdrawal
 *                            exists (§ 312g Abs. 2 Nr. 9 BGB, Art. 246a § 1
 *                            Abs. 3 EGBGB) — wording to be confirmed by counsel
 *   BOOKING_TERMS_DOCUMENTS  the AGB version that governs a concluded booking
 *   PRIVACY_NOTICES          the privacy notice version in force
 *   PRICE_COMPLETENESS       the owners' confirmation that the quoted total is
 *                            the whole price (VAT, cleaning, local levies)
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * The checkout used to render whatever cancellation text Beds24 returned for
 * an offer — and nothing when it returned nothing. A guest could pay without
 * ever seeing a cancellation term. The provider's text is no longer shown at
 * all: BoLaGio's approved policy is the only one, it is always rendered, and
 * when none has been approved the direct-booking gate is SHUT (see
 * lib/legal/readiness.ts). Fail closed; never invent a policy.
 *
 * ── How to approve a text ────────────────────────────────────────────────
 * APPEND a record. Never edit or delete one that a booking may have used:
 * every booking stores the versions it was shown (`terms_evidence`), and the
 * confirmation email re-reads the text BY VERSION. Removing a version breaks
 * the evidence trail for every booking that used it; editing one silently
 * rewrites what those guests agreed to. The newest record is the current one.
 *
 * The wording BoLaGio must approve before launch is set out, with options, in
 * docs/legal/checkout-wording-for-approval.md.
 *
 * Import-safe from client components: data and pure functions only.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type Localized = { de: string; en: string };

export interface ApprovedText {
  /** Stable id, e.g. `2026-10-01.1`. Stored with every booking that shows it. */
  version: string;
  /** ISO date of approval. */
  approvedAt: string;
  /** Who approved it — a role, e.g. "Geschäftsführung, nach anwaltlicher Prüfung". */
  approvedBy: string;
  text: Localized;
}

/**
 * The notice that no right of withdrawal exists.
 *
 * § 312g Abs. 2 Nr. 9 BGB exempts accommodation "zu anderen Zwecken als zu
 * Wohnzwecken" for a specific period. A long stay can be a residential use, for
 * which the exemption — and therefore this notice — would be WRONG. So the
 * notice carries the longest stay it was approved for, and the booking flow
 * refuses a longer online booking rather than showing a notice that may not
 * hold for it. Longer stays go to the enquiry flow. The number is counsel's,
 * not engineering's.
 */
export interface WithdrawalNotice extends ApprovedText {
  maxNights: number;
}

export interface ApprovedDocument {
  version: string;
  approvedAt: string;
  approvedBy: string;
  /** The site path the document is published at. */
  path: string;
}

export interface OnSiteCharge {
  label: Localized;
  /** Human-readable amount and basis, e.g. "2,50 € pro Person und Nacht". */
  amount: Localized;
}

export interface PriceCompleteness {
  version: string;
  confirmedAt: string;
  confirmedBy: string;
  /**
   * The sentence rendered under the total, e.g. "Gesamtpreis inkl. gesetzlicher
   * Umsatzsteuer und Endreinigung". Its content is a tax and pricing decision
   * (Kleinunternehmer or not, which fees Beds24 includes), so it is supplied,
   * never derived.
   */
  statement: Localized;
  /**
   * Mandatory charges NOT in the Beds24 total and payable on site. An empty
   * array is itself a confirmation ("there are none"); it is never assumed.
   */
  onSiteCharges: readonly OnSiteCharge[];
}

/* ── The registries. Empty until approved — which shuts the gate. ──────── */

export const CANCELLATION_POLICIES: readonly ApprovedText[] = [
  // NEEDS APPROVAL — see docs/legal/checkout-wording-for-approval.md §1.
];

export const WITHDRAWAL_NOTICES: readonly WithdrawalNotice[] = [
  // NEEDS APPROVAL — see docs/legal/checkout-wording-for-approval.md §2.
];

export const BOOKING_TERMS_DOCUMENTS: readonly ApprovedDocument[] = [
  // NEEDS APPROVAL — the current /agb covers enquiries, not concluded
  // bookings. See LEGAL_REVIEW_REQUIRED.md.
];

export const PRIVACY_NOTICES: readonly ApprovedDocument[] = [
  // NEEDS APPROVAL — /datenschutz still carries placeholders for the
  // controller details and processor regions.
];

export const PRICE_COMPLETENESS: readonly PriceCompleteness[] = [
  // NEEDS CONFIRMATION — see docs/legal/checkout-wording-for-approval.md §3.
];

/* ── The test fixture, for sandbox rehearsals only ─────────────────────── */

/**
 * Texts that exist so the staging sandbox run can exercise the checkout end
 * to end. They say, in both languages, that they are NOT a real policy.
 *
 * Used only when `BOOKING_TEST_TERMS=true` on APP_ENV=local or staging. On
 * production (or an unrecognised APP_ENV, which is read as production) the
 * switch is REFUSED by lib/config/environment.ts and ignored here.
 */
const TEST_NOTE = {
  de: 'TESTBEDINGUNGEN — keine gültige Regelung. Nur für Sandbox-Testbuchungen ohne echte Zahlung.',
  en: 'TEST TERMS — not a valid policy. For sandbox test bookings without real payment only.',
} as const;

export const TEST_TERMS = {
  cancellation: { version: 'test-fixture', approvedAt: '1970-01-01', approvedBy: 'test fixture', text: TEST_NOTE },
  withdrawal: { version: 'test-fixture', approvedAt: '1970-01-01', approvedBy: 'test fixture', text: TEST_NOTE, maxNights: 90 },
  agb: { version: 'test-fixture', approvedAt: '1970-01-01', approvedBy: 'test fixture', path: '/agb' },
  privacy: { version: 'test-fixture', approvedAt: '1970-01-01', approvedBy: 'test fixture', path: '/datenschutz' },
  price: { version: 'test-fixture', confirmedAt: '1970-01-01', confirmedBy: 'test fixture', statement: TEST_NOTE, onSiteCharges: [] },
} as const satisfies {
  cancellation: ApprovedText;
  withdrawal: WithdrawalNotice;
  agb: ApprovedDocument;
  privacy: ApprovedDocument;
  price: PriceCompleteness;
};

/* ── What travels to the browser ───────────────────────────────────────── */

/**
 * The resolved terms for one checkout. Carried on every quote; `null` when
 * any part is unapproved, in which case the checkout renders the gap and no
 * payment can start.
 */
export interface CheckoutTerms {
  cancellation: { version: string; text: Localized };
  withdrawal: { version: string; text: Localized; maxNights: number };
  agb: { version: string; path: string };
  privacy: { version: string; path: string };
  price: { version: string; statement: Localized; onSiteCharges: readonly OnSiteCharge[] };
  /** The contracting party line, e.g. "BoLaGio GmbH, …, 95444 Bayreuth". */
  contractingParty: string;
  /** True for the sandbox fixture. The checkout labels it loudly. */
  test: boolean;
}

/** The versions a guest was shown — sent back with the booking, stored as evidence. */
export interface AcceptedTermsVersions {
  cancellation: string;
  withdrawal: string;
  agb: string;
  privacy: string;
  price: string;
}

export function versionsOf(terms: CheckoutTerms): AcceptedTermsVersions {
  return {
    cancellation: terms.cancellation.version,
    withdrawal: terms.withdrawal.version,
    agb: terms.agb.version,
    privacy: terms.privacy.version,
    price: terms.price.version,
  };
}

export function sameVersions(a: AcceptedTermsVersions, b: AcceptedTermsVersions): boolean {
  return (
    a.cancellation === b.cancellation &&
    a.withdrawal === b.withdrawal &&
    a.agb === b.agb &&
    a.privacy === b.privacy &&
    a.price === b.price
  );
}

/** Reads the shape of a versions object from untrusted input; null when malformed. */
export function parseAcceptedVersions(value: unknown): AcceptedTermsVersions | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const keys = ['cancellation', 'withdrawal', 'agb', 'privacy', 'price'] as const;
  const out: Partial<AcceptedTermsVersions> = {};
  for (const key of keys) {
    const item = v[key];
    if (typeof item !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(item)) return null;
    out[key] = item;
  }
  return out as AcceptedTermsVersions;
}

/** The newest record in a registry — the one in force. */
export function latest<T>(registry: readonly T[]): T | null {
  return registry.length > 0 ? registry[registry.length - 1] : null;
}

/** A cancellation policy by version, for the confirmation email and for audit. */
export function cancellationPolicyByVersion(version: string): ApprovedText | null {
  if (version === TEST_TERMS.cancellation.version) return TEST_TERMS.cancellation;
  return CANCELLATION_POLICIES.find((p) => p.version === version) ?? null;
}

export function withdrawalNoticeByVersion(version: string): WithdrawalNotice | null {
  if (version === TEST_TERMS.withdrawal.version) return TEST_TERMS.withdrawal;
  return WITHDRAWAL_NOTICES.find((p) => p.version === version) ?? null;
}
