-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — CANONICAL RESERVATIONS (2026-09-23)
--
-- The local read model of reservations that ACTUALLY EXIST: Booking.com and
-- Airbnb stays arriving through Beds24, bookings made by hand in the Beds24
-- interface, owner blocks, and — later — BoLaGio's own direct bookings once
-- they are confirmed at the provider.
--
-- ── Why a new table and not bolagio_booking_intents ───────────────────────
-- `bolagio_booking_intents` is a CHECKOUT ATTEMPT: a state machine with a
-- lease, a payment saga, an idempotency key and a BLG-XXXXXX reference that
-- BoLaGio itself mints. A Booking.com reservation has none of those things
-- and never will. Forcing one into that table would mean either inventing a
-- reference and a payment state for a reservation BoLaGio was never part of,
-- or loosening every constraint that makes the direct-booking saga safe.
--
-- So the two live side by side, with different authorities:
--
--   bolagio_booking_intents   what THIS WEBSITE tried to do (direct booking)
--   bolagio_reservations      what IS BOOKED at the provider (every channel)
--
-- A future direct booking appears in both, linked by `direct_intent_id`.
--
-- ── Authority ─────────────────────────────────────────────────────────────
-- Beds24 is authoritative. This table is a CACHE of its answers, refreshed by
-- an idempotent read-only import (`POST /api/booking/reservations/sync`).
-- Nothing in this migration writes to Beds24 and nothing derived from this
-- table may. `bolagio_unit_inventory_days` remains the availability read
-- model; this table is the stay record. Neither replaces the other.
--
-- ── Deletion ──────────────────────────────────────────────────────────────
-- There is none. A cancelled reservation stays, with its provider status and
-- `cancelled` class; a reservation that stops being returned by a bounded
-- date query has simply left the window, which is not evidence of anything.
-- `last_seen_at` records when the provider last listed it, and that is all it
-- claims.
--
-- ── Personal data ─────────────────────────────────────────────────────────
-- Guest name, email, phone, country and the raw provider payload are in here.
-- RLS is on with NO policy and anon/authenticated are revoked, exactly as for
-- every other bolagio_* table: the only door is the service role held by the
-- server. Nothing browser-facing reads this table, and no public API exposes
-- it. Identity-document fields are deliberately absent.
--
-- Additive only. No existing table is dropped, no existing column changes
-- type, no existing enum gains a member. The single alteration to an existing
-- object is the WIDENING of a CHECK constraint on bolagio_scheduler_runs so
-- the new job may record its heartbeat.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Enumerations ───────────────────────────────────────────────────────────
--
-- A NEW type rather than a member added to `bolagio_booking_source`. That enum
-- is used by a column on `bolagio_booking_intents` with a default and is read
-- by the direct-booking code; adding `unknown` to it would give the direct
-- saga a source it has no meaning for. This one belongs to reservations only.

do $$ begin
  create type bolagio_reservation_source as enum ('booking_com', 'airbnb', 'direct', 'manual', 'unknown');
exception when duplicate_object then null; end $$;

-- How a provider status is READ, never what it is called. The provider's own
-- string is kept verbatim in `provider_status`; this column exists so a
-- cancelled stay can be excluded from occupancy without the interface having
-- to know Beds24's vocabulary.
--
--   active       a real guest stay that occupies the unit
--   provisional  requested, not confirmed — never counted as a stay
--   cancelled    was a reservation, is not any more; kept forever
--   blocked      not a guest: an owner block or maintenance
--   unknown      a status this system has not met; never treated as a stay
do $$ begin
  create type bolagio_reservation_class as enum ('active', 'provisional', 'cancelled', 'blocked', 'unknown');
exception when duplicate_object then null; end $$;

-- ── The table ──────────────────────────────────────────────────────────────

