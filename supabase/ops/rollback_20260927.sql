-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260927120000_finance_ingestion_pipeline.sql. Run in ONE
-- transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260927.sql
--
-- Drops the finance ingestion queue, its two triggers, three views and five
-- functions. The queue holds intent ids and processing state only — no
-- accounting evidence — so nothing is refused: what it would have derived is
-- re-derivable from the booking facts at any time.
--
-- ── What it never touches ─────────────────────────────────────────────────
-- Finance transactions and payments the pipeline POSTED stay exactly as they
-- are, and no booking or payment row is touched. After this rollback the
-- scheduled pass falls back to the application's full scan.
--
-- ── Order ─────────────────────────────────────────────────────────────────
-- Run this FIRST, before the rollbacks of 20260926, 20260923, 20260922 and
-- 20260920: the views read tables those migrations create.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

drop trigger if exists bolagio_booking_intents_finance_enqueue on bolagio_booking_intents;
drop trigger if exists bolagio_payment_events_finance_enqueue on bolagio_payment_events;

drop view if exists bolagio_finance_pipeline_status;
drop function if exists bolagio_finance_enqueue_missing(boolean, integer);
drop view if exists bolagio_finance_ingestion_gaps;
drop function if exists bolagio_finance_enqueue_on_payment_event();
drop view if exists bolagio_finance_refund_events;
drop function if exists bolagio_finance_enqueue_on_intent();
drop function if exists bolagio_finance_claim_ingestion(text, integer);
drop function if exists bolagio_finance_settle_ingestion(uuid, timestamptz, boolean, text);
drop function if exists bolagio_finance_enqueue(uuid, text);
drop table if exists bolagio_finance_ingestion_queue;
