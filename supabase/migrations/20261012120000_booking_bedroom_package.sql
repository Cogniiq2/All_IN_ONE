-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — BEDROOM PACKAGE ON BOOKING INTENTS (2026-10-12)
--
-- A guest booking a stay now chooses a bedroom setup, separately from the
-- party size:
--
--   one_bedroom   one bedroom prepared; intended for up to two guests
--   two_bedroom   the full two-bedroom setup; one to four guests
--
-- `bolagio_booking_intents.bedroom_package` records that choice, written once
-- when the intent is created (lib/booking/repository.ts → createIntent). It is
-- part of the intent's idempotency key, so the same dates in a different setup
-- are a different attempt.
--
-- ── What this column is NOT ───────────────────────────────────────────────
-- A price. What a package costs comes from Beds24 and is stored, as before,
-- in `quoted_total_cents` / `quote_components`. Until the Beds24 mapping for
-- packages is configured, the service refuses every live booking with
-- `pricing_unconfigured`, so no row is written with a live package at all.
--
-- ── Nulls ────────────────────────────────────────────────────────────────
-- Nullable: every intent created before this migration predates the choice,
-- and inventing one for them would be a fact nobody recorded. (Direct booking
-- has never been enabled, so none of them was paid.) The application always
-- writes a value for new intents.
--
-- ── The party rule, held by the database too ──────────────────────────────
-- `one_bedroom` with more than two guests is refused here as well as in
-- lib/booking/stay-rules.ts. The application is the first line; this is the
-- one a bug in the first cannot get past.
--
-- Additive and idempotent: safe to re-run. Rollback:
-- supabase/ops/rollback_20261012.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table bolagio_booking_intents
  add column if not exists bedroom_package text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bolagio_intent_bedroom_package_value') then
    alter table bolagio_booking_intents
      add constraint bolagio_intent_bedroom_package_value
      check (bedroom_package is null or bedroom_package in ('one_bedroom', 'two_bedroom'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bolagio_intent_bedroom_package_party') then
    alter table bolagio_booking_intents
      add constraint bolagio_intent_bedroom_package_party
      check (bedroom_package is distinct from 'one_bedroom' or adults + children <= 2);
  end if;
end $$;

comment on column bolagio_booking_intents.bedroom_package is
  'Bedroom setup the guest chose: one_bedroom (up to 2 guests) or two_bedroom (1–4 guests). Not a price — the total comes from Beds24. Null for intents created before 2026-10-12.';
