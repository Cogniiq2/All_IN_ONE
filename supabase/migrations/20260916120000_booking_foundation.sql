-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — booking foundation.
--
-- Everything the WEBSITE owns about availability and direct bookings. It is
-- deliberately additive: the three earlier migrations in this folder belong to
-- an archived admin application and are not touched, and every object created
-- here carries an unambiguous name so the two never collide.
--
--   Beds24   channel manager. Authoritative availability, authoritative rate,
--            authoritative reservation. Owns Booking.com and Airbnb.
--   Supabase (this file) BoLaGio-owned data: which unit is which on the
--            provider, a fast availability read model, booking intents,
--            payment state, raw provider events.
--
-- Money is stored in integer minor units (cents). Never a float.
-- Dates are stored as `date`, never as a timestamp: a hotel night is a
-- calendar day in the property's own locale, not an instant.
-- ════════════════════════════════════════════════════════════════════════════

-- Overlap protection for the hold constraint at the bottom of this file needs
-- gist indexes over scalar columns alongside a range column.
create extension if not exists btree_gist;

-- ── Enumerations ───────────────────────────────────────────────────────────

-- Where a reservation came from. Built into the data model rather than derived
-- from a text label later, so the future BoLaGio OS can attribute revenue.
do $$ begin
  create type bolagio_booking_source as enum ('direct', 'booking_com', 'airbnb', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bolagio_integration_provider as enum ('beds24');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bolagio_payment_provider as enum ('stripe', 'paypal');
exception when duplicate_object then null; end $$;

-- The booking intent state machine. Transitions are enforced in application
-- code (lib/booking/state-machine.ts); this type enumerates the vocabulary.
do $$ begin
  create type bolagio_booking_status as enum (
    'draft',            -- created, nothing validated yet
    'quoted',           -- live Beds24 availability + offer attached
    'hold_created',     -- inventory blocked at Beds24, awaiting payment
    'payment_pending',  -- payment session handed to n8n / provider
    'paid',             -- payment confirmed by a trusted callback
    'confirmed',        -- reservation confirmed at Beds24
    'payment_failed',
    'expired',          -- hold or quote ran out
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ── Units ──────────────────────────────────────────────────────────────────
--
-- The OPERATIONAL registry of lettable units. It is not the editorial source
-- of truth — `lib/content/apartments.ts` still owns names, photography and
-- copy, and `slug` is the join between the two.
--
-- What lives here is what the booking engine must be able to trust at runtime
-- and change without a deploy: whether the unit is bookable at all, its real
-- occupancy ceiling, and its currency.

create table if not exists bolagio_units (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  display_name   text not null,
  -- Real occupancy. Nullable on purpose: an un-set value means "not verified
  -- by the owners", and the application falls back rather than inventing one.
  max_guests     smallint check (max_guests is null or max_guests between 1 and 30),
  min_nights     smallint check (min_nights is null or min_nights >= 1),
  currency       char(3) not null default 'EUR',
  -- Nothing can be booked until this is explicitly true, whatever the content
  -- file or the provider says.
  is_bookable    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table bolagio_units is
  'BoLaGio-owned lettable units. Joined to lib/content/apartments.ts by slug.';

-- ── Provider mapping ───────────────────────────────────────────────────────
--
-- The frontend understands BoLaGio units. It never understands a Beds24 id.
-- Exactly one row per (unit, provider) may be enabled.

create table if not exists bolagio_unit_integrations (
  id                   uuid primary key default gen_random_uuid(),
  unit_id              uuid not null references bolagio_units(id) on delete cascade,
  provider             bolagio_integration_provider not null,
  external_property_id text not null,
  external_room_id     text not null,
  enabled              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (unit_id, provider)
);

-- One Beds24 room maps to one BoLaGio unit and no more, or availability from
-- two units would be written over the top of one another.
create unique index if not exists bolagio_unit_integrations_external_uq
  on bolagio_unit_integrations (provider, external_property_id, external_room_id);

-- ── Availability read model ────────────────────────────────────────────────
--
-- One row per unit per calendar day. This is a CACHE, refreshed in bulk from
-- Beds24; Beds24 stays authoritative and is re-asked live before any
-- reservation is created. It exists so opening a calendar is one indexed range
-- scan rather than a provider round trip.
--
-- ── Hotel date semantics, which this table is shaped around ────────────────
-- A reservation 16 Sep → 20 Sep occupies the NIGHTS of the 16th, 17th, 18th
-- and 19th. The 20th is a departure, not an occupied night, and may be a
-- perfectly valid new arrival. So:
--
--   is_available   is this NIGHT free (the night beginning on `date`)
--   can_check_in   may a stay START on this date
--   can_check_out  may a stay END on this date (this date is not a night)
--
-- A naive implementation that marks both endpoints of a reservation as
-- occupied loses one sellable night per back-to-back stay.

create table if not exists bolagio_unit_inventory_days (
  unit_id            uuid not null references bolagio_units(id) on delete cascade,
  date               date not null,
  is_available       boolean not null default false,
  can_check_in       boolean not null default false,
  can_check_out      boolean not null default false,
  min_stay           smallint,
  max_stay           smallint,
  -- Indicative nightly rate for calendar display only. The authoritative total
  -- always comes from a live Beds24 offer, never from this column.
  display_price_cents integer check (display_price_cents is null or display_price_cents >= 0),
  currency           char(3) not null default 'EUR',
  provider           bolagio_integration_provider not null default 'beds24',
  provider_updated_at timestamptz,
  synced_at          timestamptz not null default now(),
  primary key (unit_id, date)
);

-- The calendar read: one unit, one date window. The primary key already leads
-- with unit_id, so this covers it; the date-only index serves the sync job's
-- horizon pruning across all units.
create index if not exists bolagio_inventory_date_idx
  on bolagio_unit_inventory_days (date);

comment on table bolagio_unit_inventory_days is
  'Fast availability cache. Beds24 remains authoritative; revalidated live before every reservation.';

-- ── Booking intents ────────────────────────────────────────────────────────
--
-- A booking ATTEMPT. Unfinished attempts never mix with confirmed
-- reservations: the status column separates them and every read of "real"
-- bookings filters on it.

create table if not exists bolagio_booking_intents (
  id                  uuid primary key default gen_random_uuid(),
  -- The guest-facing reservation number: BLG-XXXXXX. Deliberately not a Beds24
  -- id, and deliberately not this row's uuid.
  reference           text not null unique check (reference ~ '^BLG-[0-9A-Z]{6}$'),
  unit_id             uuid not null references bolagio_units(id) on delete restrict,

  check_in            date not null,
  check_out           date not null,
  adults              smallint not null check (adults >= 1),
  children            smallint not null default 0 check (children >= 0),

  -- Collected at checkout. Nothing identity-document shaped belongs here;
  -- guest registration (Meldeschein) is a separate flow.
  guest_first_name    text,
  guest_last_name     text,
  guest_email         text,
  guest_phone         text,
  country             char(2),
  locale              text,

  currency            char(3) not null default 'EUR',
  -- Integer minor units. Set only from a live provider offer, never from a
  -- client-submitted amount.
  quoted_total_cents  integer check (quoted_total_cents is null or quoted_total_cents >= 0),
  -- Line items with their own tax category, so a cleaning fee, a city tax and
  -- the accommodation itself are never assumed to share a rate.
  quote_components    jsonb,

  status              bolagio_booking_status not null default 'draft',
  source              bolagio_booking_source not null default 'direct',

  beds24_booking_id   text,
  payment_provider    bolagio_payment_provider,
  payment_session_id  text,

  -- Idempotency. A single booking attempt must never produce two Beds24
  -- bookings, two intents or two payment sessions, whatever the browser does.
  idempotency_key     text not null unique,

  quote_expires_at    timestamptz,
  hold_expires_at     timestamptz,
  -- Exactly what the provider answered, kept for reconciliation and disputes.
  provider_snapshot   jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bolagio_booking_intents_range check (check_out > check_in)
);

-- The stay as a half-open range: [check_in, check_out). The departure day is
-- outside it, which is exactly the hotel semantics described above and is what
-- makes back-to-back stays non-overlapping.
alter table bolagio_booking_intents
  add column if not exists stay_range daterange
  generated always as (daterange(check_in, check_out, '[)')) stored;

create index if not exists bolagio_booking_intents_unit_idx
  on bolagio_booking_intents (unit_id, check_in);
create index if not exists bolagio_booking_intents_status_idx
  on bolagio_booking_intents (status);
create index if not exists bolagio_booking_intents_beds24_idx
  on bolagio_booking_intents (beds24_booking_id) where beds24_booking_id is not null;
-- Expiry sweeps.
create index if not exists bolagio_booking_intents_hold_idx
  on bolagio_booking_intents (hold_expires_at)
  where status in ('hold_created', 'payment_pending');

-- ── Overbooking protection, enforced by the database ───────────────────────
--
-- Two intents that both hold inventory may never overlap on the same unit.
-- This is a backstop behind the live Beds24 revalidation, not a replacement
-- for it — Beds24 is the only thing that knows about Booking.com and Airbnb —
-- but it makes a double submit from this website impossible rather than
-- merely unlikely.
do $$ begin
  alter table bolagio_booking_intents
    add constraint bolagio_booking_intents_no_overlap
    exclude using gist (
      unit_id with =,
      stay_range with &&
    ) where (status in ('hold_created', 'payment_pending', 'paid', 'confirmed'));
exception when duplicate_object then null; end $$;

-- ── State transition log ───────────────────────────────────────────────────
--
-- Every status change, appended. Makes "why is this booking in this state"
-- answerable without guessing, and gives payment callbacks something to be
-- idempotent against.

create table if not exists bolagio_booking_intent_events (
  id            uuid primary key default gen_random_uuid(),
  intent_id     uuid not null references bolagio_booking_intents(id) on delete cascade,
  from_status   bolagio_booking_status,
  to_status     bolagio_booking_status not null,
  reason        text,
  correlation_id text,
  -- No guest personal data. Provider ids and amounts only.
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists bolagio_booking_intent_events_intent_idx
  on bolagio_booking_intent_events (intent_id, created_at desc);

-- ── Raw provider events ────────────────────────────────────────────────────
--
-- Everything Beds24 (and later anything else) sends us, persisted before it is
-- interpreted. Duplicate deliveries are rejected on payload_hash, so a webhook
-- retried five times is processed once.

create table if not exists bolagio_integration_events (
  id            uuid primary key default gen_random_uuid(),
  provider      bolagio_integration_provider not null,
  event_type    text not null,
  external_id   text,
  payload       jsonb not null,
  payload_hash  text not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  status        text not null default 'received'
                check (status in ('received', 'processed', 'ignored', 'failed')),
  error         text,
  unique (provider, payload_hash)
);

create index if not exists bolagio_integration_events_unprocessed_idx
  on bolagio_integration_events (received_at)
  where processed_at is null;

-- ── updated_at ─────────────────────────────────────────────────────────────

create or replace function bolagio_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$ begin
  create trigger bolagio_units_touch before update on bolagio_units
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger bolagio_unit_integrations_touch before update on bolagio_unit_integrations
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger bolagio_booking_intents_touch before update on bolagio_booking_intents
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── Row level security: deny everything ────────────────────────────────────
--
-- No browser ever reads these tables. Every access goes through a Next.js
-- route handler holding the service role key, which bypasses RLS. Enabling RLS
-- with no permissive policy therefore means: anon and authenticated get
-- nothing, ever, including if a publishable key leaks. Guest names, emails,
-- phone numbers and reservation references live in here; this is the DSGVO
-- baseline, not a nicety.

alter table bolagio_units                enable row level security;
alter table bolagio_unit_integrations    enable row level security;
alter table bolagio_unit_inventory_days  enable row level security;
alter table bolagio_booking_intents      enable row level security;
alter table bolagio_booking_intent_events enable row level security;
alter table bolagio_integration_events   enable row level security;

revoke all on bolagio_units,
              bolagio_unit_integrations,
              bolagio_unit_inventory_days,
              bolagio_booking_intents,
              bolagio_booking_intent_events,
              bolagio_integration_events
  from anon, authenticated;
