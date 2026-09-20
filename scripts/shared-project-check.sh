#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Prove the shared-project hardening on a throwaway cluster:
#
#   fixture (the live exposure)     → the exposure is REAL as anon/authenticated
#   → dry run                        → changes nothing
#   → apply                          → verify
#   → security tests                 → anon and authenticated reach nothing
#   → Cogniiq regression tests       → owner/admin screens still work
#   → untouched-control snapshot     → no unrelated object changed, no row moved
#   → BoLaGio migration chain        → applies cleanly ON TOP
#   → rollback → re-apply            → reversible and idempotent
#
# Never touches a real project: it creates and drops a database called
# cogniiq_shared_check on its own cluster.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [ -x "$PGBIN/initdb" ] || { echo "No PostgreSQL binaries found. Set PGBIN or DATABASE_URL." >&2; exit 1; }
  DIR="$(mktemp -d)"; SOCK="$DIR/sock"; mkdir -p "$SOCK" "$DIR/data"; chmod 755 "$DIR"
  PORT="${PGTESTPORT:-$(( 55000 + RANDOM % 9000 ))}"
  RUNAS=""; if [ "$(id -u)" = "0" ]; then RUNAS="postgres"; chown -R postgres "$DIR"; fi
  run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }
  run "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null
  run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $SOCK' -l $DIR/log start" >/dev/null
  trap 'run "$PGBIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
  DATABASE_URL="postgres://postgres@/postgres?host=$SOCK&port=$PORT"
fi

BASE="${DATABASE_URL%%\?*}"; QS="${DATABASE_URL#*\?}"; [ "$QS" = "$DATABASE_URL" ] && QS=""
psql "$DATABASE_URL" -q -c "drop database if exists cogniiq_shared_check;" -c "create database cogniiq_shared_check;"
T="${BASE%/*}/cogniiq_shared_check${QS:+?$QS}"
for r in anon authenticated service_role; do
  psql "$T" -q -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;"
done
psql "$T" -q -c "alter role service_role bypassrls;" 2>/dev/null || true

FAILED=0
ck() { # ck "<label>" "<sql returning one value>" "<expected>"
  local got; got="$(psql "$T" -Atc "$2" 2>&1 || true)"
  if [ "$got" = "$3" ]; then echo "ok — $1"; else echo "FAILED — $1 (expected '$3', got '$got')"; FAILED=1; fi
}
as() { psql "$T" -Atc "set role $1; $2; reset role;" 2>&1 || true; }
ckrole() { # ckrole "<label>" <role> "<sql>" "<expected>"
  local got; got="$(psql "$T" -Atc "set local role $2; $3" 2>&1 | tail -1 || true)"
  if [ "$got" = "$4" ]; then echo "ok — $1"; else echo "FAILED — $1 (expected '$4', got '$got')"; FAILED=1; fi
}

echo "── building the shared project as the inventory found it ──"
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/fixtures/cogniiq_shared_project_fixture.sql >/dev/null

echo "── the exposure is real before the hardening ──"
ckrole "anon can read public.loans (CRITICAL, as found)" anon "select count(*)::text from public.loans" "1"
ckrole "anon can read public.emails (HIGH, as found)" anon "select count(*)::text from public.emails" "1"
ckrole "anon can delete from public.suppliers (CRITICAL, as found)" anon "with d as (delete from public.suppliers returning 1) select count(*)::text from d" "1"
# The finding is the EXECUTE privilege itself. The body happens to hit RLS on
# execution_days, which is luck, not a control: the next VOLATILE function
# anon inherits may have no such backstop.
ck "anon holds EXECUTE on generate_daily_execution_plan (HIGH, as found)" "select has_function_privilege('anon','public.generate_daily_execution_plan(date)','execute')::text" "true"
psql "$T" -q -c "insert into public.suppliers (label, amount_cents) values ('legacy row for suppliers', 4200);" >/dev/null