create table if not exists bolagio_reservations (
  id                    uuid primary key default gen_random_uuid(),

  -- `restrict`, not `cascade`: a unit with reservations against it is not a
  -- row anyone deletes by accident.
  unit_id               uuid not null references bolagio_units(id) on delete restrict,

  provider              bolagio_integration_provider not null default 'beds24',
  -- The provider's own booking id. Text, because a provider id is an opaque
  -- token even when it looks like a number.
  external_booking_id   text not null,
  -- Echoed back for diagnosis; the unit mapping is what actually resolves a
  -- booking to a BoLaGio unit, and it lives in bolagio_unit_integrations.
  external_property_id  text,
  external_room_id      text,

  -- Normalised only where the provider gives unambiguous evidence. Everything
  -- else is `unknown` — never guessed from a guest name, an email domain, a
  -- price or a date.
  source                bolagio_reservation_source not null default 'unknown',
  -- Exactly what the provider called the channel, untouched, for the day the
  -- normalisation has to be revisited.
  source_raw            text,
  -- The channel's own reference (a Booking.com confirmation number), where the
  -- provider supplies one. Operationally this is what a guest quotes.
  channel_reference     text,

  provider_status       text not null,
  status_class          bolagio_reservation_class not null default 'unknown',

  check_in              date not null,
  check_out             date not null,

  adults                smallint check (adults is null or adults >= 0),
  children              smallint check (children is null or children >= 0),
  number_of_guests      smallint check (number_of_guests is null or number_of_guests >= 0),

  -- Data minimisation: what an operator needs to receive a guest, reach them
  -- and account for the stay. Nothing identity-document shaped, ever.
  guest_first_name      text,
  guest_last_name       text,
  guest_email           text,
  guest_phone           text,
  guest_country         char(2),

  currency              char(3),
  -- Integer minor units. GROSS as the provider states it, and nothing more is
  -- claimed: whether commission is deducted, whether VAT or city tax is
  -- included, is NOT known from this number. The finance subledger does not
  -- read it. See docs/beds24-reservations.md §Financials.
  total_amount_cents    integer check (total_amount_cents is null or total_amount_cents >= 0),

  booked_at             timestamptz,
  provider_created_at   timestamptz,
  provider_modified_at  timestamptz,
  provider_cancelled_at timestamptz,

  -- Set only when this reservation is provably one of BoLaGio's own direct
  -- bookings. Nullable forever; direct booking is disabled today.
  direct_intent_id      uuid references bolagio_booking_intents(id) on delete set null,

  -- The provider's answer, as it arrived. Server-side only: it is never
  -- selected by the admin row source and never leaves a route handler.
  raw_provider_snapshot jsonb not null default '{}'::jsonb,

  imported_at           timestamptz not null default now(),
  last_synced_at        timestamptz not null default now(),
  -- When the provider last LISTED this reservation in a query that covered it.
  -- Not an expiry, not a deletion signal — see the header.
  last_seen_at          timestamptz not null default now(),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint bolagio_reservations_range check (check_out > check_in)
);

comment on table bolagio_reservations is
  'Canonical local read model of reservations that exist at the channel manager. Read-only import; Beds24 stays authoritative. Contains guest personal data.';
comment on column bolagio_reservations.total_amount_cents is
  'Gross as the provider states it. Commission, VAT and city-tax treatment are NOT implied. Not accounting revenue.';
comment on column bolagio_reservations.last_seen_at is
  'When the provider last listed this reservation. Absence from a bounded window is never treated as a cancellation.';

-- The same half-open stay semantics the rest of the booking core uses:
-- [check_in, check_out). The departure day is not an occupied night.
alter table bolagio_reservations
  add column if not exists stay_range daterange
  generated always as (daterange(check_in, check_out, '[)')) stored;

-- ── Identity ───────────────────────────────────────────────────────────────
--
-- One row per provider booking, forever. This is what makes the import
-- idempotent: the tenth sync of the same reservation updates this row rather
-- than inserting an eleventh.
create unique index if not exists bolagio_reservations_provider_uq
  on bolagio_reservations (provider, external_booking_id);

-- ── Read paths ─────────────────────────────────────────────────────────────
create index if not exists bolagio_reservations_unit_checkin_idx
  on bolagio_reservations (unit_id, check_in);
create index if not exists bolagio_reservations_stay_idx
  on bolagio_reservations (check_in, check_out);
create index if not exists bolagio_reservations_status_idx
  on bolagio_reservations (provider_status);
create index if not exists bolagio_reservations_class_idx
  on bolagio_reservations (status_class);
create index if not exists bolagio_reservations_source_idx
  on bolagio_reservations (source);
-- Incremental sync, if and when a provider-side modification filter proves
-- usable; harmless and small otherwise.
create index if not exists bolagio_reservations_modified_idx
  on bolagio_reservations (provider_modified_at desc nulls last);
-- The direct-booking join, when there is one.
create index if not exists bolagio_reservations_intent_idx
  on bolagio_reservations (direct_intent_id) where direct_intent_id is not null;

-- NO exclusion constraint on (unit_id, stay_range). Two overlapping Beds24
-- bookings on one room is a real state of the world — an overbooking, or a
-- cancelled stay sitting under its replacement — and refusing to record it
-- would make the import fail exactly when an operator most needs to see it.
-- Overbooking protection belongs on the intents table, where it already is.

-- ── updated_at ─────────────────────────────────────────────────────────────
do $$ begin
  create trigger bolagio_reservations_touch before update on bolagio_reservations
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── Scheduler heartbeat ────────────────────────────────────────────────────
--
-- The job name check is WIDENED, never narrowed: every value it accepted
-- before is still accepted. Re-runnable.
do $$ begin
  alter table bolagio_scheduler_runs drop constraint if exists bolagio_scheduler_runs_job_check;
  alter table bolagio_scheduler_runs
    add constraint bolagio_scheduler_runs_job_check
    check (job in ('reconcile', 'inventory_sync', 'operations', 'reservation_sync'));
exception when undefined_table then null; end $$;

-- ── Row level security: deny everything ────────────────────────────────────
--
-- Same posture as every other bolagio_* table. RLS on with no permissive
-- policy means anon and authenticated read nothing even if a publishable key
-- leaks. The service role held by the Next.js server is the only door.
alter table bolagio_reservations enable row level security;
revoke all on bolagio_reservations from anon, authenticated;
