-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — GUEST PRIVILEGES (2026-09-24)
--
-- The returning-guest system. A tasteful QR code in each apartment leads to a
-- page where a current guest leaves their email; a verified email earns
-- configurable benefits on a future DIRECT booking. The commercial point is
-- to convert an OTA stay into a direct relationship, which is the only lever
-- that reduces channel commission.
--
-- ── Four tables, four different jobs ──────────────────────────────────────
--   bolagio_guest_identities      WHO   a normalised email, and its consent
--   bolagio_privilege_campaigns   WHAT  the configurable benefit
--   bolagio_privilege_grants      ENTITLEMENT  this identity, this campaign
--   bolagio_privilege_redemptions LEDGER  used once, on this booking
--
-- Separating the entitlement from the redemption is what makes "one-time"
-- enforceable: a usage limit is a count of ledger rows, not a boolean someone
-- forgot to flip.
--
-- ── The security posture ──────────────────────────────────────────────────
-- A discount is resolved SERVER-SIDE from these tables at quote time. The
-- browser never sends a discount, a campaign code or an eligibility claim;
-- it sends the email the guest is booking with, and the server decides. There
-- is no coupon string to guess, forge or share.
--
-- Eligibility requires a VERIFIED email (`verified_at`). An unverified signup
-- earns nothing, which is what stops someone typing a stranger's address —
-- and also what makes double opt-in the same mechanism as the security
-- control rather than an extra one bolted beside it.
--
-- ── Personal data ─────────────────────────────────────────────────────────
-- `bolagio_guest_identities` holds an email address and consent evidence, and
-- nothing else about a person. RLS is on with NO policy and anon/authenticated
-- are revoked, as for every other bolagio_* table: the only door is the
-- service role held by the server.
--
-- Consent is recorded as EVIDENCE, not as a boolean: when, from where, and
-- which wording version. Marketing consent is a separate column from the
-- service relationship and is never implied by a booking — see
-- docs/guest-privileges.md §Consent and LEGAL_REVIEW_REQUIRED.md.
--
-- Additive only. No existing table is dropped, no existing column changes
-- type, no existing enum gains a member.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Identity ───────────────────────────────────────────────────────────────

create table if not exists bolagio_guest_identities (
  id                        uuid primary key default gen_random_uuid(),

  -- Lower-cased and trimmed by the application before it arrives. UNIQUE, so
  -- one person is one row however many times they sign up — which is what
  -- makes "a first-time benefit once" enforceable rather than aspirational.
  --
  -- Deliberately NOT further canonicalised: gmail's dot-and-plus rules are
  -- gmail's, and applying them to every provider would merge two genuinely
  -- different mailboxes at other hosts. Address-level abuse is bounded by the
  -- per-campaign grant instead.
  email_normalized          text not null unique
                              check (email_normalized = lower(email_normalized)
                                     and email_normalized like '%@%.%'
                                     and length(email_normalized) between 6 and 254),

  -- Double opt-in. Null until the guest clicks the link in the email.
  verified_at               timestamptz,
  -- Only ever a SHA-256 of the token. The raw token exists in the email and
  -- in the guest's browser, never at rest here: a database read must not be
  -- enough to verify someone else's address.
  verification_token_hash   text unique,
  verification_sent_at      timestamptz,
  verification_expires_at   timestamptz,
  -- Bounded so a mailbox cannot be used as an outbound relay.
  verification_attempts     smallint not null default 0 check (verification_attempts >= 0),

  -- ── Consent, as evidence ────────────────────────────────────────────────
  -- Separate from verification on purpose. Verifying an address proves the
  -- address; it does not grant permission to market to it.
  marketing_consent_at      timestamptz,
  -- Where the tick happened, e.g. 'qr_privileges'. Never inferred.
  marketing_consent_source  text,
  -- The wording version shown at the time, so "what did they agree to" is a
  -- query rather than an argument.
  marketing_consent_version text,
  marketing_withdrawn_at    timestamptz,

  -- Where this identity came from. Operational, not personal.
  signup_campaign_code      text,
  signup_unit_id            uuid references bolagio_units(id) on delete set null,
  signup_locale             text check (signup_locale in ('de','en')),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Marketing consent cannot be withdrawn before it was given.
  constraint bolagio_guest_identity_consent_order
    check (marketing_withdrawn_at is null
           or (marketing_consent_at is not null and marketing_withdrawn_at >= marketing_consent_at))
);

create index if not exists bolagio_guest_identity_verified_idx
  on bolagio_guest_identities (verified_at) where verified_at is not null;

comment on table bolagio_guest_identities is
  'One normalised email = one guest identity. Holds consent evidence and double opt-in state. Personal data: service role only.';

-- ── Campaigns: the configurable benefit ────────────────────────────────────

