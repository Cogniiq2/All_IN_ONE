/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CONTRACTING PARTY — BoLaGio GmbH
 *
 * Central source for:
 * - Impressum (§ 5 DDG)
 * - Datenschutz (Art. 13/14 GDPR)
 * - checkout trader identity
 * - booking confirmation
 *
 * IMPORTANT:
 * Never guess company/register details.
 * Unknown facts remain `null` and are surfaced by the legal readiness checks.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { contact } from '@/lib/content/brand';

export interface CompanyIdentity {
  /** Full registered company name exactly as entered in the Handelsregister. */
  legalName: string | null;

  /** Registered serviceable business address. */
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;

  /** All managing directors authorised to represent the GmbH. */
  managingDirectors: readonly string[] | null;

  /** Commercial register court, e.g. "Amtsgericht Bayreuth". */
  registerCourt: string | null;

  /** Commercial register number, e.g. "HRB 12345". */
  registerNumber: string | null;

  /** VAT identification number under § 27a UStG, if issued. */
  vatId: string | null;

  /** Wirtschafts-Identifikationsnummer under § 139c AO, if issued/displayed. */
  economicId: string | null;

  /**
   * Monitored email address.
   * § 5 Abs. 1 Nr. 2 DDG requires information enabling rapid electronic
   * contact and direct communication, including an email address.
   */
  email: string | null;

  /**
   * Telephone number.
   * Useful and strongly recommended, but not treated here as an unconditional
   * statutory launch blocker.
   */
  phone: string | null;

  /**
   * Statement concerning participation in consumer dispute resolution
   * proceedings under § 36 VSBG.
   *
   * Keep null until BoLaGio has confirmed whether the information obligation
   * applies and whether it is willing/obliged to participate.
   */
  consumerDisputeStatement: { de: string; en: string } | null;

  /**
   * Responsible person under § 18 Abs. 2 MStV if the Journal qualifies as a
   * journalistically/editorially designed offering.
   *
   * Do not populate merely because the site contains a blog/journal.
   * Applicability should be confirmed separately.
   */
  editorialResponsible: string | null;
}

export const COMPANY: CompanyIdentity = {
  legalName: 'BoLaGio GmbH',

  // Fill ONLY from the Handelsregister / verified company records.
  street: null,
  postalCode: null,
  city: null,
  country: 'Deutschland',

  // Fill with every registered Geschäftsführer.
  managingDirectors: null,

  // Fill exactly from the Handelsregister.
  registerCourt: null,
  registerNumber: null,

  // Fill only where actually issued.
  vatId: null,
  economicId: null,

  // Existing central contact data.
  // Verify that these addresses/numbers are actively monitored by BoLaGio.
  email: contact.email,
  phone: contact.phone,

  // Decide after checking § 36 VSBG applicability.
  consumerDisputeStatement: null,

  // Only required if the Journal falls under § 18 Abs. 2 MStV.
  editorialResponsible: null,
};

export type CompanyField =
  | 'legalName'
  | 'address'
  | 'managingDirectors'
  | 'register'
  | 'email';

/**
 * Mandatory company identity data still missing for the normal BoLaGio
 * commercial website / direct-booking flow.
 *
 * Not included as unconditional blockers:
 *
 * - phone:
 *   § 5 DDG requires rapid electronic contact/direct communication including
 *   email, but does not universally prescribe a telephone number.
 *
 * - vatId / economicId:
 *   only displayed if the relevant identifier has actually been issued.
 *
 * - consumerDisputeStatement:
 *   depends on § 36 VSBG applicability/status.
 *
 * - editorialResponsible:
 *   depends on whether the Journal qualifies under § 18 Abs. 2 MStV.
 */
export function companyIdentityGaps(
  company: CompanyIdentity = COMPANY
): CompanyField[] {
  const gaps: CompanyField[] = [];

  if (!company.legalName) {
    gaps.push('legalName');
  }

  if (!company.street || !company.postalCode || !company.city) {
    gaps.push('address');
  }

  if (
    !company.managingDirectors ||
    company.managingDirectors.length === 0
  ) {
    gaps.push('managingDirectors');
  }

  if (!company.registerCourt || !company.registerNumber) {
    gaps.push('register');
  }

  if (!company.email) {
    gaps.push('email');
  }

  return gaps;
}

/**
 * Human-readable contracting-party line used in checkout and confirmations.
 *
 * Example:
 * "BoLaGio GmbH, Musterstraße 1, 95444 Bayreuth"
 */
export function contractingPartyLine(
  company: CompanyIdentity = COMPANY
): string | null {
  if (
    !company.legalName ||
    !company.street ||
    !company.postalCode ||
    !company.city
  ) {
    return null;
  }

  return `${company.legalName}, ${company.street}, ${company.postalCode} ${company.city}`;
}
