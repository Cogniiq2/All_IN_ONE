
Ältere Nachrichten werden geladen…
Why the sync needed ~79 requests
Per hourly run (2 units, 16 reservations)	Requests
Beds24 reads: 12 months back to 18 ahead, in 90-day windows = 11 windows × 2 units	22, plus 1 token
One "Beds24 is alive" write to the database after every read	22
Two database requests per reservation (look up, then write)	32
Units list and the run's own heartbeat	2
Supabase's log for the 26 Sep 09:07 run matches this: all of Schulstraße I was written, then the first Schulstraße II read was refused, and so was the heartbeat that should have reported it. Batching both units into one Beds24 request (your option 2) isn't safe to rely on, because Beds24's contract for that is unverified.

What I changed (your options 1, 3, 4 and 5 together)
Fewer requests. Reads no longer write a status row each; there is one per run. Each 90-day window is written with one lookup plus one combined write, instead of two requests per reservation. A stored value is still never erased by a missing field, and one bad reservation falls back to row-by-row writes so it can't block its window.
Hard budget of 40 per run. A run never starts work it can't finish under the budget. It reserves room for a Beds24 token refresh and a 401 retry, and charges a failed read as three requests.
Resumable. The sync is now a list of (unit, 90-day window) tasks.
Each hourly run first refreshes arrivals from a week ago to 60 days ahead for both units.
It then continues through the remaining windows from where the last run stopped; that position is saved in the run's own heartbeat, so no migration is needed.
An interrupted window is not marked done; it is the next run's first task.
A manual re-import of a date range that doesn't fit returns a resumeFrom date to call again with, and never disturbs the hourly cycle.
Health. Each run's heartbeat records how many windows were done, failed and remaining, whether the cycle is complete, which units failed, and how many requests it used. A failed window or reservation marks the run failed and names the unit. A run that simply didn't reach every window is not a failure.
Unchanged: the webhook refresh path.
Measured at your live shape: run 1 uses 35 requests, run 2 uses 20 and completes the full cycle. Beds24 traffic drops from 22 attempted reads per hour to about 10–17.

Two more places over the cap, found by measuring
"Import valid rows": the 5-line statement needed about 50 requests. It now posts what fits (3 lines, 34 measured) and leaves the rest waiting with the batch still "validated", so clicking again continues. Nothing is posted twice.
The 3-minute payment/finance pass: with 5 queued bookings it measured 51. The default is now 2 bookings per pass (30 measured). The "Run ingestion" button, which I had set to 25, now uses the same 2.
Remaining risk (booking core, not this change): once direct booking is live, a pass that confirms several PayPal payments at once could approach 50. Measure it during the sandbox end-to-end run.

Tests
Unit: 998 passed; the same 2 legal-copy failures as before.
Integration against real Postgres: 116 passed; the same 1 messaging failure as before.
DB tests, migration apply/rollback check, both builds, and Playwright admin (15/15) all pass.
New tests cover:

budget never exceeded and the reported count never below the real one
cycle completes and all 16 reservations land with no duplicates
near-term refresh, one failing unit not blocking the other and recovering next cycle
a bad row isolated, cut-short re-imports continuing, and the 3+2 statement import
Ready for your six steps: yes, with three notes
Apply the migration: unchanged from before; this fix needed no database change.
Deploy: then wait for two hourly syncs, or trigger the route twice. On /admin/system, reservation_sync should show cycleComplete: true and no failed units. If Schulstraße II is still named, Beds24 itself is refusing that room (the 403 seen on 24 Sep); check its API permissions in Beds24.
Open imports: nothing different.
Import: the 1-line file takes one click; the 5-line file takes two clicks (3 lines, then 2).
Re-match: matching uses the Booking.com number only. Two lines already have local reservations with identical amounts. The other four (stays 7–21 Sep) match only if the complete sync imports them. I haven't established why they're missing locally: every local row was first imported on 22 Sep, before the cap started failing runs. If they're still missing after a full cycle, check those four bookings in Beds24.
Verify: unmatched lines still post; they only lack the apartment assignment.
The details are in docs/finance/live-data-pipeline.md and docs/beds24-reservations.md. Branch claude/bolagio-live-finance-data, not merged. I made no production database changes and no live provider writes.

