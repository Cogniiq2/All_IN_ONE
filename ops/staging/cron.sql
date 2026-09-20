-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio STAGING — the pg_cron schedule (docs/schedulers.md), parameterised.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -v site_url='https://bolagio-staging.<account>.workers.dev' \
--        -v secret="$BOOKING_SYNC_SECRET" \
--        -f ops/staging/cron.sql
--
-- Idempotent: unschedules the two jobs if they exist, then schedules them.
-- The secret is stored as a DATABASE SETTING (app.booking_sync_secret), not in
-- cron.job's command text, so `select * from cron.job` never shows it.
-- Requires pg_cron and pg_net (Supabase: enable under Database → Extensions).
-- Both psql variables are required; the script refuses without them.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\if :{?site_url}
\else
  \echo 'refused: -v site_url=https://… is required'
  \quit 1
\endif
\if :{?secret}
\else
  \echo 'refused: -v secret=<BOOKING_SYNC_SECRET> is required'
  \quit 1
\endif

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The secret lives in a database setting, not in cron.job.
alter database postgres set app.booking_sync_secret = :'secret';
alter database postgres set app.site_url = :'site_url';

-- unschedule if exists (cron.unschedule raises on an unknown name, hence the lookup)
select cron.unschedule(jobid) from cron.job where jobname in ('bolagio-reconcile', 'bolagio-inventory-sync');

select cron.schedule('bolagio-reconcile', '*/3 * * * *', $$
  select net.http_post(
    url     := current_setting('app.site_url') || '/api/booking/reconcile',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{"limit":25}'::jsonb,
    timeout_milliseconds := 60000);
$$);

select cron.schedule('bolagio-inventory-sync', '*/30 * * * *', $$
  select net.http_post(
    url     := current_setting('app.site_url') || '/api/booking/sync',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);

\echo '── scheduled jobs (the secret is not in the command text) ──'
select jobid, jobname, schedule, active from cron.job where jobname like 'bolagio-%' order by jobname;
\echo 'after ten minutes: select * from bolagio_scheduler_status;  — expect reconcile, operations, inventory_sync'
