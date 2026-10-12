-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — SHARED-PROJECT PREFLIGHT. Read-only. Run with psql BEFORE applying
-- a BoLaGio migration to the Supabase project BoLaGio shares with Cogniiq
-- ("ALL IN ONE"):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_preflight.sql
--
-- psql only (it uses \echo, \set and \pset); not for the Dashboard SQL editor.
--
-- Exit status is the verdict:
--   0  every check passed or is informational: the next migration may be applied
--   ≠0 a COLLISION, a missing prerequisite or a half-applied chain — stop,
--      read the message, apply nothing
--
-- It changes nothing: no DDL, no DML, no temporary object, no setting that
-- outlives the session.
--
-- ── The chain it knows (supabase/migrations, in order) ────────────────────
--    #1  20260916120000_booking_foundation
--    #2  20260917100000_booking_core_states
--    #3  20260917110000_booking_core_hardening
--    #4  20260919120000_admin_operators
--    #5  20260920120000_booking_production_hardening
--    #6  20260921120000_platform_completion
--    #7  20260922120000_finance_foundation
--    #8  20260923120000_reservation_import
--    #9  20260924120000_guest_privileges
--   #10  20260925120000_legal_compliance
--   #11  20260926120000_booking_com_finance_statement
--   #12  20260927120000_finance_ingestion_pipeline      ← the next one
--   #13  20261012120000_booking_bedroom_package        ← after #12 (one column, two checks)
--
-- On ALL IN ONE (checked read-only 2026-09-26/27) #1–#11 are applied and #12
-- is not. This script REQUIRES #1–#11 and reports #12 either way: it passes
-- before #12 (the state to apply it in) and after #12 (re-running it is how
-- the post-migration state is confirmed collision-free).
--
-- ── Sections ──────────────────────────────────────────────────────────────
--   §1  server version (15+: #12 creates security_invoker views)
--   §2  roles the migrations grant to; authenticator can switch to service_role
--   §3  which of the twelve migrations are applied; #1–#11 required, in order
--   §4  #12 prerequisites: every table, column, index and type it reads
--   §5  #12 names: absent, or (re-run) exactly #12's own objects
--   §6  existing BoLaGio data (counts only, nothing read beyond counts)
--   §7  NAME COLLISIONS: every bolagio_* relation, type, function and schema
--       must be one the chain creates (#1–#12, by exact signature). Legitimate
--       Finance / reservation / privilege objects are expected, not flagged.
--   §8  the tables each migration touches (all bolagio_*)
--   §9  default privileges for browser roles in public (informational)
--   §10 blast-radius record: unrelated (Cogniiq/legacy) tables, printed only
--   §11 RLS / policy / grant posture of every bolagio_* table (printed)
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset format aligned
\pset pager off
\pset null '∅'
set client_min_messages = notice;

\echo ''
\echo '── 1. Server ───────────────────────────────────────────────────────────'
select 'postgres_version' as check_name, current_setting('server_version') as actual, '15 or newer (#12 uses security_invoker views)' as expected;
select 'btree_gist' as check_name,
       coalesce((select extversion from pg_extension where extname = 'btree_gist'), 'ABSENT') as actual,
       'installed (#1 created it)' as expected;
do $$ begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PREFLIGHT FAILED: PostgreSQL 15 or newer is required for #12 (security_invoker views); found %', current_setting('server_version');
  end if;
end $$;

\echo ''
\echo '── 2. Roles ────────────────────────────────────────────────────────────'
select r as role, case when exists (select 1 from pg_roles where rolname = r) then 'present' else 'MISSING' end as actual
from unnest(array['anon','authenticated','service_role','authenticator']) r;
do $$ declare missing text; begin
  select string_agg(r, ', ') into missing from unnest(array['anon','authenticated','service_role','authenticator']) r
   where not exists (select 1 from pg_roles where rolname = r);
  if missing is not null then
    raise exception 'PREFLIGHT FAILED: role(s) % missing — this is not a Supabase project', missing;
  end if;
  if not exists (select 1 from pg_auth_members m join pg_roles a on a.oid = m.member join pg_roles s on s.oid = m.roleid
                 where a.rolname = 'authenticator' and s.rolname = 'service_role') then
    raise exception 'PREFLIGHT FAILED: authenticator cannot switch to service_role — the application (service-role JWT) could not reach the tables';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'PREFLIGHT FAILED: service_role does not bypass RLS — every bolagio_ table is RLS-on with no policy, so the application would read nothing';
  end if;
end $$;

\echo ''
\echo '── 3. Which BoLaGio migrations are applied ────────────────────────────'
-- One marker per migration: an object that migration and no other creates.
-- Listed and checked in one block, so the two can never disagree and nothing
-- (not even a temporary object) is created.
do $$
declare
  r record; missing text := ''; gap text := ''; first_missing int := null; twelve boolean := false; thirteen boolean := false;
begin
  for r in
    select * from (values
  (1,  '20260916120000_booking_foundation',            to_regclass('public.bolagio_booking_intents') is not null),
  (2,  '20260917100000_booking_core_states',           exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'bolagio_booking_status' and e.enumlabel = 'locking')),
  (3,  '20260917110000_booking_core_hardening',        to_regclass('public.bolagio_outbox_events') is not null and to_regprocedure('public.bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null),
  (4,  '20260919120000_admin_operators',               to_regclass('public.bolagio_operators') is not null),
  (5,  '20260920120000_booking_production_hardening',  to_regclass('public.bolagio_scheduler_runs') is not null and to_regprocedure('public.bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null),
  (6,  '20260921120000_platform_completion',           to_regclass('public.bolagio_message_deliveries') is not null and to_regprocedure('public.bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null),
  (7,  '20260922120000_finance_foundation',            to_regclass('public.bolagio_finance_transactions') is not null and to_regprocedure('public.bolagio_finance_post_transaction(jsonb,jsonb,text)') is not null),
  (8,  '20260923120000_reservation_import',            to_regclass('public.bolagio_reservations') is not null),
  (9,  '20260924120000_guest_privileges',              to_regclass('public.bolagio_guest_identities') is not null and to_regclass('public.bolagio_privilege_redemptions') is not null),
  (10, '20260925120000_legal_compliance',              exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_booking_intents' and column_name = 'terms_evidence')
                                                       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_guest_identities' and column_name = 'marketing_consent_confirmed_at')),
  (11, '20260926120000_booking_com_finance_statement', to_regclass('public.bolagio_finance_ota_settlements') is not null and to_regprocedure('public.bolagio_finance_record_ota_settlement(jsonb,text)') is not null),
  (12, '20260927120000_finance_ingestion_pipeline',    to_regclass('public.bolagio_finance_ingestion_queue') is not null
                                                       and exists (select 1 from pg_trigger where tgname = 'bolagio_booking_intents_finance_enqueue')),
  (13, '20261012120000_booking_bedroom_package',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_booking_intents' and column_name = 'beds24_offer_id')
                                                       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_reservations' and column_name = 'bedroom_package'))
) as c(n, migration, applied)
    order by n
  loop
    raise notice '#%  %  %  (expected: %)', lpad(r.n::text, 2), rpad(r.migration, 45), case when r.applied then 'applied    ' else 'NOT applied' end,
      case when r.n <= 11 then 'applied' when r.n = 12 then 'applied or not — the next migration' else 'applied or not — after #12' end;
    if r.n <= 11 and not r.applied then missing := missing || format(' #%s %s', r.n, r.migration); end if;
    if not r.applied and first_missing is null then first_missing := r.n; end if;
    if r.applied and first_missing is not null then gap := gap || format(' #%s without #%s;', r.n, first_missing); end if;
    if r.n = 12 then twelve := r.applied; end if;
    if r.n = 13 then thirteen := r.applied; end if;
  end loop;
  if gap <> '' then
    raise exception 'PREFLIGHT FAILED: the chain is out of order (%). Restore from backup or finish it by hand, in order.', gap;
  end if;
  if missing <> '' then
    raise exception 'PREFLIGHT FAILED: #12 (20260927) requires #1–#11; not applied:%. Apply them in order first (docs/supabase-migration-runbook.md).', missing;
  end if;
  if twelve then
    raise notice 'ok — #1–#12 all applied: this run confirms the post-migration state (re-applying #12 is idempotent)';
  else
    raise notice 'ok — #1–#11 applied, #12 not applied: the state #12 is written for';
  end if;
  -- #13 is reported separately so the #12 statements above keep their meaning.
  if thirteen then
    raise notice 'ok — #13 bedroom package applied (re-applying it is idempotent)';
  else
    raise notice 'info — #13 bedroom package not applied: apply it after #12';
  end if;
end $$;

\echo ''
\echo '── 3b. #13 prerequisites and names (20261012 bedroom package) ─────────'
do $$ begin
  -- #13 adds nullable columns to bolagio_booking_intents and bolagio_reservations
  -- (#1, #8), and CHECK constraints, one of which reads adults + children.
  if to_regclass('public.bolagio_reservations') is null then
    raise exception 'PREFLIGHT FAILED: #13 extends bolagio_reservations, which does not exist (#8 not applied)';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_booking_intents'
       and column_name in ('adults', 'children')) <> 2 then
    raise exception 'PREFLIGHT FAILED: #13 reads bolagio_booking_intents.adults and .children, which do not both exist';
  end if;
  -- A column or constraint already carrying a #13 name must be #13's own shape.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_booking_intents'
               and column_name = 'bedroom_package' and data_type <> 'text') then
    raise exception 'PREFLIGHT FAILED: bolagio_booking_intents.bedroom_package exists with a type #13 did not create. Inspect it; do not apply #13 over it.';
  end if;
  if exists (select 1 from pg_constraint where conname in ('bolagio_intent_bedroom_package_value', 'bolagio_intent_bedroom_package_party')
               and conrelid <> 'public.bolagio_booking_intents'::regclass) then
    raise exception 'PREFLIGHT FAILED: a #13 constraint name is used on another table';
  end if;
  -- Existing rows must satisfy the party rule, or adding the constraint fails mid-migration.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_booking_intents' and column_name = 'bedroom_package') then
    if exists (select 1 from bolagio_booking_intents where bedroom_package = 'one_bedroom' and adults + children > 2) then
      raise exception 'PREFLIGHT FAILED: existing intents violate #13''s one_bedroom party rule';
    end if;
  end if;
  raise notice 'ok — #13 prerequisites present and its names are free or its own';
end $$;

\echo ''
\echo '── 4. #12 prerequisites (what 20260927 reads, joins and triggers on) ───'
do $$
declare
  -- table.column pairs #12's triggers, views and functions reference.
  needed constant text[] := array[
    'bolagio_booking_intents.id','bolagio_booking_intents.reference','bolagio_booking_intents.status','bolagio_booking_intents.payment_status',
    'bolagio_booking_intents.payment_order_id','bolagio_booking_intents.payment_capture_id','bolagio_booking_intents.paid_amount_cents',
    'bolagio_booking_intents.quoted_total_cents','bolagio_booking_intents.refund_state','bolagio_booking_intents.refund_id',
    'bolagio_booking_intents.refunded_amount_cents','bolagio_booking_intents.updated_at',
    'bolagio_payment_events.id','bolagio_payment_events.event_type','bolagio_payment_events.verification','bolagio_payment_events.capture_id',
    'bolagio_payment_events.order_id','bolagio_payment_events.reference','bolagio_payment_events.amount_cents','bolagio_payment_events.currency',
    'bolagio_payment_events.event_time','bolagio_payment_events.received_at','bolagio_payment_events.status',
    'bolagio_finance_transactions.source_system','bolagio_finance_transactions.source_reference','bolagio_finance_transactions.kind',
    'bolagio_finance_payments.source','bolagio_finance_payments.provider_reference',
    'bolagio_finance_import_batches.status','bolagio_finance_import_batches.valid_rows',
    'bolagio_finance_ota_settlements.amendment_state','bolagio_finance_ota_settlements.ledger_state','bolagio_finance_ota_settlements.match_state',
    'bolagio_reservations.last_synced_at',
    'bolagio_scheduler_runs.job','bolagio_scheduler_runs.ok','bolagio_scheduler_runs.finished_at'];
  missing text;
begin
  select string_agg(x, ', ') into missing from unnest(needed) x
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = split_part(x, '.', 1) and column_name = split_part(x, '.', 2));
  if missing is not null then
    raise exception 'PREFLIGHT FAILED: #12 reads columns that do not exist: %', missing;
  end if;
  raise notice 'ok — all % columns #12 reads exist', array_length(needed, 1);

  -- The enum values #12's trigger and views test (as text, so a missing value would silently never match).
  select string_agg(v, ', ') into missing from unnest(array['confirmed','paid','paid_unfinalized','finalizing','finalization_failed']) v
   where not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'bolagio_booking_status' and e.enumlabel = v);
  if missing is not null then raise exception 'PREFLIGHT FAILED: bolagio_booking_status lacks %', missing; end if;
  select string_agg(v, ', ') into missing from unnest(array['paid','partially_refunded','refunded','disputed']) v
   where not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'bolagio_payment_status' and e.enumlabel = v);
  if missing is not null then raise exception 'PREFLIGHT FAILED: bolagio_payment_status lacks %', missing; end if;
  select string_agg(v, ', ') into missing from unnest(array['pending','claimed','failed']) v
   where not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'bolagio_job_status' and e.enumlabel = v);
  if missing is not null then raise exception 'PREFLIGHT FAILED: bolagio_job_status lacks %', missing; end if;
  raise notice 'ok — the status values #12 tests exist in their enums';

  -- The lookups the gap view makes on every scheduled pass must be indexed.
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indrelid
                  where c.relname = 'bolagio_finance_payments' and i.indisunique
                    and pg_get_indexdef(i.indexrelid) ~ '\(source, provider_reference\)') then
    raise exception 'PREFLIGHT FAILED: bolagio_finance_payments has no unique (source, provider_reference) index (#7 creates it)';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indrelid
                  where c.relname = 'bolagio_finance_transactions' and i.indisunique
                    and pg_get_indexdef(i.indexrelid) ~ '\(source_system, source_reference\)') then
    raise exception 'PREFLIGHT FAILED: bolagio_finance_transactions has no unique (source_system, source_reference) index (#7 creates it)';
  end if;
  raise notice 'ok — the finance idempotency keys #12 relies on are unique indexes';

  -- The trigger #12 adds sits beside the existing touch and status-guard triggers.
  if not exists (select 1 from pg_trigger where tgname = 'bolagio_booking_intents_touch') then
    raise exception 'PREFLIGHT FAILED: bolagio_booking_intents has no updated_at touch trigger; the ledger-lag measure of #12 depends on updated_at';
  end if;
  raise notice 'ok — bolagio_booking_intents.updated_at is maintained by its touch trigger';
end $$;

\echo ''
\echo '── 5. #12 names: absent, or exactly #12''s own objects ──────────────────'
do $$
declare
  queue regclass := to_regclass('public.bolagio_finance_ingestion_queue');
  cols text;
begin
  if queue is null then
    if exists (select 1 from pg_trigger where tgname in ('bolagio_booking_intents_finance_enqueue','bolagio_payment_events_finance_enqueue')) then
      raise exception 'PREFLIGHT FAILED: a #12 trigger exists without the #12 queue table: a half-applied #12 or a foreign object — run supabase/ops/rollback_20260927.sql or inspect by hand';
    end if;
    raise notice 'ok — none of #12''s names is taken; it will create them';
    return;
  end if;
  -- Present: it must be #12's own table, not something that happens to share the name
  -- (the migration's CREATE TABLE IF NOT EXISTS would otherwise adopt it silently).
  select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'bolagio_finance_ingestion_queue';
  if cols is distinct from 'intent_id:uuid,state:text,reason:text,enqueued_at:timestamp with time zone,next_attempt_at:timestamp with time zone,attempts:integer,claimed_at:timestamp with time zone,claimed_by:text,processed_at:timestamp with time zone,last_error:text,updated_at:timestamp with time zone' then
    raise exception 'PREFLIGHT FAILED: public.bolagio_finance_ingestion_queue exists with a shape #12 did not create (%). Inspect it; do not apply #12 over it.', cols;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = queue and contype = 'f' and confrelid = 'public.bolagio_booking_intents'::regclass) then
    raise exception 'PREFLIGHT FAILED: bolagio_finance_ingestion_queue does not reference bolagio_booking_intents — not #12''s table';
  end if;
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgname = 'bolagio_booking_intents_finance_enqueue' and p.proname = 'bolagio_finance_enqueue_on_intent')
     or not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgname = 'bolagio_payment_events_finance_enqueue' and p.proname = 'bolagio_finance_enqueue_on_payment_event') then
    raise exception 'PREFLIGHT FAILED: #12''s queue exists but its triggers are missing or call other functions: a half-applied #12 — re-apply it, or roll it back with supabase/ops/rollback_20260927.sql';
  end if;
  raise notice 'ok — #12''s objects are present and are #12''s own (re-run after the migration)';
