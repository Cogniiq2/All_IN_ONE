import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATA ACCESS for guest privileges.
 *
 * The only place the four privilege tables are named. Everything here runs
 * through the service role on the server; nothing in this file is reachable
 * from a browser, and no function returns an email address to a caller that
 * did not already supply it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { Campaign, Grant } from '@/lib/privileges/benefit';
import { hashVerificationToken, mintVerificationToken, MAX_VERIFICATION_SENDS, VERIFICATION_TTL_HOURS } from '@/lib/privileges/tokens';

const CAMPAIGN_COLUMNS =
  'id, code, name, active, unit_id, discount_percent_bp, discount_fixed_cents, max_discount_cents,' +
  ' min_nights, valid_from, valid_to, expiry_days, usage_limit_per_guest, stackable, priority';

interface CampaignRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  unit_id: string | null;
  discount_percent_bp: number;
  discount_fixed_cents: number;
  max_discount_cents: number | null;
  min_nights: number;
  valid_from: string | null;
  valid_to: string | null;
  expiry_days: number | null;
  usage_limit_per_guest: number;
  stackable: boolean;
  priority: number;
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    unitId: row.unit_id,
    discountPercentBp: row.discount_percent_bp,
    discountFixedCents: row.discount_fixed_cents,
    maxDiscountCents: row.max_discount_cents,
    minNights: row.min_nights,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    usageLimitPerGuest: row.usage_limit_per_guest,
    stackable: row.stackable,
    priority: row.priority,
  };
}

/** Every campaign, for the admin screen. Includes inactive ones. */
export async function listCampaigns(): Promise<Array<Campaign & { expiryDays: number | null }>> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_privilege_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .order('active', { ascending: false })
    .order('priority', { ascending: true })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as CampaignRow[]).map((r) => ({ ...toCampaign(r), expiryDays: r.expiry_days }));
}

/**
 * The campaigns a signup at this QR code earns.
 *
 * A campaign scoped to a unit is earned only by a signup AT that unit; an
 * unscoped campaign is earned by any signup. The QR code's own `code`
 * parameter selects a campaign by name when it names one that is active.
 */
export async function campaignsForSignup(input: { campaignCode?: string; unitId?: string | null }): Promise<Campaign[]> {
  let q = supabaseAdmin().from('bolagio_privilege_campaigns').select(CAMPAIGN_COLUMNS).eq('active', true);
  if (input.campaignCode) q = q.eq('code', input.campaignCode);
  const { data, error } = await q.order('priority', { ascending: true }).limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as CampaignRow[])
    .filter((r) => r.unit_id === null || (input.unitId != null && r.unit_id === input.unitId))
    .map(toCampaign);
}

export interface IdentityRecord {
  id: string;
  emailNormalized: string;
  verifiedAt: string | null;
  verificationSentAt: string | null;
  verificationAttempts: number;
}

/**
 * Find or create the identity for a normalised email, and return a token to
 * send IF one should be sent.
 *
 * ── Why this is one function ─────────────────────────────────────────────
 * Because "does this address already exist" must never be answerable from
 * outside. The route calls this and always answers the same thing; the
 * difference between a new signup and a repeat one shows up only in whether
 * an email goes out, which the person holding the mailbox can see and nobody
 * else can.
 *
 * An already-verified identity is returned with `token: null` — there is
 * nothing to verify, and re-sending would let anyone spam a known address
 * through this endpoint.
 */
