/**
 * ══════════════════════════════════════════════════════════════════════════
 * BENEFIT RESOLUTION — what a returning guest is actually owed.
 *
 * Pure. Rows in, a decision out. No database, no network, no clock of its
 * own — `now` is a parameter, so "expired" is testable rather than flaky.
 *
 * ── Why this file is the security boundary ───────────────────────────────
 * The browser never sends a discount, a campaign code, or a claim to be
 * eligible. It sends the email the guest is booking with; the server loads
 * that identity's grants and calls this function. There is no coupon string
 * to guess, forge, share or replay, because there is no coupon string.
 *
 * Every rule that could cost money is therefore HERE, in one place, with a
 * test each:
 *
 *   · an unverified identity earns nothing (this is also the double opt-in)
 *   · a revoked or expired grant earns nothing
 *   · a campaign outside its validity window earns nothing
 *   · a stay shorter than `min_nights` earns nothing
 *   · a campaign scoped to another unit earns nothing
 *   · usage is counted from the redemption LEDGER, never from a flag
 *   · a percentage is capped by `max_discount_cents`
 *   · non-stackable campaigns do not combine
 *   · a discount can never exceed the gross, and never turn it negative
 *
 * ── Rounding ─────────────────────────────────────────────────────────────
 * Integer cents throughout, and the percentage is floored. Flooring favours
 * BoLaGio by at most one cent per booking, which is the right direction for
 * a rounding rule nobody will ever audit.
 */

/** A campaign as configured. Mirrors `bolagio_privilege_campaigns`. */
export interface Campaign {
  id: string;
  code: string;
  name: string;
  active: boolean;
  /** Null means every unit. */
  unitId: string | null;
  /** Basis points: 1000 = 10%. */
  discountPercentBp: number;
  discountFixedCents: number;
  maxDiscountCents: number | null;
  minNights: number;
  validFrom: string | null;
  validTo: string | null;
  usageLimitPerGuest: number;
  stackable: boolean;
  priority: number;
}

/** An entitlement. Mirrors `bolagio_privilege_grants` plus its usage count. */
export interface Grant {
  id: string;
  campaign: Campaign;
  expiresAt: string | null;
  revokedAt: string | null;
  /** Rows in `bolagio_privilege_redemptions` for this grant. Never a boolean. */
  redemptionsUsed: number;
}

export interface Identity {
  id: string;
  /** Null until the guest clicked the link. The single gate on everything below. */
  verifiedAt: string | null;
}

/** The stay a benefit is being resolved against. */
export interface StayContext {
  unitId: string;
  nights: number;
  grossCents: number;
  /** The arrival date, which is what a campaign's validity window is measured against. */
  checkIn: string;
}

/** Why a grant did not apply. Operational vocabulary; never shown to a guest verbatim. */
export type Ineligibility =
  | 'identity_unverified'
  | 'grant_revoked'
  | 'grant_expired'
  | 'campaign_inactive'
  | 'campaign_not_started'
  | 'campaign_ended'
  | 'campaign_other_unit'
  | 'stay_too_short'
  | 'usage_limit_reached'
  | 'no_discount_produced'
  | 'not_stackable';

export interface AppliedBenefit {
  grantId: string;
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  discountCents: number;
}

export interface BenefitResolution {
  /** Cents off the gross. Always >= 0 and always <= gross. */
  discountCents: number;
  applied: AppliedBenefit[];
  /** Every grant that did NOT apply, with the reason. For the admin, not the guest. */
  rejected: Array<{ grantId: string; campaignCode: string; reason: Ineligibility }>;
}

const EMPTY: BenefitResolution = { discountCents: 0, applied: [], rejected: [] };

/**
 * The discount one campaign produces against a gross, before any cap on the
 * total. Exported because the percentage-then-cap order is worth testing on
 * its own: capping before applying would silently change the answer.
 */
export function campaignDiscountCents(campaign: Campaign, grossCents: number): number {
  if (grossCents <= 0) return 0;
  const fromPercent = Math.floor((grossCents * campaign.discountPercentBp) / 10_000);
  // The larger of the two is NOT taken. A campaign configured with both a
  // percentage and a fixed amount means "whichever is the smaller courtesy",
  // because a benefit nobody intended is the expensive kind of surprise.
  const candidates = [fromPercent, campaign.discountFixedCents].filter((n) => n > 0);
  if (candidates.length === 0) return 0;
  const raw = Math.min(...candidates);
  const capped = campaign.maxDiscountCents === null ? raw : Math.min(raw, campaign.maxDiscountCents);
  return Math.max(0, Math.min(capped, grossCents));
}

/**
 * Whether a timestamp has passed, compared as an INSTANT and never as text.
 *
 * Lexical comparison of two ISO-8601 strings is a trap that looks like it
 * works: `'2026-06-01T12:00:00Z' <= '2026-06-01T12:00:00.000Z'` is FALSE,
 * because `'Z'` sorts after `'.'`. Postgres renders a timestamptz with
 * microseconds and a `+00:00` offset while `Date.toISOString()` renders
 * milliseconds and a `Z`, so the two forms meet here constantly — and the
 * failure mode is a grant that has expired still paying out.
 *
 * An unparseable timestamp is treated as EXPIRED. Failing closed on a value
 * the system cannot read is the only safe direction for something that
 * decides whether money comes off a booking.
 */
function hasExpired(expiresAt: string | null, nowMs: number): boolean {
  if (expiresAt === null) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return true;
  return ms <= nowMs;
}

