#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Prove the NEXT BoLaGio migration against a copy-shaped shared project, on a
# throwaway cluster. Never touches a real project.
#
#   1  a database shaped like ALL IN ONE: the Cogniiq/legacy fixture, the
#      shared-project hardening, Supabase's roles and default privileges,
#      then BoLaGio #1–#11 (the state ALL IN ONE is in)
#   2  shared_project_preflight.sql PASSES and reports #12 not applied
#   3  …and FAILS on each thing it exists to catch: a foreign bolagio_ object,
#      a foreign object squatting a #12 name, a missing #12 prerequisite,
#      a chain with a gap
#   4  #12 (20260927) applies cleanly, in one transaction
#   5  shared_project_verify.sql PASSES; the preflight passes again (post state)
#   6  no non-bolagio object changed: a fingerprint of every other relation,
#      column, policy, grant, function, trigger, type, sequence, default
#      privilege and row count is identical before and after — and the
#      inventory diff contains only bolagio_ lines
#   8  #13 (20261012 bedroom package): preflight/verify report it, it applies,
#   9  #14 (20261014 channel turnovers): the same cycle,
#      rolls back and re-applies cleanly, touching nothing outside bolagio_
#   7  rollback_20260927 in one transaction → #1–#11 state again (preflight
#      passes, verify refuses) → re-apply twice → verify passes → still no
#      non-bolagio change
#
#   ./scripts/shared-project-migration-check.sh
#
# Needs PostgreSQL 15+ binaries (PGBIN or /usr/lib/postgresql/*/bin), or
# DATABASE_URL pointing at a DISPOSABLE server (a database called
# bolagio_shared_migration_check is created and dropped on it).
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
DB=bolagio_shared_migration_check
psql "$DATABASE_URL" -q -c "drop database if exists $DB;" -c "create database $DB;"
T="${BASE%/*}/$DB${QS:+?$QS}"
WORK="$(mktemp -d)"
FAILED=0
pass() { echo "ok — $1"; }
fail() { echo "FAILED — $1"; FAILED=1; }
must_pass() { # label, file
  if psql "$T" -v ON_ERROR_STOP=1 -q -f "$2" > "$WORK/out.txt" 2>&1; then pass "$1"; else fail "$1"; sed -n '/ERROR/,$p' "$WORK/out.txt" | head -8; fi
}
must_fail() { # label, file, expected message fragment
  if psql "$T" -v ON_ERROR_STOP=1 -q -f "$2" > "$WORK/out.txt" 2>&1; then fail "$1 (it passed)";
  elif grep -q "$3" "$WORK/out.txt"; then pass "$1"; else fail "$1 (wrong reason)"; grep ERROR "$WORK/out.txt" | head -3; fi
}

# Everything that is NOT BoLaGio's, as one hash per line. Row counts included:
# a migration that moved a Cogniiq row would show here.
fingerprint() {
  psql "$T" -Atq -v ON_ERROR_STOP=1 <<'SQL'
select 'rel ' || n.nspname || '.' || c.relname || ' ' || c.relkind::text || ' rls=' || c.relrowsecurity || ' acl=' || coalesce(c.relacl::text, '-')
       || ' cols=' || coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum)
                                 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '-')
       || ' opts=' || coalesce(c.reloptions::text, '-')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'
  and c.relname not like 'bolagio\_%' and c.relkind in ('r','p','v','m','S','f','i')
union all
select 'policy ' || schemaname || '.' || tablename || '.' || policyname || ' ' || coalesce(qual, '-') || ' ' || coalesce(with_check, '-') || ' ' || array_to_string(roles, ',')
from pg_policies where tablename not like 'bolagio\_%'
union all
select 'fn ' || n.nspname || '.' || p.oid::regprocedure::text || ' acl=' || coalesce(p.proacl::text, '-') || ' md5=' || md5(p.prosrc) || ' secdef=' || p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog','information_schema') and p.proname not like 'bolagio\_%'
union all
select 'trigger ' || c.relname || '.' || t.tgname || ' ' || t.tgenabled::text
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and c.relname not like 'bolagio\_%' and n.nspname not in ('pg_catalog','information_schema')
union all
select 'type ' || n.nspname || '.' || t.typname || ' ' || t.typtype::text
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname not in ('pg_catalog','information_schema','pg_toast') and t.typname not like 'bolagio\_%' and t.typname not like '\_bolagio\_%'
  and not exists (select 1 from pg_class c where c.reltype = t.oid and c.relname like 'bolagio\_%')