export async function upsertIdentityForSignup(input: {
  emailNormalized: string;
  campaignCode?: string;
  unitId?: string | null;
  locale?: 'de' | 'en';
  marketingConsent: boolean;
  consentVersion: string;
  consentSource: string;
}): Promise<{ identity: IdentityRecord; token: string | null; created: boolean }> {
  const db = supabaseAdmin();
  const now = new Date();

  const { data: existing, error: readError } = await db
    .from('bolagio_guest_identities')
    .select('id, email_normalized, verified_at, verification_sent_at, verification_attempts, marketing_consent_at')
    .eq('email_normalized', input.emailNormalized)
    .maybeSingle();
  if (readError) throw readError;

  const consentPatch = input.marketingConsent
    ? {
        marketing_consent_at: now.toISOString(),
        marketing_consent_source: input.consentSource,
        marketing_consent_version: input.consentVersion,
        // A fresh, explicit consent lifts an earlier withdrawal. Recorded as
        // a new consent with its own timestamp, never as an edit of the old.
        marketing_withdrawn_at: null,
      }
    : {};

  if (existing) {
    const row = existing as unknown as {
      id: string;
      email_normalized: string;
      verified_at: string | null;
      verification_sent_at: string | null;
      verification_attempts: number;
    };
    const identity: IdentityRecord = {
      id: row.id,
      emailNormalized: row.email_normalized,
      verifiedAt: row.verified_at,
      verificationSentAt: row.verification_sent_at,
      verificationAttempts: row.verification_attempts,
    };

    // Already verified: record any new consent, send nothing.
    if (row.verified_at !== null) {
      if (input.marketingConsent) {
        await db.from('bolagio_guest_identities').update({ ...consentPatch, updated_at: now.toISOString() }).eq('id', row.id);
      }
      return { identity, token: null, created: false };
    }

    // Unverified and out of sends: the mailbox has had enough from us.
    if (row.verification_attempts >= MAX_VERIFICATION_SENDS) {
      return { identity, token: null, created: false };
    }

    const token = mintVerificationToken();
    const { error } = await db
      .from('bolagio_guest_identities')
      .update({
        ...consentPatch,
        verification_token_hash: await hashVerificationToken(token),
        verification_sent_at: now.toISOString(),
        verification_expires_at: new Date(now.getTime() + VERIFICATION_TTL_HOURS * 3600_000).toISOString(),
        verification_attempts: row.verification_attempts + 1,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id);
    if (error) throw error;
    return { identity: { ...identity, verificationAttempts: row.verification_attempts + 1 }, token, created: false };
  }

  const token = mintVerificationToken();
  const { data, error } = await db
    .from('bolagio_guest_identities')
    .insert({
      email_normalized: input.emailNormalized,
      ...consentPatch,
      verification_token_hash: await hashVerificationToken(token),
      verification_sent_at: now.toISOString(),
      verification_expires_at: new Date(now.getTime() + VERIFICATION_TTL_HOURS * 3600_000).toISOString(),
      verification_attempts: 1,
      signup_campaign_code: input.campaignCode ?? null,
      signup_unit_id: input.unitId ?? null,
      signup_locale: input.locale ?? null,
    })
    .select('id, email_normalized, verified_at, verification_sent_at, verification_attempts')
    .single();

  if (error) {
    // A concurrent signup for the same address lost the race. Not an error
    // worth showing anyone: the winner's email is already on its way.
    if ((error as { code?: string }).code === '23505') {
      const retry = await upsertIdentityForSignup(input);
      return retry;
    }
    throw error;
  }

  const row = data as unknown as { id: string; email_normalized: string; verified_at: string | null; verification_sent_at: string | null; verification_attempts: number };
  return {
    identity: {
      id: row.id,
      emailNormalized: row.email_normalized,
      verifiedAt: row.verified_at,
      verificationSentAt: row.verification_sent_at,
      verificationAttempts: row.verification_attempts,
    },
    token,
    created: true,
  };
}

/**
 * Verify a token and grant the benefits it earns.
 *
 * Idempotent in the way that matters: a guest who clicks the link twice sees
 * success both times. The second click finds the token consumed, but the
 * grant is already there, so nothing is created twice — the unique index on
 * (guest_identity_id, campaign_id) is what makes that true rather than the
 * order of statements here.
 */
export async function verifyIdentity(token: string): Promise<{ ok: boolean; identityId?: string; grantedCampaigns?: string[] }> {
  const db = supabaseAdmin();
  const hash = await hashVerificationToken(token);
  const now = new Date();

  const { data, error } = await db
    .from('bolagio_guest_identities')
    .select('id, verified_at, verification_expires_at, signup_campaign_code, signup_unit_id')
    .eq('verification_token_hash', hash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false };

  const row = data as unknown as {
    id: string;
    verified_at: string | null;
    verification_expires_at: string | null;
    signup_campaign_code: string | null;
    signup_unit_id: string | null;
  };

  const expiresMs = row.verification_expires_at ? Date.parse(row.verification_expires_at) : NaN;
  // Fail closed: an unreadable or passed expiry is an expired link.
  if (row.verified_at === null && (!Number.isFinite(expiresMs) || expiresMs <= now.getTime())) {
    return { ok: false };
  }

  if (row.verified_at === null) {
    const { error: updateError } = await db
      .from('bolagio_guest_identities')
      .update({
        verified_at: now.toISOString(),
        // Consumed. The link cannot be replayed, and the row no longer holds
        // anything that could verify this address again.
        verification_token_hash: null,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)
      // Only if still unverified: two simultaneous clicks, one winner.
      .is('verified_at', null);
    if (updateError) throw updateError;
  }

  const campaigns = await campaignsForSignup({
    campaignCode: row.signup_campaign_code ?? undefined,
    unitId: row.signup_unit_id,
  });

  const granted: string[] = [];
  for (const campaign of campaigns) {
    const expiresAt = await grantExpiry(campaign.id, now);
    const { error: grantError } = await db.from('bolagio_privilege_grants').insert({
      guest_identity_id: row.id,
      campaign_id: campaign.id,
      expires_at: expiresAt,
    });
    // 23505 = the guest already holds this grant. That is the invariant
    // working, not a failure: signing up ten times earns one benefit.
    if (grantError && (grantError as { code?: string }).code !== '23505') throw grantError;
    if (!grantError) granted.push(campaign.code);
  }

  return { ok: true, identityId: row.id, grantedCampaigns: granted };
}

async function grantExpiry(campaignId: string, now: Date): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('bolagio_privilege_campaigns')
    .select('expiry_days')
    .eq('id', campaignId)
    .maybeSingle();
  const days = (data as { expiry_days?: number | null } | null)?.expiry_days ?? null;
  return days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString();
}

/**
 * Every grant an email holds, with its usage counted from the LEDGER.
 *
 * This is what the quote path calls. It returns the identity and the grants;
 * it never returns the email it was given, and it says nothing at all about
 * whether an address exists — an unknown address simply has no grants, which
 * is the same answer as a known address with none.
 */
export async function loadGrantsForEmail(emailNormalized: string): Promise<{ identity: { id: string; verifiedAt: string | null } | null; grants: Grant[] }> {
  const db = supabaseAdmin();
  const { data: identityRow, error } = await db
    .from('bolagio_guest_identities')
    .select('id, verified_at')
    .eq('email_normalized', emailNormalized)
    .maybeSingle();
  if (error) throw error;
  if (!identityRow) return { identity: null, grants: [] };

  const identity = identityRow as unknown as { id: string; verified_at: string | null };

  const { data: grantRows, error: grantError } = await db
    .from('bolagio_privilege_grants')
    .select(`id, expires_at, revoked_at, bolagio_privilege_campaigns(${CAMPAIGN_COLUMNS})`)
    .eq('guest_identity_id', identity.id)
    .limit(50);
  if (grantError) throw grantError;

  const rows = (grantRows ?? []) as unknown as Array<{
    id: string;
    expires_at: string | null;
    revoked_at: string | null;
    bolagio_privilege_campaigns: CampaignRow | CampaignRow[] | null;
  }>;

  const grants: Grant[] = [];
  for (const row of rows) {
    const joined = Array.isArray(row.bolagio_privilege_campaigns)
      ? row.bolagio_privilege_campaigns[0]
      : row.bolagio_privilege_campaigns;
    if (!joined) continue;
    const { count, error: countError } = await db
      .from('bolagio_privilege_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('grant_id', row.id);
    if (countError) throw countError;
    grants.push({
      id: row.id,
      campaign: toCampaign(joined),
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      redemptionsUsed: count ?? 0,
    });
  }

  return { identity: { id: identity.id, verifiedAt: identity.verified_at }, grants };
}
