-- ════════════════════════════════════════════════════════════════════════════
-- REAL Postgres tests for the finance foundation (20260922120000).
--
-- Runs after tests/sql/completion.sql on the same throwaway database
-- (`t_assert` and the unit fixtures are defined in concurrency.sql).
--
-- What is proven here and nowhere else:
--   • posting validates gross = net + VAT, the rate against the tax code,
--     effective dates, and refuses an unknown or inactive code
--   • the same source key posts once (idempotent ingestion)
--   • posted money is immutable; classification moves only through the
--     override function, which records old/new/reason/actor
--   • a reversal mirrors every line, links both ways, freezes the original
--   • a locked period refuses inserts, updates and reversals dated into it,
--     but a correction posted into the open period still marks the original
--   • the accountant-only gates: locking, accountant stages, unlocking a
--     locked line
--   • tax estimates, overrides, reconciliations and movements are append-only
--   • document content is unique by hash and the original is immutable
--   • payments are unique per provider reference
--   • minibar sale posts revenue at the product's own tax code plus COGS and
--     reduces stock; a second call with the same key posts nothing
--   • the period gate refuses "ready" while lines need review
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- helper: post a simple one-line transaction
create or replace function tf_post(p_key text, p_kind text, p_date date, p_cat text, p_code text, p_net bigint, p_vat bigint, p_extra jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := bolagio_finance_post_transaction(
    jsonb_build_object('kind', p_kind, 'booked_on', p_date, 'description', 'test ' || p_key, 'source_type', 'manual',
                       'source_system', 'test', 'source_reference', p_key, 'currency', 'EUR') || p_extra,
    jsonb_build_array(jsonb_build_object('category', p_cat, 'tax_code', p_code, 'net_cents', p_net, 'vat_cents', p_vat, 'gross_cents', p_net + p_vat,
                       'input_vat_treatment', case when p_kind = 'revenue' then 'not_applicable' else 'deductible' end, 'classification', 'reviewed')),
    'tester');
  return (r->>'id')::uuid;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Posting validation and idempotency
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; b uuid; r jsonb; failed boolean;
begin
  delete from bolagio_finance_reconciliations; delete from bolagio_finance_document_links;
  -- (finance tables are never deleted from in production; this is a test database)
  a := tf_post('rev-1', 'revenue', '2026-08-15', 'accommodation_revenue', 'DE_ACCOMMODATION_REDUCED', 10000, 700);
  perform t_assert(a is not null, 'a valid accommodation revenue posts');
  perform t_assert((select gross_cents from bolagio_finance_transactions where id = a) = 10700, 'header totals follow the lines');

  r := bolagio_finance_post_transaction(
    jsonb_build_object('kind','revenue','booked_on','2026-08-15','description','dup','source_type','manual','source_system','test','source_reference','rev-1'),
    jsonb_build_array(jsonb_build_object('category','accommodation_revenue','tax_code','DE_ACCOMMODATION_REDUCED','net_cents',1,'vat_cents',0,'gross_cents',1)), 'tester');
  perform t_assert((r->>'created')::boolean = false and (r->>'id')::uuid = a, 'the same source key posts once and returns the existing id');
  perform t_assert((select count(*) from bolagio_finance_transactions where source_reference = 'rev-1') = 1, 'no duplicate revenue row');

  failed := false;
  begin perform tf_post('bad-1', 'revenue', '2026-08-15', 'accommodation_revenue', 'DE_ACCOMMODATION_REDUCED', 10000, 1900);
  exception when sqlstate 'BLG14' then failed := true; end;
  perform t_assert(failed, 'VAT inconsistent with the tax code rate is refused (BLG14)');

  failed := false;
  begin
    perform bolagio_finance_post_transaction(
      jsonb_build_object('kind','expense','booked_on','2026-08-15','description','x','source_type','manual','source_system','test','source_reference','bad-2'),
      jsonb_build_array(jsonb_build_object('category','cleaning','tax_code','DE_STANDARD','net_cents',10000,'vat_cents',1900,'gross_cents',12000)), 'tester');
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'gross <> net + vat is refused (BLG12)');

  failed := false;
  begin perform tf_post('bad-3', 'expense', '2026-08-15', 'cleaning', 'NOPE', 100, 19);
  exception when sqlstate 'BLG14' then failed := true; end;
  perform t_assert(failed, 'an unknown tax code is refused');

  failed := false;
  begin
    perform bolagio_finance_post_transaction(
      jsonb_build_object('kind','expense','booked_on','2026-08-15','description','x','source_type','manual','source_system','test','source_reference','bad-4'),
      '[]'::jsonb, 'tester');
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'a transaction without lines is refused');

  -- Review-required code: accepted, but never verified.
  b := tf_post('rev-2', 'expense', '2026-08-16', 'guest_supplies', 'DE_REVIEW_REQUIRED', 5000, 0);
  perform t_assert((select classification from bolagio_finance_transaction_lines where transaction_id = b) = 'needs_review', 'a DE_REVIEW_REQUIRED line is forced to needs_review even when posted as reviewed');

  -- Reverse charge: net only, RC VAT computed, treatment forced.
  r := bolagio_finance_post_transaction(
    jsonb_build_object('kind','expense','booked_on','2026-08-20','description','SaaS','source_type','manual','source_system','test','source_reference','rc-1','counterparty_label','Foreign SaaS Inc.'),
    jsonb_build_array(jsonb_build_object('category','software','tax_code','DE_REVERSE_CHARGE','net_cents',10000,'vat_cents',0,'gross_cents',10000,'reverse_charge_vat_cents',1900,'classification','reviewed')), 'tester');
  perform t_assert((select input_vat_treatment from bolagio_finance_transaction_lines where transaction_id = (r->>'id')::uuid) = 'reverse_charge', 'a reverse-charge code forces reverse_charge treatment');
  perform t_assert((select rc_output_vat_cents from bolagio_finance_vat_monthly where period_key = '2026-08' and tax_code = 'DE_REVERSE_CHARGE') = 1900, 'the VAT view carries reverse-charge output VAT');
  perform t_assert((select rc_input_vat_cents from bolagio_finance_vat_monthly where period_key = '2026-08' and tax_code = 'DE_REVERSE_CHARGE') = 1900, 'and the corresponding input VAT');

  failed := false;
  begin
    perform bolagio_finance_post_transaction(
      jsonb_build_object('kind','expense','booked_on','2026-08-20','description','SaaS','source_type','manual','source_system','test','source_reference','rc-bad'),
      jsonb_build_array(jsonb_build_object('category','software','tax_code','DE_REVERSE_CHARGE','net_cents',10000,'vat_cents',1900,'gross_cents',11900)), 'tester');
  exception when sqlstate 'BLG14' then failed := true; end;
  perform t_assert(failed, 'VAT on a reverse-charge line is refused');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Immutability, overrides, reversal
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; l uuid; r jsonb; failed boolean; rev uuid;
begin
  a := (select id from bolagio_finance_transactions where source_reference = 'rev-1');
  l := (select id from bolagio_finance_transaction_lines where transaction_id = a);

  failed := false;
  begin update bolagio_finance_transaction_lines set net_cents = 1 where id = l;
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'line money is immutable (BLG12)');

  failed := false;
  begin update bolagio_finance_transactions set booked_on = '2026-09-01' where id = a;
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'header financial columns are immutable');

  failed := false;
  begin update bolagio_finance_transactions set net_cents = 5 where id = a;
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'header totals cannot be set by hand');

  failed := false;
  begin delete from bolagio_finance_transactions where id = a;
  exception when sqlstate 'BLG10' then failed := true; end;
  perform t_assert(failed, 'transactions are never deleted (BLG10)');

  failed := false;
  begin update bolagio_finance_transaction_lines set category = 'other_revenue' where id = l;
  exception when sqlstate 'BLG13' then failed := true; end;
  perform t_assert(failed, 'classification cannot change outside the override function (BLG13)');

  r := bolagio_finance_reclassify_line(l, '{"category":"other_revenue"}', '', 'ops@example.com');
  perform t_assert((r->>'ok')::boolean = false and r->>'code' = 'REASON_REQUIRED', 'a reclassification needs a reason');
  r := bolagio_finance_reclassify_line(l, '{"category":"other_revenue"}', 'wrong bucket', 'ops@example.com');
  perform t_assert((r->>'ok')::boolean and (r->>'changed')::int >= 1, 'reclassify with a reason succeeds');
  perform t_assert((select count(*) from bolagio_finance_overrides where target_id = l and field = 'category' and old_value = 'accommodation_revenue' and new_value = 'other_revenue' and reason = 'wrong bucket' and actor = 'ops@example.com') = 1,
    'the override row carries old value, new value, reason and actor');
  r := bolagio_finance_reclassify_line(l, '{"tax_code":"DE_STANDARD"}', 'try a rate change', 'ops@example.com');
  perform t_assert((r->>'ok')::boolean = false and r->>'code' = 'RATE_CHANGE_NEEDS_REVERSAL', 'changing to a code with another rate is refused: money is immutable');

  -- Accountant lock and its gate.
  r := bolagio_finance_reclassify_line(l, '{"category":"accommodation_revenue"}', 'final', 'steuerberater@example.com', true);
  perform t_assert(r->>'classification' = 'accountant_locked', 'the accountant path locks the line');
  perform t_assert((select review_state from bolagio_finance_transactions where id = a) = 'accountant_locked', 'the header follows');
  r := bolagio_finance_reclassify_line(l, '{"category":"other_revenue"}', 'oops', 'ops@example.com');
  perform t_assert((r->>'ok')::boolean = false and r->>'code' = 'ACCOUNTANT_LOCKED', 'an operator cannot re-classify an accountant-locked line');

  -- Reversal.
  r := bolagio_finance_reverse_transaction(a, '', 'ops@example.com');
  perform t_assert(false, 'unreachable') ;
