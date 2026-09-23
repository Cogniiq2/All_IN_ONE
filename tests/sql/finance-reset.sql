-- Test-only reset of the finance ledger. In production the finance tables
-- are append-only (triggers refuse deletes); a test database drops the rows
-- with the triggers disabled and keeps the schema and the seeded reference
-- data (tax codes, categories, rates, policy, counterparties).
do $$ begin
  if to_regclass('public.bolagio_finance_transactions') is null then return; end if;
  execute 'alter table bolagio_finance_transactions disable trigger all';
  execute 'alter table bolagio_finance_transaction_lines disable trigger all';
  execute 'alter table bolagio_finance_payments disable trigger all';
  execute 'alter table bolagio_finance_documents disable trigger all';
  execute 'alter table bolagio_finance_reconciliations disable trigger all';
  execute 'alter table bolagio_finance_overrides disable trigger all';
  execute 'alter table bolagio_finance_tax_estimates disable trigger all';
  execute 'alter table bolagio_finance_document_links disable trigger all';
  execute 'alter table bolagio_minibar_movements disable trigger all';
  execute 'alter table bolagio_finance_reserves disable trigger all';
  execute 'alter table bolagio_finance_tax_payments disable trigger all';
  execute 'alter table bolagio_finance_exports disable trigger all';
  execute 'alter table bolagio_finance_tax_adjustments disable trigger all';
  execute 'alter table bolagio_finance_invoices disable trigger all';
  -- Booking.com settlement lines and payouts (20260926, when applied) reference
  -- transactions, payments, import rows and batches: truncated in the same statement.
  execute 'truncate bolagio_finance_reconciliations, bolagio_finance_document_links, bolagio_finance_overrides, bolagio_finance_tax_estimates,
           bolagio_finance_tax_notice_dues, bolagio_finance_tax_notices, bolagio_finance_tax_payments, bolagio_finance_tax_periods, bolagio_finance_tax_adjustments,
           bolagio_finance_assets, bolagio_finance_invoice_lines, bolagio_finance_invoices, bolagio_minibar_movements, bolagio_minibar_products,
           bolagio_finance_turnover_costs, bolagio_finance_transaction_lines, bolagio_finance_transactions, bolagio_finance_payments,
           bolagio_finance_documents, bolagio_finance_import_rows, bolagio_finance_import_batches, bolagio_finance_reserves, bolagio_finance_exports,
           bolagio_finance_periods, bolagio_finance_accounts, bolagio_invoice_sequences' || case when to_regclass('public.bolagio_finance_ota_settlements') is not null
                 then ', bolagio_finance_ota_settlements, bolagio_finance_ota_payouts' else '' end;
  execute 'alter table bolagio_finance_transactions enable trigger all';
  execute 'alter table bolagio_finance_transaction_lines enable trigger all';
  execute 'alter table bolagio_finance_payments enable trigger all';
  execute 'alter table bolagio_finance_documents enable trigger all';
  execute 'alter table bolagio_finance_reconciliations enable trigger all';
  execute 'alter table bolagio_finance_overrides enable trigger all';
  execute 'alter table bolagio_finance_tax_estimates enable trigger all';
  execute 'alter table bolagio_finance_document_links enable trigger all';
  execute 'alter table bolagio_minibar_movements enable trigger all';
  execute 'alter table bolagio_finance_reserves enable trigger all';
  execute 'alter table bolagio_finance_tax_payments enable trigger all';
  execute 'alter table bolagio_finance_exports enable trigger all';
  execute 'alter table bolagio_finance_tax_adjustments enable trigger all';
  execute 'alter table bolagio_finance_invoices enable trigger all';
end $$;
