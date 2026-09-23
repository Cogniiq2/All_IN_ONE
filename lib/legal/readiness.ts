/**
 * ══════════════════════════════════════════════════════════════════════════
 * LEGAL READINESS — the third lock on the direct-booking gate.
 *
 *   lock 1   DIRECT_BOOKING_ENABLED=true               (the operator's intent)
 *   lock 2   validateEnvironment() has no refusal        (the configuration)
 *   lock 3   bookingLegalGaps() is empty                 (this file)
 *
 * Lock 3 is shut while any text a guest must see before paying is missing or
 * unapproved: the cancellation policy, the no-withdrawal notice, the AGB for
 * concluded bookings, the privacy notice, the confirmation that the quoted
 * total is complete, and the contracting company's identity. Each gap is a
 * refusal code the System page and the logs show verbatim, in the same
 * vocabulary as the environment refusals.
 *
 * The sandbox fixture (`BOOKING_TEST_TERMS=true`) satisfies lock 3 on
 * APP_ENV=local or staging only. Production refuses the switch outright.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { appEnvironment, type EnvironmentSource } from '@/lib/config/environment';
import { COMPANY, companyIdentityGaps, contractingPartyLine, type CompanyIdentity } from '@/lib/legal/company';
import {
  BOOKING_TERMS_DOCUMENTS,
  CANCELLATION_POLICIES,
  latest,
  PRICE_COMPLETENESS,
  PRIVACY_NOTICES,
  TEST_TERMS,
  WITHDRAWAL_NOTICES,
  type ApprovedDocument,
  type ApprovedText,
  type CheckoutTerms,
  type WithdrawalNotice,
  type PriceCompleteness,
} from '@/lib/legal/booking-terms';

export type LegalGapCode =
  | 'LEGAL_CANCELLATION_POLICY_UNAPPROVED'
  | 'LEGAL_WITHDRAWAL_NOTICE_UNAPPROVED'
  | 'LEGAL_BOOKING_TERMS_UNAPPROVED'
  | 'LEGAL_PRIVACY_NOTICE_UNAPPROVED'
  | 'LEGAL_PRICE_COMPLETENESS_UNCONFIRMED'
  | 'LEGAL_COMPANY_IDENTITY_INCOMPLETE';

export interface LegalGap {
  code: LegalGapCode;
  /** An operator-facing sentence. Never shown to a guest. */
  message: string;
}

/** The registries, injectable so the rules can be tested without editing the real ones. */
export interface LegalRegistries {
  cancellation: readonly ApprovedText[];
  withdrawal: readonly WithdrawalNotice[];
  agb: readonly ApprovedDocument[];
  privacy: readonly ApprovedDocument[];
  price: readonly PriceCompleteness[];
  company: CompanyIdentity;
}

export const REGISTRIES: LegalRegistries = {
  cancellation: CANCELLATION_POLICIES,
  withdrawal: WITHDRAWAL_NOTICES,
  agb: BOOKING_TERMS_DOCUMENTS,
  privacy: PRIVACY_NOTICES,
  price: PRICE_COMPLETENESS,
  company: COMPANY,
};

/** Whether the sandbox fixture is in force on this deployment. */
export function testTermsActive(source: EnvironmentSource = process.env): boolean {
  if (source.BOOKING_TEST_TERMS?.trim() !== 'true') return false;
  const environment = appEnvironment(source);
  return environment === 'local' || environment === 'staging';
}

function hasText(record: ApprovedText | null): record is ApprovedText {
  return Boolean(record && record.version && record.text.de.trim() && record.text.en.trim());
}