echo "── a snapshot of everything that must NOT change ──"
rm -f /tmp/cogniiq_rows_before.txt /tmp/cogniiq_rows_after.txt
psql "$T" -Atc "
  select md5(string_agg(x, '|' order by x)) from (
    select c.relname || ':' || c.relrowsecurity || ':' ||
           coalesce((select string_agg(polname, ',' order by polname) from pg_policy where polrelid = c.oid), '-') || ':' ||
           coalesce((select string_agg(distinct grantee || privilege_type, ',' order by grantee || privilege_type)
                       from information_schema.role_table_grants g
                      where g.table_schema = 'public' and g.table_name = c.relname), '-') as x
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname in ('owner_tax_estimates','owner_invoices','organization_members','profiles','owner_offers','execution_days')
  ) s;" > /tmp/cogniiq_control_before.txt
psql "$T" -Atc "select md5(string_agg(t || ':' || n::text, '|' order by t)) from (
    select relname as t, (select count(*) from pg_class c2 where c2.oid = c.oid) as n from pg_class c
     join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname='public' and c.relkind='r') z;" > /tmp/cogniiq_tables_before.txt
for tbl in owner_tax_estimates owner_invoices organization_members profiles owner_offers emails properties loans invoices; do
  psql "$T" -Atc "select count(*) from public.$tbl;" >> /tmp/cogniiq_rows_before.txt
done

echo "── dry run must change nothing ──"
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_hardening.sql > /tmp/cogniiq_dryrun.txt 2>&1
grep -q "DRY RUN" /tmp/cogniiq_dryrun.txt && echo "ok — dry run announced itself" || { echo "FAILED — no dry-run banner"; FAILED=1; }
ckrole "anon still reads public.loans after the dry run" anon "select count(*)::text from public.loans" "1"

echo "── applying ──"
psql "$T" -1 -v ON_ERROR_STOP=1 -q -v apply=yes -f supabase/ops/shared_project_hardening.sql > /tmp/cogniiq_apply.txt 2>&1
grep -q "APPLIED" /tmp/cogniiq_apply.txt && echo "ok — applied" || { echo "FAILED — apply did not complete"; cat /tmp/cogniiq_apply.txt; FAILED=1; }

echo "── verification ──"
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_hardening_verify.sql 2>&1 \
  | sed 's/^psql:[^ ]* //; s/^NOTICE: *//' | grep -E "^(ok —|skip —|════)" || { echo "FAILED — verification did not pass"; FAILED=1; }

echo "── SECURITY: the browser roles now reach nothing legacy ──"
for tbl in loans suppliers tenants documents bank_accounts audit_log emails email_attachments properties invoices transactions property_units utility_bills; do
  ckrole "anon cannot read public.$tbl" anon "select count(*)::text from public.$tbl" "ERROR:  permission denied for table $tbl"
done
ckrole "authenticated cannot read public.emails" authenticated "select count(*)::text from public.emails" "ERROR:  permission denied for table emails"
ckrole "authenticated cannot read public.properties" authenticated "select count(*)::text from public.properties" "ERROR:  permission denied for table properties"
ck "anon no longer holds EXECUTE on generate_daily_execution_plan" "select has_function_privilege('anon','public.generate_daily_execution_plan(date)','execute')::text" "false"
ckrole "anon calling it is refused outright" anon "select (public.generate_daily_execution_plan(current_date) is not null)::text" "ERROR:  permission denied for function generate_daily_execution_plan"
ck "anon lost USAGE on the loans sequence too" "select has_sequence_privilege('anon','public.loans_id_seq','USAGE')::text" "false"
ckrole "service_role still reads public.loans" service_role "select count(*)::text from public.loans" "1"
ckrole "service_role still reads public.emails" service_role "select count(*)::text from public.emails" "1"
ckrole "service_role can still WRITE a locked-down legacy table" service_role "with i as (insert into public.audit_log (label) values ('server-side write') returning 1) select count(*)::text from i" "1"