union all
select 'defacl ' || pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '*') || ' ' || d.defaclobjtype::text || ' ' || d.defaclacl::text
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
union all
select 'role ' || rolname || ' login=' || rolcanlogin || ' bypassrls=' || rolbypassrls || ' super=' || rolsuper from pg_roles where rolname not like 'pg\_%'
union all
select 'ext ' || extname || ' ' || extversion from pg_extension
order by 1;
SQL
  # Row counts of every non-bolagio table.
  psql "$T" -Atq -c "select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'bolagio\_%' order by 1" |
    while read -r t; do echo "rows $t $(psql "$T" -Atqc "select count(*) from $t")"; done
}

echo "── 1. a shared project shaped like ALL IN ONE ──"
psql "$T" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin create role anon nologin;                    exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin;           exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls;  exception when duplicate_object then null; end $$;
do $$ begin create role authenticator login noinherit;   exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default privileges: every new table / function / sequence in
-- public is granted to all three API roles. The migrations must revoke
-- them from the browser roles themselves; this makes that visible.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/ops/fixtures/cogniiq_shared_project_fixture.sql >/dev/null
psql "$T" -1 -v ON_ERROR_STOP=1 -q -v apply=yes -f supabase/ops/shared_project_hardening.sql >/dev/null
CHAIN_1_11=(
  supabase/migrations/20260916120000_booking_foundation.sql
  supabase/migrations/20260917100000_booking_core_states.sql
  supabase/migrations/20260917110000_booking_core_hardening.sql
  supabase/migrations/20260919120000_admin_operators.sql
  supabase/migrations/20260920120000_booking_production_hardening.sql
  supabase/migrations/20260921120000_platform_completion.sql
  supabase/migrations/20260922120000_finance_foundation.sql
  supabase/migrations/20260923120000_reservation_import.sql
  supabase/migrations/20260924120000_guest_privileges.sql
  supabase/migrations/20260925120000_legal_compliance.sql
  supabase/migrations/20260926120000_booking_com_finance_statement.sql
)
SEP27=supabase/migrations/20260927120000_finance_ingestion_pipeline.sql
for f in "${CHAIN_1_11[@]}"; do
  # One file, one transaction: #2 adds enum values #3 uses, so never -1 across files.
  psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { fail "$f did not apply"; }
done
psql "$T" -v ON_ERROR_STOP=1 -q -f supabase/seed/bolagio_booking_units.sql >/dev/null
# Some BoLaGio data, as the live project holds (units, a reservation, a finance import).
psql "$T" -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into bolagio_reservations (unit_id, external_booking_id, source, channel_reference, provider_status, status_class, check_in, check_out)
select id, '93233347', 'booking_com', '6923362372', 'confirmed', 'active', current_date + 10, current_date + 13 from bolagio_units where slug = 'schulstrasse-ii';
SQL
pass "#1–#11 applied on top of the Cogniiq fixture and the hardening"

fingerprint > "$WORK/fp_before.txt"
psql "$T" -q -v format=unaligned -f supabase/ops/shared_project_inventory.sql > "$WORK/inv_before.txt" 2>/dev/null || true

echo "── 2. the shared-project preflight passes on #1–#11 ──"
must_pass "preflight passes on the ALL IN ONE state (#1–#11)" supabase/ops/shared_project_preflight.sql
grep -q "#1–#11 applied, #12 not applied" "$WORK/out.txt" && pass "it reports #1–#11 applied and #12 not applied" || fail "it did not report the #1–#11 state"
grep -q "no collision: .* every one created by the chain" "$WORK/out.txt" && pass "no legitimate finance / reservation / privilege object is flagged" || fail "collision check did not report cleanly"

