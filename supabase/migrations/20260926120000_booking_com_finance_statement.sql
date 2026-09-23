-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — BOOKING.COM FINANCE STATEMENT SETTLEMENTS (2026-09-26)
--
-- The Booking.com Extranet → Finance statement export carries, per
-- reservation, what Booking.com says the stay grossed, what it kept as
-- commission and as payment-service fee, what it paid out net, and under
-- which payout. That is evidence the existing ledger cannot hold on its own:
-- a transaction is ONE economic fact with lines, and a payment is ONE cash
-- movement. A statement line is neither — it is a settlement: gross, two
-- costs and a net, tied to a payout that bundles several reservations.
--
-- ── What is added ─────────────────────────────────────────────────────────
--   bolagio_finance_ota_payouts       one row per payout ID: the ANCHOR a
--                                     future bank receipt reconciles against.
--                                     Totals are never stored here; they are
--                                     summed from the lines (view below).
--   bolagio_finance_ota_settlements   one row per statement line, with its
--                                     signed source values, the normalised
--                                     costs, the local reservation it matched
--                                     (if any), the gross delta against it,
--                                     and the ledger transactions it posted.
--   bolagio_finance_ota_payout_totals view: current lines summed per payout.
--   bolagio_finance_record_ota_settlement(jsonb, text)
--   bolagio_finance_accept_ota_amendment(uuid, text, text)
--
-- ── Authority ─────────────────────────────────────────────────────────────
-- The statement is authoritative for gross, commission, payment-service fee,
-- net and payout. Beds24 stays authoritative for the reservation itself.
-- Nothing here writes `bolagio_reservations`: the local gross is SNAPSHOT
-- beside the statement gross, and a difference is a finding, not a fix.
--
-- ── Cash ──────────────────────────────────────────────────────────────────
-- No payment row is created from a statement. The payout's money is a fact
-- about the bank account, and the bank statement import records it once.
-- `bolagio_finance_ota_payouts.bank_payment_id` is where that receipt will be
-- linked, one bank receipt to one payout group. Recording the payout here
-- as a cash fact as well would count the same euros twice.
--
-- ── Idempotency and amendments ────────────────────────────────────────────
-- A line's LOGICAL identity is (booking number, payout ID, row type); its
-- CONTENT is a SHA-256 over the financial fields. Same identity and content:
-- the same fact seen again in an overlapping export — nothing is written.
-- Same identity, different content: Booking.com amended the line. It is kept
-- beside the original as `conflict`, posts nothing, and waits for a person;
-- accepting it REVERSES the original's ledger postings (never deletes) and
-- makes the amendment current. One current line per identity, enforced.
--
-- ── Personal data ─────────────────────────────────────────────────────────
-- None. The guest name in the file is not a column here and is redacted
-- from the staged raw row before it is stored. Identity is the reservation
-- number. RLS on, no policy, browser roles revoked, as every bolagio_* table.
--
-- Additive: two tables, one view, two functions, one nullable column on
-- bolagio_finance_import_rows, and the WIDENING of the import batch
-- source_type check. Nothing is dropped, narrowed or rewritten. Re-runnable.
-- Rollback: supabase/ops/rollback_20260926.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The import batch may now say where it came from ─────────────────────
do $$ begin
  alter table bolagio_finance_import_batches drop constraint if exists bolagio_finance_import_batches_source_type_check;
  alter table bolagio_finance_import_batches
    add constraint bolagio_finance_import_batches_source_type_check
    check (source_type in ('booking_com_reservations','booking_com_payouts','booking_com_finance_statement','paypal_activity',
                           'bank_csv','supplier_csv','manual_csv','accountant_csv','other'));
end $$;