Background task stopped· Stopped by a worker restart: until grep -q "^exit" /tmp/claude-0/e2e-guest.log; do sleep 5; done; grep -E "✓|✘|passed|failed|flaky|^exit" /tmp/claude-0/e2e-guest.log | tail -30

The container restart only lost an old watcher on the guest Playwright run I had already stopped, so nothing needs re-running. Checking the repository came back intact.

Rangit status…

The container restart cost nothing. The only background job lost was a watcher on a guest browser-test run I had already stopped. That run concerned the guest booking dialog, which this branch doesn't touch, so it doesn't need repeating.

Everything was already committed and pushed. The branch claude/bolagio-live-finance-data has no uncommitted changes and matches the remote at e840741. The six steps from my last message are unchanged.

…
This is now in a good state to proceed.

The Cloudflare issue is materially improved: Claude reduced the sync from ~79 requests to a hard budget of 40, made it resumable, and preserved correctness. That means you do not need to upgrade Cloudflare just for this sync right now.

What matters next is activation, not more coding.

Do these six steps:

Apply the new Supabase migration:

supabase/ops/preflight.sql
supabase/migrations/20260927120000_finance_ingestion_pipeline.sql
supabase/ops/verify.sql
Deploy branch:

claude/bolagio-live-finance-data
current pushed commit: e840741
Wait for two hourly reservation syncs, or trigger the sync twice.
In /admin/system, reservation_sync should then show:

cycleComplete: true
no failed units
Go to /admin/finance/imports

import the 1-line statement once
import the 5-line statement twice, because it now safely posts 3 rows, then the remaining 2
Go to /admin/finance/booking-com

click Re-match reservations
Open /admin/finance and verify the real figures now appear.

The most important thing to understand is that after step 4, the existing Finance dashboard should finally stop being empty because the actual Booking.com statement rows will have been posted into the ledger.

One thing I would watch closely: those four Booking.com lines for stays between 7–21 September that are currently missing local reservation matches. After the full Beds24 sync cycle, check whether they appear. If they still do not, then the problem is likely those bookings not being returned/accessible in Beds24, not Finance.

Also, direct-booking automation is now ready for later: once direct booking is switched on, booking/payment facts will persist in Supabase and feed Finance automatically through the queue + 3-minute processing path.

The remaining failed tests are pre-existing legal-copy/messaging/guest-E2E issues, not Finance pipeline failures. I would not block this Finance activation on those, though I would clean them up before eventually merging the branch into your main production base.

which branch in git
Use this Git branch:

claude/bolagio-live-finance-data

Current pushed commit:

e840741

That is the branch you should deploy/test now.

Error running SQL query
Failed to run sql query: ERROR:  42601: syntax error at or near "\" LINE 34: \set ON_ERROR_STOP on          ^

That error is because \set ON_ERROR_STOP on is a psql client command, not valid SQL in the Supabase SQL Editor.

So don’t paste the ops file blindly into the SQL Editor if it contains backslash commands.

Do this instead:

Remove/comment out lines starting with \ such as:
\set ON_ERROR_STOP on
possibly \echo, \if, etc.
Then run the remaining pure SQL in Supabase.
For your case, safest sequence is:

Open supabase/ops/preflight.sql
Remove all psql-only \... commands
Run the remaining SQL in Supabase SQL Editor
Then run:
supabase/migrations/20260927120000_finance_ingestion_pipeline.sql
Then open supabase/ops/verify.sql
Again remove any psql-only \... commands
Run the remaining SQL
If you want, paste me the contents of preflight.sql and verify.sql and I’ll tell you exactly which lines to remove and in what order to run them.


Eingefügter Text(20260927-080503).txt
Dokument
give me teh fll correc ted file:

19s nachgedacht


Here is the full corrected Supabase SQL Editor version. I removed the psql-only commands (\set, \pset, \echo) that caused your syntax error, while keeping the actual safety checks unchanged. Your uploaded file explicitly contained those psql commands at the top. 