end $$;

\echo ''
\echo '── 6. Existing BoLaGio data (counts only) ─────────────────────────────'
do $$
declare v bigint; t text;
begin
  foreach t in array array['bolagio_units','bolagio_booking_intents','bolagio_payment_events','bolagio_reservations',
                           'bolagio_finance_transactions','bolagio_finance_payments','bolagio_finance_import_batches',
                           'bolagio_finance_ota_settlements','bolagio_scheduler_runs'] loop
    if to_regclass('public.' || t) is null then
      raise notice '%: table absent', t;
    else
      execute format('select count(*) from public.%I', t) into v;
      raise notice '%: % rows', t, v;
    end if;
  end loop;
  execute $q$select count(*) from public.bolagio_external_operations where outcome = 'outcome_unknown'$q$ into v;
  raise notice 'external operations with outcome_unknown (reconcile first if > 0): %', v;
  execute $q$select count(*) from public.bolagio_payment_events where verification = 'verified' and status in ('pending','claimed','failed')$q$ into v;
  raise notice 'verified payment events not yet processed (informational; #12 does not process them): %', v;
end $$;

\echo ''
\echo '── 7. NAME COLLISIONS — bolagio_* objects the chain does not create ────'
-- The exact object set of #1–#11, taken from a database built from the
-- migration files and identical to ALL IN ONE's catalog on 2026-09-27, plus
-- #12's objects (so this passes before and after #12). Anything else named
-- bolagio_* exists for another reason and would collide.
do $$
declare
  expected_tables constant text[] := array[
    'bolagio_admin_audit_log', 'bolagio_booking_intent_events', 'bolagio_booking_intents',
    'bolagio_external_operations', 'bolagio_finance_accounts', 'bolagio_finance_assets',
    'bolagio_finance_categories', 'bolagio_finance_counterparties', 'bolagio_finance_document_links',
    'bolagio_finance_documents', 'bolagio_finance_exports', 'bolagio_finance_import_batches',
    'bolagio_finance_import_rows', 'bolagio_finance_invoice_lines', 'bolagio_finance_invoices',
    'bolagio_finance_ota_payouts', 'bolagio_finance_ota_settlements', 'bolagio_finance_overrides',
    'bolagio_finance_payments', 'bolagio_finance_periods', 'bolagio_finance_policy',
    'bolagio_finance_reconciliations', 'bolagio_finance_reserves', 'bolagio_finance_tax_adjustments',
    'bolagio_finance_tax_codes', 'bolagio_finance_tax_estimates', 'bolagio_finance_tax_notice_dues',
    'bolagio_finance_tax_notices', 'bolagio_finance_tax_payments', 'bolagio_finance_tax_periods',
    'bolagio_finance_tax_rates', 'bolagio_finance_transaction_lines', 'bolagio_finance_transactions',
    'bolagio_finance_turnover_costs', 'bolagio_guest_events', 'bolagio_guest_identities',
    'bolagio_integration_events', 'bolagio_integration_health', 'bolagio_invoice_sequences',
    'bolagio_message_deliveries', 'bolagio_minibar_movements', 'bolagio_minibar_products',
    'bolagio_operators', 'bolagio_outbox_events', 'bolagio_payment_events', 'bolagio_privilege_campaigns',
    'bolagio_privilege_grants', 'bolagio_privilege_redemptions', 'bolagio_reconciliation_jobs',
    'bolagio_reservations', 'bolagio_scheduler_runs', 'bolagio_turnover_events', 'bolagio_turnovers',
    'bolagio_unit_integrations', 'bolagio_unit_inventory_days', 'bolagio_units',
    -- #12
    'bolagio_finance_ingestion_queue'];
  expected_views constant text[] := array[
    'bolagio_finance_cash_monthly', 'bolagio_finance_exception_counts', 'bolagio_finance_ledger_lines',
    'bolagio_finance_ota_payout_totals', 'bolagio_finance_pl_monthly', 'bolagio_finance_unit_monthly',
    'bolagio_finance_vat_monthly', 'bolagio_minibar_stock', 'bolagio_ops_attention', 'bolagio_ops_queues',
    'bolagio_scheduler_status',
    -- #12
    'bolagio_finance_refund_events', 'bolagio_finance_ingestion_gaps', 'bolagio_finance_pipeline_status'];
  expected_types constant text[] := array[
    'bolagio_booking_source','bolagio_booking_status','bolagio_external_provider','bolagio_integration_provider','bolagio_job_status',
    'bolagio_operation_outcome','bolagio_payment_provider','bolagio_payment_status','bolagio_reservation_class','bolagio_reservation_source'];
  expected_functions constant text[] := array[
    'bolagio_ack_outbox_event(uuid,text)',
    'bolagio_acquire_lock(uuid,integer,text)',
    'bolagio_assign_turnover(uuid,text,text)',
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)',
    'bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer)',
    'bolagio_begin_refund(uuid,text)',
    'bolagio_booking_status_guard()',
    'bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)',
    'bolagio_claim_outbox_events(text,integer,integer)',
    'bolagio_claim_payment_events(text,integer)',
    'bolagio_claim_reconciliation_jobs(text,integer)',
    'bolagio_complete_cancellation(uuid,text)',
    'bolagio_complete_external_operation(text,bolagio_operation_outcome,text,text)',
    'bolagio_complete_message_delivery(uuid,text,text,text,text,boolean)',
    'bolagio_emit_guest_events(integer,integer,integer,timestamp with time zone)',
    'bolagio_fail_outbox_event(uuid,text,text)',
    'bolagio_fail_reconciliation_job(uuid,text)',
    'bolagio_finance_accept_ota_amendment(uuid,text,text)',
    'bolagio_finance_append_only()',
    'bolagio_finance_document_guard()',
    'bolagio_finance_ensure_period(date)',
    'bolagio_finance_invoice_guard()',
    'bolagio_finance_line_guard()',
    'bolagio_finance_link_document(uuid,text,uuid,text)',
    'bolagio_finance_ota_payout_guard()',
    'bolagio_finance_ota_settlement_guard()',
    'bolagio_finance_payment_guard()',
    'bolagio_finance_period_key(date)',
    'bolagio_finance_period_locked(date)',
    'bolagio_finance_post_transaction(jsonb,jsonb,text)',
    'bolagio_finance_reclassify_line(uuid,jsonb,text,text,boolean)',
    'bolagio_finance_record_match(jsonb,text)',
    'bolagio_finance_record_ota_settlement(jsonb,text)',
    'bolagio_finance_record_payment(jsonb,text)',
    'bolagio_finance_record_tax_stage(text,text,date,date,text,bigint,jsonb,text,text,boolean,text,date,date)',
    'bolagio_finance_register_document(jsonb,text)',
    'bolagio_finance_reverse_transaction(uuid,text,text,date)',
    'bolagio_finance_set_period_status(text,text,text,boolean,text)',
    'bolagio_finance_set_transaction_state(uuid,jsonb,text,text)',
    'bolagio_finance_sync_totals()',
    'bolagio_finance_tax_adjustment_guard()',
    'bolagio_finance_tx_guard()',
    'bolagio_minibar_record_movement(jsonb,text)',
    'bolagio_next_invoice_number(text)',
    'bolagio_observe_integration(text,text,text)',
    'bolagio_payment_transition_allowed(bolagio_payment_status,bolagio_payment_status)',
    'bolagio_queue_reconciliation(uuid,text,integer,jsonb)',
    'bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,character,text)',
    'bolagio_record_payment_event(bolagio_external_provider,text,text,text,jsonb,timestamp with time zone,timestamp with time zone,text,text,text,text,integer,character)',
    'bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text)',
    'bolagio_record_scheduler_run(text,timestamp with time zone,boolean,jsonb,text,text)',
    'bolagio_request_cancellation(uuid,text,text,boolean,integer,text)',
    'bolagio_requeue_message_delivery(uuid,text)',
    'bolagio_requeue_outbox_event(uuid,text)',
    'bolagio_reset_refund(uuid,text)',
    'bolagio_resolve_reconciliation_job(uuid,text)',
    'bolagio_set_turnover_status(uuid,text,text,text)',
    'bolagio_settle_payment_event(uuid,boolean,text)',
    'bolagio_status_reserves(bolagio_booking_status)',
    'bolagio_suppress_message_deliveries(uuid,text)',
    'bolagio_sync_turnovers(integer,timestamp with time zone)',
    'bolagio_touch_updated_at()',
    'bolagio_transition_allowed(bolagio_booking_status,bolagio_booking_status)',
    -- #12
    'bolagio_finance_enqueue(uuid,text)',
    'bolagio_finance_enqueue_on_intent()',
    'bolagio_finance_enqueue_on_payment_event()',
    'bolagio_finance_enqueue_missing(boolean,integer)',
    'bolagio_finance_claim_ingestion(text,integer)',
    'bolagio_finance_settle_ingestion(uuid,timestamp with time zone,boolean,text)'];
  r record; collisions text := ''; n_rel int := 0; n_type int := 0; n_fn int := 0;
