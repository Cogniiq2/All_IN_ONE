/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CONTRACTING PARTY — BoLaGio GmbH, as the law needs it stated.
 *
 * One record, read by the Impressum (§ 5 DDG), the privacy notice (Art. 13/14
 * GDPR "identity and contact details of the controller"), the checkout
 * (identity of the trader, Art. 246a § 1 Abs. 1 Nr. 2–3 EGBGB) and the
 * booking confirmation (§ 312f Abs. 2 BGB).
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 * A value is either VERIFIED by the owners or `null`. Nothing here is guessed:
 * a plausible-looking register number or street is worse than a gap, because
 * a gap is visible and a wrong fact is published. The Impressum renders a
 * `null` as an explicit "wird ergänzt" marker, and `companyIdentityGaps()`
 * lists every missing mandatory item so the direct-booking gate can refuse
 * while one is missing.
 *
 * To complete it: fill in each `null` from the Handelsregister extract and
 * the Gesellschaftsvertrag, and nothing else. See LEGAL_REVIEW_REQUIRED.md.
 *
 * Import-safe from client components: data and pure functions only.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { contact } from '@/lib/content/brand';

export interface CompanyIdentity {
  /** Full registered firm name, exactly as in the Handelsregister. */
  legalName: string | null;
  /** Registered business address (ladungsfähige Anschrift). */
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  /** Geschäftsführer — every person authorised to represent the GmbH. */
  managingDirectors: readonly string[] | null;
  /** e.g. "Amtsgericht Bayreuth" — from the register extract, never assumed. */
  registerCourt: string | null;
  /** e.g. "HRB 12345". */
  registerNumber: string | null;
  /** USt-IdNr. (§ 27a UStG), when one has been issued. */
  vatId: string | null;
  /** Wirtschafts-Identifikationsnummer (§ 139c AO), when issued and if displayed. */
  economicId: string | null;
  /** A monitored address. § 5 Abs. 1 Nr. 2 DDG requires electronic contact. */
  email: string | null;
  phone: string | null;
  /**
   * § 36 VSBG statement. `null` until the owners decide — the obligation and
   * its small-business exemption are a question for the adviser (see
   * LEGAL_REVIEW_REQUIRED.md). Never defaulted to a sentence nobody chose.
   */
  consumerDisputeStatement: { de: string; en: string } | null;
  /**
   * Person responsible for journalistic-editorial content (§ 18 Abs. 2
   * MStV), with address — relevant because the site publishes a journal.
   * Whether the journal is such content is for the adviser; `null` renders as
   * a visible gap rather than a guess.
   */
  editorialResponsible: string | null;
}

export const COMPANY: CompanyIdentity = {
  // Given by the owners as the operating company of this website.
  legalName: 'BoLaGio GmbH',
  // NEEDS CONFIRMATION — the registered address (Sitz) with house number.
  street: null,
  postalCode: null,
  city: null,
  country: 'Deutschland',
  // NEEDS CONFIRMATION — from the Handelsregister extract.
  managingDirectors: null,
  registerCourt: null,
  registerNumber: null,
  // NEEDS CONFIRMATION — only if issued. Never a placeholder number.
  vatId: null,
  economicId: null,
  // `contact.email` is null until a monitored address is verified.
  email: contact.email,
  phone: contact.phone,
  consumerDisputeStatement: null,
  editorialResponsible: null,
};

export type CompanyField =
  | 'legalName'
  | 'address'
  | 'managingDirectors'
  | 'register'
  | 'email'
  | 'phone';

/**
 * The mandatory items that are still missing.
 *
 * VAT id is deliberately not in this list: § 5 Abs. 1 Nr. 6 DDG requires it
 * only where one exists, and whether it exists is a fact the owners supply.
 * The Impressum still shows the gap so it cannot be forgotten.
 */
export function companyIdentityGaps(company: CompanyIdentity = COMPANY): CompanyField[] {
  const gaps: CompanyField[] = [];
  if (!company.legalName) gaps.push('legalName');
  if (!company.street || !company.postalCode || !company.city) gaps.push('address');
  if (!company.managingDirectors || company.managingDirectors.length === 0) gaps.push('managingDirectors');
  if (!company.registerCourt || !company.registerNumber) gaps.push('register');
  if (!company.email) gaps.push('email');
  if (!company.phone) gaps.push('phone');
  return gaps;
}

/** "BoLaGio GmbH, Musterweg 1, 95444 Bayreuth" — or null while incomplete. */
export function contractingPartyLine(company: CompanyIdentity = COMPANY): string | null {
  if (!company.legalName || !company.street || !company.postalCode || !company.city) return null;
  return `${company.legalName}, ${company.street}, ${company.postalCode} ${company.city}`;
}