Run the whole file in Supabase → SQL Editor. If it throws any PREFLIGHT FAILED exception, stop there and send me the error before running the migration. 


shared_project_preflight_supabase.sql
Code
Error running SQL query
Failed to run sql query: ERROR:  42601: syntax error at or near "loop" LINE 1:   end loop;               ^


35s nachgedacht

The previous preflight was the wrong file for your current database state. It was written for the early shared-project migration sequence and includes old collision logic. Your current Sep-27 migration depends on Finance/Reservations objects that already exist, so I replaced it with a specific read-only preflight for 20260927120000_finance_ingestion_pipeline.sql.

Run the entire file with nothing selected in Supabase SQL Editor. It contains no \set, \echo, or foreach/end loop constructs.

You should end with:

PREFLIGHT PASSED — prerequisites for 20260927120000_finance_ingestion_pipeline.sql are present. You may now apply the migration.

If it instead raises PREFLIGHT FAILED, send me that exact error and do not run the migration yet.

The migration itself really does depend on the existing booking/payment/finance tables and then adds the new ingestion queue, refund/gap/status views, triggers and backfill. 


finance_ingestion_20260927_preflight_supabase.sql
Code
Error running SQL query
Failed to run sql query: ERROR:  42601: unterminated dollar-quoted string at or near "$$ begin   if not exists (     select 1 from information_schema.columns     where table_schema='public' and table_name='bolagio_booking_intents' and column_name='id'   ) then raise exception 'PREFLIGHT FAILED: bolagio_booking_intents.id is missing'; end if;    if not exists (     select 1 from information_schema.columns     where table_schema='public' and table_name='bolagio_booking_intents' and column_name='reference'   ) then raise exception 'PREFLIGHT FAILED: bolagio_booking_intents.reference is missing'; end if;    if not exists (     select 1 from information_schema.columns     where table_schema='public' and table_name='bolagio_booking_intents' and column_name='status'   ) then raise exception 'PREFLIGHT FAILED: bolagio_booking_intents.status is missing'; end if;    if not exists (     select 1 from information_schema.columns     where table_schema='public' and table_name='bolagio_booking_intents' and column_name='payment_status'   ) then raise exception 'PREFLIGHT FAILED: bolagio_booking_intents.payment_status is missing'; end if;    if not exists (     select 1 from information_schema.columns     where table_schema='public' and table_name='bolagio_booking_intents' and column_name='payment_order_id'  -- source: dashboard -- user: session:87807511-0db5-40c3-be20-66c6f3de8280 -- date: 2026-09-27T08:10:03.891Z" LINE 72: do $$             ^

…

ChatGPT antwortet



-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — SHARED-PROJECT PREFLIGHT. Read-only. Run BEFORE applying the
-- BoLaGio migrations to the Supabase project BoLaGio shares with Cogniiq.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_preflight.sql
--
-- Exit status is the verdict:
--   0  every check passed or is informational; the migrations may be applied
--   ≠0 a COLLISION or a missing prerequisite — stop, read the message, do not
--      apply anything
--
-- It changes nothing. It contains every check of supabase/ops/preflight.sql
-- in compact form PLUS the checks that only matter because the project is
-- shared:
--   §5  name collisions — a pre-existing object called bolagio_* that the
--       BoLaGio migrations did not create would be silently altered or would
--       break the migration half way. Raises.
--   §6  the exact set of tables the six migration files touch, hardcoded,
--       so a reader can confirm "no non-bolagio table is referenced" against
--       the repository (tests/shared-project-sql.test.ts makes the same
--       invariant executable over the migration sources)
--   §7  default privileges for anon/authenticated exist in schema public —
--       otherwise the migrations' REVOKEs are no-ops, which is fine, but the
--       operator should know which case they are in
--   §8  the `authenticator` role exists (the role PostgREST switches from)
--   §9  the blast-radius record: the unrelated tables named in
--       docs/security/2026-08-15-admin-exposure.md, with their RLS state
--       PRINTED, never changed
--
-- Idempotent-safe: running it on a project where the migrations are already
-- applied passes (their objects are the expected ones).
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset format aligned
\pset pager off
\pset null '∅'