/** Whether a campaign's redemption window contains the arrival date. */
function windowReason(campaign: Campaign, checkIn: string): Ineligibility | null {
  // Plain `YYYY-MM-DD` on BOTH sides — a `date` column and a check-in date —
  // so lexical comparison is exact here, unlike the timestamp case above.
  // Inclusive at both ends: a campaign valid "to 31 July" includes 31 July.
  if (campaign.validFrom !== null && checkIn < campaign.validFrom) return 'campaign_not_started';
  if (campaign.validTo !== null && checkIn > campaign.validTo) return 'campaign_ended';
  return null;
}

/**
 * Resolve every benefit an identity may use on one stay.
 *
 * Order: the highest-value grant first, so a guest holding two non-stacking
 * campaigns gets the better one rather than whichever the database returned
 * first. `priority` breaks a tie, then the code, so the answer is stable
 * across reads — an unstable discount is a support ticket.
 */
export function resolveBenefits(
  identity: Identity,
  grants: readonly Grant[],
  stay: StayContext,
  now: Date = new Date()
): BenefitResolution {
  // The one gate that outranks everything. An unverified identity is an email
  // address someone typed, which is not evidence that they own it.
  if (!identity.verifiedAt) {
    return {
      ...EMPTY,
      rejected: grants.map((g) => ({ grantId: g.id, campaignCode: g.campaign.code, reason: 'identity_unverified' as const })),
    };
  }
  if (stay.grossCents <= 0 || stay.nights <= 0) return EMPTY;

  const instant = now.getTime();
  const rejected: BenefitResolution['rejected'] = [];
  const eligible: Array<{ grant: Grant; discountCents: number }> = [];

  for (const grant of grants) {
    const reject = (reason: Ineligibility) => rejected.push({ grantId: grant.id, campaignCode: grant.campaign.code, reason });

    if (grant.revokedAt !== null) { reject('grant_revoked'); continue; }
    if (hasExpired(grant.expiresAt, instant)) { reject('grant_expired'); continue; }
    if (!grant.campaign.active) { reject('campaign_inactive'); continue; }
    if (grant.campaign.unitId !== null && grant.campaign.unitId !== stay.unitId) { reject('campaign_other_unit'); continue; }
    if (stay.nights < grant.campaign.minNights) { reject('stay_too_short'); continue; }
    // The ledger decides, not a flag. `>=` because a limit of one means one.
    if (grant.redemptionsUsed >= grant.campaign.usageLimitPerGuest) { reject('usage_limit_reached'); continue; }

    const windowFailure = windowReason(grant.campaign, stay.checkIn);
    if (windowFailure) { reject(windowFailure); continue; }

    const discountCents = campaignDiscountCents(grant.campaign, stay.grossCents);
    if (discountCents <= 0) { reject('no_discount_produced'); continue; }

    eligible.push({ grant, discountCents });
  }

  eligible.sort(
    (a, b) =>
      b.discountCents - a.discountCents ||
      a.grant.campaign.priority - b.grant.campaign.priority ||
      a.grant.campaign.code.localeCompare(b.grant.campaign.code)
  );

  const applied: AppliedBenefit[] = [];
  let total = 0;
  for (const candidate of eligible) {
    // The first benefit always applies. A later one only joins it if BOTH it
    // and everything already applied are stackable — one non-stackable
    // campaign in the set closes the door, which is the conservative reading
    // and the one that cannot produce a surprise refund.
    if (applied.length > 0) {
      const allStackable = candidate.grant.campaign.stackable && eligible
        .filter((e) => applied.some((a) => a.grantId === e.grant.id))
        .every((e) => e.grant.campaign.stackable);
      if (!allStackable) {
        rejected.push({ grantId: candidate.grant.id, campaignCode: candidate.grant.campaign.code, reason: 'not_stackable' });
        continue;
      }
    }

    // Never below zero, whatever the configuration says. This is the last
    // line of defence and it is unconditional.
    const room = stay.grossCents - total;
    const discountCents = Math.max(0, Math.min(candidate.discountCents, room));
    if (discountCents === 0) {
      rejected.push({ grantId: candidate.grant.id, campaignCode: candidate.grant.campaign.code, reason: 'no_discount_produced' });
      continue;
    }

    total += discountCents;
    applied.push({
      grantId: candidate.grant.id,
      campaignId: candidate.grant.campaign.id,
      campaignCode: candidate.grant.campaign.code,
      campaignName: candidate.grant.campaign.name,
      discountCents,
    });
  }

  return { discountCents: total, applied, rejected };
}

/* ── Email normalisation ───────────────────────────────────────────────── */

/**
 * The one canonical form an email takes before it is stored or looked up.
 *
 * Trimmed and lower-cased, and nothing more. Gmail's dot-and-plus rules are
 * GMAIL's: applying them to every provider would merge two genuinely
 * different mailboxes at hosts that treat them as different, and silently
 * hand one person's benefit to another. Address-level farming is bounded by
 * the one-grant-per-campaign unique index instead, which costs nothing and
 * cannot be wrong.
 *
 * Returns null for anything that is not plausibly an address; the caller
 * refuses rather than storing it.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length < 6 || value.length > 254) return null;
  // Deliberately permissive on the local part and strict on the shape: a
  // validator that out-clevers the RFC rejects real addresses, and the
  // verification email is the real proof that an address exists.
  if (!/^[^\s@,;:<>"'\\]+@[^\s@.,;:<>"'\\]+(\.[^\s@.,;:<>"'\\]+)+$/.test(value)) return null;
  return value;
}