echo "── 3. …and refuses what it exists to catch ──"
psql "$T" -qc "create table public.bolagio_rogue (id int);"
must_fail "a bolagio_ table no migration creates is a NAME COLLISION" supabase/ops/shared_project_preflight.sql "NAME COLLISION"
psql "$T" -qc "drop table public.bolagio_rogue;"
psql "$T" -qc "create function public.bolagio_finance_pipeline_helper() returns int language sql as 'select 1';"
must_fail "a bolagio_ function no migration creates is a NAME COLLISION" supabase/ops/shared_project_preflight.sql "no BoLaGio migration creates this signature"
psql "$T" -qc "drop function public.bolagio_finance_pipeline_helper();"
psql "$T" -qc "create table public.bolagio_finance_ingestion_queue (id int);"
must_fail "a foreign table squatting #12's queue name is refused" supabase/ops/shared_project_preflight.sql "exists with a shape #12 did not create"
psql "$T" -qc "drop table public.bolagio_finance_ingestion_queue;"
psql "$T" -qc "alter table public.bolagio_payment_events rename column capture_id to capture_ref;"
must_fail "a missing #12 prerequisite column is refused" supabase/ops/shared_project_preflight.sql "#12 reads columns that do not exist: bolagio_payment_events.capture_id"
psql "$T" -qc "alter table public.bolagio_payment_events rename column capture_ref to capture_id;"
psql "$T" -qc "alter table public.bolagio_reservations rename to bolagio_reservations_hidden;"
must_fail "a chain with a gap (#8 missing under #9–#11) is refused as out of order" supabase/ops/shared_project_preflight.sql "#9 without #8"
psql "$T" -qc "alter table public.bolagio_reservations_hidden rename to bolagio_reservations;"
psql "$T" -qc "alter table public.bolagio_finance_ota_settlements rename to bolagio_finance_ota_settlements_hidden;"
must_fail "#11 not applied: #12's prerequisites are refused, and #11 is named" supabase/ops/shared_project_preflight.sql "requires #1–#11; not applied: #11 20260926120000_booking_com_finance_statement"
psql "$T" -qc "alter table public.bolagio_finance_ota_settlements_hidden rename to bolagio_finance_ota_settlements;"
must_pass "restored: the preflight passes again" supabase/ops/shared_project_preflight.sql
fingerprint > "$WORK/fp_probe.txt"
diff -q "$WORK/fp_before.txt" "$WORK/fp_probe.txt" >/dev/null && pass "the negative probes left nothing behind" || fail "the probes changed the fixture"

echo "── 4. #12 applies cleanly, in one transaction ──"
if psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$SEP27" > "$WORK/apply.txt" 2>&1; then pass "20260927 applied"; else fail "20260927 did not apply"; cat "$WORK/apply.txt"; fi

echo "── 5. the shared-project verify passes ──"
must_pass "shared-project verify passes after #12" supabase/ops/shared_project_verify.sql
grep -q "#12 bolagio_finance_pipeline_status is a security_invoker view" "$WORK/out.txt" && pass "the #12 assertions ran" || fail "the #12 assertions did not run"
must_pass "the preflight passes on the post-#12 state too" supabase/ops/shared_project_preflight.sql
grep -q "#1–#12 all applied" "$WORK/out.txt" && pass "…and reports #12 applied" || fail "it did not report #12 applied"
for role in anon authenticated; do
  got="$(psql "$T" -Atc "set role $role; select count(*) from public.bolagio_finance_pipeline_status;" 2>&1 | tail -1 || true)"
  case "$got" in *"permission denied"*) pass "$role cannot read the pipeline status";; *) fail "$role read the pipeline status ($got)";; esac
  got="$(psql "$T" -Atc "set role $role; select public.bolagio_finance_enqueue_missing(true);" 2>&1 | tail -1 || true)"
  case "$got" in *"permission denied"*) pass "$role cannot run the backfill function";; *) fail "$role ran the backfill function ($got)";; esac
done

echo "── 6. no non-bolagio object changed ──"
fingerprint > "$WORK/fp_after.txt"
if diff -u "$WORK/fp_before.txt" "$WORK/fp_after.txt" > "$WORK/fp.diff"; then
  pass "every non-bolagio relation, column, policy, grant, function, trigger, type, default privilege, role and row count is identical ($(wc -l < "$WORK/fp_after.txt") lines)"
