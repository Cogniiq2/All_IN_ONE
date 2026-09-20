-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — FINANCE FOUNDATION (2026-09-22)
--
-- Finance Operations, Management Accounting, Tax Estimation and Accounting
-- Preparation for BoLaGio GmbH — a SEPARATE domain beside the booking core.
--
-- ── Authority ─────────────────────────────────────────────────────────────
-- Nothing in this file touches a booking table. The booking core stays the
-- authority on reservations, PayPal on money, Beds24 on inventory. Finance
-- CONSUMES facts from them (through idempotent source keys) and never writes
-- back. There is no foreign key from a finance row to a booking row that
-- could block the booking domain: finance keeps the booking's uuid and
-- reference as provenance columns only.
--
-- ── Ledger decision ───────────────────────────────────────────────────────
-- Not a general ledger with a chart of accounts — that is the Steuerberater's
-- (DATEV) and a mapping layer exists for it. What IS built is a subledger of
-- three kinds of fact and the links between them:
--
--   transactions + lines    the ECONOMIC fact (revenue, cost, refund) — what
--                           was earned or incurred, with net/VAT/gross per
--                           line, a tax code per line and an allocation to a
--                           unit; posted once, corrected only by reversal
--   payments                the CASH fact — money that moved on an account
--                           (PayPal capture, Booking.com payout, bank line)
--   documents               the EVIDENCE — an invoice, a statement, a notice,
--                           hashed and versioned, never overwritten
--   reconciliations         explicit, explainable links between the three
--
-- Invariants the database enforces (tests/sql/finance.sql proves each):
--   • gross = net + VAT on every line; header totals = sum of lines
--   • a posted transaction's financial columns never change; a correction is
--     a reversal plus a new posting, both pointing at each other
--   • nothing in a LOCKED period changes at all; corrections after a lock are
--     posted into the open period with `correction_of`
--   • one source fact → one transaction (unique source key)
--   • one payment provider reference → one payment
--   • one document content → one document (sha-256)
--   • one (series, number) → one invoice; numbers drawn gaplessly at issue
--   • tax estimates and overrides are append-only
--   • a tax code is required on every line, or the line is explicitly
--     `review_required` — never silently defaulted
--
-- ── Money ─────────────────────────────────────────────────────────────────
-- Integer minor units (cents) everywhere, bigint. Rates in basis points
-- (700 = 7.00 %). No numeric, no float. Rounding policy: docs/finance/vat.md.
--
-- ── Shared project ────────────────────────────────────────────────────────
-- Every object is `bolagio_finance_*` / `bolagio_minibar_*`. RLS on, no
-- policy, browser roles revoked, functions service_role-only.
-- Idempotent: every statement can be re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — reference data: tax codes, categories, tax rates, policy
-- ══════════════════════════════════════════════════════════════════════════

-- Effective-dated tax codes. `rate_bp` is the statutory rate in basis points.
-- `treatment` says how a line under this code enters the VAT position.
create table if not exists bolagio_finance_tax_codes (
  code               text primary key,
  label              text not null,
  description        text,
  jurisdiction       char(2) not null default 'DE',
  -- output (sales), input (purchases) or both
  side               text not null check (side in ('output','input','both')),
  treatment          text not null check (treatment in
                       ('standard','reduced','reverse_charge','exempt','outside_scope','review_required')),
  rate_bp            integer not null check (rate_bp between 0 and 10000),
  reverse_charge     boolean not null default false,
  review_required    boolean not null default false,
  effective_from     date not null,
  effective_to       date,
  legal_reference    text,
  source_url         text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bolagio_finance_tax_codes_range check (effective_to is null or effective_to >= effective_from)
);

comment on table bolagio_finance_tax_codes is
  'Effective-dated VAT tax codes. Rates in basis points. review_required codes park a line until a person classifies it.';

