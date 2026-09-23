-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — LEGAL COMPLIANCE EVIDENCE (2026-09-25)
--
-- Two pieces of evidence the law expects BoLaGio to be able to produce, and
-- that the schema could not hold until now.
--
-- ── 1. What a booking guest was shown ─────────────────────────────────────
-- `bolagio_booking_intents.terms_evidence` records which VERSION of the
-- cancellation policy, the no-withdrawal notice, the AGB, the privacy notice
-- and the price statement were on screen when the guest pressed the order
-- button, when, and in which language. The texts themselves live, versioned
-- and append-only, in lib/legal/booking-terms.ts; the confirmation email
-- re-reads them BY THIS VERSION, so a guest is always sent the terms they
-- agreed to rather than whatever is current when the mail goes out.
--
-- Written once, at intent creation. Null for every booking created before
-- this migration (none were paid: direct booking has never been enabled).
--
-- ── 2. Marketing consent that was actually CONFIRMED ──────────────────────
-- `marketing_consent_at` records the tick on the form. Until now nothing
-- recorded that the mailbox owner confirmed it: an address that was already
-- verified could have consent recorded by anyone who typed it. The double
-- opt-in now confirms CONSENT, not just the address:
--
--   marketing_consent_confirmed_at   set when the emailed link is clicked
--                                     for a consent that is pending
--   marketing_withdrawal_source      how a withdrawal arrived
--
-- Marketable = consent confirmed at or after the latest consent tick AND not
-- withdrawn since. lib/privileges/marketing.ts is the only reader.
--
-- ── 3. A re-consent no longer erases the withdrawal ────────────────────────
-- `bolagio_guest_identity_consent_order` required withdrawn_at >= consent_at,
-- which forced the application to NULL an earlier withdrawal when the same
-- guest later consented again — destroying the evidence that the withdrawal
-- was honoured. It is replaced by "a withdrawal needs a consent to withdraw";
-- the ORDER of the two timestamps is now meaning (withdrawn after the latest
-- consent = not marketable), not an invariant.
--
-- Additive apart from §3: nullable columns, check constraints, one partial
-- index, and one constraint replaced by a strictly weaker one. No row is
-- rewritten and no existing row can violate the new constraints.
-- Rollback: supabase/ops/rollback_20260925.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table bolagio_booking_intents
  add column if not exists terms_evidence jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bolagio_intent_terms_evidence_shape') then
    alter table bolagio_booking_intents
      add constraint bolagio_intent_terms_evidence_shape
      check (terms_evidence is null
             or (jsonb_typeof(terms_evidence) = 'object'
                 and terms_evidence ? 'versions'
                 and terms_evidence ? 'acceptedAt'
                 and jsonb_typeof(terms_evidence -> 'versions') = 'object'));
  end if;
end $$;

comment on column bolagio_booking_intents.terms_evidence is
  'Versions of the checkout terms shown when the guest pressed the order button: {versions:{cancellation,withdrawal,agb,privacy,price}, acceptedAt, locale}.';

alter table bolagio_guest_identities
  add column if not exists marketing_consent_confirmed_at timestamptz,
  add column if not exists marketing_withdrawal_source    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bolagio_guest_identity_confirm_needs_consent') then
    alter table bolagio_guest_identities
      add constraint bolagio_guest_identity_confirm_needs_consent
      check (marketing_consent_confirmed_at is null or marketing_consent_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bolagio_guest_identity_withdrawal_source') then
    alter table bolagio_guest_identities
      add constraint bolagio_guest_identity_withdrawal_source
      check (marketing_withdrawal_source is null
             or marketing_withdrawal_source in ('unsubscribe_link', 'one_click', 'operator', 'guest_request'));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'bolagio_guest_identity_consent_order') then
    alter table bolagio_guest_identities drop constraint bolagio_guest_identity_consent_order;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bolagio_guest_identity_withdrawal_needs_consent') then
    alter table bolagio_guest_identities
      add constraint bolagio_guest_identity_withdrawal_needs_consent
      check (marketing_withdrawn_at is null or marketing_consent_at is not null);
  end if;
end $$;

-- The marketing audience, if one is ever read: confirmed and not withdrawn.
create index if not exists bolagio_guest_identity_marketable_idx
  on bolagio_guest_identities (marketing_consent_confirmed_at)
  where marketing_consent_confirmed_at is not null and marketing_withdrawn_at is null;

comment on column bolagio_guest_identities.marketing_consent_confirmed_at is
  'Double opt-in for MARKETING: set when the emailed link is clicked for a pending consent. Marketable only if >= marketing_consent_at and not withdrawn.';
comment on column bolagio_guest_identities.marketing_withdrawal_source is
  'How the withdrawal arrived: unsubscribe_link | one_click (RFC 8058) | operator | guest_request.';