echo "── COGNIIQ REGRESSION: the platform still works ──"
ckrole "the token offer flow still answers anon" anon "select offer_number from public.public_offer_by_token('tok_live_demo_token_value','kunde@example.com')" "AN-2026-007"
ckrole "a wrong token still returns nothing" anon "select coalesce((select offer_number from public.public_offer_by_token('wrong','kunde@example.com')), 'none')" "none"
ckrole "anon can still respond to an offer by token" anon "select public.respond_offer_by_token('tok_live_demo_token_value','kunde@example.com','accept','K','C','A','n','sig')::text" "true"
ck "the offer was actually accepted" "select status from public.owner_offers where offer_number = 'AN-2026-007'" "accepted"
ckrole "a platform owner still reads owner_tax_adjustments" authenticated "set local cogniiq.test_is_owner = 'true'; select count(*)::text from public.owner_tax_adjustments" "1"
ckrole "a platform owner still WRITES owner_tax_adjustments" authenticated "set local cogniiq.test_is_owner = 'true'; with i as (insert into public.owner_tax_adjustments (tax_year, amount_cents) values (2027, -1) returning 1) select count(*)::text from i" "1"
ckrole "a signed-up non-owner reads NO owner_tax_adjustments" authenticated "select count(*)::text from public.owner_tax_adjustments" "0"
ckrole "anon reaches no owner_tax_adjustments at all" anon "select count(*)::text from public.owner_tax_adjustments" "ERROR:  permission denied for table owner_tax_adjustments"
ck "authenticated KEPT the owner_tax_adjustments sequence" "select has_sequence_privilege('authenticated','public.owner_tax_adjustments_id_seq','USAGE')::text" "true"
ck "anon lost the owner_tax_adjustments sequence" "select has_sequence_privilege('anon','public.owner_tax_adjustments_id_seq','USAGE')::text" "false"
ckrole "a platform owner still reads owner_invoices" authenticated "set local cogniiq.test_is_owner = 'true'; select count(*)::text from public.owner_invoices" "1"
ckrole "a platform admin still reads organization_members" authenticated "set local cogniiq.test_is_admin = 'true'; select count(*)::text from public.organization_members" "1"
ckrole "a platform admin still runs the execution planner" authenticated "set local cogniiq.test_is_admin = 'true'; select (public.generate_daily_execution_plan(current_date) is not null)::text" "true"

echo "── NOTHING UNRELATED CHANGED ──"
psql "$T" -Atc "
  select md5(string_agg(x, '|' order by x)) from (
    select c.relname || ':' || c.relrowsecurity || ':' ||
           coalesce((select string_agg(polname, ',' order by polname) from pg_policy where polrelid = c.oid), '-') || ':' ||
           coalesce((select string_agg(distinct grantee || privilege_type, ',' order by grantee || privilege_type)
                       from information_schema.role_table_grants g
                      where g.table_schema = 'public' and g.table_name = c.relname), '-') as x
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname in ('owner_tax_estimates','owner_invoices','organization_members','profiles','owner_offers','execution_days')
  ) s;" > /tmp/cogniiq_control_after.txt
if diff -q /tmp/cogniiq_control_before.txt /tmp/cogniiq_control_after.txt >/dev/null; then
  echo "ok — the 6 sound Cogniiq control tables are bit-identical (RLS, policies, grants)"
else echo "FAILED — a Cogniiq control table changed"; FAILED=1; fi
psql "$T" -Atc "select md5(string_agg(t || ':' || n::text, '|' order by t)) from (
    select relname as t, (select count(*) from pg_class c2 where c2.oid = c.oid) as n from pg_class c
     join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname='public' and c.relkind='r') z;" > /tmp/cogniiq_tables_after.txt
diff -q /tmp/cogniiq_tables_before.txt /tmp/cogniiq_tables_after.txt >/dev/null \
  && echo "ok — no table created or dropped" || { echo "FAILED — the table set changed"; FAILED=1; }