/** Every reason a paid direct booking may not be offered yet. Empty = ready. */
export function bookingLegalGaps(
  source: EnvironmentSource = process.env,
  registries: LegalRegistries = REGISTRIES
): LegalGap[] {
  if (testTermsActive(source)) return [];

  const gaps: LegalGap[] = [];
  if (!hasText(latest(registries.cancellation))) {
    gaps.push({
      code: 'LEGAL_CANCELLATION_POLICY_UNAPPROVED',
      message: 'No approved cancellation policy in lib/legal/booking-terms.ts. The checkout would show no cancellation terms; payment is refused.',
    });
  }
  const withdrawal = latest(registries.withdrawal);
  if (!hasText(withdrawal) || !Number.isInteger(withdrawal.maxNights) || withdrawal.maxNights < 1) {
    gaps.push({
      code: 'LEGAL_WITHDRAWAL_NOTICE_UNAPPROVED',
      message: 'No approved notice on the (non-)existence of a right of withdrawal (Art. 246a § 1 Abs. 3 EGBGB).',
    });
  }
  if (!latest(registries.agb)) {
    gaps.push({
      code: 'LEGAL_BOOKING_TERMS_UNAPPROVED',
      message: 'No AGB version approved for concluded, paid bookings. The published /agb covers enquiries only.',
    });
  }
  if (!latest(registries.privacy)) {
    gaps.push({
      code: 'LEGAL_PRIVACY_NOTICE_UNAPPROVED',
      message: 'The privacy notice has not been approved (controller details and processor regions outstanding).',
    });
  }
  const price = latest(registries.price);
  if (!price || !price.statement.de.trim() || !price.statement.en.trim()) {
    gaps.push({
      code: 'LEGAL_PRICE_COMPLETENESS_UNCONFIRMED',
      message: 'Nobody has confirmed that the Beds24 total is the complete price (VAT, cleaning, local levies, on-site charges).',
    });
  }
  const identity = companyIdentityGaps(registries.company);
  if (identity.length > 0) {
    gaps.push({
      code: 'LEGAL_COMPANY_IDENTITY_INCOMPLETE',
      message: `The contracting company's identity is incomplete in lib/legal/company.ts: ${identity.join(', ')}.`,
    });
  }
  return gaps;
}

/**
 * The terms for a checkout, or `null` when any part is missing.
 *
 * `null` is not an error to be papered over: the quote carries it to the
 * browser, which renders "no direct booking possible yet" in place of the
 * cancellation block and offers no payment.
 */
export function resolveCheckoutTerms(
  source: EnvironmentSource = process.env,
  registries: LegalRegistries = REGISTRIES
): CheckoutTerms | null {
  if (testTermsActive(source)) {
    return {
      cancellation: { version: TEST_TERMS.cancellation.version, text: TEST_TERMS.cancellation.text },
      withdrawal: { version: TEST_TERMS.withdrawal.version, text: TEST_TERMS.withdrawal.text, maxNights: TEST_TERMS.withdrawal.maxNights },
      agb: { version: TEST_TERMS.agb.version, path: TEST_TERMS.agb.path },
      privacy: { version: TEST_TERMS.privacy.version, path: TEST_TERMS.privacy.path },
      price: { version: TEST_TERMS.price.version, statement: TEST_TERMS.price.statement, onSiteCharges: [] },
      contractingParty: contractingPartyLine(registries.company) ?? `${registries.company.legalName ?? 'BoLaGio'} (TEST)`,
      test: true,
    };
  }

  if (bookingLegalGaps(source, registries).length > 0) return null;

  // Every lookup below is non-null: bookingLegalGaps() just proved it.
  const cancellation = latest(registries.cancellation)!;
  const withdrawal = latest(registries.withdrawal)!;
  const agb = latest(registries.agb)!;
  const privacy = latest(registries.privacy)!;
  const price = latest(registries.price)!;
  const party = contractingPartyLine(registries.company);
  if (!party) return null;

  return {
    cancellation: { version: cancellation.version, text: cancellation.text },
    withdrawal: { version: withdrawal.version, text: withdrawal.text, maxNights: withdrawal.maxNights },
    agb: { version: agb.version, path: agb.path },
    privacy: { version: privacy.version, path: privacy.path },
    price: { version: price.version, statement: price.statement, onSiteCharges: price.onSiteCharges },
    contractingParty: party,
    test: false,
  };
}
