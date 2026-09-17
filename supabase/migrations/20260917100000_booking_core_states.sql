-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — booking core, part 1 of 2: the state vocabulary.
--
-- This migration does ONE thing: it adds enum values. It is separate from the
-- rest of the hardening for a hard PostgreSQL reason — a value added to an
-- enum with `alter type … add value` cannot be USED (in a check, a constraint
-- predicate, a default or a function body that is parsed eagerly) until the
-- transaction that added it has committed. Supabase runs each migration file
-- in its own transaction, so the tables and constraints that reference these
-- values live in `20260917110000_booking_core_hardening.sql`.
--
-- Splitting it is not tidiness. Merging it produces
--   ERROR: unsafe use of new value "locking" of enum type bolagio_booking_status
-- on a fresh database, which means the migration only ever works on a database
-- that already had the values — the worst possible failure mode.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Booking intent states ──────────────────────────────────────────────────
--
-- The 2026-09-16 foundation shipped nine states. Thirteen more are added here.
-- Nothing is renamed and nothing is removed: `hold_created` keeps its meaning
-- (inventory is blocked at Beds24 and the guest has not paid), which is
-- exactly the "held" state the architecture calls for.
--
-- Read the full machine in docs/booking-state-machine.md.

alter type bolagio_booking_status add value if not exists 'locking';
alter type bolagio_booking_status add value if not exists 'hold_failed';
alter type bolagio_booking_status add value if not exists 'payment_session_created';
alter type bolagio_booking_status add value if not exists 'awaiting_payment';
alter type bolagio_booking_status add value if not exists 'payment_cancelled';
alter type bolagio_booking_status add value if not exists 'quote_expired';
alter type bolagio_booking_status add value if not exists 'unavailable';
alter type bolagio_booking_status add value if not exists 'finalizing';
alter type bolagio_booking_status add value if not exists 'paid_unfinalized';
alter type bolagio_booking_status add value if not exists 'finalization_failed';
alter type bolagio_booking_status add value if not exists 'releasing';
alter type bolagio_booking_status add value if not exists 'released';
alter type bolagio_booking_status add value if not exists 'release_failed';
alter type bolagio_booking_status add value if not exists 'manual_review';

-- ── Payment state ──────────────────────────────────────────────────────────
--
-- Modelled SEPARATELY from the reservation, because the two genuinely diverge.
-- The combination that makes this necessary is:
--
--     payment_status = 'paid'   AND   status = 'paid_unfinalized'
--
-- — the guest's money is ours and the channel manager has not been told. A
-- single status column cannot express that, and a system that cannot express
-- it will eventually resolve it by guessing.
do $$ begin
  create type bolagio_payment_status as enum (
    'not_created',        -- no provider order exists
    'order_created',      -- provider order exists, guest has not approved
    'approved',           -- guest approved at the provider, not captured
    'capture_pending',    -- capture requested, provider says PENDING
    'paid',               -- capture COMPLETED. The only state that means money
    'denied',             -- provider refused the capture
    'cancelled',          -- guest abandoned at the provider
    'refunded',
    'partially_refunded',
    'disputed',
    -- An operation whose outcome we could not determine. NEVER treated as
    -- either paid or unpaid; it is a reconciliation input.
    'unknown'
  );
exception when duplicate_object then null; end $$;

-- ── Provider-side vocabulary for tracked external mutations ────────────────

do $$ begin
  create type bolagio_external_provider as enum ('beds24', 'paypal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bolagio_operation_outcome as enum (
    'in_flight',       -- request sent, no answer yet
    'succeeded',
    'failed',          -- the provider answered, and the answer was "no"
    -- The important one. The request may or may not have taken effect: a
    -- timeout, a dropped connection, a 5xx after a POST. It is NOT 'failed'
    -- and must never be retried blind.
    'outcome_unknown',
    'reconciled'       -- an outcome_unknown that a later read resolved
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type bolagio_job_status as enum (
    'pending', 'claimed', 'succeeded', 'failed', 'exhausted', 'resolved'
  );
exception when duplicate_object then null; end $$;