-- ── 2. Payouts: the anchor, not a cash fact ────────────────────────────────
create table if not exists bolagio_finance_ota_payouts (
  id                     uuid primary key default gen_random_uuid(),
  provider               text not null default 'booking_com' check (provider in ('booking_com')),
  payout_id              text not null check (payout_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  -- A DATE: the export gives no time of day, and none is invented.
  payout_date            date not null,
  currency               char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- The bank receipt this payout arrived as, once the bank statement is
  -- imported and a person (or a later rule) links it. Never set by the
  -- statement import itself.
  bank_payment_id        uuid references bolagio_finance_payments(id) on delete restrict,
  bank_state             text not null default 'awaiting_bank' check (bank_state in ('awaiting_bank','matched','mismatch')),
  bank_matched_at        timestamptz,
  bank_matched_by        text,
  first_import_batch_id  uuid not null references bolagio_finance_import_batches(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (provider, payout_id),
  constraint bolagio_finance_ota_payouts_bank check ((bank_state = 'awaiting_bank') = (bank_payment_id is null))
);

create unique index if not exists bolagio_finance_ota_payouts_bank_uq on bolagio_finance_ota_payouts (bank_payment_id) where bank_payment_id is not null;
create index if not exists bolagio_finance_ota_payouts_date_idx on bolagio_finance_ota_payouts (payout_date desc);
create index if not exists bolagio_finance_ota_payouts_bank_state_idx on bolagio_finance_ota_payouts (bank_state) where bank_state <> 'matched';

comment on table bolagio_finance_ota_payouts is
  'One row per OTA payout ID. Totals are summed from bolagio_finance_ota_settlements (current lines). Not a cash fact: the bank receipt is, linked via bank_payment_id.';

-- ── 3. Settlements: one row per statement line ─────────────────────────────
create table if not exists bolagio_finance_ota_settlements (
  id                                uuid primary key default gen_random_uuid(),
  provider                          text not null default 'booking_com' check (provider in ('booking_com')),
  -- booking_com|<booking number>|<payout id>|<row type>
  identity_key                      text not null check (length(identity_key) between 10 and 200),
  content_sha256                    text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  row_type                          text not null,
  booking_number                    text not null check (booking_number ~ '^[0-9]{6,20}$'),
  payout_id                         text not null,
  payout_date                       date not null,
  check_in                          date not null,
  check_out                         date not null,
  currency                          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- Money, integer cents. Costs are POSITIVE here; the file's own signed
  -- values are kept beside them so the sign convention is never a guess.
  gross_cents                       bigint not null,
  commission_cents                  bigint not null,
  payment_service_fee_cents         bigint not null,
  net_cents                         bigint not null,
  source_commission_cents           bigint not null,
  source_payment_service_fee_cents  bigint not null,
  reservation_status                text not null,
  payment_status                    text,
  payments_service_provider         text,
  -- The local reservation, by exact Booking.com reservation number against
  -- bolagio_reservations.channel_reference. Never by a name.
  reservation_id                    uuid references bolagio_reservations(id) on delete restrict,
  -- Snapshot of the matched reservation's unit, for filtering. Provenance only.
  unit_id                           uuid,
  match_state                       text not null default 'unmatched' check (match_state in ('matched','unmatched','ambiguous')),
  match_candidates                  integer not null default 0 check (match_candidates >= 0),
  -- The local gross AS IT WAS when matched. Neither side overwrites the other.
  local_gross_cents                 bigint,
  local_currency                    char(3),
  gross_delta_cents                 bigint,
  gross_state                       text not null default 'not_applicable' check (gross_state in ('exact','discrepancy','no_local_gross','not_applicable')),
  matched_at                        timestamptz,
  match_rule_version                text,
  amendment_state                   text not null default 'current' check (amendment_state in ('current','conflict','superseded')),
  supersedes_id                     uuid references bolagio_finance_ota_settlements(id) on delete restrict,
  ledger_state                      text not null default 'pending' check (ledger_state in ('pending','posted','not_posted','legacy_posted')),
  revenue_transaction_id            uuid references bolagio_finance_transactions(id) on delete restrict,
  commission_transaction_id         uuid references bolagio_finance_transactions(id) on delete restrict,
  fee_transaction_id                uuid references bolagio_finance_transactions(id) on delete restrict,
  import_batch_id                   uuid not null references bolagio_finance_import_batches(id) on delete restrict,
  import_row_id                     uuid references bolagio_finance_import_rows(id) on delete restrict,
  created_by                        text not null,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  foreign key (provider, payout_id) references bolagio_finance_ota_payouts (provider, payout_id) on delete restrict,
  unique (identity_key, content_sha256),
  constraint bolagio_finance_ota_settlements_identity check (net_cents = gross_cents - commission_cents - payment_service_fee_cents),
  constraint bolagio_finance_ota_settlements_signs check (commission_cents = -source_commission_cents and payment_service_fee_cents = -source_payment_service_fee_cents),
  constraint bolagio_finance_ota_settlements_stay check (check_out > check_in),
  constraint bolagio_finance_ota_settlements_match check ((match_state = 'matched') = (reservation_id is not null)),
  constraint bolagio_finance_ota_settlements_delta check (gross_delta_cents is null or gross_state in ('exact','discrepancy')),
  constraint bolagio_finance_ota_settlements_amend check ((amendment_state = 'conflict') <= (supersedes_id is not null))
);

-- One CURRENT line per logical identity: an amendment can never sit beside
-- its original as a second fact.
create unique index if not exists bolagio_finance_ota_settlements_current_uq
  on bolagio_finance_ota_settlements (identity_key) where amendment_state = 'current';
create index if not exists bolagio_finance_ota_settlements_booking_idx on bolagio_finance_ota_settlements (booking_number);
create index if not exists bolagio_finance_ota_settlements_reservation_idx on bolagio_finance_ota_settlements (reservation_id) where reservation_id is not null;
create index if not exists bolagio_finance_ota_settlements_payout_idx on bolagio_finance_ota_settlements (provider, payout_id);
create index if not exists bolagio_finance_ota_settlements_payout_date_idx on bolagio_finance_ota_settlements (payout_date desc);
create index if not exists bolagio_finance_ota_settlements_checkout_idx on bolagio_finance_ota_settlements (check_out desc);
create index if not exists bolagio_finance_ota_settlements_batch_idx on bolagio_finance_ota_settlements (import_batch_id);
create index if not exists bolagio_finance_ota_settlements_unit_idx on bolagio_finance_ota_settlements (unit_id) where unit_id is not null;
create index if not exists bolagio_finance_ota_settlements_recon_idx on bolagio_finance_ota_settlements (match_state, gross_state) where amendment_state = 'current';
create index if not exists bolagio_finance_ota_settlements_conflict_idx on bolagio_finance_ota_settlements (amendment_state) where amendment_state = 'conflict';

comment on table bolagio_finance_ota_settlements is
  'OTA finance-statement lines (Booking.com): gross, commission, payment-service fee, net, payout. Authoritative for those amounts only. No guest personal data. Financial columns immutable; amendments are new rows.';
comment on column bolagio_finance_ota_settlements.commission_cents is 'Commission as a positive cost. The file signs it negative: see source_commission_cents.';
comment on column bolagio_finance_ota_settlements.local_gross_cents is 'bolagio_reservations.total_amount_cents at match time. A snapshot: the reservation is never written.';
comment on column bolagio_finance_ota_settlements.gross_delta_cents is 'Statement gross − local gross.';

alter table bolagio_finance_import_rows add column if not exists settlement_id uuid references bolagio_finance_ota_settlements(id) on delete restrict;

-- ── 4. Triggers: touch, immutability, no delete ────────────────────────────
do $$ declare t text; begin
  foreach t in array array['bolagio_finance_ota_payouts','bolagio_finance_ota_settlements'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function bolagio_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

create or replace function bolagio_finance_ota_settlement_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'settlement lines are never deleted; an amendment supersedes them' using errcode = 'BLG20';
  end if;
  if row(new.provider, new.identity_key, new.content_sha256, new.row_type, new.booking_number, new.payout_id, new.payout_date,
         new.check_in, new.check_out, new.currency, new.gross_cents, new.commission_cents, new.payment_service_fee_cents, new.net_cents,
         new.source_commission_cents, new.source_payment_service_fee_cents, new.reservation_status, new.payment_status,
         new.payments_service_provider, new.supersedes_id, new.import_batch_id, new.import_row_id, new.created_by, new.created_at)
     is distinct from
     row(old.provider, old.identity_key, old.content_sha256, old.row_type, old.booking_number, old.payout_id, old.payout_date,
         old.check_in, old.check_out, old.currency, old.gross_cents, old.commission_cents, old.payment_service_fee_cents, old.net_cents,
         old.source_commission_cents, old.source_payment_service_fee_cents, old.reservation_status, old.payment_status,
         old.payments_service_provider, old.supersedes_id, old.import_batch_id, old.import_row_id, old.created_by, old.created_at) then
    raise exception 'settlement line % is evidence and immutable; import the amended line instead', old.id using errcode = 'BLG20';
  end if;
  if new.amendment_state is distinct from old.amendment_state
     and coalesce(current_setting('bolagio.ota_amendment', true), '') <> 'yes' then
    raise exception 'amendment state changes only through bolagio_finance_accept_ota_amendment' using errcode = 'BLG20';
  end if;
  -- A posted ledger link is never cleared or re-pointed.
  if (old.revenue_transaction_id is not null and new.revenue_transaction_id is distinct from old.revenue_transaction_id)
     or (old.commission_transaction_id is not null and new.commission_transaction_id is distinct from old.commission_transaction_id)
     or (old.fee_transaction_id is not null and new.fee_transaction_id is distinct from old.fee_transaction_id) then
    raise exception 'ledger links of settlement % are fixed once set', old.id using errcode = 'BLG20';
  end if;
  return new;
end $$;

drop trigger if exists bolagio_finance_ota_settlement_guard on bolagio_finance_ota_settlements;
create trigger bolagio_finance_ota_settlement_guard before update or delete on bolagio_finance_ota_settlements
  for each row execute function bolagio_finance_ota_settlement_guard();

create or replace function bolagio_finance_ota_payout_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payouts are never deleted' using errcode = 'BLG20';
  end if;
  if row(new.provider, new.payout_id, new.payout_date, new.currency, new.first_import_batch_id, new.created_at)
     is distinct from row(old.provider, old.payout_id, old.payout_date, old.currency, old.first_import_batch_id, old.created_at) then
    raise exception 'payout % identity is immutable', old.payout_id using errcode = 'BLG20';
  end if;
  return new;
end $$;

drop trigger if exists bolagio_finance_ota_payout_guard on bolagio_finance_ota_payouts;
create trigger bolagio_finance_ota_payout_guard before update or delete on bolagio_finance_ota_payouts
  for each row execute function bolagio_finance_ota_payout_guard();

-- ── 5. Record a line: idempotent, amendment-aware, atomic ──────────────────
--
-- Returns {ok, outcome, id, ledger_state}, outcome one of
--   created     a new logical line; ledger_state 'pending' until posted
--   duplicate   the same line (identity AND content) exists; nothing written
--   amendment   the identity exists as current with different content; the
--               new content is kept as `conflict`, superseding nothing yet
-- Raises BLG21 when the payout ID is already recorded with another date or
-- currency: a payout is one transfer, and two dates for it is not a guess
-- this function makes.
create or replace function bolagio_finance_record_ota_settlement(p_row jsonb, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_identity text := p_row->>'identity_key';
  v_existing bolagio_finance_ota_settlements;
  v_current  bolagio_finance_ota_settlements;
  v_payout   bolagio_finance_ota_payouts;
  v_id uuid;
  v_state text;
begin
  if coalesce(v_identity, '') = '' then raise exception 'identity_key is required' using errcode = 'BLG20'; end if;
  -- Two commits of overlapping files serialise on the identity, not on the table.
  perform pg_advisory_xact_lock(hashtextextended('bolagio_ota_settlement:' || v_identity, 0));

  select * into v_existing from bolagio_finance_ota_settlements
   where identity_key = v_identity and content_sha256 = p_row->>'content_sha256';
  if found then
    return jsonb_build_object('ok', true, 'outcome', 'duplicate', 'id', v_existing.id, 'ledger_state', v_existing.ledger_state, 'amendment_state', v_existing.amendment_state);
  end if;

  insert into bolagio_finance_ota_payouts (provider, payout_id, payout_date, currency, first_import_batch_id)
  values (coalesce(p_row->>'provider', 'booking_com'), p_row->>'payout_id', (p_row->>'payout_date')::date, p_row->>'currency', (p_row->>'import_batch_id')::uuid)
  on conflict (provider, payout_id) do nothing;
  select * into v_payout from bolagio_finance_ota_payouts where provider = coalesce(p_row->>'provider', 'booking_com') and payout_id = p_row->>'payout_id';
  if v_payout.payout_date <> (p_row->>'payout_date')::date or v_payout.currency <> p_row->>'currency' then
    raise exception 'payout % is recorded for % %, this line says % %', v_payout.payout_id, v_payout.payout_date, v_payout.currency, p_row->>'payout_date', p_row->>'currency'
      using errcode = 'BLG21';
  end if;

  select * into v_current from bolagio_finance_ota_settlements where identity_key = v_identity and amendment_state = 'current';
  v_state := case when found then 'conflict' else 'current' end;

  insert into bolagio_finance_ota_settlements (
    provider, identity_key, content_sha256, row_type, booking_number, payout_id, payout_date, check_in, check_out, currency,
    gross_cents, commission_cents, payment_service_fee_cents, net_cents, source_commission_cents, source_payment_service_fee_cents,
    reservation_status, payment_status, payments_service_provider,
    reservation_id, unit_id, match_state, match_candidates, local_gross_cents, local_currency, gross_delta_cents, gross_state, matched_at, match_rule_version,
    amendment_state, supersedes_id, ledger_state, import_batch_id, import_row_id, created_by)
  values (
    coalesce(p_row->>'provider', 'booking_com'), v_identity, p_row->>'content_sha256', p_row->>'row_type', p_row->>'booking_number',
    p_row->>'payout_id', (p_row->>'payout_date')::date, (p_row->>'check_in')::date, (p_row->>'check_out')::date, p_row->>'currency',
    (p_row->>'gross_cents')::bigint, (p_row->>'commission_cents')::bigint, (p_row->>'payment_service_fee_cents')::bigint, (p_row->>'net_cents')::bigint,
    (p_row->>'source_commission_cents')::bigint, (p_row->>'source_payment_service_fee_cents')::bigint,
    left(p_row->>'reservation_status', 40), left(p_row->>'payment_status', 40), left(p_row->>'payments_service_provider', 120),
    (p_row->>'reservation_id')::uuid, (p_row->>'unit_id')::uuid, coalesce(p_row->>'match_state', 'unmatched'), coalesce((p_row->>'match_candidates')::integer, 0),
    (p_row->>'local_gross_cents')::bigint, p_row->>'local_currency', (p_row->>'gross_delta_cents')::bigint, coalesce(p_row->>'gross_state', 'not_applicable'),
    case when p_row->>'match_state' is null then null else now() end, p_row->>'match_rule_version',
    v_state, case when v_state = 'conflict' then v_current.id else null end, case when v_state = 'conflict' then 'not_posted' else 'pending' end,
    (p_row->>'import_batch_id')::uuid, (p_row->>'import_row_id')::uuid, left(p_actor, 200))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'outcome', case when v_state = 'conflict' then 'amendment' else 'created' end, 'id', v_id,
    'ledger_state', case when v_state = 'conflict' then 'not_posted' else 'pending' end, 'supersedes_id', v_current.id);
end $$;

-- ── 6. Accept an amendment: reverse, supersede, promote — in one transaction
--
-- The original's posted ledger transactions are REVERSED through the ledger's
-- own reversal function (never deleted, never edited), the original becomes
-- `superseded`, the amendment becomes `current` with ledger_state 'pending'.
-- The caller then posts the amendment's ledger facts under their own keys.
-- A reason is required and lands on every reversal.
create or replace function bolagio_finance_accept_ota_amendment(p_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_new bolagio_finance_ota_settlements;
  v_old bolagio_finance_ota_settlements;
  v_tx uuid;
  v_res jsonb;
  v_reversals jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'accepting an amendment needs a reason' using errcode = 'BLG20'; end if;
  select * into v_new from bolagio_finance_ota_settlements where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_new.amendment_state <> 'conflict' then return jsonb_build_object('ok', false, 'code', 'NOT_AN_AMENDMENT', 'state', v_new.amendment_state); end if;
  perform pg_advisory_xact_lock(hashtextextended('bolagio_ota_settlement:' || v_new.identity_key, 0));
  select * into v_old from bolagio_finance_ota_settlements where identity_key = v_new.identity_key and amendment_state = 'current' for update;
  if not found or v_old.id <> v_new.supersedes_id then
    return jsonb_build_object('ok', false, 'code', 'STALE', 'detail', 'the line this amendment supersedes is no longer current');
  end if;

  foreach v_tx in array array[v_old.revenue_transaction_id, v_old.commission_transaction_id, v_old.fee_transaction_id] loop
    continue when v_tx is null;
    if exists (select 1 from bolagio_finance_transactions where id = v_tx and status = 'posted') then
      v_res := bolagio_finance_reverse_transaction(v_tx, 'Booking.com statement amendment: ' || p_reason, p_actor, null);
      v_reversals := v_reversals || jsonb_build_array(v_res);
    end if;
  end loop;

  perform set_config('bolagio.ota_amendment', 'yes', true);
  update bolagio_finance_ota_settlements set amendment_state = 'superseded' where id = v_old.id;
  update bolagio_finance_ota_settlements set amendment_state = 'current', ledger_state = 'pending' where id = v_new.id;
  perform set_config('bolagio.ota_amendment', '', true);

  return jsonb_build_object('ok', true, 'superseded_id', v_old.id, 'current_id', v_new.id, 'reversals', v_reversals);
end $$;

-- ── 7. Payout totals, from current lines only ──────────────────────────────
create or replace view bolagio_finance_ota_payout_totals as
select p.id, p.provider, p.payout_id, p.payout_date, p.currency, p.bank_state, p.bank_payment_id,
       count(s.id)                                   as lines,
       coalesce(sum(s.gross_cents), 0)               as gross_cents,
       coalesce(sum(s.commission_cents), 0)          as commission_cents,
       coalesce(sum(s.payment_service_fee_cents), 0) as payment_service_fee_cents,
       coalesce(sum(s.net_cents), 0)                 as net_cents,
       count(s.id) filter (where s.match_state = 'matched')   as matched,
       count(s.id) filter (where s.match_state = 'unmatched') as unmatched,
       count(s.id) filter (where s.match_state = 'ambiguous') as ambiguous,
       count(s.id) filter (where s.gross_state = 'discrepancy') as discrepancies
from bolagio_finance_ota_payouts p
left join bolagio_finance_ota_settlements s
  on s.provider = p.provider and s.payout_id = p.payout_id and s.amendment_state = 'current'
group by p.id;

-- ── 8. Security: deny the browser everything ───────────────────────────────
do $$ declare t text; begin
  foreach t in array array['bolagio_finance_ota_payouts','bolagio_finance_ota_settlements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
  execute 'revoke all on bolagio_finance_ota_payout_totals from anon, authenticated';
end $$;

do $$ declare fn text; begin
  foreach fn in array array[
    'bolagio_finance_record_ota_settlement(jsonb,text)',
    'bolagio_finance_accept_ota_amendment(uuid,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array array['bolagio_finance_ota_settlement_guard()', 'bolagio_finance_ota_payout_guard()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end $$;