else fail "a non-bolagio object changed:"; head -20 "$WORK/fp.diff"; fi
psql "$T" -q -v format=unaligned -f supabase/ops/shared_project_inventory.sql > "$WORK/inv_after.txt" 2>/dev/null || true
# Changed lines, minus the two kinds of AGGREGATE line that change whenever
# any object is added: psql's "(N rows)" footers, and §1's per-schema totals
# row for public (owner|tables|views|functions). Every object line must name
# a bolagio_ object.
CHANGED="$(diff "$WORK/inv_before.txt" "$WORK/inv_after.txt" | grep '^[<>]' | sed 's/^[<>] //' \
  | grep -v '^([0-9]* rows\?)$' | grep -v '^public|[a-z_]*|[0-9]*|[0-9]*|[0-9]*$' | grep -v 'generated_at' | grep -v '^[0-9-]\{10\} [0-9:.+]*|' || true)"
FOREIGN="$(printf '%s\n' "$CHANGED" | grep -v 'bolagio' | grep -v '^$' || true)"
if [ -z "$FOREIGN" ]; then pass "the inventory diff names only bolagio_ objects ($(printf '%s\n' "$CHANGED" | grep -c bolagio || true) changed lines)"; else fail "the inventory diff has non-bolagio lines:"; printf '%s\n' "$FOREIGN" | head -10; fi

echo "── 7. rollback, then re-apply ──"
if psql "$T" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20260927.sql > "$WORK/rb.txt" 2>&1; then pass "rollback_20260927 ran in one transaction"; else fail "rollback failed"; cat "$WORK/rb.txt"; fi
must_pass "after rollback the preflight passes (the #1–#11 state again)" supabase/ops/shared_project_preflight.sql
grep -q "#1–#11 applied, #12 not applied" "$WORK/out.txt" && pass "…and reports #12 not applied" || fail "rollback left #12 detectable"
must_fail "after rollback the verify refuses (it requires #12)" supabase/ops/shared_project_verify.sql "VERIFY FAILED: #12"
fingerprint > "$WORK/fp_rb.txt"
diff -q "$WORK/fp_before.txt" "$WORK/fp_rb.txt" >/dev/null && pass "rollback touched nothing outside bolagio_" || { fail "rollback changed a non-bolagio object"; diff "$WORK/fp_before.txt" "$WORK/fp_rb.txt" | head; }
for i in 1 2; do
  psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$SEP27" > "$WORK/apply.txt" 2>&1 && pass "re-apply $i of 20260927" || { fail "re-apply $i failed"; cat "$WORK/apply.txt"; }
done
must_pass "the verify passes after rollback and two re-applies" supabase/ops/shared_project_verify.sql
must_pass "the plain verify.sql passes too" supabase/ops/verify.sql
fingerprint > "$WORK/fp_final.txt"
diff -q "$WORK/fp_before.txt" "$WORK/fp_final.txt" >/dev/null && pass "still no non-bolagio change after rollback and re-apply" || fail "a non-bolagio object changed across rollback / re-apply"
got="$(psql "$T" -Atc "select count(*) from bolagio_reservations")"
[ "$got" = "1" ] && pass "BoLaGio data survived apply, rollback and re-apply (reservation still there)" || fail "BoLaGio data changed ($got reservations)"

echo "── 8. #13 (20261012 bedroom package): apply, verify, roll back, re-apply ──"
SEP13=supabase/migrations/20261012120000_booking_bedroom_package.sql
must_pass "the preflight passes before #13" supabase/ops/shared_project_preflight.sql
grep -q "#13 bedroom package not applied" "$WORK/out.txt" && pass "…and reports #13 not applied" || fail "it did not report #13 not applied"
if psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$SEP13" > "$WORK/apply.txt" 2>&1; then pass "20261012 applied in one transaction"; else fail "20261012 did not apply"; cat "$WORK/apply.txt"; fi
must_pass "the preflight passes after #13" supabase/ops/shared_project_preflight.sql
grep -q "#13 bedroom package applied" "$WORK/out.txt" && pass "…and reports #13 applied" || fail "it did not report #13 applied"
must_pass "shared-project verify passes after #13" supabase/ops/shared_project_verify.sql
grep -q "#13 one_bedroom party check exists" "$WORK/out.txt" && pass "the #13 assertions ran" || fail "the #13 assertions did not run"
fingerprint > "$WORK/fp_13.txt"
diff -q "$WORK/fp_before.txt" "$WORK/fp_13.txt" >/dev/null && pass "#13 touched nothing outside bolagio_" || { fail "#13 changed a non-bolagio object"; diff "$WORK/fp_before.txt" "$WORK/fp_13.txt" | head; }
if psql "$T" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20261012.sql > "$WORK/rb.txt" 2>&1; then pass "rollback_20261012 ran in one transaction"; else fail "rollback_20261012 failed"; cat "$WORK/rb.txt"; fi
must_pass "after the #13 rollback the preflight passes" supabase/ops/shared_project_preflight.sql
grep -q "#13 bedroom package not applied" "$WORK/out.txt" && pass "…and reports #13 not applied again" || fail "rollback left #13 detectable"
for i in 1 2; do
  psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$SEP13" > "$WORK/apply.txt" 2>&1 && pass "re-apply $i of 20261012" || { fail "re-apply $i of 20261012 failed"; cat "$WORK/apply.txt"; }