begin
  for r in
    select c.relname, c.relkind, n.nspname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname like 'bolagio\_%' and c.relkind in ('r','p','v','m','S','f')
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  loop
    n_rel := n_rel + 1;
    if r.nspname <> 'public' then
      collisions := collisions || format(E'\n  relation %I.%I (kind %s): bolagio_ object outside schema public', r.nspname, r.relname, r.relkind);
    elsif r.relkind in ('r','p') and not (r.relname = any(expected_tables)) then
      collisions := collisions || format(E'\n  table public.%I: not created by any BoLaGio migration', r.relname);
    elsif r.relkind in ('v','m') and not (r.relname = any(expected_views)) then
      collisions := collisions || format(E'\n  view public.%I: not created by any BoLaGio migration', r.relname);
    elsif r.relkind in ('S','f') then
      collisions := collisions || format(E'\n  %s public.%I: the BoLaGio migrations create no sequence or foreign table', case r.relkind when 'S' then 'sequence' else 'foreign table' end, r.relname);
    end if;
  end loop;
  for r in
    select t.typname, t.typtype::text as typtype, n.nspname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname like 'bolagio\_%' and t.typtype <> 'c' and t.typarray <> 0
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  loop
    n_type := n_type + 1;
    if r.nspname <> 'public' or r.typtype <> 'e' or not (r.typname = any(expected_types)) then
      collisions := collisions || format(E'\n  type %I.%I (typtype %s): not one of the ten BoLaGio enums', r.nspname, r.typname, r.typtype);
    end if;
  end loop;
  for r in
    select p.oid::regprocedure::text as sig, n.nspname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'bolagio\_%' and n.nspname not in ('pg_catalog','information_schema')
  loop
    n_fn := n_fn + 1;
    if r.nspname <> 'public' or not (r.sig = any(expected_functions)) then
      collisions := collisions || format(E'\n  function %s.%s: no BoLaGio migration creates this signature', r.nspname, r.sig);
    end if;
  end loop;
  for r in select nspname from pg_namespace where nspname like 'bolagio%' loop
    collisions := collisions || format(E'\n  schema %I: the BoLaGio migrations create no schema', r.nspname);
  end loop;
  -- Roles: only the optional bolagio_app (supabase/ops/bolagio_app_role.sql) is expected.
  for r in select rolname from pg_roles where rolname like 'bolagio%' and rolname <> 'bolagio_app' loop
    collisions := collisions || format(E'\n  role %I: the BoLaGio operations create no such role', r.rolname);
  end loop;

  if collisions <> '' then
    raise exception E'PREFLIGHT FAILED — NAME COLLISION. These bolagio_* objects exist but no BoLaGio migration creates them. Applying a migration could alter or depend on them:%\nInspect them (supabase/ops/shared_project_inventory.sql) and resolve by hand before applying anything.', collisions;
  end if;
  raise notice 'ok — no collision: % relation(s), % enum(s), % function(s) named bolagio_*, every one created by the chain', n_rel, n_type, n_fn;