-- Management categories. NOT statutory accounts. `pl_group` places the
-- category in the management P&L; `datev_account_*` is an OPTIONAL mapping
-- the accountant confirms (null until then).
create table if not exists bolagio_finance_categories (
  code                 text primary key,
  label                text not null,
  pl_group             text not null check (pl_group in
                         ('revenue','direct_cost','property_cost','company_cost','depreciation','interest',
                          'other_adjustment','tax','balance','excluded')),
  kind                 text not null check (kind in ('revenue','expense','neutral')),
  default_tax_code     text references bolagio_finance_tax_codes(code),
  asset_candidate      boolean not null default false,
  requires_unit        boolean not null default false,
  datev_account_skr03  text,
  datev_account_skr04  text,
  datev_confirmed      boolean not null default false,
  sort_order           integer not null default 100,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table bolagio_finance_categories is
  'Management P&L categories. Never legally authoritative accounts; the DATEV mapping is a proposal until datev_confirmed.';

-- Effective-dated rates for the company taxes and the trade-tax multiplier.
create table if not exists bolagio_finance_tax_rates (
  id               uuid primary key default gen_random_uuid(),
  tax_type         text not null check (tax_type in ('kst','soli','gewst_messzahl','gewst_hebesatz')),
  jurisdiction     text not null default 'DE',
  rate_bp          integer not null check (rate_bp >= 0),
  effective_from   date not null,
  effective_to     date,
  legal_reference  text,
  source_url       text,
  review_required  boolean not null default false,
  note             text,
  created_at       timestamptz not null default now(),
  unique (tax_type, jurisdiction, effective_from)
);

comment on table bolagio_finance_tax_rates is
  'KSt, Soli, Gewerbesteuer-Messzahl and the municipal Hebesatz by effective date. review_required means seeded but not authoritatively confirmed for that year.';

-- Finance/tax policy: small, effective-dated key/value. Identifiers such as
-- the tax number or the USt-IdNr are NOT stored here; they stay in the
-- deployment configuration (see lib/finance/config.ts).
create table if not exists bolagio_finance_policy (
  id               uuid primary key default gen_random_uuid(),
  key              text not null,
  value            text not null,
  effective_from   date not null,
  effective_to     date,
  source_reference text,
  set_by           text not null default 'seed',
  created_at       timestamptz not null default now(),
  unique (key, effective_from)
);

comment on table bolagio_finance_policy is
  'Effective-dated finance policy (VAT filing frequency, Dauerfristverlängerung, fiscal year, reserve policy, local levy). No identifiers.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — periods, counterparties, accounts
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_periods (
  period_key   text primary key check (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  starts_on    date not null,
  ends_on      date not null,
  status       text not null default 'open' check (status in ('open','review','accountant_reviewed','locked')),
  status_at    timestamptz not null default now(),
  status_by    text,
  locked_at    timestamptz,
  locked_by    text,
  note         text,
  created_at   timestamptz not null default now(),
  check (ends_on > starts_on)
);

comment on table bolagio_finance_periods is
  'Monthly accounting periods. Locked periods refuse every change; corrections go to the open period.';

create or replace function bolagio_finance_period_key(p_date date) returns text
language sql immutable as $$ select to_char(p_date, 'YYYY-MM') $$;

-- Ensure a period row exists (open) for a date. Idempotent.
create or replace function bolagio_finance_ensure_period(p_date date) returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare v_key text := bolagio_finance_period_key(p_date);
begin
  insert into bolagio_finance_periods (period_key, starts_on, ends_on)
  values (v_key, date_trunc('month', p_date)::date, (date_trunc('month', p_date) + interval '1 month')::date)
  on conflict (period_key) do nothing;
  return v_key;
end $$;

create or replace function bolagio_finance_period_locked(p_date date) returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce((select status = 'locked' from bolagio_finance_periods where period_key = bolagio_finance_period_key(p_date)), false)
$$;

-- Suppliers, customers, OTAs, providers, authorities. The categorisation
-- rule engine keys on these rows.
create table if not exists bolagio_finance_counterparties (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  kind                   text not null check (kind in ('supplier','customer','ota','payment_provider','authority','bank','other')),
  country                char(2),
  vat_id                 text,
  default_category       text references bolagio_finance_categories(code),
  default_tax_code       text references bolagio_finance_tax_codes(code),
  default_input_vat      text check (default_input_vat in ('deductible','partially_deductible','not_deductible','reverse_charge','review_required','unknown','not_applicable')),
  default_allocation     text check (default_allocation in ('direct','manual','revenue_share','occupied_nights','floor_area','equal_units','custom')),
  -- When true and every rule input matches, the rule engine posts AUTO_VERIFIED
  -- rather than SUGGESTED. Off by default: ambiguity must be earned away.
  auto_verify            boolean not null default false,
  match_patterns         text[] not null default '{}',
  active                 boolean not null default true,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists bolagio_finance_counterparties_name_uq on bolagio_finance_counterparties (lower(name));

comment on table bolagio_finance_counterparties is
  'Suppliers, OTAs, payment providers and authorities with their default classification rules. Business entities only; no guest data.';

-- Money accounts: the bank, PayPal, cash, an OTA wallet. IBAN stored masked.
create table if not exists bolagio_finance_accounts (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,
  label                  text not null,
  kind                   text not null check (kind in ('bank','paypal','cash','ota_wallet','other')),
  currency               char(3) not null default 'EUR',
  iban_masked            text,
  bic                    text,
  opening_balance_cents  bigint not null default 0,
  opening_balance_on     date,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table bolagio_finance_accounts is 'Money accounts. IBAN masked (last 4). No credentials.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — import batches and documents (evidence)
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_import_batches (
  id              uuid primary key default gen_random_uuid(),
  source_type     text not null check (source_type in
                    ('booking_com_reservations','booking_com_payouts','paypal_activity','bank_csv','supplier_csv','manual_csv','accountant_csv','other')),
  adapter         text not null,
  adapter_version text not null,
  filename        text not null,
  sha256          text not null,
  byte_size       integer not null check (byte_size >= 0),
  row_count       integer not null default 0,
  valid_rows      integer not null default 0,
  error_rows      integer not null default 0,
  duplicate_rows  integer not null default 0,
  status          text not null default 'staged' check (status in ('staged','validated','imported','rejected','failed')),
  error           text,
  imported_at     timestamptz,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The same file content cannot be imported twice.
create unique index if not exists bolagio_finance_import_batches_sha_uq on bolagio_finance_import_batches (sha256);

comment on table bolagio_finance_import_batches is 'One uploaded file. Content hashed; a second upload of the same bytes is refused.';

create table if not exists bolagio_finance_import_rows (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references bolagio_finance_import_batches(id) on delete cascade,
  row_no        integer not null,
  raw           jsonb not null,
  parsed        jsonb,
  status        text not null default 'staged' check (status in ('staged','valid','error','duplicate','imported','skipped')),
  error         text,
  -- What the row became. Null until imported.
  transaction_id uuid,
  payment_id     uuid,
  created_at    timestamptz not null default now(),
  unique (batch_id, row_no)
);

create index if not exists bolagio_finance_import_rows_batch_idx on bolagio_finance_import_rows (batch_id, status);

comment on table bolagio_finance_import_rows is 'Staging rows. Nothing here is authoritative until imported into a transaction or payment.';

create table if not exists bolagio_finance_documents (
  id                  uuid primary key default gen_random_uuid(),
  document_type       text not null check (document_type in
                        ('supplier_invoice','guest_invoice','credit_note','booking_com_commission_invoice','booking_com_payout_statement',
                         'paypal_statement','bank_statement','tax_notice','contract','receipt','e_invoice','other')),
  original_filename   text not null,
  mime_type           text not null,
  byte_size           integer not null check (byte_size >= 0),
  sha256              text not null,
  -- Where the bytes live (a private storage key). Never a public URL.
  storage_key         text,
  source              text not null check (source in ('upload','import','generated','email','api')),
  structured_format   text not null default 'none' check (structured_format in ('none','xrechnung','zugferd','other_xml','pdf_only')),
  structured_valid    boolean,
  counterparty_id     uuid references bolagio_finance_counterparties(id),
  tax_period_key      text,
  document_date       date,
  review_state        text not null default 'unreviewed' check (review_state in ('unreviewed','reviewed','rejected')),
  -- Retention (docs/finance/retention.md): computed at insert, reviewed by the adviser.
  retention_class     text not null check (retention_class in
                        ('accounting_voucher','invoice','annual_accounts','tax_notice','contract','business_letter','technical_log','other')),
  retention_basis     text,
  retain_until        date,
  legal_hold          boolean not null default false,
  deletion_allowed    boolean not null default false,
  retention_review    boolean not null default true,
  -- Versioning: a corrected upload points at what it supersedes; the old row stays.
  supersedes_id       uuid references bolagio_finance_documents(id),
  received_at         timestamptz not null default now(),
  uploaded_by         text,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists bolagio_finance_documents_sha_uq on bolagio_finance_documents (sha256);
create index if not exists bolagio_finance_documents_type_idx on bolagio_finance_documents (document_type, received_at desc);
create index if not exists bolagio_finance_documents_period_idx on bolagio_finance_documents (tax_period_key) where tax_period_key is not null;

comment on table bolagio_finance_documents is
  'Registry of finance documents: hashed originals, versioned, retention-classed. Content lives in private storage, never in this table.';

-- A document may evidence several records (one statement → many payments)
-- and a record may have several documents.
create table if not exists bolagio_finance_document_links (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references bolagio_finance_documents(id) on delete restrict,
  target_type   text not null check (target_type in ('transaction','payment','tax_notice','invoice','asset','import_batch')),
  target_id     uuid not null,
  linked_by     text not null,
  created_at    timestamptz not null default now(),
  unique (document_id, target_type, target_id)
);

create index if not exists bolagio_finance_document_links_target_idx on bolagio_finance_document_links (target_type, target_id);

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — transactions and lines (the economic facts)
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_transactions (
  id                    uuid primary key default gen_random_uuid(),
  -- What kind of economic fact this is.
  kind                  text not null check (kind in
                          ('revenue','expense','refund','credit_note','commission','fee','tax_payment','adjustment','cogs')),
  -- The accounting date: which period this belongs to. For accommodation
  -- revenue this is the check-out date (end of the service), for an expense
  -- the service date or, failing that, the invoice date. Never created_at.
  booked_on             date not null,
  service_from          date,
  service_to            date,
  invoice_date          date,
  due_on                date,
  currency              char(3) not null default 'EUR',
  -- Cached totals; the constraint trigger keeps them equal to the lines.
  net_cents             bigint not null default 0,
  vat_cents             bigint not null default 0,
  gross_cents           bigint not null default 0,
  counterparty_id       uuid references bolagio_finance_counterparties(id),
  counterparty_label    text,
  supplier_invoice_no   text,
  description           text not null,
  channel               text check (channel in ('booking_com','direct','airbnb','manual','other')),
  -- Provenance to the booking core: uuid + reference, no foreign key.
  booking_intent_id     uuid,
  booking_reference     text,
  unit_id               uuid,
  -- Provenance to the fact this row was derived from. (source_system,
  -- source_reference) is unique: the idempotency key of ingestion.
  source_type           text not null check (source_type in
                          ('booking','payment','refund','minibar','cleaning','import','manual','system')),
  source_system         text not null,
  source_reference      text not null,
  import_batch_id       uuid references bolagio_finance_import_batches(id),
  -- States that may move after posting (not money).
  status                text not null default 'posted' check (status in ('posted','reversed','reversal')),
  review_state          text not null default 'needs_review' check (review_state in
                          ('auto_verified','suggested','needs_review','reviewed','accountant_locked')),
  document_state        text not null default 'missing' check (document_state in ('complete','missing','not_required','pending')),
  payment_state         text not null default 'unpaid' check (payment_state in ('unpaid','partially_paid','paid','not_applicable')),
  reconciliation_state  text not null default 'unmatched' check (reconciliation_state in
                          ('unmatched','partially_matched','matched','mismatch','needs_review','not_applicable')),
  correction_of         uuid references bolagio_finance_transactions(id),
  reversed_by           uuid references bolagio_finance_transactions(id),
  reversal_reason       text,
  note                  text,
  posted_by             text not null,
  posted_at             timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source_system, source_reference),
  constraint bolagio_finance_tx_totals check (gross_cents = net_cents + vat_cents),
  constraint bolagio_finance_tx_service check (service_to is null or service_from is null or service_to >= service_from)
);

create index if not exists bolagio_finance_tx_booked_idx on bolagio_finance_transactions (booked_on desc);
create index if not exists bolagio_finance_tx_kind_idx on bolagio_finance_transactions (kind, booked_on desc);
create index if not exists bolagio_finance_tx_booking_idx on bolagio_finance_transactions (booking_intent_id) where booking_intent_id is not null;
create index if not exists bolagio_finance_tx_counterparty_idx on bolagio_finance_transactions (counterparty_id) where counterparty_id is not null;
create index if not exists bolagio_finance_tx_review_idx on bolagio_finance_transactions (review_state) where review_state in ('needs_review','suggested');
create index if not exists bolagio_finance_tx_docs_idx on bolagio_finance_transactions (document_state) where document_state in ('missing','pending');
create index if not exists bolagio_finance_tx_recon_idx on bolagio_finance_transactions (reconciliation_state) where reconciliation_state not in ('matched','not_applicable');
create index if not exists bolagio_finance_tx_unit_idx on bolagio_finance_transactions (unit_id, booked_on) where unit_id is not null;

comment on table bolagio_finance_transactions is
  'Economic facts. Posted once; financial columns immutable; corrected only by reversal. No guest personal data — the booking reference is the link.';

create table if not exists bolagio_finance_transaction_lines (
  id                     uuid primary key default gen_random_uuid(),
  transaction_id         uuid not null references bolagio_finance_transactions(id) on delete restrict,
  line_no                smallint not null check (line_no >= 1),
  category               text not null references bolagio_finance_categories(code),
  description            text,
  quantity               integer,
  -- A tax code is REQUIRED. Ambiguity is a specific code (DE_REVIEW_REQUIRED),
  -- never null.
  tax_code               text not null references bolagio_finance_tax_codes(code),
  rate_bp                integer not null check (rate_bp between 0 and 10000),
  net_cents              bigint not null,
  vat_cents              bigint not null,
  gross_cents            bigint not null,
  -- Reverse charge: the recipient owes output VAT on the net and may deduct it.
  reverse_charge_vat_cents bigint not null default 0,
  -- Input VAT (purchases only).
  input_vat_treatment    text not null default 'not_applicable' check (input_vat_treatment in
                           ('deductible','partially_deductible','not_deductible','reverse_charge','review_required','unknown','not_applicable')),
  deductible_bp          integer not null default 10000 check (deductible_bp between 0 and 10000),
  -- Allocation to a unit (property) and how it was decided.
  unit_id                uuid,
  allocation_method      text not null default 'direct' check (allocation_method in
                           ('direct','manual','revenue_share','occupied_nights','floor_area','equal_units','custom','unallocated')),
  allocation_note        text,
  cost_centre            text,
  -- Fixed-asset foundation.
  asset_state            text not null default 'none' check (asset_state in ('none','candidate','confirmed_asset','not_asset')),
  minibar_product_id     uuid,
  -- Classification provenance.
  classification         text not null default 'needs_review' check (classification in
                           ('auto_verified','suggested','needs_review','reviewed','accountant_locked')),
  classified_by          text,
  classified_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (transaction_id, line_no),
  constraint bolagio_finance_line_totals check (gross_cents = net_cents + vat_cents),
  constraint bolagio_finance_line_rc check (reverse_charge_vat_cents = 0 or vat_cents = 0)
);

create index if not exists bolagio_finance_lines_tx_idx on bolagio_finance_transaction_lines (transaction_id);
create index if not exists bolagio_finance_lines_category_idx on bolagio_finance_transaction_lines (category);
create index if not exists bolagio_finance_lines_tax_idx on bolagio_finance_transaction_lines (tax_code);
create index if not exists bolagio_finance_lines_unit_idx on bolagio_finance_transaction_lines (unit_id) where unit_id is not null;
create index if not exists bolagio_finance_lines_asset_idx on bolagio_finance_transaction_lines (asset_state) where asset_state = 'candidate';
create index if not exists bolagio_finance_lines_review_idx on bolagio_finance_transaction_lines (classification) where classification in ('needs_review','suggested');

comment on table bolagio_finance_transaction_lines is
  'Lines of a transaction: category, tax code, net/VAT/gross, input-VAT treatment, unit allocation. Financial columns immutable once posted.';

-- ── Field-level overrides: who changed what, from what, why ───────────────
create table if not exists bolagio_finance_overrides (
  id             uuid primary key default gen_random_uuid(),
  target_type    text not null check (target_type in ('transaction','line','tax_estimate','tax_period','asset','allocation','invoice','policy')),
  target_id      uuid not null,
  field          text not null,
  old_value      text,
  new_value      text,
  reason         text not null,
  actor          text not null,
  created_at     timestamptz not null default now()
);

create index if not exists bolagio_finance_overrides_target_idx on bolagio_finance_overrides (target_type, target_id, created_at desc);

comment on table bolagio_finance_overrides is 'Append-only record of every manual or accountant override: old value, new value, reason, actor, time.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — payments (cash facts) and reconciliations
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_payments (
  id                    uuid primary key default gen_random_uuid(),
  direction             text not null check (direction in ('in','out')),
  source                text not null check (source in ('paypal','booking_com_payout','bank','cash','manual','other')),
  -- The provider's own id: capture id, refund id, payout id, bank tx id.
  provider_reference    text not null,
  account_id            uuid references bolagio_finance_accounts(id),
  amount_cents          bigint not null check (amount_cents > 0),
  fee_cents             bigint not null default 0 check (fee_cents >= 0),
  currency              char(3) not null default 'EUR',
  occurred_at           timestamptz not null,
  value_date            date,
  counterparty_label    text,
  reference_text        text,
  booking_intent_id     uuid,
  booking_reference     text,
  import_batch_id       uuid references bolagio_finance_import_batches(id),
  kind                  text not null default 'receipt' check (kind in ('receipt','refund','payout','disbursement','fee','transfer','tax','unknown')),
  reconciliation_state  text not null default 'unmatched' check (reconciliation_state in
                          ('unmatched','partially_matched','matched','mismatch','needs_review','ignored')),
  note                  text,
  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source, provider_reference)
);

create index if not exists bolagio_finance_payments_occurred_idx on bolagio_finance_payments (occurred_at desc);
create index if not exists bolagio_finance_payments_recon_idx on bolagio_finance_payments (reconciliation_state) where reconciliation_state not in ('matched','ignored');
create index if not exists bolagio_finance_payments_booking_idx on bolagio_finance_payments (booking_intent_id) where booking_intent_id is not null;

comment on table bolagio_finance_payments is
  'Cash facts: money that moved on an account. One row per provider reference. Counterparty label only; no IBAN of a person.';

create table if not exists bolagio_finance_reconciliations (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references bolagio_finance_transactions(id) on delete restrict,
  payment_id      uuid references bolagio_finance_payments(id) on delete restrict,
  document_id     uuid references bolagio_finance_documents(id) on delete restrict,
  amount_cents    bigint not null,
  state           text not null check (state in ('matched','partially_matched','mismatch','needs_review','rejected')),
  rule            text not null,
  rule_version    text not null,
  confidence      text not null check (confidence in ('exact','high','medium','low')),
  reason          text not null,
  matched_by      text not null,
  created_at      timestamptz not null default now(),
  check (transaction_id is not null or payment_id is not null or document_id is not null)
);

create index if not exists bolagio_finance_recon_tx_idx on bolagio_finance_reconciliations (transaction_id) where transaction_id is not null;
create index if not exists bolagio_finance_recon_payment_idx on bolagio_finance_reconciliations (payment_id) where payment_id is not null;
create unique index if not exists bolagio_finance_recon_pair_uq on bolagio_finance_reconciliations (transaction_id, payment_id)
  where transaction_id is not null and payment_id is not null and state <> 'rejected';

comment on table bolagio_finance_reconciliations is 'Explicit links between facts, each with rule, version, confidence and reason. Nothing is matched silently.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — guest invoices (foundation; nothing is sent)
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_invoices (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null default 'invoice' check (kind in ('invoice','credit_note')),
  series                text,
  number                integer,
  status                text not null default 'draft' check (status in ('draft','issued','voided')),
  issued_on             date,
  issued_at             timestamptz,
  issued_by             text,
  -- Issuer snapshot at issue time (configuration may change later).
  issuer_name           text,
  issuer_address        text,
  issuer_tax_id_kind    text check (issuer_tax_id_kind in ('steuernummer','ust_idnr')),
  issuer_tax_id_masked  text,
  -- Recipient (the invoice is the one place recipient details are needed).
  recipient_name        text not null,
  recipient_address     text,
  recipient_company     text,
  recipient_vat_id      text,
  recipient_country     char(2),
  booking_intent_id     uuid,
  booking_reference     text,
  unit_id               uuid,
  service_from          date,
  service_to            date,
  currency              char(3) not null default 'EUR',
  net_cents             bigint not null default 0,
  vat_cents             bigint not null default 0,
  gross_cents           bigint not null default 0,
  payment_state         text not null default 'unpaid' check (payment_state in ('unpaid','paid','partially_paid','refunded','not_applicable')),
  corrects_invoice_id   uuid references bolagio_finance_invoices(id),
  transaction_id        uuid references bolagio_finance_transactions(id),
  document_id           uuid references bolagio_finance_documents(id),
  note                  text,
  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint bolagio_finance_inv_totals check (gross_cents = net_cents + vat_cents),
  constraint bolagio_finance_inv_issued check (status <> 'issued' or (series is not null and number is not null and issued_on is not null))
);

create unique index if not exists bolagio_finance_invoices_number_uq on bolagio_finance_invoices (series, number) where number is not null;
create index if not exists bolagio_finance_invoices_booking_idx on bolagio_finance_invoices (booking_intent_id) where booking_intent_id is not null;

comment on table bolagio_finance_invoices is
  'Guest invoices and credit notes. Numbers come from bolagio_next_invoice_number at issue time, gaplessly. Issue fails closed while configuration is incomplete.';

create table if not exists bolagio_finance_invoice_lines (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references bolagio_finance_invoices(id) on delete restrict,
  line_no        smallint not null check (line_no >= 1),
  description    text not null,
  quantity       integer not null default 1 check (quantity > 0),
  category       text not null references bolagio_finance_categories(code),
  tax_code       text not null references bolagio_finance_tax_codes(code),
  rate_bp        integer not null check (rate_bp between 0 and 10000),
  net_cents      bigint not null,
  vat_cents      bigint not null,
  gross_cents    bigint not null,
  unique (invoice_id, line_no),
  constraint bolagio_finance_invl_totals check (gross_cents = net_cents + vat_cents)
);

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — taxes: periods, estimates, adjustments, notices, payments, reserves
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_tax_periods (
  id                 uuid primary key default gen_random_uuid(),
  tax_type           text not null check (tax_type in ('vat','kst','soli','gewst')),
  -- vat: '2026-Q3' or '2026-09'; kst/soli/gewst: '2026'
  period_key         text not null,
  starts_on          date not null,
  ends_on            date not null,
  -- Planning dates computed from policy + law; the official date, when a
  -- notice or the tax office names one, overrides for display and alerts.
  filing_due_on      date,
  payment_due_on     date,
  official_due_on    date,
  status             text not null default 'open' check (status in ('open','estimated','reviewed','filed','assessed','paid','closed')),
  status_at          timestamptz not null default now(),
  status_by          text,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tax_type, period_key),
  check (ends_on >= starts_on)
);

comment on table bolagio_finance_tax_periods is 'One row per tax type and period. Status moves forward through estimate → reviewed → filed → assessed → paid.';

-- Append-only. Each stage of a figure is a new row; the latest per stage wins.
create table if not exists bolagio_finance_tax_estimates (
  id               uuid primary key default gen_random_uuid(),
  tax_period_id    uuid not null references bolagio_finance_tax_periods(id) on delete restrict,
  stage            text not null check (stage in ('system_estimate','accountant_reviewed','filed','assessed','paid')),
  amount_cents     bigint not null,
  -- The calculation basis: components a person can re-derive. Structured on
  -- purpose (output VAT, input VAT, taxable income, Messbetrag …).
  basis            jsonb not null default '{}'::jsonb,
  rules_version    text not null,
  computed_at      timestamptz not null default now(),
  actor            text not null,
  note             text,
  document_id      uuid references bolagio_finance_documents(id)
);

create index if not exists bolagio_finance_tax_estimates_period_idx on bolagio_finance_tax_estimates (tax_period_id, stage, computed_at desc);

comment on table bolagio_finance_tax_estimates is 'Append-only stages of a tax figure. A filed amount is never recalculated; a new system estimate is a new row.';

create table if not exists bolagio_finance_tax_adjustments (
  id               uuid primary key default gen_random_uuid(),
  tax_type         text not null check (tax_type in ('kst','gewst','vat')),
  fiscal_year      integer not null check (fiscal_year between 2020 and 2100),
  kind             text not null check (kind in
                     ('non_deductible_expense','tax_free_income','loss_carryforward','gewst_addition','gewst_reduction','vat_correction','other')),
  amount_cents     bigint not null,
  reason           text not null,
  legal_reference  text,
  actor            text not null,
  superseded_by    uuid references bolagio_finance_tax_adjustments(id),
  created_at       timestamptz not null default now()
);

create index if not exists bolagio_finance_tax_adjustments_year_idx on bolagio_finance_tax_adjustments (tax_type, fiscal_year) where superseded_by is null;

comment on table bolagio_finance_tax_adjustments is 'Accountant-entered adjustments to the tax basis. Append-only; a correction supersedes rather than edits.';

create table if not exists bolagio_finance_tax_notices (
  id                     uuid primary key default gen_random_uuid(),
  tax_type               text not null check (tax_type in ('vat','kst','soli','gewst','other')),
  period_key             text not null,
  authority              text not null,
  notice_type            text not null check (notice_type in ('assessment','advance_payment','amendment','interest','late_surcharge','other')),
  assessment_date        date,
  received_on            date not null,
  assessed_cents         bigint,
  advance_payment_cents  bigint,
  paid_cents             bigint not null default 0,
  status                 text not null default 'received' check (status in ('received','reviewed','disputed','paid','superseded')),
  document_id            uuid references bolagio_finance_documents(id),
  tax_period_id          uuid references bolagio_finance_tax_periods(id),
  note                   text,
  created_by             text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists bolagio_finance_tax_notice_dues (
  id             uuid primary key default gen_random_uuid(),
  notice_id      uuid not null references bolagio_finance_tax_notices(id) on delete cascade,
  due_on         date not null,
  amount_cents   bigint not null,
  label          text,
  paid_cents     bigint not null default 0,
  paid_on        date,
  payment_id     uuid references bolagio_finance_payments(id)
);

create index if not exists bolagio_finance_tax_notice_dues_due_idx on bolagio_finance_tax_notice_dues (due_on);

comment on table bolagio_finance_tax_notices is 'Official notices (Bescheide) with their due dates. Official figures override system estimates for display; the variance is shown.';

create table if not exists bolagio_finance_tax_payments (
  id               uuid primary key default gen_random_uuid(),
  tax_type         text not null check (tax_type in ('vat','kst','soli','gewst','other')),
  period_key       text not null,
  kind             text not null check (kind in ('advance','final','refund','interest','surcharge')),
  amount_cents     bigint not null,
  paid_on          date not null,
  payment_id       uuid references bolagio_finance_payments(id),
  notice_id        uuid references bolagio_finance_tax_notices(id),
  note             text,
  created_by       text not null,
  created_at       timestamptz not null default now()
);

create index if not exists bolagio_finance_tax_payments_idx on bolagio_finance_tax_payments (tax_type, period_key);

-- Cash the company has actually SET ASIDE. A management declaration, not a
-- bank fact: "required reserve" is computed, "held reserve" is stated here.
create table if not exists bolagio_finance_reserves (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('tax','maintenance','deposit','other')),
  label          text not null,
  amount_cents   bigint not null check (amount_cents >= 0),
  account_id     uuid references bolagio_finance_accounts(id),
  as_of          date not null,
  note           text,
  set_by         text not null,
  created_at     timestamptz not null default now()
);

create index if not exists bolagio_finance_reserves_idx on bolagio_finance_reserves (kind, as_of desc);

comment on table bolagio_finance_reserves is 'Cash declared as reserved, by kind, as of a date. Latest row per kind counts. Never implies a separate bank account.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — fixed assets (foundation), exports, minibar
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_finance_assets (
  id                     uuid primary key default gen_random_uuid(),
  description            text not null,
  line_id                uuid references bolagio_finance_transaction_lines(id),
  counterparty_id        uuid references bolagio_finance_counterparties(id),
  purchased_on           date not null,
  acquisition_cents      bigint not null check (acquisition_cents >= 0),
  unit_id                uuid,
  category               text references bolagio_finance_categories(code),
  useful_life_months     integer check (useful_life_months is null or useful_life_months > 0),
  depreciation_method    text check (depreciation_method in ('straight_line','declining_balance','immediate','pool')),
  depreciation_start_on  date,
  status                 text not null default 'candidate' check (status in ('candidate','confirmed','rejected','disposed')),
  accountant_confirmed   boolean not null default false,
  confirmed_by           text,
  confirmed_at           timestamptz,
  document_id            uuid references bolagio_finance_documents(id),
  note                   text,
  created_by             text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table bolagio_finance_assets is 'Asset candidates and confirmed fixed assets. Useful life and method are the accountant''s decision; nothing is defaulted.';

create table if not exists bolagio_finance_exports (
  id              uuid primary key default gen_random_uuid(),
  export_kind     text not null,
  period_from     date,
  period_to       date,
  format          text not null,
  generator       text not null,
  version         text not null,
  row_count       integer not null default 0,
  sha256          text not null,
  byte_size       integer not null default 0,
  parameters      jsonb not null default '{}'::jsonb,
  generated_by    text not null,
  generated_at    timestamptz not null default now()
);

create index if not exists bolagio_finance_exports_idx on bolagio_finance_exports (export_kind, generated_at desc);

comment on table bolagio_finance_exports is 'Audit of every export: kind, period, generator version, hash. The file itself is not stored here.';

create table if not exists bolagio_minibar_products (
  id                   uuid primary key default gen_random_uuid(),
  sku                  text not null unique,
  name                 text not null,
  unit_label           text not null default 'piece',
  active               boolean not null default true,
  purchase_cost_cents  bigint not null default 0 check (purchase_cost_cents >= 0),
  selling_price_cents  bigint not null check (selling_price_cents >= 0),
  -- Tax code is per product and REQUIRED; food vs beverage is never guessed.
  tax_code             text not null references bolagio_finance_tax_codes(code),
  purchase_tax_code    text references bolagio_finance_tax_codes(code),
  reorder_threshold    integer not null default 0 check (reorder_threshold >= 0),
  supplier_id          uuid references bolagio_finance_counterparties(id),
  -- null = available in every unit
  unit_id              uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists bolagio_minibar_movements (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references bolagio_minibar_products(id) on delete restrict,
  movement             text not null check (movement in ('purchase','sale','adjustment','waste','complimentary','correction')),
  -- Signed: purchase +, sale/waste/complimentary −, adjustment/correction ±.
  quantity             integer not null check (quantity <> 0),
  unit_cost_cents      bigint,
  unit_price_cents     bigint,
  unit_id              uuid,
  booking_intent_id    uuid,
  booking_reference    text,
  charge_state         text not null default 'not_applicable' check (charge_state in
                         ('not_applicable','unpaid','paid','included','written_off','needs_review')),
  occurred_on          date not null,
  -- The finance transaction this movement created (sale → revenue + COGS).
  transaction_id       uuid references bolagio_finance_transactions(id),
  corrects_id          uuid references bolagio_minibar_movements(id),
  note                 text,
  recorded_by          text not null,
  created_at           timestamptz not null default now(),
  constraint bolagio_minibar_sign check (
    (movement in ('purchase') and quantity > 0) or
    (movement in ('sale','waste','complimentary') and quantity < 0) or
    (movement in ('adjustment','correction'))
  )
);

create index if not exists bolagio_minibar_movements_product_idx on bolagio_minibar_movements (product_id, occurred_on desc);
create index if not exists bolagio_minibar_movements_booking_idx on bolagio_minibar_movements (booking_intent_id) where booking_intent_id is not null;

comment on table bolagio_minibar_movements is 'Stock movements. Append-only; a mistake is corrected by a correction movement pointing at the original.';

-- Expected cleaning cost per turnover — an expectation, not an expense. The
-- invoice, when it comes, is the expense; the two are linked and compared.
create table if not exists bolagio_finance_turnover_costs (
  id                    uuid primary key default gen_random_uuid(),
  turnover_id           uuid not null unique,
  booking_intent_id     uuid,
  booking_reference     text,
  unit_id               uuid,
  departure             date not null,
  supplier_id           uuid references bolagio_finance_counterparties(id),
  expected_net_cents    bigint not null check (expected_net_cents >= 0),
  expected_tax_code     text references bolagio_finance_tax_codes(code),
  actual_line_id        uuid references bolagio_finance_transaction_lines(id),
  state                 text not null default 'expected' check (state in ('expected','invoiced','waived','needs_review')),
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists bolagio_finance_turnover_costs_state_idx on bolagio_finance_turnover_costs (state, departure);

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 9 — triggers: immutability, totals, locks, append-only
-- ══════════════════════════════════════════════════════════════════════════

-- 9a. touch updated_at
do $$ declare t text; begin
  foreach t in array array['bolagio_finance_tax_codes','bolagio_finance_categories','bolagio_finance_counterparties','bolagio_finance_accounts',
    'bolagio_finance_import_batches','bolagio_finance_documents','bolagio_finance_transactions','bolagio_finance_transaction_lines',
    'bolagio_finance_payments','bolagio_finance_invoices','bolagio_finance_tax_periods','bolagio_finance_tax_notices','bolagio_finance_assets',
    'bolagio_minibar_products','bolagio_finance_turnover_costs'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function bolagio_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- 9b. Transactions: financial columns immutable once posted; locked periods
-- refuse every change; delete is never allowed.
create or replace function bolagio_finance_tx_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance transactions are never deleted; reverse them' using errcode = 'BLG10';
  end if;
  if tg_op = 'INSERT' then
    if bolagio_finance_period_locked(new.booked_on) and coalesce(current_setting('bolagio.finance_unlock', true), '') <> 'yes' then
      raise exception 'period % is locked', bolagio_finance_period_key(new.booked_on) using errcode = 'BLG11';
    end if;
    perform bolagio_finance_ensure_period(new.booked_on);
    return new;
  end if;
  -- UPDATE
  if bolagio_finance_period_locked(old.booked_on) and coalesce(current_setting('bolagio.finance_unlock', true), '') <> 'yes' then
    -- The one permitted change in a locked period: marking the row reversed
    -- by a correction posted in an OPEN period.
    if not (new.status = 'reversed' and old.status = 'posted' and new.reversed_by is not null
            and row(new.kind, new.booked_on, new.currency, new.net_cents, new.vat_cents, new.gross_cents, new.source_system, new.source_reference)
              is not distinct from row(old.kind, old.booked_on, old.currency, old.net_cents, old.vat_cents, old.gross_cents, old.source_system, old.source_reference)) then
      raise exception 'period % is locked', bolagio_finance_period_key(old.booked_on) using errcode = 'BLG11';
    end if;
  end if;
  if row(new.kind, new.booked_on, new.service_from, new.service_to, new.invoice_date, new.currency,
         new.counterparty_id, new.booking_intent_id, new.booking_reference, new.source_type, new.source_system,
         new.source_reference, new.posted_by, new.posted_at, new.correction_of)
     is distinct from
     row(old.kind, old.booked_on, old.service_from, old.service_to, old.invoice_date, old.currency,
         old.counterparty_id, old.booking_intent_id, old.booking_reference, old.source_type, old.source_system,
         old.source_reference, old.posted_by, old.posted_at, old.correction_of) then
    raise exception 'posted transaction % is immutable; post a reversal' , old.id using errcode = 'BLG12';
  end if;
  -- Totals move only through the line-sync path.
  if row(new.net_cents, new.vat_cents, new.gross_cents) is distinct from row(old.net_cents, old.vat_cents, old.gross_cents)
     and coalesce(current_setting('bolagio.finance_sync_totals', true), '') <> 'yes' then
    raise exception 'transaction totals are derived from lines' using errcode = 'BLG12';
  end if;
  -- A reversed transaction is frozen entirely.
  if old.status <> 'posted' and row(new.review_state, new.document_state, new.payment_state, new.reconciliation_state, new.note)
     is distinct from row(old.review_state, old.document_state, old.payment_state, old.reconciliation_state, old.note) then
    raise exception 'transaction % is % and frozen', old.id, old.status using errcode = 'BLG12';
  end if;
  -- Accountant-locked rows are not re-classified by automation; the unlock
  -- GUC is set only by the override function, which records the change.
  if old.review_state = 'accountant_locked' and new.review_state <> 'accountant_locked'
     and coalesce(current_setting('bolagio.finance_override', true), '') <> 'yes' then
    raise exception 'transaction % is accountant-locked', old.id using errcode = 'BLG13';
  end if;
  return new;
end $$;

drop trigger if exists bolagio_finance_tx_guard on bolagio_finance_transactions;
create trigger bolagio_finance_tx_guard before insert or update or delete on bolagio_finance_transactions
  for each row execute function bolagio_finance_tx_guard();

-- 9c. Lines: money columns immutable; classification changes only through the
-- override path; sync header totals; locked period refuses.
create or replace function bolagio_finance_line_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_tx bolagio_finance_transactions;
begin
  if tg_op = 'DELETE' then
    raise exception 'finance lines are never deleted; reverse the transaction' using errcode = 'BLG10';
  end if;
  select * into v_tx from bolagio_finance_transactions where id = coalesce(new.transaction_id, old.transaction_id);
  if not found then raise exception 'line without transaction' using errcode = 'BLG12'; end if;
  if bolagio_finance_period_locked(v_tx.booked_on) and coalesce(current_setting('bolagio.finance_unlock', true), '') <> 'yes' then
    raise exception 'period % is locked', bolagio_finance_period_key(v_tx.booked_on) using errcode = 'BLG11';
  end if;
  if tg_op = 'INSERT' then
    -- Lines are added only while the transaction is being posted (same
    -- statement/transaction as the header), never later.
    if coalesce(current_setting('bolagio.finance_posting', true), '') <> 'yes' then
      raise exception 'lines are added only through bolagio_finance_post_transaction' using errcode = 'BLG12';
    end if;
    if new.tax_code = 'DE_REVIEW_REQUIRED' and new.classification not in ('needs_review','suggested') then
      raise exception 'a review-required tax code cannot be verified' using errcode = 'BLG14';
    end if;
    return new;
  end if;
  if row(new.transaction_id, new.line_no, new.net_cents, new.vat_cents, new.gross_cents, new.rate_bp, new.reverse_charge_vat_cents, new.quantity)
     is distinct from
     row(old.transaction_id, old.line_no, old.net_cents, old.vat_cents, old.gross_cents, old.rate_bp, old.reverse_charge_vat_cents, old.quantity) then
    raise exception 'line % money columns are immutable; reverse the transaction' , old.id using errcode = 'BLG12';
  end if;
  if row(new.category, new.tax_code, new.input_vat_treatment, new.deductible_bp, new.unit_id, new.allocation_method, new.asset_state, new.classification, new.cost_centre)
     is distinct from
     row(old.category, old.tax_code, old.input_vat_treatment, old.deductible_bp, old.unit_id, old.allocation_method, old.asset_state, old.classification, old.cost_centre) then
    if coalesce(current_setting('bolagio.finance_override', true), '') <> 'yes' then
      raise exception 'classification changes only through bolagio_finance_reclassify_line' using errcode = 'BLG13';
    end if;
    if old.classification = 'accountant_locked' and coalesce(current_setting('bolagio.finance_accountant', true), '') <> 'yes' then
      raise exception 'line % is accountant-locked', old.id using errcode = 'BLG13';
    end if;
    if new.tax_code = 'DE_REVIEW_REQUIRED' and new.classification not in ('needs_review','suggested') then
      raise exception 'a review-required tax code cannot be verified' using errcode = 'BLG14';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bolagio_finance_line_guard on bolagio_finance_transaction_lines;
create trigger bolagio_finance_line_guard before insert or update or delete on bolagio_finance_transaction_lines
  for each row execute function bolagio_finance_line_guard();

-- Header totals follow the lines (deferred, once per statement).
create or replace function bolagio_finance_sync_totals() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid := coalesce(new.transaction_id, old.transaction_id);
begin
  perform set_config('bolagio.finance_sync_totals', 'yes', true);
  update bolagio_finance_transactions t set
    net_cents = s.net, vat_cents = s.vat, gross_cents = s.gross
  from (select coalesce(sum(net_cents),0) net, coalesce(sum(vat_cents),0) vat, coalesce(sum(gross_cents),0) gross
        from bolagio_finance_transaction_lines where transaction_id = v_id) s
  where t.id = v_id and (t.net_cents, t.vat_cents, t.gross_cents) is distinct from (s.net, s.vat, s.gross);
  perform set_config('bolagio.finance_sync_totals', '', true);
  return null;
end $$;

drop trigger if exists bolagio_finance_sync_totals on bolagio_finance_transaction_lines;
create trigger bolagio_finance_sync_totals after insert or update on bolagio_finance_transaction_lines
  for each row execute function bolagio_finance_sync_totals();

-- 9d. Append-only tables.
create or replace function bolagio_finance_append_only() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'BLG10';
end $$;

do $$ declare t text; begin
  foreach t in array array['bolagio_finance_tax_estimates','bolagio_finance_overrides','bolagio_finance_reconciliations',
                           'bolagio_finance_exports','bolagio_minibar_movements','bolagio_finance_reserves','bolagio_finance_tax_payments',
                           'bolagio_finance_document_links'] loop
    execute format('drop trigger if exists %I on %I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on %I for each row execute function bolagio_finance_append_only()', t || '_append_only', t);
  end loop;
end $$;

-- Tax adjustments: only `superseded_by` may be set, once.
create or replace function bolagio_finance_tax_adjustment_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'tax adjustments are append-only' using errcode = 'BLG10'; end if;
  if old.superseded_by is not null or new.superseded_by is null
     or row(new.tax_type, new.fiscal_year, new.kind, new.amount_cents, new.reason, new.actor, new.created_at)
        is distinct from row(old.tax_type, old.fiscal_year, old.kind, old.amount_cents, old.reason, old.actor, old.created_at) then
    raise exception 'tax adjustments are append-only; supersede instead' using errcode = 'BLG10';
  end if;
  return new;
end $$;
drop trigger if exists bolagio_finance_tax_adjustment_guard on bolagio_finance_tax_adjustments;
create trigger bolagio_finance_tax_adjustment_guard before update or delete on bolagio_finance_tax_adjustments
  for each row execute function bolagio_finance_tax_adjustment_guard();

-- Documents: the original is never overwritten. Hash, bytes, filename, type
-- and storage key are immutable; only review/retention/link metadata moves.
create or replace function bolagio_finance_document_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'documents are never deleted' using errcode = 'BLG10'; end if;
  if row(new.sha256, new.byte_size, new.original_filename, new.mime_type, new.storage_key, new.document_type, new.source, new.received_at, new.supersedes_id)
     is distinct from row(old.sha256, old.byte_size, old.original_filename, old.mime_type, old.storage_key, old.document_type, old.source, old.received_at, old.supersedes_id) then
    raise exception 'document % is immutable; upload a new version with supersedes_id', old.id using errcode = 'BLG12';
  end if;
  if old.legal_hold and not new.legal_hold and coalesce(current_setting('bolagio.finance_accountant', true), '') <> 'yes' then
    raise exception 'legal hold is lifted only by the accountant path' using errcode = 'BLG13';
  end if;
  return new;
end $$;
drop trigger if exists bolagio_finance_document_guard on bolagio_finance_documents;
create trigger bolagio_finance_document_guard before update or delete on bolagio_finance_documents
  for each row execute function bolagio_finance_document_guard();

-- Payments: money columns immutable; never deleted.
create or replace function bolagio_finance_payment_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'payments are never deleted' using errcode = 'BLG10'; end if;
  if row(new.direction, new.source, new.provider_reference, new.amount_cents, new.fee_cents, new.currency, new.occurred_at, new.value_date, new.import_batch_id)
     is distinct from row(old.direction, old.source, old.provider_reference, old.amount_cents, old.fee_cents, old.currency, old.occurred_at, old.value_date, old.import_batch_id) then
    raise exception 'payment % money columns are immutable', old.id using errcode = 'BLG12';
  end if;
  return new;
end $$;
drop trigger if exists bolagio_finance_payment_guard on bolagio_finance_payments;
create trigger bolagio_finance_payment_guard before update or delete on bolagio_finance_payments
  for each row execute function bolagio_finance_payment_guard();

-- Invoices: an issued invoice is frozen except payment_state; voiding needs the accountant/override path and a reason in the overrides table.
create or replace function bolagio_finance_invoice_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'issued invoices are never deleted' using errcode = 'BLG10'; end if;
    return old;
  end if;
  if old.status = 'issued' then
    if row(new.series, new.number, new.issued_on, new.issuer_name, new.issuer_address, new.issuer_tax_id_masked, new.recipient_name, new.recipient_address,
           new.recipient_company, new.recipient_vat_id, new.currency, new.net_cents, new.vat_cents, new.gross_cents, new.booking_intent_id, new.service_from, new.service_to)
       is distinct from
       row(old.series, old.number, old.issued_on, old.issuer_name, old.issuer_address, old.issuer_tax_id_masked, old.recipient_name, old.recipient_address,
           old.recipient_company, old.recipient_vat_id, old.currency, old.net_cents, old.vat_cents, old.gross_cents, old.booking_intent_id, old.service_from, old.service_to) then
      raise exception 'issued invoice % is immutable; issue a credit note', old.id using errcode = 'BLG12';
    end if;
    if new.status = 'voided' and coalesce(current_setting('bolagio.finance_override', true), '') <> 'yes' then
      raise exception 'voiding is recorded through the override path' using errcode = 'BLG13';
    end if;
  end if;
  if old.status = 'voided' and row(new.*) is distinct from row(old.*) then
    raise exception 'voided invoice % is frozen', old.id using errcode = 'BLG12';
  end if;
  return new;
end $$;
drop trigger if exists bolagio_finance_invoice_guard on bolagio_finance_invoices;
create trigger bolagio_finance_invoice_guard before update or delete on bolagio_finance_invoices
  for each row execute function bolagio_finance_invoice_guard();

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 10 — command functions (the only write paths the app uses)
-- ══════════════════════════════════════════════════════════════════════════

-- Post a transaction with its lines, atomically, validated.
--
-- p_header keys: kind, booked_on, service_from, service_to, invoice_date, due_on,
--   currency, counterparty_id, counterparty_label, supplier_invoice_no,
--   description, channel, booking_intent_id, booking_reference, unit_id,
--   source_type, source_system, source_reference, import_batch_id,
--   review_state, document_state, payment_state, reconciliation_state,
--   correction_of, note
-- p_lines: array of {line_no, category, description, quantity, tax_code,
--   rate_bp, net_cents, vat_cents, gross_cents, reverse_charge_vat_cents,
--   input_vat_treatment, deductible_bp, unit_id, allocation_method,
--   allocation_note, cost_centre, asset_state, minibar_product_id,
--   classification}
--
-- Idempotent on (source_system, source_reference): a second call with the
-- same key returns the existing id with created=false and changes nothing.
create or replace function bolagio_finance_post_transaction(p_header jsonb, p_lines jsonb, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid; v_existing uuid; v_line jsonb; v_n integer := 0;
  v_code bolagio_finance_tax_codes; v_booked date; v_rate integer;
  v_net bigint; v_vat bigint; v_gross bigint; v_rc bigint; v_class text; v_treat text;
begin
  if p_header->>'source_system' is null or p_header->>'source_reference' is null then
    raise exception 'source_system and source_reference are required' using errcode = 'BLG12';
  end if;
  select id into v_existing from bolagio_finance_transactions
   where source_system = p_header->>'source_system' and source_reference = p_header->>'source_reference';
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'created', false, 'id', v_existing);
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a transaction needs at least one line' using errcode = 'BLG12';
  end if;
  v_booked := (p_header->>'booked_on')::date;
  if v_booked is null then raise exception 'booked_on is required' using errcode = 'BLG12'; end if;
  if bolagio_finance_period_locked(v_booked) then
    raise exception 'period % is locked', bolagio_finance_period_key(v_booked) using errcode = 'BLG11';
  end if;

  perform set_config('bolagio.finance_posting', 'yes', true);

  insert into bolagio_finance_transactions (
    kind, booked_on, service_from, service_to, invoice_date, due_on, currency,
    counterparty_id, counterparty_label, supplier_invoice_no, description, channel,
    booking_intent_id, booking_reference, unit_id, source_type, source_system, source_reference, import_batch_id,
    status, review_state, document_state, payment_state, reconciliation_state, correction_of, note, posted_by)
  values (
    p_header->>'kind', v_booked, (p_header->>'service_from')::date, (p_header->>'service_to')::date,
    (p_header->>'invoice_date')::date, (p_header->>'due_on')::date, coalesce(p_header->>'currency', 'EUR'),
    (p_header->>'counterparty_id')::uuid, left(p_header->>'counterparty_label', 200), left(p_header->>'supplier_invoice_no', 120),
    left(coalesce(p_header->>'description', ''), 400), p_header->>'channel',
    (p_header->>'booking_intent_id')::uuid, p_header->>'booking_reference', (p_header->>'unit_id')::uuid,
    p_header->>'source_type', p_header->>'source_system', p_header->>'source_reference', (p_header->>'import_batch_id')::uuid,
    coalesce(p_header->>'status', 'posted'),
    coalesce(p_header->>'review_state', 'needs_review'), coalesce(p_header->>'document_state', 'missing'),
    coalesce(p_header->>'payment_state', 'unpaid'), coalesce(p_header->>'reconciliation_state', 'unmatched'),
    (p_header->>'correction_of')::uuid, left(p_header->>'note', 1000), left(p_actor, 200))
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    select * into v_code from bolagio_finance_tax_codes where code = v_line->>'tax_code';
    if not found then raise exception 'unknown tax code %', v_line->>'tax_code' using errcode = 'BLG14'; end if;
    if not v_code.active then raise exception 'tax code % is inactive', v_code.code using errcode = 'BLG14'; end if;
    if v_booked < v_code.effective_from or (v_code.effective_to is not null and v_booked > v_code.effective_to) then
      raise exception 'tax code % is not effective on %', v_code.code, v_booked using errcode = 'BLG14';
    end if;
    v_rate := coalesce((v_line->>'rate_bp')::integer, v_code.rate_bp);
    if v_rate <> v_code.rate_bp and v_code.treatment <> 'review_required' then
      raise exception 'rate % does not match tax code % (%)', v_rate, v_code.code, v_code.rate_bp using errcode = 'BLG14';
    end if;
    v_net := (v_line->>'net_cents')::bigint; v_vat := (v_line->>'vat_cents')::bigint; v_gross := (v_line->>'gross_cents')::bigint;
    v_rc := coalesce((v_line->>'reverse_charge_vat_cents')::bigint, 0);
    if v_net is null or v_vat is null or v_gross is null then raise exception 'line % needs net, vat and gross', v_n using errcode = 'BLG12'; end if;
    if v_gross <> v_net + v_vat then raise exception 'line % gross <> net + vat', v_n using errcode = 'BLG12'; end if;
    -- VAT consistency with the rate, ±1 cent for rounding (exempt/outside/reverse charge carry 0).
    if v_code.treatment in ('standard','reduced') and abs(v_vat - round(v_net * v_rate / 10000.0)) > 1 then
      raise exception 'line % vat % inconsistent with rate % on net %', v_n, v_vat, v_rate, v_net using errcode = 'BLG14';
    end if;
    if v_code.treatment in ('exempt','outside_scope','reverse_charge') and v_vat <> 0 then
      raise exception 'line % carries VAT under a % code', v_n, v_code.treatment using errcode = 'BLG14';
    end if;
    if v_code.reverse_charge and abs(v_rc - round(v_net * v_rate / 10000.0)) > 1 then
      raise exception 'line % reverse-charge VAT % inconsistent with rate %', v_n, v_rc, v_rate using errcode = 'BLG14';
    end if;
    v_class := coalesce(v_line->>'classification', 'needs_review');
    if v_code.review_required then v_class := 'needs_review'; end if;
    v_treat := coalesce(v_line->>'input_vat_treatment', case when p_header->>'kind' in ('revenue','refund','credit_note') then 'not_applicable' else 'review_required' end);
    if v_code.reverse_charge then v_treat := 'reverse_charge'; end if;
    insert into bolagio_finance_transaction_lines (
      transaction_id, line_no, category, description, quantity, tax_code, rate_bp, net_cents, vat_cents, gross_cents,
      reverse_charge_vat_cents, input_vat_treatment, deductible_bp, unit_id, allocation_method, allocation_note, cost_centre,
      asset_state, minibar_product_id, classification, classified_by, classified_at)
    values (
      v_id, coalesce((v_line->>'line_no')::smallint, v_n::smallint), v_line->>'category', left(v_line->>'description', 300),
      (v_line->>'quantity')::integer, v_code.code, v_rate, v_net, v_vat, v_gross, v_rc, v_treat,
      coalesce((v_line->>'deductible_bp')::integer, case when v_treat = 'deductible' or v_treat = 'reverse_charge' then 10000 when v_treat = 'not_deductible' then 0 else 10000 end),
      coalesce((v_line->>'unit_id')::uuid, (p_header->>'unit_id')::uuid),
      coalesce(v_line->>'allocation_method', case when coalesce(v_line->>'unit_id', p_header->>'unit_id') is null then 'unallocated' else 'direct' end),
      left(v_line->>'allocation_note', 300), left(v_line->>'cost_centre', 60),
      coalesce(v_line->>'asset_state', 'none'), (v_line->>'minibar_product_id')::uuid,
      v_class, case when v_class in ('auto_verified','reviewed','accountant_locked') then left(p_actor, 200) end,
      case when v_class in ('auto_verified','reviewed','accountant_locked') then now() end);
  end loop;

  perform set_config('bolagio.finance_posting', '', true);
  return jsonb_build_object('ok', true, 'created', true, 'id', v_id);
end $$;

-- Reverse a posted transaction: a mirror-image posting in an OPEN period,
-- linked both ways. The original is marked reversed and frozen.
create or replace function bolagio_finance_reverse_transaction(p_id uuid, p_reason text, p_actor text, p_booked_on date default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_tx bolagio_finance_transactions; v_lines jsonb; v_header jsonb; v_res jsonb; v_date date;
begin
  select * into v_tx from bolagio_finance_transactions where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_tx.status <> 'posted' then return jsonb_build_object('ok', false, 'code', 'NOT_POSTED', 'status', v_tx.status); end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reversal needs a reason' using errcode = 'BLG12'; end if;
  v_date := coalesce(p_booked_on, greatest(v_tx.booked_on, current_date));
  if v_date < v_tx.booked_on then raise exception 'a reversal cannot predate the original' using errcode = 'BLG12'; end if;
  if bolagio_finance_period_locked(v_date) then
    raise exception 'period % is locked', bolagio_finance_period_key(v_date) using errcode = 'BLG11';
  end if;

  select jsonb_agg(jsonb_build_object(
    'line_no', line_no, 'category', category, 'description', description, 'quantity', case when quantity is null then null else -quantity end,
    'tax_code', tax_code, 'rate_bp', rate_bp, 'net_cents', -net_cents, 'vat_cents', -vat_cents, 'gross_cents', -gross_cents,
    'reverse_charge_vat_cents', -reverse_charge_vat_cents, 'input_vat_treatment', input_vat_treatment, 'deductible_bp', deductible_bp,
    'unit_id', unit_id, 'allocation_method', allocation_method, 'cost_centre', cost_centre, 'asset_state', 'none',
    'minibar_product_id', minibar_product_id, 'classification', case when classification = 'accountant_locked' then 'reviewed' else classification end)
    order by line_no)
  into v_lines from bolagio_finance_transaction_lines where transaction_id = p_id;

  v_header := jsonb_build_object(
    'kind', v_tx.kind, 'booked_on', v_date, 'service_from', v_tx.service_from, 'service_to', v_tx.service_to,
    'invoice_date', v_tx.invoice_date, 'currency', v_tx.currency, 'counterparty_id', v_tx.counterparty_id,
    'counterparty_label', v_tx.counterparty_label, 'supplier_invoice_no', v_tx.supplier_invoice_no,
    'description', left('Reversal: ' || v_tx.description, 400), 'channel', v_tx.channel,
    'booking_intent_id', v_tx.booking_intent_id, 'booking_reference', v_tx.booking_reference, 'unit_id', v_tx.unit_id,
    'source_type', 'system', 'source_system', 'reversal', 'source_reference', p_id::text,
    'status', 'reversal', 'review_state', 'reviewed', 'document_state', 'not_required', 'payment_state', 'not_applicable',
    'reconciliation_state', 'not_applicable', 'correction_of', p_id, 'note', left(p_reason, 1000));

  v_res := bolagio_finance_post_transaction(v_header, v_lines, p_actor);
  if not (v_res->>'created')::boolean then return jsonb_build_object('ok', false, 'code', 'ALREADY_REVERSED', 'reversal_id', v_res->>'id'); end if;

  perform set_config('bolagio.finance_unlock', 'yes', true);
  update bolagio_finance_transactions set status = 'reversed', reversed_by = (v_res->>'id')::uuid, reversal_reason = left(p_reason, 1000)
   where id = p_id;
  perform set_config('bolagio.finance_unlock', '', true);

  insert into bolagio_finance_overrides (target_type, target_id, field, old_value, new_value, reason, actor)
  values ('transaction', p_id, 'status', 'posted', 'reversed', left(p_reason, 1000), left(p_actor, 200));

  return jsonb_build_object('ok', true, 'reversal_id', v_res->>'id');
end $$;

-- Re-classify a line (category / tax code / input VAT / allocation / asset
-- state). Records an override row per changed field. The tax code may only
-- change to one with the SAME rate (money is immutable); a rate change is a
-- reversal plus a new posting.
create or replace function bolagio_finance_reclassify_line(
  p_line_id uuid, p_patch jsonb, p_reason text, p_actor text, p_as_accountant boolean default false)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_line bolagio_finance_transaction_lines; v_new bolagio_finance_transaction_lines; v_code bolagio_finance_tax_codes; v_key text; v_changed integer := 0;
begin
  select * into v_line from bolagio_finance_transaction_lines where id = p_line_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if coalesce(trim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if v_line.classification = 'accountant_locked' and not p_as_accountant then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNTANT_LOCKED');
  end if;
  v_new := v_line;
  if p_patch ? 'tax_code' then
    select * into v_code from bolagio_finance_tax_codes where code = p_patch->>'tax_code';
    if not found then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_TAX_CODE'); end if;
    if v_code.rate_bp <> v_line.rate_bp and v_code.treatment <> 'review_required' and v_line.tax_code <> 'DE_REVIEW_REQUIRED' then
      return jsonb_build_object('ok', false, 'code', 'RATE_CHANGE_NEEDS_REVERSAL');
    end if;
    if v_line.tax_code = 'DE_REVIEW_REQUIRED' and v_code.treatment in ('standard','reduced') and abs(v_line.vat_cents - round(v_line.net_cents * v_code.rate_bp / 10000.0)) > 1 then
      return jsonb_build_object('ok', false, 'code', 'VAT_INCONSISTENT_WITH_CODE');
    end if;
    v_new.tax_code := v_code.code;
  end if;
  if p_patch ? 'category' then
    if not exists (select 1 from bolagio_finance_categories where code = p_patch->>'category' and active) then
      return jsonb_build_object('ok', false, 'code', 'UNKNOWN_CATEGORY');
    end if;
    v_new.category := p_patch->>'category';
  end if;
  if p_patch ? 'input_vat_treatment' then v_new.input_vat_treatment := p_patch->>'input_vat_treatment'; end if;
  if p_patch ? 'deductible_bp' then v_new.deductible_bp := (p_patch->>'deductible_bp')::integer; end if;
  if p_patch ? 'unit_id' then v_new.unit_id := (p_patch->>'unit_id')::uuid; end if;
  if p_patch ? 'allocation_method' then v_new.allocation_method := p_patch->>'allocation_method'; end if;
  if p_patch ? 'asset_state' then v_new.asset_state := p_patch->>'asset_state'; end if;
  if p_patch ? 'cost_centre' then v_new.cost_centre := p_patch->>'cost_centre'; end if;
  v_new.classification := case when p_as_accountant then 'accountant_locked'
                               when v_new.tax_code = 'DE_REVIEW_REQUIRED' then 'needs_review'
                               else 'reviewed' end;

  perform set_config('bolagio.finance_override', 'yes', true);
  if p_as_accountant then perform set_config('bolagio.finance_accountant', 'yes', true); end if;
  update bolagio_finance_transaction_lines set
    category = v_new.category, tax_code = v_new.tax_code, input_vat_treatment = v_new.input_vat_treatment,
    deductible_bp = v_new.deductible_bp, unit_id = v_new.unit_id, allocation_method = v_new.allocation_method,
    asset_state = v_new.asset_state, cost_centre = v_new.cost_centre, classification = v_new.classification,
    classified_by = left(p_actor, 200), classified_at = now()
  where id = p_line_id;
  perform set_config('bolagio.finance_override', '', true);
  perform set_config('bolagio.finance_accountant', '', true);

  foreach v_key in array array['category','tax_code','input_vat_treatment','deductible_bp','unit_id','allocation_method','asset_state','cost_centre','classification'] loop
    if to_jsonb(v_line)->>v_key is distinct from to_jsonb(v_new)->>v_key then
      insert into bolagio_finance_overrides (target_type, target_id, field, old_value, new_value, reason, actor)
      values ('line', p_line_id, v_key, to_jsonb(v_line)->>v_key, to_jsonb(v_new)->>v_key, left(p_reason, 1000), left(p_actor, 200));
      v_changed := v_changed + 1;
    end if;
  end loop;

  -- The header's review state follows the lines.
  update bolagio_finance_transactions t set review_state =
    (select case when bool_and(classification = 'accountant_locked') then 'accountant_locked'
                 when bool_or(classification = 'needs_review') then 'needs_review'
                 when bool_or(classification = 'suggested') then 'suggested'
                 when bool_and(classification = 'auto_verified') then 'auto_verified'
                 else 'reviewed' end
       from bolagio_finance_transaction_lines where transaction_id = v_line.transaction_id)
  where t.id = v_line.transaction_id and t.status = 'posted';

  return jsonb_build_object('ok', true, 'changed', v_changed, 'classification', v_new.classification);
end $$;

-- Update a transaction's non-money states (document, payment, reconciliation,
-- note). Audited through the overrides table when a state moves.
create or replace function bolagio_finance_set_transaction_state(p_id uuid, p_patch jsonb, p_actor text, p_reason text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_tx bolagio_finance_transactions; v_key text; v_val text;
begin
  select * into v_tx from bolagio_finance_transactions where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_tx.status <> 'posted' then return jsonb_build_object('ok', false, 'code', 'NOT_POSTED'); end if;
  foreach v_key in array array['document_state','payment_state','reconciliation_state','review_state','note','counterparty_label','supplier_invoice_no','due_on'] loop
    if p_patch ? v_key then
      v_val := p_patch->>v_key;
      if v_key = 'review_state' and v_val = 'accountant_locked' then perform set_config('bolagio.finance_override', 'yes', true); end if;
      if v_key = 'review_state' and v_tx.review_state = 'accountant_locked' then perform set_config('bolagio.finance_override', 'yes', true); end if;
      execute format('update bolagio_finance_transactions set %I = $1 where id = $2', v_key)
        using case when v_key = 'due_on' then null else v_val end, p_id;
      if v_key = 'due_on' then update bolagio_finance_transactions set due_on = v_val::date where id = p_id; end if;
      if to_jsonb(v_tx)->>v_key is distinct from v_val then
        insert into bolagio_finance_overrides (target_type, target_id, field, old_value, new_value, reason, actor)
        values ('transaction', p_id, v_key, to_jsonb(v_tx)->>v_key, v_val, coalesce(left(p_reason, 1000), 'state change'), left(p_actor, 200));
      end if;
      perform set_config('bolagio.finance_override', '', true);
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Record a cash fact. Idempotent on (source, provider_reference).
create or replace function bolagio_finance_record_payment(p_payment jsonb, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from bolagio_finance_payments where source = p_payment->>'source' and provider_reference = p_payment->>'provider_reference';
  if v_id is not null then return jsonb_build_object('ok', true, 'created', false, 'id', v_id); end if;
  insert into bolagio_finance_payments (
    direction, source, provider_reference, account_id, amount_cents, fee_cents, currency, occurred_at, value_date,
    counterparty_label, reference_text, booking_intent_id, booking_reference, import_batch_id, kind, reconciliation_state, note, created_by)
  values (
    p_payment->>'direction', p_payment->>'source', p_payment->>'provider_reference', (p_payment->>'account_id')::uuid,
    (p_payment->>'amount_cents')::bigint, coalesce((p_payment->>'fee_cents')::bigint, 0), coalesce(p_payment->>'currency', 'EUR'),
    (p_payment->>'occurred_at')::timestamptz, (p_payment->>'value_date')::date, left(p_payment->>'counterparty_label', 200),
    left(p_payment->>'reference_text', 300), (p_payment->>'booking_intent_id')::uuid, p_payment->>'booking_reference',
    (p_payment->>'import_batch_id')::uuid, coalesce(p_payment->>'kind', 'receipt'), coalesce(p_payment->>'reconciliation_state', 'unmatched'),
    left(p_payment->>'note', 1000), left(p_actor, 200))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'created', true, 'id', v_id);
end $$;

-- Record a match between facts and move their reconciliation states.
create or replace function bolagio_finance_record_match(p_match jsonb, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid; v_tx uuid := (p_match->>'transaction_id')::uuid; v_pay uuid := (p_match->>'payment_id')::uuid; v_state text := p_match->>'state';
begin
  if v_tx is not null and v_pay is not null and exists (
    select 1 from bolagio_finance_reconciliations where transaction_id = v_tx and payment_id = v_pay and state <> 'rejected') then
    return jsonb_build_object('ok', true, 'created', false);
  end if;
  insert into bolagio_finance_reconciliations (transaction_id, payment_id, document_id, amount_cents, state, rule, rule_version, confidence, reason, matched_by)
  values (v_tx, v_pay, (p_match->>'document_id')::uuid, (p_match->>'amount_cents')::bigint, v_state, p_match->>'rule', p_match->>'rule_version',
          p_match->>'confidence', left(p_match->>'reason', 500), left(p_actor, 200))
  returning id into v_id;
  if v_tx is not null then
    update bolagio_finance_transactions set reconciliation_state = case v_state when 'matched' then 'matched' when 'partially_matched' then 'partially_matched' when 'mismatch' then 'mismatch' else 'needs_review' end,
      payment_state = case when v_state = 'matched' and v_pay is not null then 'paid' when v_state = 'partially_matched' and v_pay is not null then 'partially_paid' else payment_state end
    where id = v_tx and status = 'posted';
  end if;
  if v_pay is not null then
    update bolagio_finance_payments set reconciliation_state = case v_state when 'matched' then 'matched' when 'partially_matched' then 'partially_matched' when 'mismatch' then 'mismatch' else 'needs_review' end
    where id = v_pay;
  end if;
  if (p_match->>'document_id') is not null and v_tx is not null then
    insert into bolagio_finance_document_links (document_id, target_type, target_id, linked_by)
    values ((p_match->>'document_id')::uuid, 'transaction', v_tx, left(p_actor, 200)) on conflict do nothing;
    update bolagio_finance_transactions set document_state = 'complete' where id = v_tx and status = 'posted' and document_state in ('missing','pending');
  end if;
  return jsonb_build_object('ok', true, 'created', true, 'id', v_id);
end $$;

-- Register a document. Idempotent on sha256 (returns the existing row).
create or replace function bolagio_finance_register_document(p_doc jsonb, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid; v_class text; v_until date; v_basis text; v_date date;
begin
  select id into v_id from bolagio_finance_documents where sha256 = p_doc->>'sha256';
  if v_id is not null then return jsonb_build_object('ok', true, 'created', false, 'id', v_id, 'duplicate', true); end if;
  v_date := coalesce((p_doc->>'document_date')::date, current_date);
  -- Retention class from type. Periods per docs/finance/retention.md: the
  -- dates are PLANNING dates (review flag stays on) — nothing deletes.
  v_class := coalesce(p_doc->>'retention_class', case p_doc->>'document_type'
    when 'supplier_invoice' then 'invoice' when 'guest_invoice' then 'invoice' when 'credit_note' then 'invoice'
    when 'booking_com_commission_invoice' then 'invoice' when 'e_invoice' then 'invoice'
    when 'booking_com_payout_statement' then 'accounting_voucher' when 'paypal_statement' then 'accounting_voucher'
    when 'bank_statement' then 'accounting_voucher' when 'receipt' then 'accounting_voucher'
    when 'tax_notice' then 'tax_notice' when 'contract' then 'contract' else 'other' end);
  -- Retention runs from the END of the calendar year of the document (§ 147 Abs. 4 AO).
  v_until := case v_class
    when 'invoice' then make_date(extract(year from v_date)::int + 1, 1, 1) + interval '8 years' - interval '1 day'
    when 'accounting_voucher' then make_date(extract(year from v_date)::int + 1, 1, 1) + interval '8 years' - interval '1 day'
    when 'annual_accounts' then make_date(extract(year from v_date)::int + 1, 1, 1) + interval '10 years' - interval '1 day'
    when 'tax_notice' then make_date(extract(year from v_date)::int + 1, 1, 1) + interval '10 years' - interval '1 day'
    when 'contract' then make_date(extract(year from v_date)::int + 1, 1, 1) + interval '10 years' - interval '1 day'
    when 'business_letter' then make_date(extract(year from v_date)::int + 1, 1, 1) + interval '6 years' - interval '1 day'
    else null end;
  v_basis := case v_class
    when 'invoice' then '§ 14b Abs. 1 UStG / § 147 Abs. 1 Nr. 4, Abs. 3 AO (8 years, from the end of the year) — planning date, adviser to confirm'
    when 'accounting_voucher' then '§ 147 Abs. 1 Nr. 4, Abs. 3 AO (8 years) — planning date, adviser to confirm'
    when 'annual_accounts' then '§ 147 Abs. 1 Nr. 1, Abs. 3 AO / § 257 HGB (10 years)'
    when 'tax_notice' then '§ 147 Abs. 1 Nr. 1 AO by analogy (kept with the books, 10 years) — adviser to confirm'
    when 'contract' then 'kept for the life of the contract + limitation; 10 years planning — adviser to confirm'
    when 'business_letter' then '§ 147 Abs. 1 Nr. 2, 3 AO (6 years)'
    else 'unclassified — adviser to confirm' end;
  insert into bolagio_finance_documents (
    document_type, original_filename, mime_type, byte_size, sha256, storage_key, source, structured_format, structured_valid,
    counterparty_id, tax_period_key, document_date, retention_class, retention_basis, retain_until, supersedes_id, uploaded_by, note)
  values (
    p_doc->>'document_type', left(p_doc->>'original_filename', 255), left(p_doc->>'mime_type', 120), (p_doc->>'byte_size')::integer,
    p_doc->>'sha256', p_doc->>'storage_key', coalesce(p_doc->>'source', 'upload'), coalesce(p_doc->>'structured_format', 'none'),
    (p_doc->>'structured_valid')::boolean, (p_doc->>'counterparty_id')::uuid, p_doc->>'tax_period_key', (p_doc->>'document_date')::date,
    v_class, v_basis, v_until, (p_doc->>'supersedes_id')::uuid, left(p_actor, 200), left(p_doc->>'note', 1000))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'created', true, 'id', v_id, 'retain_until', v_until, 'retention_class', v_class);
end $$;

-- Link a document to a record and, for a transaction, mark evidence complete.
create or replace function bolagio_finance_link_document(p_document_id uuid, p_target_type text, p_target_id uuid, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from bolagio_finance_documents where id = p_document_id) then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  insert into bolagio_finance_document_links (document_id, target_type, target_id, linked_by)
  values (p_document_id, p_target_type, p_target_id, left(p_actor, 200)) on conflict do nothing;
  if p_target_type = 'transaction' then
    update bolagio_finance_transactions set document_state = 'complete' where id = p_target_id and status = 'posted' and document_state in ('missing','pending');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Period status. Forward moves by operators; `locked` and any backward move
-- need the accountant flag. A period cannot lock while critical exceptions
-- remain (decided here, in the database, from the facts).
create or replace function bolagio_finance_set_period_status(p_period_key text, p_to text, p_actor text, p_as_accountant boolean default false, p_note text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_p bolagio_finance_periods; v_rank_from int; v_rank_to int; v_blockers jsonb;
begin
  select * into v_p from bolagio_finance_periods where period_key = p_period_key for update;
  if not found then
    perform bolagio_finance_ensure_period((p_period_key || '-01')::date);
    select * into v_p from bolagio_finance_periods where period_key = p_period_key for update;
  end if;
  if v_p.status = p_to then return jsonb_build_object('ok', true, 'noop', true, 'status', v_p.status); end if;
  v_rank_from := array_position(array['open','review','accountant_reviewed','locked'], v_p.status);
  v_rank_to := array_position(array['open','review','accountant_reviewed','locked'], p_to);
  if v_rank_to is null then return jsonb_build_object('ok', false, 'code', 'ILLEGAL'); end if;
  if (v_rank_to < v_rank_from or p_to in ('accountant_reviewed','locked')) and not p_as_accountant then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNTANT_REQUIRED', 'status', v_p.status);
  end if;
  if p_to in ('review','accountant_reviewed','locked') then
    select jsonb_build_object(
      'unclassified', (select count(*) from bolagio_finance_transaction_lines l join bolagio_finance_transactions t on t.id = l.transaction_id
                        where t.status = 'posted' and t.booked_on >= v_p.starts_on and t.booked_on < v_p.ends_on and l.classification in ('needs_review','suggested')),
      'missing_documents', (select count(*) from bolagio_finance_transactions t where t.status = 'posted' and t.booked_on >= v_p.starts_on and t.booked_on < v_p.ends_on and t.document_state = 'missing' and t.kind in ('expense','commission','fee')),
      'mismatches', (select count(*) from bolagio_finance_transactions t where t.status = 'posted' and t.booked_on >= v_p.starts_on and t.booked_on < v_p.ends_on and t.reconciliation_state = 'mismatch'))
    into v_blockers;
    if p_to <> 'review' and ((v_blockers->>'unclassified')::int > 0 or (v_blockers->>'mismatches')::int > 0) then
      return jsonb_build_object('ok', false, 'code', 'BLOCKED', 'blockers', v_blockers, 'status', v_p.status);
    end if;
  end if;
  update bolagio_finance_periods set status = p_to, status_at = now(), status_by = left(p_actor, 200),
    locked_at = case when p_to = 'locked' then now() else null end, locked_by = case when p_to = 'locked' then left(p_actor, 200) else null end,
    note = coalesce(left(p_note, 1000), note)
  where period_key = p_period_key;
  insert into bolagio_finance_overrides (target_type, target_id, field, old_value, new_value, reason, actor)
  values ('tax_period', gen_random_uuid(), 'period:' || p_period_key, v_p.status, p_to, coalesce(left(p_note, 1000), 'period status'), left(p_actor, 200));
  return jsonb_build_object('ok', true, 'from', v_p.status, 'to', p_to, 'blockers', v_blockers);
end $$;

-- Ensure a tax period row and append a stage figure. Filed/assessed/paid
-- stages need the accountant flag. A stage never overwrites; it appends.
create or replace function bolagio_finance_record_tax_stage(
  p_tax_type text, p_period_key text, p_starts_on date, p_ends_on date, p_stage text, p_amount_cents bigint,
  p_basis jsonb, p_rules_version text, p_actor text, p_as_accountant boolean default false, p_note text default null,
  p_filing_due_on date default null, p_payment_due_on date default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_pid uuid; v_id uuid; v_status text;
begin
  if p_stage in ('accountant_reviewed','filed','assessed','paid') and not p_as_accountant then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNTANT_REQUIRED');
  end if;
  insert into bolagio_finance_tax_periods (tax_type, period_key, starts_on, ends_on, filing_due_on, payment_due_on)
  values (p_tax_type, p_period_key, p_starts_on, p_ends_on, p_filing_due_on, p_payment_due_on)
  on conflict (tax_type, period_key) do update set
    filing_due_on = coalesce(bolagio_finance_tax_periods.filing_due_on, excluded.filing_due_on),
    payment_due_on = coalesce(bolagio_finance_tax_periods.payment_due_on, excluded.payment_due_on)
  returning id, status into v_pid, v_status;
  -- A system estimate never moves a period that has been filed or beyond.
  if p_stage = 'system_estimate' and v_status in ('filed','assessed','paid','closed') then
    insert into bolagio_finance_tax_estimates (tax_period_id, stage, amount_cents, basis, rules_version, actor, note)
    values (v_pid, p_stage, p_amount_cents, p_basis, p_rules_version, left(p_actor, 200), coalesce(p_note, 'informational: period already ' || v_status))
    returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'period_id', v_pid, 'status', v_status, 'informational', true);
  end if;
  insert into bolagio_finance_tax_estimates (tax_period_id, stage, amount_cents, basis, rules_version, actor, note)
  values (v_pid, p_stage, p_amount_cents, p_basis, p_rules_version, left(p_actor, 200), left(p_note, 1000))
  returning id into v_id;
  update bolagio_finance_tax_periods set status = case p_stage
      when 'system_estimate' then case when status = 'open' then 'estimated' else status end
      when 'accountant_reviewed' then 'reviewed' when 'filed' then 'filed' when 'assessed' then 'assessed' when 'paid' then 'paid' end,
    status_at = now(), status_by = left(p_actor, 200)
  where id = v_pid;
  return jsonb_build_object('ok', true, 'id', v_id, 'period_id', v_pid);
end $$;

-- Minibar: record a movement and, for a sale, post revenue + COGS.
create or replace function bolagio_minibar_record_movement(p_move jsonb, p_actor text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_p bolagio_minibar_products; v_code bolagio_finance_tax_codes; v_qty integer; v_id uuid; v_tx jsonb; v_gross bigint; v_net bigint; v_vat bigint; v_cogs bigint;
  v_lines jsonb; v_key text; v_charge text; v_occurred date;
begin
  select * into v_p from bolagio_minibar_products where id = (p_move->>'product_id')::uuid;
  if not found then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_PRODUCT'); end if;
  v_qty := (p_move->>'quantity')::integer;
  v_occurred := coalesce((p_move->>'occurred_on')::date, current_date);
  v_charge := coalesce(p_move->>'charge_state', case when p_move->>'movement' = 'sale' then 'unpaid' else 'not_applicable' end);
  v_key := coalesce(p_move->>'source_reference', 'minibar:' || gen_random_uuid()::text);
  if p_move->>'movement' = 'sale' then
    if exists (select 1 from bolagio_finance_transactions where source_system = 'minibar' and source_reference = v_key) then
      return jsonb_build_object('ok', true, 'created', false);
    end if;
    select * into v_code from bolagio_finance_tax_codes where code = v_p.tax_code;
    v_gross := v_p.selling_price_cents * (-v_qty);
    v_net := round(v_gross / (1 + v_code.rate_bp / 10000.0));
    v_vat := v_gross - v_net;
    v_cogs := v_p.purchase_cost_cents * (-v_qty);
    v_lines := jsonb_build_array(jsonb_build_object(
      'line_no', 1, 'category', 'minibar_sales', 'description', v_p.name || ' × ' || (-v_qty), 'quantity', -v_qty,
      'tax_code', v_p.tax_code, 'rate_bp', v_code.rate_bp, 'net_cents', v_net, 'vat_cents', v_vat, 'gross_cents', v_gross,
      'unit_id', p_move->>'unit_id', 'minibar_product_id', v_p.id, 'classification', case when v_code.review_required then 'needs_review' else 'auto_verified' end));
    if v_cogs > 0 then
      v_lines := v_lines || jsonb_build_object(
        'line_no', 2, 'category', 'minibar_cogs', 'description', 'COGS ' || v_p.name || ' × ' || (-v_qty), 'quantity', -v_qty,
        'tax_code', 'DE_OUTSIDE_SCOPE', 'rate_bp', 0, 'net_cents', -v_cogs, 'vat_cents', 0, 'gross_cents', -v_cogs,
        'input_vat_treatment', 'not_applicable', 'unit_id', p_move->>'unit_id', 'minibar_product_id', v_p.id, 'classification', 'auto_verified');
    end if;
    v_tx := bolagio_finance_post_transaction(jsonb_build_object(
      'kind', 'revenue', 'booked_on', v_occurred, 'service_from', v_occurred, 'service_to', v_occurred, 'currency', 'EUR',
      'description', 'Minibar ' || v_p.name, 'channel', coalesce(p_move->>'channel', 'direct'),
      'booking_intent_id', p_move->>'booking_intent_id', 'booking_reference', p_move->>'booking_reference', 'unit_id', p_move->>'unit_id',
      'source_type', 'minibar', 'source_system', 'minibar', 'source_reference', v_key,
      'review_state', case when v_code.review_required then 'needs_review' else 'auto_verified' end,
      'document_state', 'not_required', 'payment_state', case v_charge when 'paid' then 'paid' when 'included' then 'not_applicable' when 'written_off' then 'not_applicable' else 'unpaid' end,
      'reconciliation_state', case when v_charge in ('paid','unpaid') then 'unmatched' else 'not_applicable' end), v_lines, p_actor);
  end if;
  insert into bolagio_minibar_movements (product_id, movement, quantity, unit_cost_cents, unit_price_cents, unit_id, booking_intent_id, booking_reference,
    charge_state, occurred_on, transaction_id, corrects_id, note, recorded_by)
  values (v_p.id, p_move->>'movement', v_qty, coalesce((p_move->>'unit_cost_cents')::bigint, v_p.purchase_cost_cents),
    case when p_move->>'movement' = 'sale' then v_p.selling_price_cents end, (p_move->>'unit_id')::uuid, (p_move->>'booking_intent_id')::uuid,
    p_move->>'booking_reference', v_charge, v_occurred, (v_tx->>'id')::uuid, (p_move->>'corrects_id')::uuid, left(p_move->>'note', 400), left(p_actor, 200))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'created', true, 'id', v_id, 'transaction_id', v_tx->>'id');
end $$;

-- Current stock per product: sum of signed movements.
create or replace view bolagio_minibar_stock as
select p.id as product_id, p.sku, p.name, p.active, p.reorder_threshold, p.purchase_cost_cents, p.selling_price_cents, p.tax_code, p.unit_id,
       coalesce(sum(m.quantity), 0)::integer as on_hand,
       coalesce(sum(case when m.movement = 'sale' then -m.quantity else 0 end), 0)::integer as units_sold,
       coalesce(sum(case when m.movement in ('waste','adjustment','correction') then m.quantity else 0 end), 0)::integer as shrinkage_units,
       coalesce(sum(case when m.movement = 'complimentary' then -m.quantity else 0 end), 0)::integer as complimentary_units,
       coalesce(sum(m.quantity), 0) * p.purchase_cost_cents as stock_value_cents
from bolagio_minibar_products p
left join bolagio_minibar_movements m on m.product_id = p.id
group by p.id;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 11 — aggregate views (the drill-downs read the tables)
-- ══════════════════════════════════════════════════════════════════════════

-- Lines with their header's status-independent facts. Reversals carry
-- negative amounts, so plain sums net out — no filtering needed, and every
-- aggregate remains traceable to both the original and its reversal.
create or replace view bolagio_finance_ledger_lines as
select l.id as line_id, t.id as transaction_id, t.kind, t.booked_on, bolagio_finance_period_key(t.booked_on) as period_key,
       t.channel, t.booking_intent_id, t.booking_reference, coalesce(l.unit_id, t.unit_id) as unit_id, t.counterparty_id, t.counterparty_label,
       t.status, t.review_state, t.document_state, t.payment_state, t.reconciliation_state, t.source_type, t.source_system, t.description,
       l.line_no, l.category, c.pl_group, c.kind as category_kind, l.tax_code, x.treatment, x.side, l.rate_bp, l.net_cents, l.vat_cents, l.gross_cents,
       l.reverse_charge_vat_cents, l.input_vat_treatment, l.deductible_bp, l.allocation_method, l.asset_state, l.classification, l.minibar_product_id, l.quantity
from bolagio_finance_transaction_lines l
join bolagio_finance_transactions t on t.id = l.transaction_id
join bolagio_finance_categories c on c.code = l.category
join bolagio_finance_tax_codes x on x.code = l.tax_code;

-- Management P&L by month, group, category and unit (net amounts).
create or replace view bolagio_finance_pl_monthly as
select period_key, pl_group, category, unit_id, channel,
       sum(case when category_kind = 'revenue' then net_cents else 0 end) as revenue_net_cents,
       sum(case when category_kind = 'expense' then net_cents else 0 end) as expense_net_cents,
       sum(net_cents) as net_cents, sum(gross_cents) as gross_cents, count(distinct transaction_id) as transactions
from bolagio_finance_ledger_lines
group by 1,2,3,4,5;

-- VAT position inputs by month and tax code.
create or replace view bolagio_finance_vat_monthly as
select period_key, tax_code, treatment, rate_bp,
       sum(case when kind in ('revenue','refund','credit_note') then net_cents else 0 end) as output_basis_cents,
       sum(case when kind in ('revenue','refund','credit_note') then vat_cents else 0 end) as output_vat_cents,
       sum(case when kind not in ('revenue','refund','credit_note') and input_vat_treatment in ('deductible','partially_deductible') then net_cents else 0 end) as input_basis_cents,
       sum(case when kind not in ('revenue','refund','credit_note') and input_vat_treatment in ('deductible','partially_deductible') then round(vat_cents * deductible_bp / 10000.0) else 0 end)::bigint as input_vat_cents,
       sum(case when kind not in ('revenue','refund','credit_note') and input_vat_treatment = 'not_deductible' then vat_cents else 0 end) as non_deductible_vat_cents,
       sum(case when kind not in ('revenue','refund','credit_note') and input_vat_treatment in ('review_required','unknown') then vat_cents else 0 end) as review_vat_cents,
       sum(case when treatment = 'reverse_charge' then net_cents else 0 end) as rc_basis_cents,
       sum(reverse_charge_vat_cents) as rc_output_vat_cents,
       sum(case when treatment = 'reverse_charge' then round(reverse_charge_vat_cents * deductible_bp / 10000.0) else 0 end)::bigint as rc_input_vat_cents,
       count(*) filter (where classification in ('needs_review','suggested')) as lines_needing_review
from bolagio_finance_ledger_lines
group by 1,2,3,4;

-- Cash by month, source and kind.
create or replace view bolagio_finance_cash_monthly as
select to_char(occurred_at at time zone 'Europe/Berlin', 'YYYY-MM') as period_key, source, kind, direction, account_id,
       sum(case when direction = 'in' then amount_cents else -amount_cents end) as net_cents,
       sum(amount_cents) as gross_cents, sum(fee_cents) as fee_cents, count(*) as payments
from bolagio_finance_payments
where reconciliation_state <> 'ignored'
group by 1,2,3,4,5;

-- Per-unit economics by month (revenue and direct costs only; shared costs
-- are allocated explicitly on the line, never here).
create or replace view bolagio_finance_unit_monthly as
select period_key, unit_id, category, pl_group, sum(net_cents) as net_cents, count(distinct transaction_id) as transactions
from bolagio_finance_ledger_lines where unit_id is not null
group by 1,2,3,4;

-- Exception counts for the inbox and the health section.
create or replace view bolagio_finance_exception_counts as
select
  (select count(*) from bolagio_finance_transactions where status = 'posted' and document_state = 'missing' and kind in ('expense','commission','fee')) as missing_documents,
  (select count(*) from bolagio_finance_transaction_lines l join bolagio_finance_transactions t on t.id = l.transaction_id where t.status = 'posted' and l.classification in ('needs_review','suggested')) as lines_needing_review,
  (select count(*) from bolagio_finance_transaction_lines l join bolagio_finance_transactions t on t.id = l.transaction_id where t.status = 'posted' and l.tax_code = 'DE_REVIEW_REQUIRED') as tax_code_review,
  (select count(*) from bolagio_finance_transaction_lines l join bolagio_finance_transactions t on t.id = l.transaction_id where t.status = 'posted' and l.input_vat_treatment in ('review_required','unknown') and t.kind not in ('revenue','refund','credit_note')) as input_vat_review,
  (select count(*) from bolagio_finance_transactions where status = 'posted' and reconciliation_state = 'mismatch') as mismatches,
  (select count(*) from bolagio_finance_transactions where status = 'posted' and reconciliation_state in ('unmatched','needs_review') and kind in ('revenue','refund') and booked_on <= current_date) as unreconciled_revenue,
  (select count(*) from bolagio_finance_payments where reconciliation_state in ('unmatched','needs_review')) as unmatched_payments,
  (select count(*) from bolagio_finance_transaction_lines l join bolagio_finance_transactions t on t.id = l.transaction_id where t.status = 'posted' and l.allocation_method = 'unallocated' and t.kind in ('expense')) as unallocated_expense_lines,
  (select count(*) from bolagio_finance_transaction_lines l join bolagio_finance_transactions t on t.id = l.transaction_id where t.status = 'posted' and l.asset_state = 'candidate') as asset_candidates,
  (select count(*) from bolagio_finance_import_batches where status = 'failed') as failed_imports,
  (select count(*) from bolagio_minibar_movements where charge_state in ('unpaid','needs_review')) as minibar_open_charges,
  (select min(t.posted_at) from bolagio_finance_transactions t where t.status = 'posted' and (t.review_state in ('needs_review','suggested') or t.document_state = 'missing' or t.reconciliation_state in ('mismatch','needs_review'))) as oldest_open_item;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 12 — seed reference data (idempotent)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Rates and references as researched on 2026-09-20 (docs/finance/tax-sources.md).
-- A code whose legal footing is not settled carries review_required = true.

insert into bolagio_finance_tax_codes (code, label, description, side, treatment, rate_bp, reverse_charge, review_required, effective_from, legal_reference, source_url) values
  ('DE_ACCOMMODATION_REDUCED', 'Accommodation 7 %', 'Short-term letting of living and sleeping rooms to strangers. Services not directly serving the accommodation are excluded (Aufteilungsgebot).', 'output', 'reduced', 700, false, false, '2010-01-01', '§ 12 Abs. 2 Nr. 11 UStG', 'https://www.gesetze-im-internet.de/ustg_1980/__12.html'),
  ('DE_STANDARD', 'Standard 19 %', 'Standard rate. Beverages, ancillary services not directly serving accommodation, most purchases.', 'both', 'standard', 1900, false, false, '2007-01-01', '§ 12 Abs. 1 UStG', 'https://www.gesetze-im-internet.de/ustg_1980/__12.html'),
  ('DE_REDUCED', 'Reduced 7 %', 'Reduced rate for goods in Anlage 2 UStG (food items, printed matter) and other § 12 Abs. 2 supplies.', 'both', 'reduced', 700, false, false, '2007-01-01', '§ 12 Abs. 2 Nr. 1 UStG, Anlage 2', 'https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html'),
  ('DE_FOOD_REDUCED', 'Food items 7 %', 'Delivery of food items listed in Anlage 2 (snacks, chocolate, fruit). Beverages are NOT included except milk / milk mixes ≥ 75 % milk and water under Anlage 2.', 'both', 'reduced', 700, false, false, '2007-01-01', '§ 12 Abs. 2 Nr. 1 UStG, Anlage 2', 'https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html'),
  ('DE_BEVERAGE_STANDARD', 'Beverages 19 %', 'Delivery of beverages (alcoholic and non-alcoholic) — standard rate; beverages are excluded from the reduced rate.', 'both', 'standard', 1900, false, false, '2007-01-01', '§ 12 Abs. 1 UStG; Anlage 2 exclusions', 'https://www.gesetze-im-internet.de/ustg_1980/__12.html'),
  ('DE_ANCILLARY_STANDARD', 'Accommodation ancillary 19 %', 'Services provided with a stay that do not directly serve the accommodation (breakfast, parking, laundry service, late check-out fee).', 'output', 'standard', 1900, false, false, '2010-01-01', '§ 12 Abs. 2 Nr. 11 Satz 2 UStG (Aufteilungsgebot)', 'https://www.gesetze-im-internet.de/ustg_1980/__12.html'),
  ('DE_ANCILLARY_REVIEW', 'Accommodation ancillary — review', 'A charge sold with the stay whose classification (part of the accommodation at 7 % vs. separate service at 19 %) is not yet decided by the adviser — e.g. a mandatory final-cleaning fee.', 'output', 'review_required', 0, false, true, '2010-01-01', '§ 12 Abs. 2 Nr. 11 UStG; BFH XI R 11/23, XI R 13/23, XI R 14/23 (CJEU referrals)', 'https://www.bundesfinanzhof.de'),
  ('DE_REVERSE_CHARGE', 'Reverse charge 19 % (§ 13b)', 'B2B service received from an entrepreneur established abroad (EU or third country): the recipient owes 19 % output VAT on the net and deducts it as input VAT where entitled.', 'input', 'reverse_charge', 1900, true, false, '2010-01-01', '§ 13b Abs. 1, Abs. 2 Nr. 1, Abs. 5 UStG; § 15 Abs. 1 Satz 1 Nr. 4 UStG', 'https://www.gesetze-im-internet.de/ustg_1980/__13b.html'),
  ('DE_EXEMPT', 'Exempt 0 %', 'Exempt supplies without input-VAT deduction (bank charges, insurance, payment-service fees under § 4 Nr. 8).', 'both', 'exempt', 0, false, false, '2007-01-01', '§ 4 Nr. 8, Nr. 10 UStG', 'https://www.gesetze-im-internet.de/ustg_1980/__4.html'),
  ('DE_OUTSIDE_SCOPE', 'Outside scope', 'Not a taxable supply: taxes, fines, internal cost of goods sold, transfers, deposits held.', 'both', 'outside_scope', 0, false, false, '2007-01-01', '§ 1 UStG (not a Leistung)', 'https://www.gesetze-im-internet.de/ustg_1980/__1.html'),
  ('DE_REVIEW_REQUIRED', 'Review required', 'Tax treatment not yet determined. The line is parked until a person classifies it. Never counts toward any VAT figure.', 'both', 'review_required', 0, false, true, '2000-01-01', '—', null)
on conflict (code) do nothing;

insert into bolagio_finance_categories (code, label, pl_group, kind, default_tax_code, asset_candidate, requires_unit, datev_account_skr03, datev_account_skr04, sort_order) values
  -- revenue
  ('accommodation_revenue', 'Accommodation', 'revenue', 'revenue', 'DE_ACCOMMODATION_REDUCED', false, true, '8110', '4110', 10),
  ('accommodation_ancillary', 'Accommodation ancillary', 'revenue', 'revenue', 'DE_ANCILLARY_REVIEW', false, true, null, null, 11),
  ('minibar_sales', 'Minibar sales', 'revenue', 'revenue', null, false, true, null, null, 12),
  ('other_guest_charges', 'Other guest charges', 'revenue', 'revenue', 'DE_REVIEW_REQUIRED', false, true, null, null, 13),
  ('other_revenue', 'Other revenue', 'revenue', 'revenue', 'DE_REVIEW_REQUIRED', false, false, null, null, 19),
  -- direct operating costs
  ('cleaning', 'Cleaning', 'direct_cost', 'expense', 'DE_STANDARD', false, true, null, null, 20),
  ('laundry', 'Laundry', 'direct_cost', 'expense', 'DE_STANDARD', false, true, null, null, 21),
  ('guest_supplies', 'Guest supplies', 'direct_cost', 'expense', 'DE_REVIEW_REQUIRED', false, true, null, null, 22),
  ('minibar_purchases', 'Minibar purchases', 'direct_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 23),
  ('minibar_cogs', 'Minibar cost of goods sold', 'direct_cost', 'expense', 'DE_OUTSIDE_SCOPE', false, true, null, null, 24),
  ('ota_commission', 'OTA commission', 'direct_cost', 'expense', 'DE_REVERSE_CHARGE', false, true, null, null, 25),
  ('ota_fees', 'OTA fees', 'direct_cost', 'expense', 'DE_REVIEW_REQUIRED', false, true, null, null, 26),
  ('payment_fees', 'Payment processing fees', 'direct_cost', 'expense', 'DE_EXEMPT', false, true, null, null, 27),
  -- property operating costs
  ('repairs', 'Repairs', 'property_cost', 'expense', 'DE_STANDARD', false, true, null, null, 30),
  ('maintenance', 'Maintenance', 'property_cost', 'expense', 'DE_STANDARD', false, true, null, null, 31),
  ('furniture', 'Furniture', 'property_cost', 'expense', 'DE_STANDARD', true, true, null, null, 32),
  ('equipment', 'Equipment & appliances', 'property_cost', 'expense', 'DE_STANDARD', true, true, null, null, 33),
  ('utilities', 'Utilities', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', false, true, null, null, 34),
  ('electricity', 'Electricity', 'property_cost', 'expense', 'DE_STANDARD', false, true, null, null, 35),
  ('heating', 'Heating', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', false, true, null, null, 36),
  ('water', 'Water & waste water', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', false, true, null, null, 37),
  ('internet', 'Internet & TV', 'property_cost', 'expense', 'DE_STANDARD', false, true, null, null, 38),
  ('insurance', 'Insurance', 'property_cost', 'expense', 'DE_EXEMPT', false, true, null, null, 39),
  ('property_costs', 'Property costs (rent, HOA, ground)', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', false, true, null, null, 40),
  -- general company costs
  ('software', 'Software / SaaS', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 50),
  ('marketing', 'Marketing', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 51),
  ('advertising', 'Advertising', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 52),
  ('professional_services', 'Professional services', 'company_cost', 'expense', 'DE_STANDARD', false, false, null, null, 53),
  ('tax_adviser', 'Tax adviser', 'company_cost', 'expense', 'DE_STANDARD', false, false, null, null, 54),
  ('legal', 'Legal', 'company_cost', 'expense', 'DE_STANDARD', false, false, null, null, 55),
  ('bank_fees', 'Bank fees', 'company_cost', 'expense', 'DE_EXEMPT', false, false, null, null, 56),
  ('office_admin', 'Office & administration', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 57),
  ('travel', 'Travel', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 58),
  -- below operating result
  ('depreciation', 'Depreciation (management)', 'depreciation', 'expense', 'DE_OUTSIDE_SCOPE', false, false, null, null, 70),
  ('interest', 'Interest', 'interest', 'expense', 'DE_EXEMPT', false, false, null, null, 71),
  ('other_adjustment', 'Other adjustments', 'other_adjustment', 'neutral', 'DE_OUTSIDE_SCOPE', false, false, null, null, 72),
  ('taxes_non_operating', 'Company taxes (KSt, Soli, GewSt)', 'tax', 'expense', 'DE_OUTSIDE_SCOPE', false, false, null, null, 80),
  ('vat_settlement', 'VAT settlement (payment / refund)', 'balance', 'neutral', 'DE_OUTSIDE_SCOPE', false, false, null, null, 90),
  ('asset_acquisition', 'Fixed asset acquisition (balance)', 'balance', 'neutral', 'DE_STANDARD', true, true, null, null, 91),
  ('other', 'Other', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', false, false, null, null, 99)
on conflict (code) do nothing;

-- KSt: 15 % today; the enacted step-down (Investitionssofortprogramm 2025) is
-- seeded review_required so the adviser confirms each year before it is used.
insert into bolagio_finance_tax_rates (tax_type, jurisdiction, rate_bp, effective_from, effective_to, legal_reference, source_url, review_required, note) values
  ('kst', 'DE', 1500, '2008-01-01', '2027-12-31', '§ 23 Abs. 1 KStG', 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', false, null),
  ('kst', 'DE', 1400, '2028-01-01', '2028-12-31', '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', true, 'scheduled step-down; confirm before use'),
  ('kst', 'DE', 1300, '2029-01-01', '2029-12-31', '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', true, 'scheduled step-down; confirm before use'),
  ('kst', 'DE', 1200, '2030-01-01', '2030-12-31', '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', true, 'scheduled step-down; confirm before use'),
  ('kst', 'DE', 1100, '2031-01-01', '2031-12-31', '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', true, 'scheduled step-down; confirm before use'),
  ('kst', 'DE', 1000, '2032-01-01', null, '§ 23 Abs. 1 KStG i.d.F. Investitionssofortprogramm 2025', 'https://www.gesetze-im-internet.de/kstg_1977/__23.html', true, 'scheduled step-down; confirm before use'),
  ('soli', 'DE', 550, '1998-01-01', null, '§ 4 Satz 1 SolzG 1995 (5,5 % of the KSt)', 'https://www.gesetze-im-internet.de/solzg_1995/__4.html', false, null),
  ('gewst_messzahl', 'DE', 350, '2008-01-01', null, '§ 11 Abs. 2 GewStG', 'https://www.gesetze-im-internet.de/gewstg/__11.html', false, null),
  -- The Bayreuth Hebesatz is seeded as review_required: the value must be
  -- confirmed against the city's Haushaltssatzung for each year before any
  -- figure that depends on it is treated as more than a placeholder.
  ('gewst_hebesatz', 'DE-BY-Bayreuth', 39000, '2020-01-01', null, 'Haushaltssatzung der Stadt Bayreuth (§ 16 GewStG)', 'https://www.bayreuth.de', true, 'CONFIRM: Bayreuth Hebesatz per year; 390 % is the seeded placeholder')
on conflict (tax_type, jurisdiction, effective_from) do nothing;

insert into bolagio_finance_policy (key, value, effective_from, source_reference, set_by) values
  ('fiscal_year_start_month', '1', '2020-01-01', 'calendar year assumed — confirm against the Gesellschaftsvertrag', 'seed'),
  ('vat_filing_frequency', 'quarterly', '2020-01-01', '§ 18 Abs. 2 UStG — quarterly unless the tax office set monthly; CONFIRM with the adviser / Finanzamt', 'seed'),
  ('dauerfristverlaengerung', 'false', '2020-01-01', '§§ 46–48 UStDV — set true once granted', 'seed'),
  ('vat_annual_return_month', '7', '2020-01-01', '§ 149 Abs. 2 AO (31 July of the following year without adviser; adviser deadlines differ)', 'seed'),
  ('tax_reserve_policy', 'estimate_less_paid', '2020-01-01', 'management policy: reserve = remaining estimated liability across all tax types', 'seed'),
  ('local_levy_enabled', 'false', '2020-01-01', 'Bayreuth: no Übernachtungsteuer; Bavaria bars local accommodation taxes (Art. 3 Abs. 3 KAG) — CONFIRM', 'seed'),
  ('small_business_scheme', 'false', '2020-01-01', '§ 19 UStG — a GmbH letting at scale is assumed regular-taxed; CONFIRM', 'seed'),
  ('default_shared_cost_allocation', 'occupied_nights', '2020-01-01', 'management policy for shared costs; visible on every allocated line', 'seed')
on conflict (key, effective_from) do nothing;

insert into bolagio_finance_counterparties (name, kind, country, vat_id, default_category, default_tax_code, default_input_vat, auto_verify, match_patterns, note) values
  ('Booking.com B.V.', 'ota', 'NL', 'NL805734958B01', 'ota_commission', 'DE_REVERSE_CHARGE', 'reverse_charge', false, array['booking.com','booking com','bookingcom'], 'Commission invoices are issued by the Dutch entity; reverse charge § 13b applies to the German recipient. Confirm entity on each invoice.'),
  ('PayPal (Europe) S.à r.l. et Cie, S.C.A.', 'payment_provider', 'LU', null, 'payment_fees', 'DE_EXEMPT', 'not_deductible', false, array['paypal'], 'Payment-service fees: exempt financial service (§ 4 Nr. 8 UStG) — no input VAT. Confirm with the adviser.'),
  ('Finanzamt Bayreuth', 'authority', 'DE', null, 'taxes_non_operating', 'DE_OUTSIDE_SCOPE', 'not_applicable', true, array['finanzamt','finanzkasse'], 'Tax payments are outside scope.'),
  ('Stadt Bayreuth', 'authority', 'DE', null, 'taxes_non_operating', 'DE_OUTSIDE_SCOPE', 'not_applicable', true, array['stadt bayreuth','stadtkasse bayreuth'], 'Trade tax is paid to the city.')
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 13 — RLS and privileges
-- ══════════════════════════════════════════════════════════════════════════

do $$ declare t text; begin
  foreach t in array array[
    'bolagio_finance_tax_codes','bolagio_finance_categories','bolagio_finance_tax_rates','bolagio_finance_policy','bolagio_finance_periods',
    'bolagio_finance_counterparties','bolagio_finance_accounts','bolagio_finance_import_batches','bolagio_finance_import_rows',
    'bolagio_finance_documents','bolagio_finance_document_links','bolagio_finance_transactions','bolagio_finance_transaction_lines',
    'bolagio_finance_overrides','bolagio_finance_payments','bolagio_finance_reconciliations','bolagio_finance_invoices','bolagio_finance_invoice_lines',
    'bolagio_finance_tax_periods','bolagio_finance_tax_estimates','bolagio_finance_tax_adjustments','bolagio_finance_tax_notices',
    'bolagio_finance_tax_notice_dues','bolagio_finance_tax_payments','bolagio_finance_reserves','bolagio_finance_assets','bolagio_finance_exports',
    'bolagio_minibar_products','bolagio_minibar_movements','bolagio_finance_turnover_costs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
  foreach t in array array['bolagio_minibar_stock','bolagio_finance_ledger_lines','bolagio_finance_pl_monthly','bolagio_finance_vat_monthly',
    'bolagio_finance_cash_monthly','bolagio_finance_unit_monthly','bolagio_finance_exception_counts'] loop
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'bolagio_finance_ensure_period(date)',
    'bolagio_finance_period_locked(date)',
    'bolagio_finance_post_transaction(jsonb,jsonb,text)',
    'bolagio_finance_reverse_transaction(uuid,text,text,date)',
    'bolagio_finance_reclassify_line(uuid,jsonb,text,text,boolean)',
    'bolagio_finance_set_transaction_state(uuid,jsonb,text,text)',
    'bolagio_finance_record_payment(jsonb,text)',
    'bolagio_finance_record_match(jsonb,text)',
    'bolagio_finance_register_document(jsonb,text)',
    'bolagio_finance_link_document(uuid,text,uuid,text)',
    'bolagio_finance_set_period_status(text,text,text,boolean,text)',
    'bolagio_finance_record_tax_stage(text,text,date,date,text,bigint,jsonb,text,text,boolean,text,date,date)',
    'bolagio_minibar_record_movement(jsonb,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  -- The immutable key helper keeps the PUBLIC default (no table access), as
  -- the shared-project verification allows for IMMUTABLE predicates.
  execute 'grant execute on function bolagio_finance_period_key(date) to service_role';
end $$;
