-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260925120000_legal_compliance.sql. Run in ONE transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260925.sql
--
-- ── What it REFUSES to do silently ────────────────────────────────────────
-- `terms_evidence` and the consent-confirmation columns ARE evidence: what a
-- paying guest agreed to, and that a marketing consent was confirmed or
-- withdrawn. Dropping them destroys that evidence. If any row carries a value
-- in one of them, this script stops unless the operator has said, in the
-- session, that the evidence has been exported:
--
--   set bolagio.legal_rollback_confirmed = 'I have exported the evidence';
--
-- Rolling this back also requires rolling back the application code that
-- writes the columns (lib/booking/repository.ts, lib/privileges/*), or every
-- direct booking and every privileges verification will fail.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

do $$
declare
  v_rows bigint;
begin
  select (select count(*) from bolagio_booking_intents where terms_evidence is not null)
       + (select count(*) from bolagio_guest_identities
            where marketing_consent_confirmed_at is not null or marketing_withdrawal_source is not null)
    into v_rows;
  if v_rows > 0 and coalesce(current_setting('bolagio.legal_rollback_confirmed', true), '') <> 'I have exported the evidence' then
    raise exception 'rollback_20260925 refused: % row(s) carry legal evidence. Export them, then set bolagio.legal_rollback_confirmed.', v_rows;
  end if;
end $$;

drop index if exists bolagio_guest_identity_marketable_idx;

-- Restore the original ordering constraint. NOT VALID, because a guest who
-- withdrew and later consented again is a legitimate row the old constraint
-- cannot express; new writes are checked, existing rows are left as evidence.
alter table bolagio_guest_identities
  drop constraint if exists bolagio_guest_identity_withdrawal_needs_consent;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bolagio_guest_identity_consent_order') then
    alter table bolagio_guest_identities
      add constraint bolagio_guest_identity_consent_order
      check (marketing_withdrawn_at is null
             or (marketing_consent_at is not null and marketing_withdrawn_at >= marketing_consent_at)) not valid;
  end if;
end $$;

alter table bolagio_guest_identities
  drop constraint if exists bolagio_guest_identity_withdrawal_source,
  drop constraint if exists bolagio_guest_identity_confirm_needs_consent,
  drop column if exists marketing_withdrawal_source,
  drop column if exists marketing_consent_confirmed_at;

alter table bolagio_booking_intents
  drop constraint if exists bolagio_intent_terms_evidence_shape,
  drop column if exists terms_evidence;