create table if not exists bolagio_privilege_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  -- Stable, human, and what a QR URL carries. Never a secret: a QR code is
  -- printed on a wall where anyone can photograph it, so the code grants
  -- nothing on its own.
  code                  text not null unique
                          check (code ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name                  text not null,
  description_de        text,
  description_en        text,

  active                boolean not null default false,
  -- Null means every unit. A campaign may be scoped to one apartment.
  unit_id               uuid references bolagio_units(id) on delete cascade,

  -- ── The economics. Both may be set; the LARGER is never taken, the
  --    smaller is — see lib/privileges/benefit.ts. `max_discount_cents` caps
  --    whatever the percentage produces, which is what stops a long stay
  --    turning a 10% courtesy into a four-figure giveaway.
  discount_percent_bp   integer not null default 0
                          check (discount_percent_bp between 0 and 5000),
  discount_fixed_cents  integer not null default 0
                          check (discount_fixed_cents between 0 and 100000),
  max_discount_cents    integer check (max_discount_cents is null or max_discount_cents > 0),

  min_nights            smallint not null default 1 check (min_nights between 1 and 365),
  -- The window in which the benefit may be REDEEMED, not the signup window.
  valid_from            date,
  valid_to              date,
  -- A grant made today expires this many days later. Null = no expiry.
  expiry_days           integer check (expiry_days is null or expiry_days between 1 and 3650),

  -- How many times ONE guest may use this campaign. 1 = the classic
  -- returning-guest benefit.
  usage_limit_per_guest smallint not null default 1
                          check (usage_limit_per_guest between 1 and 100),
  -- Whether this may combine with another campaign on one booking. False by
  -- default: stacking is the bug that turns a discount into a refund.
  stackable             boolean not null default false,
  -- Lower sorts first when two campaigns both apply and neither stacks.
  priority              smallint not null default 100,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A campaign that discounts nothing is a configuration mistake, not a
  -- campaign. Refused at the database so it cannot be saved and puzzled over.
  constraint bolagio_campaign_has_a_benefit
    check (discount_percent_bp > 0 or discount_fixed_cents > 0),
  constraint bolagio_campaign_window_ordered
    check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create index if not exists bolagio_campaign_active_idx
  on bolagio_privilege_campaigns (active, priority) where active;

comment on table bolagio_privilege_campaigns is
  'Admin-configurable returning-guest benefits. `code` appears in a QR URL and is not a secret; it grants nothing by itself.';

-- ── Grants: what an identity is entitled to ────────────────────────────────

create table if not exists bolagio_privilege_grants (
  id                 uuid primary key default gen_random_uuid(),
  guest_identity_id  uuid not null references bolagio_guest_identities(id) on delete cascade,
  campaign_id        uuid not null references bolagio_privilege_campaigns(id) on delete cascade,

  granted_at         timestamptz not null default now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  -- Why an operator revoked it. Operational text, never about the person.
  revoked_reason     text,

  -- THE anti-abuse invariant. One identity gets one grant per campaign, for
  -- ever. Signing up ten times from the same apartment produces one grant, so
  -- a "first-time benefit" cannot be farmed by re-submitting the form.
  unique (guest_identity_id, campaign_id)
);

create index if not exists bolagio_grant_identity_idx
  on bolagio_privilege_grants (guest_identity_id) where revoked_at is null;

comment on table bolagio_privilege_grants is
  'One entitlement per (identity, campaign), enforced by a unique index. Re-signup never creates a second.';

-- ── Redemptions: the ledger ────────────────────────────────────────────────

create table if not exists bolagio_privilege_redemptions (
  id                uuid primary key default gen_random_uuid(),
  grant_id          uuid not null references bolagio_privilege_grants(id) on delete restrict,

  -- The booking it was spent on. Unique, so a retried checkout cannot spend
  -- one benefit twice — the same idempotency posture as the rest of the
  -- booking core, enforced by the database rather than by a code path.
  intent_id         uuid not null references bolagio_booking_intents(id) on delete restrict,

  discount_cents    integer not null check (discount_cents > 0),
  -- What the stay cost before the benefit, so a redemption is auditable
  -- without re-deriving the quote months later.
  gross_cents       integer not null check (gross_cents > 0),
  campaign_code     text not null,
  redeemed_at       timestamptz not null default now(),

  unique (intent_id),
  -- A discount can never exceed what was being discounted.
  constraint bolagio_redemption_not_more_than_gross check (discount_cents <= gross_cents)
);

create index if not exists bolagio_redemption_grant_idx
  on bolagio_privilege_redemptions (grant_id);

comment on table bolagio_privilege_redemptions is
  'Immutable ledger of benefits actually spent. One row per booking intent; the usage limit is a count of these.';

-- ── Access ─────────────────────────────────────────────────────────────────
--
-- Identical to every other bolagio_* table: RLS on, no policy, browser roles
-- revoked. The service role the server holds bypasses RLS; nothing else has a
-- door at all. The campaigns table is included even though it holds no
-- personal data — the discount configuration is commercially sensitive and a
-- browser that could read it could plan against it.

alter table bolagio_guest_identities      enable row level security;
alter table bolagio_privilege_campaigns   enable row level security;
alter table bolagio_privilege_grants      enable row level security;
alter table bolagio_privilege_redemptions enable row level security;

revoke all on bolagio_guest_identities      from anon, authenticated;
revoke all on bolagio_privilege_campaigns   from anon, authenticated;
revoke all on bolagio_privilege_grants      from anon, authenticated;
revoke all on bolagio_privilege_redemptions from anon, authenticated;

-- ── The outbox event this feature emits ────────────────────────────────────
--
-- `guest_privileges_verify`, aggregate_type `guest_identity`. The payload
-- carries the identity id and NEVER the email or the token: the outbox is
-- documented as holding references and not guest PII, and this feature does
-- not become the exception. The delivery worker resolves the recipient
-- through the internal API, exactly as guest messaging already does.
--
-- No enum to widen: `event_type` is free text and n8n refuses a shape it does
-- not know by `event_version`.
