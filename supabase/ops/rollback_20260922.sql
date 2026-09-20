-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260922120000_finance_foundation.sql. Run in ONE transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260922.sql
--
-- Drops every finance object. It REFUSES to run while the finance ledger
-- holds posted facts, issued invoices or registered documents: those are
-- accounting records (§ 147 AO) and are not dropped by a script. Export
-- them first, or set `bolagio.finance_rollback_confirmed` to
-- 'I have exported the finance ledger' in the session to proceed.
--
-- Nothing here touches a booking table: the finance schema has no foreign
-- key into the booking core and adds no column to it.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

do $$ begin
  if to_regclass('public.bolagio_finance_transactions') is null then return; end if;
  if coalesce(current_setting('bolagio.finance_rollback_confirmed', true), '') <> 'I have exported the finance ledger' then
    if exists (select 1 from bolagio_finance_transactions where source_system <> 'test') then
      raise exception 'rollback refused: the finance ledger holds posted transactions (export first, then set bolagio.finance_rollback_confirmed)';
    end if;
    if exists (select 1 from bolagio_finance_invoices where status = 'issued') then
      raise exception 'rollback refused: issued invoices exist';
    end if;
    if exists (select 1 from bolagio_finance_documents where legal_hold) then
      raise exception 'rollback refused: documents under legal hold exist';
    end if;
  end if;
end $$;

drop function if exists bolagio_minibar_record_movement(jsonb,text);
drop function if exists bolagio_finance_record_tax_stage(text,text,date,date,text,bigint,jsonb,text,text,boolean,text,date,date);
drop function if exists bolagio_finance_set_period_status(text,text,text,boolean,text);
drop function if exists bolagio_finance_link_document(uuid,text,uuid,text);
drop function if exists bolagio_finance_register_document(jsonb,text);
drop function if exists bolagio_finance_record_match(jsonb,text);
drop function if exists bolagio_finance_record_payment(jsonb,text);
drop function if exists bolagio_finance_set_transaction_state(uuid,jsonb,text,text);
drop function if exists bolagio_finance_reclassify_line(uuid,jsonb,text,text,boolean);
drop function if exists bolagio_finance_reverse_transaction(uuid,text,text,date);
drop function if exists bolagio_finance_post_transaction(jsonb,jsonb,text);

drop view if exists bolagio_finance_exception_counts;
drop view if exists bolagio_finance_unit_monthly;
drop view if exists bolagio_finance_cash_monthly;
drop view if exists bolagio_finance_vat_monthly;
drop view if exists bolagio_finance_pl_monthly;
drop view if exists bolagio_finance_ledger_lines;
drop view if exists bolagio_minibar_stock;

-- Triggers refuse deletes; dropping the tables does not fire row triggers.
drop table if exists bolagio_finance_turnover_costs;
drop table if exists bolagio_minibar_movements;
drop table if exists bolagio_minibar_products;
drop table if exists bolagio_finance_exports;
drop table if exists bolagio_finance_assets;
drop table if exists bolagio_finance_reserves;
drop table if exists bolagio_finance_tax_payments;
drop table if exists bolagio_finance_tax_notice_dues;
drop table if exists bolagio_finance_tax_notices;
drop table if exists bolagio_finance_tax_adjustments;
drop table if exists bolagio_finance_tax_estimates;
drop table if exists bolagio_finance_tax_periods;
drop table if exists bolagio_finance_invoice_lines;
drop table if exists bolagio_finance_invoices;
drop table if exists bolagio_finance_reconciliations;
drop table if exists bolagio_finance_payments;
drop table if exists bolagio_finance_overrides;
drop table if exists bolagio_finance_transaction_lines;
drop table if exists bolagio_finance_transactions;
drop table if exists bolagio_finance_document_links;
drop table if exists bolagio_finance_documents;
drop table if exists bolagio_finance_import_rows;
drop table if exists bolagio_finance_import_batches;
drop table if exists bolagio_finance_accounts;
drop table if exists bolagio_finance_counterparties;
drop table if exists bolagio_finance_periods;
drop table if exists bolagio_finance_policy;
drop table if exists bolagio_finance_tax_rates;
drop table if exists bolagio_finance_categories;
drop table if exists bolagio_finance_tax_codes;

drop function if exists bolagio_finance_period_locked(date);
drop function if exists bolagio_finance_ensure_period(date);
drop function if exists bolagio_finance_period_key(date);
drop function if exists bolagio_finance_tx_guard();
drop function if exists bolagio_finance_line_guard();
drop function if exists bolagio_finance_sync_totals();
drop function if exists bolagio_finance_append_only();
drop function if exists bolagio_finance_tax_adjustment_guard();
drop function if exists bolagio_finance_document_guard();
drop function if exists bolagio_finance_payment_guard();
drop function if exists bolagio_finance_invoice_guard();