\echo ''
\echo '── 1. Server and extensions ────────────────────────────────────────────'
select 'postgres_version' as check_name, version() as actual, '14 or newer' as expected;
select 'btree_gist' as check_name,
       coalesce((select extversion from pg_extension where extname='btree_gist'), 'ABSENT (foundation creates it)') as actual,
       'installed or creatable' as expected;
select 'pg_cron_available' as check_name,
       case when exists (select 1 from pg_available_extensions where name='pg_cron') then 'available' else 'NOT available' end as actual,
       'available (Supabase: yes) — needed only for the scheduler' as expected;
do $$ begin
  if current_setting('server_version_num')::int < 140000 then
    raise exception 'PREFLIGHT FAILED: PostgreSQL 14 or newer is required (found %)', current_setting('server_version');
  end if;
end $$;

\echo ''
\echo '── 2. Roles the migrations grant to ────────────────────────────────────'
select r.rolname as check_name, 'present' as actual, 'present' as expected
from pg_roles r where r.rolname in ('anon','authenticated','service_role')
union all
select missing, 'MISSING', 'present'
from unnest(array['anon','authenticated','service_role']) as missing
where not exists (select 1 from pg_roles where rolname = missing);
do $$ declare missing text; begin
  select string_agg(r, ', ') into missing from unnest(array['anon','authenticated','service_role']) r
   where not exists (select 1 from pg_roles where rolname = r);
  if missing is not null then
    raise exception 'PREFLIGHT FAILED: role(s) % missing — this is not a Supabase project', missing;
  end if;
end $$;

\echo ''
\echo '── 3. Which BoLaGio migrations are already applied ─────────────────────'
select 'booking_foundation (20260916120000)' as migration,
       case when to_regclass('public.bolagio_booking_intents') is not null then 'applied' else 'not applied' end as actual
union all
select 'booking_core_states (20260917100000)',
       case when exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='bolagio_booking_status' and e.enumlabel='locking') then 'applied' else 'not applied' end