end $$;

\echo ''
\echo '── 8. Tables each migration touches (all bolagio_*) ───────────────────'
-- tests/shared-project-sql.test.ts asserts the same over the migration
-- sources: no migration file creates, alters, grants on or drops anything
-- not named bolagio_* (plus btree_gist in #1).
select m.migration, m.tables_touched
from (values
  ('#7 finance_foundation', 'bolagio_finance_* (28 tables), bolagio_minibar_products, bolagio_minibar_movements; reads bolagio_booking_intents, bolagio_turnovers, bolagio_units'),
  ('#8 reservation_import', 'bolagio_reservations; widens bolagio_scheduler_runs'),
  ('#9 guest_privileges', 'bolagio_guest_identities, bolagio_privilege_campaigns, bolagio_privilege_grants, bolagio_privilege_redemptions'),
  ('#10 legal_compliance', 'bolagio_booking_intents (adds terms_evidence), bolagio_guest_identities (adds consent columns)'),
  ('#11 booking_com_finance_statement', 'bolagio_finance_ota_payouts, bolagio_finance_ota_settlements; alters bolagio_finance_import_batches, bolagio_finance_import_rows'),
  ('#12 finance_ingestion_pipeline', 'bolagio_finance_ingestion_queue; triggers on bolagio_booking_intents, bolagio_payment_events; views over bolagio_finance_*, bolagio_reservations, bolagio_scheduler_runs')
) as m(migration, tables_touched);

\echo ''
\echo '── 9. Default privileges for anon/authenticated in schema public ──────'
select pg_get_userbyid(d.defaclrole) as for_objects_created_by,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' else d.defaclobjtype::text end as object_type,
       d.defaclacl as acl
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
order by 1, 2;
do $$ begin
  if exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
              where n.nspname = 'public' and d.defaclobjtype = 'r' and d.defaclacl::text ~ '(anon|authenticated)=') then
    raise notice 'info — browser roles receive privileges on new tables by default; #12 revokes them on its table and views (verified afterwards)';
  else
    raise notice 'info — no browser default privilege on new tables in public; #12''s revokes are no-ops';
  end if;
end $$;

\echo ''
\echo '── 10. Blast-radius record: unrelated tables (printed, never changed) ──'
select c.relname as unrelated_table, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and c.relname not like 'bolagio\_%'
order by 1;
\echo '(keep this with the change record; run supabase/ops/shared_project_inventory.sql before and after and diff: every changed line must be a bolagio_* object)'

\echo ''
\echo '── 11. RLS / policy / grant posture of every bolagio_ table ────────────'
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants,
       'true / 0 (or bolagio_app-only) / 0' as expected
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'bolagio\_%'
order by 1;
do $$ declare bad text; begin
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'bolagio\_%' and not c.relrowsecurity;
  if bad is not null then raise exception 'PREFLIGHT FAILED: RLS is off on %; fix before applying anything', bad; end if;
  select string_agg(distinct g.table_name, ', ') into bad from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name like 'bolagio\_%' and g.grantee in ('anon','authenticated');
  if bad is not null then raise exception 'PREFLIGHT FAILED: browser roles hold privileges on %; fix before applying anything', bad; end if;
  raise notice 'ok — every bolagio_ table has RLS on and no browser grant';
end $$;

\echo ''
\echo '════════ shared-project preflight passed (read-only) ════════'