exception when sqlstate 'BLG12' then
  raise notice 'ok — a reversal without a reason is refused';
end $$;

do $$
declare a uuid; r jsonb; rev uuid; failed boolean;
begin
  a := (select id from bolagio_finance_transactions where source_reference = 'rev-1');
  r := bolagio_finance_reverse_transaction(a, 'booking cancelled', 'ops@example.com', '2026-09-10');
  perform t_assert((r->>'ok')::boolean, 'a reversal posts');
  rev := (r->>'reversal_id')::uuid;
  perform t_assert((select status from bolagio_finance_transactions where id = a) = 'reversed', 'the original is marked reversed');
  perform t_assert((select reversed_by from bolagio_finance_transactions where id = a) = rev, 'and points at the reversal');
  perform t_assert((select correction_of from bolagio_finance_transactions where id = rev) = a, 'the reversal points back');
  perform t_assert((select gross_cents from bolagio_finance_transactions where id = rev) = -10700, 'the reversal mirrors the amount');
  perform t_assert((select sum(net_cents) from bolagio_finance_ledger_lines where transaction_id in (a, rev)) = 0, 'original + reversal net to zero in the ledger view');
  r := bolagio_finance_reverse_transaction(a, 'again', 'ops@example.com');
  perform t_assert((r->>'ok')::boolean = false and r->>'code' = 'NOT_POSTED', 'a reversed transaction cannot be reversed twice');
  failed := false;
  begin update bolagio_finance_transactions set note = 'x' where id = a;
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'a reversed transaction is frozen');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Period locking
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; r jsonb; failed boolean; b uuid;
begin
  a := tf_post('lock-1', 'expense', '2026-07-05', 'cleaning', 'DE_STANDARD', 8000, 1520);
  -- A line still needing review blocks readiness beyond `review`.
  b := tf_post('lock-2', 'expense', '2026-07-06', 'guest_supplies', 'DE_REVIEW_REQUIRED', 900, 0);
  r := bolagio_finance_set_period_status('2026-07', 'locked', 'ops@example.com', false);
  perform t_assert((r->>'ok')::boolean = false and r->>'code' = 'ACCOUNTANT_REQUIRED', 'an operator cannot lock a period');
  r := bolagio_finance_set_period_status('2026-07', 'accountant_reviewed', 'sb@example.com', true);
  perform t_assert((r->>'ok')::boolean = false and r->>'code' = 'BLOCKED' and (r->'blockers'->>'unclassified')::int = 1, 'a period with unclassified lines cannot become accountant-reviewed');
  r := bolagio_finance_reclassify_line((select id from bolagio_finance_transaction_lines where transaction_id = b), '{"tax_code":"DE_STANDARD"}', 'x', 'ops@example.com');
  perform t_assert(r->>'code' = 'VAT_INCONSISTENT_WITH_CODE', 'a 0-VAT line cannot become 19 % by reclassification');
  r := bolagio_finance_reclassify_line((select id from bolagio_finance_transaction_lines where transaction_id = b), '{"tax_code":"DE_OUTSIDE_SCOPE","input_vat_treatment":"not_applicable"}', 'deposit, not a supply', 'ops@example.com');
  perform t_assert((r->>'ok')::boolean, 'a review line resolved to a 0-rate code');
  r := bolagio_finance_set_period_status('2026-07', 'review', 'ops@example.com', false);
  perform t_assert((r->>'ok')::boolean, 'operators can move a period to review');
  r := bolagio_finance_set_period_status('2026-07', 'locked', 'sb@example.com', true);
  perform t_assert((r->>'ok')::boolean and r->>'to' = 'locked', 'the accountant locks a clean period');

  failed := false;
  begin perform tf_post('lock-3', 'expense', '2026-07-20', 'cleaning', 'DE_STANDARD', 100, 19);
  exception when sqlstate 'BLG11' then failed := true; end;
  perform t_assert(failed, 'posting into a locked period is refused (BLG11)');

  failed := false;
  begin perform bolagio_finance_reclassify_line((select id from bolagio_finance_transaction_lines where transaction_id = a), '{"category":"laundry"}', 'x', 'ops@example.com');
  exception when sqlstate 'BLG11' then failed := true; end;
  perform t_assert(failed, 'reclassifying a line in a locked period is refused');

  failed := false;
  begin perform bolagio_finance_reverse_transaction(a, 'x', 'ops@example.com', '2026-07-31');
  exception when sqlstate 'BLG11' then failed := true; end;
  perform t_assert(failed, 'a reversal dated into the locked period is refused');

  r := bolagio_finance_reverse_transaction(a, 'invoice was wrong', 'ops@example.com', '2026-09-12');
  perform t_assert((r->>'ok')::boolean, 'a correction posted into the OPEN period succeeds');
  perform t_assert((select status from bolagio_finance_transactions where id = a) = 'reversed', 'and still marks the locked original as reversed');
  perform t_assert((select bolagio_finance_period_key(booked_on) from bolagio_finance_transactions where id = (r->>'reversal_id')::uuid) = '2026-09', 'the correction lives in the open period');

  r := bolagio_finance_set_period_status('2026-07', 'open', 'ops@example.com', false);
  perform t_assert(r->>'code' = 'ACCOUNTANT_REQUIRED', 'an operator cannot unlock');
  r := bolagio_finance_set_period_status('2026-07', 'open', 'sb@example.com', true, 'reopened for a late invoice');
  perform t_assert((r->>'ok')::boolean, 'the accountant can reopen, with a note');
  perform t_assert((select count(*) from bolagio_finance_overrides where field = 'period:2026-07') >= 3, 'every period move is recorded');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Append-only tables, documents, payments, tax stages
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; d uuid; p uuid; failed boolean; e uuid;
begin
  r := bolagio_finance_register_document(jsonb_build_object('document_type','supplier_invoice','original_filename','clean.pdf','mime_type','application/pdf','byte_size',1234,'sha256',repeat('a',64),'document_date','2026-08-03'), 'ops@example.com');
  d := (r->>'id')::uuid;
  perform t_assert((r->>'created')::boolean and r->>'retention_class' = 'invoice' and (r->>'retain_until')::date = '2034-12-31', 'an invoice from 2026 is retained until 31 Dec 2034 (8 years from year end)');
  r := bolagio_finance_register_document(jsonb_build_object('document_type','receipt','original_filename','copy.pdf','mime_type','application/pdf','byte_size',1234,'sha256',repeat('a',64)), 'ops@example.com');
  perform t_assert((r->>'created')::boolean = false and (r->>'duplicate')::boolean, 'the same content is not registered twice');
  failed := false;
  begin update bolagio_finance_documents set sha256 = repeat('b',64) where id = d;
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'a document original is immutable');
  failed := false;
  begin delete from bolagio_finance_documents where id = d;
  exception when sqlstate 'BLG10' then failed := true; end;
  perform t_assert(failed, 'documents are never deleted');

  e := tf_post('doc-1', 'expense', '2026-08-03', 'cleaning', 'DE_STANDARD', 8000, 1520);
  perform t_assert((select document_state from bolagio_finance_transactions where id = e) = 'missing', 'a new expense is missing its document');
  r := bolagio_finance_link_document(d, 'transaction', e, 'ops@example.com');
  perform t_assert((select document_state from bolagio_finance_transactions where id = e) = 'complete', 'linking the document completes the evidence');
  failed := false;
  begin delete from bolagio_finance_document_links where document_id = d;
  exception when sqlstate 'BLG10' then failed := true; end;
  perform t_assert(failed, 'document links are append-only');

  r := bolagio_finance_record_payment(jsonb_build_object('direction','in','source','paypal','provider_reference','CAP-1','amount_cents',10700,'occurred_at','2026-08-15T10:00:00Z','kind','receipt'), 'system');
  p := (r->>'id')::uuid;
  r := bolagio_finance_record_payment(jsonb_build_object('direction','in','source','paypal','provider_reference','CAP-1','amount_cents',999,'occurred_at','2026-08-15T10:00:00Z'), 'system');
  perform t_assert((r->>'created')::boolean = false and (r->>'id')::uuid = p, 'a payment is unique per provider reference');
  failed := false;
  begin update bolagio_finance_payments set amount_cents = 1 where id = p;
  exception when sqlstate 'BLG12' then failed := true; end;
  perform t_assert(failed, 'payment money is immutable');

  r := bolagio_finance_record_match(jsonb_build_object('transaction_id', e, 'payment_id', p, 'amount_cents', 9520, 'state', 'matched', 'rule', 'test', 'rule_version', '1', 'confidence', 'exact', 'reason', 'test'), 'system');
  perform t_assert((select reconciliation_state from bolagio_finance_transactions where id = e) = 'matched' and (select payment_state from bolagio_finance_transactions where id = e) = 'paid', 'a match moves both states');
  perform t_assert((select reconciliation_state from bolagio_finance_payments where id = p) = 'matched', 'and the payment');
  failed := false;
  begin delete from bolagio_finance_reconciliations;
  exception when sqlstate 'BLG10' then failed := true; end;
  perform t_assert(failed, 'reconciliations are append-only');

  r := bolagio_finance_record_tax_stage('vat', '2026-Q3', '2026-07-01', '2026-09-30', 'system_estimate', 123400, '{"output":1}', 'v1', 'system');
  perform t_assert((r->>'ok')::boolean, 'a system estimate is recorded');
  r := bolagio_finance_record_tax_stage('vat', '2026-Q3', '2026-07-01', '2026-09-30', 'filed', 123100, '{}', 'v1', 'ops@example.com', false);
  perform t_assert(r->>'code' = 'ACCOUNTANT_REQUIRED', 'an operator cannot record a filed amount');
  r := bolagio_finance_record_tax_stage('vat', '2026-Q3', '2026-07-01', '2026-09-30', 'filed', 123100, '{}', 'v1', 'sb@example.com', true);
  perform t_assert((select status from bolagio_finance_tax_periods where tax_type = 'vat' and period_key = '2026-Q3') = 'filed', 'the period is filed');
  r := bolagio_finance_record_tax_stage('vat', '2026-Q3', '2026-07-01', '2026-09-30', 'system_estimate', 999, '{}', 'v2', 'system');
  perform t_assert((r->>'informational')::boolean and (select status from bolagio_finance_tax_periods where tax_type = 'vat' and period_key = '2026-Q3') = 'filed', 'a later estimate never overwrites a filed period');
  perform t_assert((select count(*) from bolagio_finance_tax_estimates) = 3, 'every stage is a row');
  failed := false;
  begin update bolagio_finance_tax_estimates set amount_cents = 0;
  exception when sqlstate 'BLG10' then failed := true; end;
  perform t_assert(failed, 'tax estimates are append-only');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Minibar
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare pid uuid; r jsonb; tx uuid; failed boolean;
begin
  insert into bolagio_minibar_products (sku, name, purchase_cost_cents, selling_price_cents, tax_code) values ('WATER-05', 'Mineral water 0.5 l', 45, 250, 'DE_BEVERAGE_STANDARD') returning id into pid;
  r := bolagio_minibar_record_movement(jsonb_build_object('product_id', pid, 'movement', 'purchase', 'quantity', 24, 'occurred_on', '2026-09-01'), 'ops@example.com');
  perform t_assert((select on_hand from bolagio_minibar_stock where product_id = pid) = 24, 'a purchase raises stock');
  r := bolagio_minibar_record_movement(jsonb_build_object('product_id', pid, 'movement', 'sale', 'quantity', -2, 'occurred_on', '2026-09-05', 'booking_reference', 'BLG-TEST01', 'source_reference', 'BLG-TEST01:WATER-05', 'charge_state', 'unpaid'), 'ops@example.com');
  tx := (r->>'transaction_id')::uuid;
  perform t_assert(tx is not null, 'a sale posts a finance transaction');
  perform t_assert((select on_hand from bolagio_minibar_stock where product_id = pid) = 22, 'and reduces stock');
  perform t_assert((select gross_cents from bolagio_finance_transaction_lines where transaction_id = tx and line_no = 1) = 500, 'revenue line is 2 × 2.50 gross');
  perform t_assert((select vat_cents from bolagio_finance_transaction_lines where transaction_id = tx and line_no = 1) = 80, 'at 19 % (500 − round(500/1.19)=420 → 80)');
  perform t_assert((select gross_cents from bolagio_finance_transactions where id = tx) = 500, 'the revenue transaction gross is the guest charge (COGS is not netted into it)');
  perform t_assert((select net_cents from bolagio_finance_transactions where kind = 'cogs' and source_system = 'minibar' and source_reference = 'BLG-TEST01:WATER-05:cogs') = 90, 'COGS is its own cogs transaction: 2 × 0.45 as a positive cost');
  r := bolagio_minibar_record_movement(jsonb_build_object('product_id', pid, 'movement', 'sale', 'quantity', -2, 'occurred_on', '2026-09-05', 'source_reference', 'BLG-TEST01:WATER-05'), 'ops@example.com');
  perform t_assert((r->>'created')::boolean = false and (select on_hand from bolagio_minibar_stock where product_id = pid) = 22, 'the same sale key posts nothing twice');
  failed := false;
  begin insert into bolagio_minibar_movements (product_id, movement, quantity, occurred_on, recorded_by) values (pid, 'sale', 3, '2026-09-06', 'x');
  exception when check_violation then failed := true; end;
  perform t_assert(failed, 'a positive sale quantity is refused by the sign constraint');
  failed := false;
  begin delete from bolagio_minibar_movements where product_id = pid;
  exception when sqlstate 'BLG10' then failed := true; end;
  perform t_assert(failed, 'movements are append-only');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. Views and the exception counts
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare c record;
begin
  select * into c from bolagio_finance_exception_counts;
  perform t_assert(c.missing_documents >= 1, 'exception counts see missing documents');
  perform t_assert(c.unmatched_payments = 0, 'the matched payment is not counted as unmatched');
  perform t_assert((select count(*) from bolagio_finance_pl_monthly where period_key = '2026-08') >= 1, 'the P&L view aggregates August');
  perform t_assert((select coalesce(sum(revenue_net_cents),0) from bolagio_finance_pl_monthly where period_key in ('2026-08','2026-09') and category = 'accommodation_revenue') = 0,
    'the reversed accommodation revenue nets to zero across August and September');
end $$;

drop function tf_post(text, text, date, text, text, bigint, bigint, jsonb);
