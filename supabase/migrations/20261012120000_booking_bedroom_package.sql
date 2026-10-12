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
-- ── The Beds24 offer, beside it (added with the live mapping) ─────────────
-- `beds24_offer_id` records the Beds24 offer the quote was priced on — 1
-- ("1 Schlafzimmer") or 2 ("2 Schlafzimmer"), verified against the live
-- account on 2026-10-12. It is the provider's own record of the package, and
-- the same id is written to the Beds24 booking at hold time.
--
-- ── Imported reservations ────────────────────────────────────────────────
-- `bolagio_reservations.external_offer_id` keeps the `offerId` every Beds24
-- booking carries, and `bedroom_package` is derived from it for offers 1 and
-- 2 only. Channel reservations arrive with offerId 0 (observed live): their
-- bedroom package stays NULL — unknown, never guessed.
--
-- Additive and idempotent: safe to re-run. Rollback:
-- supabase/ops/rollback_20261012.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table bolagio_booking_intents
  add column if not exists bedroom_package text,
  add column if not exists beds24_offer_id integer;

alter table bolagio_reservations
  add column if not exists bedroom_package text,
  add column if not exists external_offer_id integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bolagio_intent_bedroom_package_value') then
    alter table bolagio_booking_intents
      add constraint bolagio_intent_bedroom_package_value
      check (bedroom_package is null or bedroom_package in ('one_bedroom', 'two_bedroom'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bolagio_intent_beds24_offer_id_positive') then
    alter table bolagio_booking_intents
      add constraint bolagio_intent_beds24_offer_id_positive
      check (beds24_offer_id is null or beds24_offer_id > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bolagio_reservation_bedroom_package_value') then
    alter table bolagio_reservations
      add constraint bolagio_reservation_bedroom_package_value
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

comment on column bolagio_booking_intents.beds24_offer_id is
  'Beds24 offer the quote was priced on: 1 = 1 Schlafzimmer, 2 = 2 Schlafzimmer. Written to the Beds24 booking at hold time.';

comment on column bolagio_reservations.external_offer_id is
  'Beds24 booking.offerId as imported (0 on channel reservations).';

comment on column bolagio_reservations.bedroom_package is
  'Derived from external_offer_id (1 → one_bedroom, 2 → two_bedroom). NULL when unknown, e.g. Booking.com / Airbnb reservations.';
