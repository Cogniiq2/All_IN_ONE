-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260926120000_booking_com_finance_statement.sql. Run in ONE
-- transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260926.sql
--
-- Drops the settlement and payout tables, their view and functions, the
-- `settlement_id` column on bolagio_finance_import_rows, and narrows the
-- import batch source_type check back to what 20260922 allowed.
--
-- ── What it REFUSES to do silently ────────────────────────────────────────
-- Settlement lines are accounting evidence (§ 147 AO, § 257 HGB): what
-- Booking.com said it earned, kept and paid out. If either table holds a
-- row, this script stops unless the operator has said, in the session, that
-- the lines have been exported:
--
--   set bolagio.ota_rollback_confirmed = 'I have exported the settlements';
--
-- It also stops if any import batch was staged with the finance-statement
-- adapter, because the narrowed check could not be re-added over those rows.
-- Those batches are evidence too; nothing here deletes them.
--
-- ── What it never touches ─────────────────────────────────────────────────
-- Ledger transactions the settlement import POSTED (source_system
-- 'booking_com_statement') stay exactly as they are: the ledger is corrected
-- by reversal, never by a schema rollback. Reverse them first through the
-- finance screens if they must go. Nothing in the booking core, the
-- reservation table or any other finance table is touched.
--
-- ── Order ─────────────────────────────────────────────────────────────────
-- Run this BEFORE rollback_20260923.sql: settlements reference
-- bolagio_reservations, so the reservation table cannot be dropped first.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

do $$ begin
  if to_regclass('public.bolagio_finance_ota_settlements') is null then return; end if;
  if coalesce(current_setting('bolagio.ota_rollback_confirmed', true), '') <> 'I have exported the settlements' then
    if exists (select 1 from bolagio_finance_ota_settlements) or exists (select 1 from bolagio_finance_ota_payouts) then
      raise exception 'rollback refused: % settlement line(s) and % payout(s) exist. Export them, or set bolagio.ota_rollback_confirmed.',
        (select count(*) from bolagio_finance_ota_settlements), (select count(*) from bolagio_finance_ota_payouts);
    end if;
  end if;
  if exists (select 1 from bolagio_finance_import_batches where source_type = 'booking_com_finance_statement') then
    raise exception 'rollback refused: % import batch(es) were staged with the Booking.com finance statement adapter; the narrowed source_type check cannot be restored over them.',
      (select count(*) from bolagio_finance_import_batches where source_type = 'booking_com_finance_statement');
  end if;
end $$;

drop view if exists bolagio_finance_ota_payout_totals;
drop function if exists bolagio_finance_accept_ota_amendment(uuid, text, text);
drop function if exists bolagio_finance_record_ota_settlement(jsonb, text);

alter table if exists bolagio_finance_import_rows drop column if exists settlement_id;

-- The guard triggers refuse deletes, and the tables are dropped whole: no
-- row-level delete runs, so they need not be disabled.
drop table if exists bolagio_finance_ota_settlements;
drop table if exists bolagio_finance_ota_payouts;
drop function if exists bolagio_finance_ota_settlement_guard();
drop function if exists bolagio_finance_ota_payout_guard();

do $$ begin
  if to_regclass('public.bolagio_finance_import_batches') is null then return; end if;
  alter table bolagio_finance_import_batches drop constraint if exists bolagio_finance_import_batches_source_type_check;
  alter table bolagio_finance_import_batches
    add constraint bolagio_finance_import_batches_source_type_check
    check (source_type in ('booking_com_reservations','booking_com_payouts','paypal_activity','bank_csv','supplier_csv','manual_csv','accountant_csv','other'));
end $$;