union all
select 'booking_core_hardening (20260917110000)',
       case when to_regclass('public.bolagio_outbox_events') is not null and to_regprocedure('bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null then 'applied' else 'not applied' end
union all
select 'admin_operators (20260919120000)',
       case when to_regclass('public.bolagio_operators') is not null then 'applied' else 'not applied' end
union all
select 'booking_production_hardening (20260920120000)',
       case when to_regclass('public.bolagio_scheduler_runs') is not null
             and to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null
            then 'applied' else 'not applied' end
union all
select 'platform_completion (20260921120000)',
       case when to_regclass('public.bolagio_message_deliveries') is not null
             and to_regprocedure('bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null
            then 'applied' else 'not applied' end;
-- A later migration applied without an earlier one is a half state the runbook does not cover.
do $$
declare a1 boolean := to_regclass('public.bolagio_booking_intents') is not null;
        a3 boolean := to_regclass('public.bolagio_outbox_events') is not null;
        a4 boolean := to_regclass('public.bolagio_operators') is not null;
        a5 boolean := to_regclass('public.bolagio_scheduler_runs') is not null;
        a6 boolean := to_regclass('public.bolagio_message_deliveries') is not null;
begin
  if (a3 and not a1) or (a4 and not a3) or (a5 and not a4) or (a6 and not a5) then
    raise exception 'PREFLIGHT FAILED: a later BoLaGio migration is applied without an earlier one (foundation=% hardening=% operators=% production=% completion=%) — restore from backup or apply by hand in order', a1, a3, a4, a5, a6;
  end if;
end $$;

\echo ''
\echo '── 4. Existing BoLaGio data that the migrations must not disturb ───────'
do $$
declare v bigint; t text;
begin
  foreach t in array array['bolagio_units','bolagio_unit_integrations','bolagio_booking_intents',
                           'bolagio_external_operations','bolagio_payment_events','bolagio_outbox_events'] loop
    if to_regclass('public.' || t) is null then
      raise notice '%: table absent', t;
    else
      execute format('select count(*) from %I', t) into v;
      raise notice '%: % rows', t, v;
    end if;
  end loop;
  if to_regclass('public.bolagio_external_operations') is not null then
    execute $q$select count(*) from bolagio_external_operations where outcome = 'outcome_unknown'$q$ into v;
    raise notice 'external operations with outcome_unknown (reconcile first if > 0): %', v;
    execute $q$select count(*) from bolagio_external_operations where outcome = 'in_flight' and started_at > now() - interval '5 minutes'$q$ into v;
    raise notice 'external operations in flight in the last 5 minutes (expected 0): %', v;
  end if;
end $$;

\echo ''
\echo '── 5. NAME COLLISIONS — bolagio_* objects the migrations did not create ─'
-- Every relation, type and function the six migrations create, by name. A
-- bolagio_* object that is NOT in these lists exists for another reason and
-- would collide. The three "intermediate" signatures are legitimate between
-- migrations 3 and 5 (they are replaced by 5 and 6).
do $$
declare
  expected_tables constant text[] := array[
    'bolagio_admin_audit_log','bolagio_booking_intent_events','bolagio_booking_intents','bolagio_external_operations',
    'bolagio_guest_events','bolagio_integration_events','bolagio_integration_health','bolagio_invoice_sequences',
    'bolagio_message_deliveries','bolagio_operators','bolagio_outbox_events','bolagio_payment_events',
    'bolagio_reconciliation_jobs','bolagio_scheduler_runs','bolagio_turnover_events','bolagio_turnovers',
    'bolagio_unit_integrations','bolagio_unit_inventory_days','bolagio_units'];
  expected_views constant text[] := array['bolagio_ops_attention','bolagio_ops_queues','bolagio_scheduler_status'];
  expected_types constant text[] := array[
    'bolagio_booking_source','bolagio_booking_status','bolagio_external_provider','bolagio_integration_provider',
    'bolagio_job_status','bolagio_operation_outcome','bolagio_payment_provider','bolagio_payment_status'];
  expected_functions constant text[] := array[
    'bolagio_touch_updated_at()',
    'bolagio_status_reserves(bolagio_booking_status)',
    'bolagio_transition_allowed(bolagio_booking_status,bolagio_booking_status)',
    'bolagio_payment_transition_allowed(bolagio_payment_status,bolagio_payment_status)',
    'bolagio_booking_status_guard()',
    'bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)',
    'bolagio_acquire_lock(uuid,integer,text)',
    'bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,character,text)',
    'bolagio_queue_reconciliation(uuid,text,integer,jsonb)',
    'bolagio_claim_outbox_events(text,integer,integer)',
    'bolagio_ack_outbox_event(uuid,text)',
    'bolagio_fail_outbox_event(uuid,text,text)',
    'bolagio_claim_reconciliation_jobs(text,integer)',
    'bolagio_resolve_reconciliation_job(uuid,text)',
    'bolagio_fail_reconciliation_job(uuid,text)',
    'bolagio_record_payment_event(bolagio_external_provider,text,text,text,jsonb,timestamp with time zone,timestamp with time zone,text,text,text,text,integer,character)',
    'bolagio_claim_payment_events(text,integer)',
    'bolagio_settle_payment_event(uuid,boolean,text)',
    'bolagio_complete_external_operation(text,bolagio_operation_outcome,text,text)',
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)',
    'bolagio_record_scheduler_run(text,timestamp with time zone,boolean,jsonb,text,text)',
    'bolagio_request_cancellation(uuid,text,text,boolean,integer,text)',
    'bolagio_complete_cancellation(uuid,text)',
    'bolagio_begin_refund(uuid,text)',
    'bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text)',
    'bolagio_reset_refund(uuid,text)',
    'bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer)',
    'bolagio_complete_message_delivery(uuid,text,text,text,text,boolean)',
    'bolagio_requeue_message_delivery(uuid,text)',
    'bolagio_suppress_message_deliveries(uuid,text)',
    'bolagio_requeue_outbox_event(uuid,text)',
    'bolagio_set_turnover_status(uuid,text,text,text)',
    'bolagio_assign_turnover(uuid,text,text)',
    'bolagio_sync_turnovers(integer,timestamp with time zone)',
    'bolagio_emit_guest_events(integer,integer,integer,timestamp with time zone)',
    'bolagio_observe_integration(text,text,text)',
    'bolagio_next_invoice_number(text)',
    -- legitimate intermediate signatures (after #3, before #5 / #6)
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb)',
    'bolagio_sync_turnovers(integer)',
    'bolagio_emit_guest_events(integer,integer,integer)'];
  r record; collisions text := ''; n_found int := 0;
begin
  -- relations (tables, views, sequences, materialized views, foreign tables; indexes and toast are derived)
  for r in
    select c.relname, c.relkind, n.nspname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname like 'bolagio\_%' and c.relkind in ('r','p','v','m','S','f')
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  loop
    n_found := n_found + 1;
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
  -- types (enums; composite row types of the tables carry the table name and are skipped)
  for r in
    select t.typname, t.typtype, n.nspname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname like 'bolagio\_%' and t.typtype not in ('c') and t.typname !~ '^bolagio_.*\[\]$' and t.typarray <> 0
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  loop
    n_found := n_found + 1;
    if r.nspname <> 'public' or r.typtype <> 'e' or not (r.typname = any(expected_types)) then
      collisions := collisions || format(E'\n  type %I.%I (typtype %s): not one of the eight BoLaGio enums', r.nspname, r.typname, r.typtype);
    end if;
  end loop;
  -- functions, by exact signature
  for r in
    select p.oid::regprocedure::text as sig, n.nspname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'bolagio\_%' and n.nspname not in ('pg_catalog','information_schema')
  loop
    n_found := n_found + 1;
    if r.nspname <> 'public' or not (r.sig = any(expected_functions)) then
      collisions := collisions || format(E'\n  function %s.%s: no BoLaGio migration creates this signature', r.nspname, r.sig);
    end if;
  end loop;
  -- schemas
  for r in select nspname from pg_namespace where nspname like 'bolagio%' loop
    collisions := collisions || format(E'\n  schema %I: the BoLaGio migrations create no schema', r.nspname);
  end loop;

  if collisions <> '' then
    raise exception E'PREFLIGHT FAILED — NAME COLLISION. These bolagio_* objects exist but no BoLaGio migration creates them. Applying the migrations could alter or depend on them:%\nInspect them (supabase/ops/shared_project_inventory.sql) and resolve by hand before applying anything.', collisions;
  end if;
  raise notice 'no collision: % bolagio_* object(s) found, all of them expected', n_found;
end $$;

\echo ''
\echo '── 6. Tables the six migration files touch (hardcoded; compare to what exists)'
-- Each name must start with bolagio_ (tests/shared-project-sql.test.ts asserts the
-- same over the migration sources). "applied" means the table exists already.
select t.table_name, t.created_by,
       case when to_regclass('public.' || t.table_name) is not null then 'exists' else 'will be created' end as actual
from (values
  ('bolagio_units','20260916'), ('bolagio_unit_integrations','20260916'), ('bolagio_unit_inventory_days','20260916'),
  ('bolagio_booking_intents','20260916'), ('bolagio_booking_intent_events','20260916'), ('bolagio_integration_events','20260916'),
  ('bolagio_outbox_events','20260917'), ('bolagio_payment_events','20260917'), ('bolagio_external_operations','20260917'),
  ('bolagio_reconciliation_jobs','20260917'),
  ('bolagio_operators','20260919'), ('bolagio_admin_audit_log','20260919'),
  ('bolagio_scheduler_runs','20260920'), ('bolagio_turnovers','20260920'), ('bolagio_guest_events','20260920'),
  ('bolagio_message_deliveries','20260921'), ('bolagio_turnover_events','20260921'), ('bolagio_integration_health','20260921'),
  ('bolagio_invoice_sequences','20260921')
) as t(table_name, created_by)
order by 2, 1;
do $$ begin
  if exists (select 1 from unnest(array[
      'bolagio_units','bolagio_unit_integrations','bolagio_unit_inventory_days','bolagio_booking_intents',
      'bolagio_booking_intent_events','bolagio_integration_events','bolagio_outbox_events','bolagio_payment_events',
      'bolagio_external_operations','bolagio_reconciliation_jobs','bolagio_operators','bolagio_admin_audit_log',
      'bolagio_scheduler_runs','bolagio_turnovers','bolagio_guest_events','bolagio_message_deliveries',
      'bolagio_turnover_events','bolagio_integration_health','bolagio_invoice_sequences']) t where t not like 'bolagio\_%') then
    raise exception 'PREFLIGHT FAILED: the hardcoded migration table list names a non-bolagio table';
  end if;
  raise notice 'every table the migrations touch is prefixed bolagio_ (19 tables); no unrelated table is referenced';
end $$;

\echo ''
\echo '── 7. Default privileges for anon/authenticated in schema public ──────'
-- Supabase grants anon/authenticated privileges on NEW tables in public by
-- default. The BoLaGio migrations REVOKE them on every bolagio_ table. If the
-- defaults are absent, the revokes are harmless no-ops — both cases are fine,
-- but the verify step proves the posture either way.
select pg_get_userbyid(d.defaclrole) as for_objects_created_by,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' else d.defaclobjtype::text end as object_type,
       d.defaclacl as acl,
       case when d.defaclacl::text ~ '(anon|authenticated)=' then 'browser roles get privileges by default → the migration REVOKEs matter' else 'no browser default' end as meaning
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
order by 1, 2;
do $$ begin
  if not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                 where n.nspname = 'public' and d.defaclobjtype = 'r' and d.defaclacl::text ~ '(anon|authenticated)=') then
    raise notice 'INFO: no default table privilege for anon/authenticated in public — new tables start without browser grants (the migration revokes are no-ops)';
  else
    raise notice 'ok — browser default privileges exist in public; the migrations revoke them on every bolagio_ table';
  end if;
