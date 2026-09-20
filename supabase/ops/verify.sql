-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — POST-MIGRATION VERIFICATION. Read-only.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/verify.sql
--
-- Every check raises if it fails, so a non-zero exit is a failed verification.
-- It does not write. It does not call any provider.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create or replace function pg_temp.v_assert(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'VERIFY FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

set client_min_messages = notice;

do $$ begin
  -- Tables
  perform pg_temp.v_assert(to_regclass('public.bolagio_units') is not null, 'bolagio_units exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_booking_intents') is not null, 'bolagio_booking_intents exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_outbox_events') is not null, 'bolagio_outbox_events exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_payment_events') is not null, 'bolagio_payment_events exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_external_operations') is not null, 'bolagio_external_operations exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_reconciliation_jobs') is not null, 'bolagio_reconciliation_jobs exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_operators') is not null, 'bolagio_operators exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_admin_audit_log') is not null, 'bolagio_admin_audit_log exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_scheduler_runs') is not null, 'bolagio_scheduler_runs exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_turnovers') is not null, 'bolagio_turnovers exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_guest_events') is not null, 'bolagio_guest_events exists');
  -- Views
  perform pg_temp.v_assert(to_regclass('public.bolagio_ops_attention') is not null, 'bolagio_ops_attention view exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_ops_queues') is not null, 'bolagio_ops_queues view exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_scheduler_status') is not null, 'bolagio_scheduler_status view exists');
  -- Columns
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_units' and column_name='check_in_time'), 'bolagio_units.check_in_time exists');
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_booking_intents' and column_name='payment_status'), 'bolagio_booking_intents.payment_status exists');
  -- Functions, by exact signature
  perform pg_temp.v_assert(to_regprocedure('bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null, 'bolagio_booking_transition has the expected signature');
  perform pg_temp.v_assert(to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null, 'bolagio_begin_external_operation has the 6-argument signature');
  perform pg_temp.v_assert(to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb)') is null, 'the old 5-argument bolagio_begin_external_operation is gone');
  perform pg_temp.v_assert(to_regprocedure('bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,bpchar,text)') is not null, 'bolagio_record_payment_capture exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_sync_turnovers(integer,timestamptz)') is not null, 'bolagio_sync_turnovers has the clock parameter');
  perform pg_temp.v_assert(to_regprocedure('bolagio_emit_guest_events(integer,integer,integer,timestamptz)') is not null, 'bolagio_emit_guest_events has the clock parameter');
  -- Platform completion (2026-09-21)
  perform pg_temp.v_assert(to_regclass('public.bolagio_message_deliveries') is not null, 'bolagio_message_deliveries exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_turnover_events') is not null, 'bolagio_turnover_events exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_integration_health') is not null, 'bolagio_integration_health exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_invoice_sequences') is not null, 'bolagio_invoice_sequences exists');
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_booking_intents' and column_name='refund_state'), 'bolagio_booking_intents.refund_state exists');
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_units' and column_name='prearrival_days'), 'bolagio_units.prearrival_days exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null, 'bolagio_request_cancellation exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text)') is not null, 'bolagio_record_refund_outcome exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer)') is not null, 'bolagio_begin_message_delivery exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_set_turnover_status(uuid,text,text,text)') is not null, 'bolagio_set_turnover_status exists');
  perform pg_temp.v_assert(exists (select 1 from pg_constraint where conname='bolagio_refund_completed_evidence'), 'refund_completed requires provider evidence (constraint present)');
  perform pg_temp.v_assert(exists (select 1 from pg_constraint where conname='bolagio_refund_requires_authorization'), 'a refund requires an authorised cancellation (constraint present)');
  -- Finance foundation (2026-09-22)
  perform pg_temp.v_assert(to_regclass('public.bolagio_finance_transactions') is not null, 'bolagio_finance_transactions exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_finance_transaction_lines') is not null, 'bolagio_finance_transaction_lines exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_finance_payments') is not null, 'bolagio_finance_payments exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_finance_documents') is not null, 'bolagio_finance_documents exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_finance_tax_periods') is not null, 'bolagio_finance_tax_periods exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_minibar_movements') is not null, 'bolagio_minibar_movements exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_finance_vat_monthly') is not null, 'bolagio_finance_vat_monthly view exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_finance_post_transaction(jsonb,jsonb,text)') is not null, 'bolagio_finance_post_transaction exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_finance_reverse_transaction(uuid,text,text,date)') is not null, 'bolagio_finance_reverse_transaction exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_finance_set_period_status(text,text,text,boolean,text)') is not null, 'bolagio_finance_set_period_status exists');
  perform pg_temp.v_assert((select count(*) from bolagio_finance_tax_codes where code in ('DE_ACCOMMODATION_REDUCED','DE_STANDARD','DE_REVERSE_CHARGE','DE_REVIEW_REQUIRED')) = 4, 'the core tax codes are seeded');
  perform pg_temp.v_assert(exists (select 1 from bolagio_finance_tax_rates where tax_type = 'gewst_hebesatz'), 'a trade-tax Hebesatz row exists (review flag tells whether it is confirmed)');
  perform pg_temp.v_assert(not exists (select 1 from bolagio_finance_transactions where gross_cents <> net_cents + vat_cents), 'no transaction violates gross = net + VAT');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_finance_transactions t
    join (select transaction_id, sum(net_cents) n, sum(vat_cents) v, sum(gross_cents) g from bolagio_finance_transaction_lines group by 1) s on s.transaction_id = t.id
    where t.net_cents <> s.n or t.vat_cents <> s.v or t.gross_cents <> s.g), 'every header total equals the sum of its lines');
  perform pg_temp.v_assert(not exists (select 1 from bolagio_finance_transactions where status = 'reversed' and reversed_by is null), 'every reversed transaction names its reversal');
  perform pg_temp.v_assert(not exists (select 1 from bolagio_finance_transaction_lines where tax_code = 'DE_REVIEW_REQUIRED' and classification not in ('needs_review','suggested')), 'no review-required line is marked verified');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where refund_state = 'completed' and (refund_id is null or refunded_amount_cents <= 0)), 'no completed refund without evidence');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where status in ('releasing','released','cancelled')
      and payment_status in ('paid','partially_refunded','disputed') and cancellation_authorized_by is null
      and cancellation_requested_at is not null), 'no released paid booking without an authorised cancellation');
  perform pg_temp.v_assert(to_regprocedure('bolagio_record_scheduler_run(text,timestamptz,boolean,jsonb,text,text)') is not null, 'bolagio_record_scheduler_run exists');
  -- Transition semantics
  perform pg_temp.v_assert(bolagio_payment_transition_allowed('denied','paid'), 'denied -> paid is legal');
  perform pg_temp.v_assert(not bolagio_payment_transition_allowed('paid','order_created'), 'paid -> order_created is illegal');
  perform pg_temp.v_assert(not bolagio_transition_allowed('confirmed','cancelled'), 'confirmed -> cancelled is illegal');
  perform pg_temp.v_assert(bolagio_transition_allowed('expired','paid'), 'expired -> paid is legal');
  perform pg_temp.v_assert(bolagio_status_reserves('release_failed') and bolagio_status_reserves('manual_review') and bolagio_status_reserves('expired') and bolagio_status_reserves('payment_failed'), 'failure states still reserve');
  perform pg_temp.v_assert(not bolagio_status_reserves('released') and not bolagio_status_reserves('cancelled'), 'released/cancelled do not reserve');
  -- Constraints and triggers
  perform pg_temp.v_assert(exists (select 1 from pg_constraint where conname='bolagio_booking_intents_no_overlap'), 'the no-overlap exclusion constraint is present');
  perform pg_temp.v_assert(exists (select 1 from pg_trigger where tgname='bolagio_booking_intents_status_guard'), 'the status guard trigger is present');
  perform pg_temp.v_assert(exists (select 1 from pg_indexes where indexname='bolagio_booking_intents_hold_idx' and indexdef like '%payment_failed%'), 'the hold-sweep index covers payment_failed');
  perform pg_temp.v_assert(exists (select 1 from pg_indexes where indexname='bolagio_reconciliation_open_uq'), 'one open reconciliation job per (intent, reason)');
  -- RLS on every bolagio_ table, no policies, no browser grants
  perform pg_temp.v_assert(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname like 'bolagio\_%' and not c.relrowsecurity), 'RLS enabled on every bolagio_ table');
  perform pg_temp.v_assert(not exists (select 1 from pg_policies where schemaname='public' and tablename like 'bolagio\_%'), 'no policy on any bolagio_ table');
  perform pg_temp.v_assert(not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name like 'bolagio\_%' and grantee in ('anon','authenticated')), 'anon/authenticated hold no privilege on bolagio_ tables');
  -- Command functions are not executable by browser roles
  perform pg_temp.v_assert(not has_function_privilege('anon', 'bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)', 'execute'), 'anon cannot execute bolagio_booking_transition');
  perform pg_temp.v_assert(not has_function_privilege('authenticated', 'bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,bpchar,text)', 'execute'), 'authenticated cannot execute bolagio_record_payment_capture');
  perform pg_temp.v_assert(has_function_privilege('service_role', 'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)', 'execute'), 'service_role can execute bolagio_begin_external_operation');
  -- Data integrity
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where payment_capture_id is not null group by payment_capture_id having count(*) > 1), 'no capture id is shared by two bookings');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where beds24_booking_id is not null group by beds24_booking_id having count(*) > 1), 'no Beds24 booking id is shared by two bookings');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where status = 'confirmed' and source = 'direct' and payment_status not in ('paid','partially_refunded','disputed','refunded')), 'no direct confirmed booking without a settled payment');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_units where is_bookable and not exists (
      select 1 from bolagio_unit_integrations i where i.unit_id = bolagio_units.id and i.enabled)), 'no bookable unit lacks an enabled provider mapping');
end $$;

\echo ''
\echo '── Operational snapshot (informational) ────────────────────────────────'
select * from bolagio_ops_queues order by 1,2;
select job, ok, finished_at, error from bolagio_scheduler_status order by job;
select count(*) as attention_rows, min(severity) as worst_severity from bolagio_ops_attention;
\echo '════════ verification passed ════════'
