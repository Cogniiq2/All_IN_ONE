/**
 * ══════════════════════════════════════════════════════════════════════════
 * GUEST EMAIL THAT IS NOT PURELY TRANSACTIONAL — gated on a confirmed basis.
 *
 * A booking confirmation, the arrival details and the check-out note are part
 * of performing the contract. A request for feedback or a review is not: the
 * BGH treats a customer-satisfaction email as advertising (BGH, 10.07.2018 —
 * VI ZR 225/17), which needs either prior consent (§ 7 Abs. 2 Nr. 2 UWG) or
 * the existing-customer exemption of § 7 Abs. 3 UWG — whose conditions
 * include an objection notice when the address was COLLECTED, which the
 * checkout does not give today.
 *
 * So `review_request` is suppressed until the owners, on advice, record here
 * which basis they rely on and that its preconditions are in place. The
 * scheduler may keep emitting the event; the delivery refuses it with a
 * reason an operator can read.
 *
 * Import-safe: data only.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface ConfirmedLegalBasis {
  basis: 'consent' | 'uwg_7_3_existing_customer';
  confirmedAt: string;
  confirmedBy: string;
}

/** NEEDS CONFIRMATION — see LEGAL_REVIEW_REQUIRED.md. `null` suppresses the email. */
export const REVIEW_REQUEST_BASIS: ConfirmedLegalBasis | null = null;

/**
 * Approval of the marketing-consent wording on /guest/privileges and of the
 * double opt-in email that confirms it (which must itself contain no
 * advertising). `null` blocks every marketing send — see
 * lib/privileges/marketing.ts. When approved, `versions` lists the
 * MARKETING_CONSENT_VERSION values the approval covers; a consent recorded
 * under any other wording version is not marketable.
 */
export interface MarketingConsentApproval {
  versions: readonly string[];
  approvedAt: string;
  approvedBy: string;
}

/** NEEDS APPROVAL — see LEGAL_REVIEW_REQUIRED.md. */
export const MARKETING_CONSENT_APPROVAL: MarketingConsentApproval | null = null;