done
must_pass "the verify passes after the #13 rollback and two re-applies" supabase/ops/shared_project_verify.sql
got="$(psql "$T" -Atc "select count(*) from bolagio_reservations")"
[ "$got" = "1" ] && pass "BoLaGio data survived #13 apply, rollback and re-apply" || fail "BoLaGio data changed across #13 ($got reservations)"

echo "── 9. #14 (20261014 channel turnovers): apply, verify, roll back, re-apply ──"
SEP14=supabase/migrations/20261014120000_channel_turnovers.sql
must_pass "the preflight passes before #14" supabase/ops/shared_project_preflight.sql
grep -q "#14 channel turnovers not applied" "$WORK/out.txt" && pass "…and reports #14 not applied" || fail "it did not report #14 not applied"
if psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$SEP14" > "$WORK/apply.txt" 2>&1; then pass "20261014 applied in one transaction"; else fail "20261014 did not apply"; cat "$WORK/apply.txt"; fi
must_pass "the preflight passes after #14" supabase/ops/shared_project_preflight.sql
grep -q "#14 channel turnovers applied" "$WORK/out.txt" && pass "…and reports #14 applied" || fail "it did not report #14 applied"
must_pass "shared-project verify passes after #14" supabase/ops/shared_project_verify.sql
grep -q "#14 origin check exists" "$WORK/out.txt" && pass "the #14 assertions ran" || fail "the #14 assertions did not run"
fingerprint > "$WORK/fp_14.txt"
diff -q "$WORK/fp_before.txt" "$WORK/fp_14.txt" >/dev/null && pass "#14 touched nothing outside bolagio_" || { fail "#14 changed a non-bolagio object"; diff "$WORK/fp_before.txt" "$WORK/fp_14.txt" | head; }
if psql "$T" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20261014.sql > "$WORK/rb.txt" 2>&1; then pass "rollback_20261014 ran in one transaction"; else fail "rollback_20261014 failed"; cat "$WORK/rb.txt"; fi
must_pass "after the #14 rollback the preflight passes" supabase/ops/shared_project_preflight.sql
grep -q "#14 channel turnovers not applied" "$WORK/out.txt" && pass "…and reports #14 not applied again" || fail "rollback left #14 detectable"
for i in 1 2; do
  psql "$T" -1 -v ON_ERROR_STOP=1 -q -f "$SEP14" > "$WORK/apply.txt" 2>&1 && pass "re-apply $i of 20261014" || { fail "re-apply $i of 20261014 failed"; cat "$WORK/apply.txt"; }
done
must_pass "the verify passes after the #14 rollback and two re-applies" supabase/ops/shared_project_verify.sql
got="$(psql "$T" -Atc "select count(*) from bolagio_reservations")"
[ "$got" = "1" ] && pass "BoLaGio data survived #14 apply, rollback and re-apply" || fail "BoLaGio data changed across #14 ($got reservations)"

rm -rf "$WORK"
psql "$DATABASE_URL" -q -c "drop database if exists $DB;" >/dev/null 2>&1 || true
if [ "$FAILED" = "0" ]; then echo "════ shared-project migration check: all checks passed ════"; else
  echo "════ shared-project migration check: FAILURES ABOVE ════"; exit 1; fi