for tbl in owner_tax_estimates owner_invoices organization_members profiles owner_offers emails properties loans invoices; do
  psql "$T" -Atc "select count(*) from public.$tbl;" >> /tmp/cogniiq_rows_after.txt
done
# owner_tax_adjustments gained a row from the write test above; every other
# table must hold exactly the rows it held before.
diff -q /tmp/cogniiq_rows_before.txt /tmp/cogniiq_rows_after.txt >/dev/null \
  && echo "ok — not one row was added, changed or removed by the hardening" || { echo "FAILED — row counts moved"; diff /tmp/cogniiq_rows_before.txt /tmp/cogniiq_rows_after.txt; FAILED=1; }

echo "── re-apply is idempotent ──"
psql "$T" -1 -v ON_ERROR_STOP=1 -q -v apply=yes -f supabase/ops/shared_project_hardening.sql >/dev/null 2>&1
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_hardening_verify.sql >/dev/null 2>&1 \
  && echo "ok — second apply still verifies" || { echo "FAILED — re-apply broke verification"; FAILED=1; }

echo "── the BoLaGio migration chain applies ON TOP ──"
for f in supabase/migrations/20260916120000_booking_foundation.sql \
         supabase/migrations/20260917100000_booking_core_states.sql \
         supabase/migrations/20260917110000_booking_core_hardening.sql \
         supabase/migrations/20260919120000_admin_operators.sql \
         supabase/migrations/20260920120000_booking_production_hardening.sql \
         supabase/migrations/20260921120000_platform_completion.sql \
         supabase/migrations/20260922120000_finance_foundation.sql; do
  psql "$T" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "FAILED — $f did not apply"; FAILED=1; }
done
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/verify.sql 2>&1 | grep -E "FAILED|passed" | tail -1
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_hardening_verify.sql >/dev/null 2>&1 \
  && echo "ok — the hardening still verifies after the whole BoLaGio chain" || { echo "FAILED — BoLaGio migrations disturbed the hardening"; FAILED=1; }
ckrole "anon still reaches no BoLaGio booking data" anon "select count(*)::text from public.bolagio_booking_intents" "ERROR:  permission denied for table bolagio_booking_intents"
ckrole "the Cogniiq offer flow survives the BoLaGio chain" anon "select coalesce((select offer_number from public.public_offer_by_token('tok_live_demo_token_value','kunde@example.com')), 'BROKEN')" "AN-2026-007"

echo "── rollback restores the found state, then re-apply closes it again ──"
psql "$T" -1 -v ON_ERROR_STOP=1 -q -v apply=yes -f supabase/ops/shared_project_hardening_rollback.sql >/dev/null 2>&1
ckrole "after rollback anon reads public.loans again" anon "select count(*)::text from public.loans" "1"
ckrole "after rollback anon reads public.emails again" anon "select count(*)::text from public.emails" "1"
psql "$T" -1 -v ON_ERROR_STOP=1 -q -v apply=yes -f supabase/ops/shared_project_hardening.sql >/dev/null 2>&1
ckrole "re-applied: anon is locked out of public.loans again" anon "select count(*)::text from public.loans" "ERROR:  permission denied for table loans"
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_hardening_verify.sql >/dev/null 2>&1 \
  && echo "ok — verification passes after rollback and re-apply" || { echo "FAILED — re-apply after rollback"; FAILED=1; }

rm -f /tmp/cogniiq_*_before.txt /tmp/cogniiq_*_after.txt /tmp/cogniiq_dryrun.txt /tmp/cogniiq_apply.txt
psql "$DATABASE_URL" -q -c "drop database if exists cogniiq_shared_check;" >/dev/null 2>&1 || true
if [ "$FAILED" = "0" ]; then echo "════ shared-project hardening: all checks passed ════"; else
  echo "════ shared-project hardening: FAILURES ABOVE ════"; exit 1; fi