end $$;

\echo ''
\echo '── 8. The authenticator role (what PostgREST connects as) ─────────────'
select r.rolname as role, r.rolcanlogin as can_login, r.rolinherit as inherit,
       array(select b.rolname from pg_auth_members m join pg_roles b on b.oid = m.roleid where m.member = r.oid order by 1) as can_switch_to
from pg_roles r where r.rolname = 'authenticator';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    raise exception 'PREFLIGHT FAILED: role authenticator is missing — this is not a Supabase project (or the local stack)';
  end if;
  if not exists (select 1 from pg_auth_members m join pg_roles a on a.oid = m.member join pg_roles s on s.oid = m.roleid
                 where a.rolname = 'authenticator' and s.rolname = 'service_role') then
    raise exception 'PREFLIGHT FAILED: authenticator cannot switch to service_role — the application (service-role JWT) could not reach the tables';
  end if;
end $$;

\echo ''
\echo '── 9. Blast-radius record: unrelated tables (RLS state PRINTED, not changed)'
-- The tables docs/security/2026-08-15-admin-exposure.md names, then every
-- other non-bolagio table. Nothing here is asserted; it is the evidence to
-- keep with the change record; the hardening it feeds is
-- supabase/ops/shared_project_hardening.sql.
select t.table_name as named_in_security_doc,
       case when to_regclass('public.' || t.table_name) is null then 'absent' else 'present' end as presence,
       (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = t.table_name) as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = t.table_name and g.grantee in ('anon','authenticated')) as browser_grants
from (values ('invoices'), ('emails'), ('email_attachments'), ('properties'), ('property_units')) as t(table_name)
order by 1;
select c.relname as other_unrelated_table, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and c.relname not like 'bolagio\_%'
  and c.relname not in ('invoices','emails','email_attachments','properties','property_units')
order by 1;
\echo '(record both tables above with the change; run shared_project_inventory.sql before and after and diff)'

\echo ''
\echo '── 10. Row-level security posture on every bolagio_ table (if any) ─────'
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee in ('anon','authenticated')) as browser_grants,
       'true / 0 (or bolagio_app-only policies) / 0' as expected
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'bolagio\_%'
order by 1;

\echo ''
\echo '════════ shared-project preflight passed (read-only) ════════'
