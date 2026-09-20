-- ════════════════════════════════════════════════════════════════════════════
-- FIXTURE — the shared project's state as the live inventory found it.
--
-- TEST ONLY. This never runs against a real project; it builds a throwaway
-- database that LOOKS like the shared Supabase project so the hardening, its
-- rollback and its verification can be proven before anyone touches the real
-- one. Nothing here is a description of what SHOULD be — it is a faithful copy
-- of what the 2026-09-20 inventory reported, exposures and all.
--
-- Three families, and the difference between them is the whole point:
--
--   LEGACY (20 tables)   the withdrawn property-management admin app
--                        (archive/admin-app). RLS off or policy-less, anon and
--                        authenticated holding table privileges.
--   COGNIIQ-SOUND        owner_*/organization_*/profiles with is_platform_*()
--                        policies. Must come out of the hardening UNCHANGED —
--                        that is what the regression test checks.
--   COGNIIQ-GAP          owner_tax_adjustments: a Cogniiq owner table whose
--                        siblings all carry an is_platform_owner() policy and
--                        which was left without one.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create schema if not exists auth;

-- Supabase's auth.role()/auth.uid(), as the real policies call them.
create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role', true), current_user::text) $$;
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Cogniiq's identity helpers. The real ones read organization membership; the
-- shape is what matters here — a boolean the policies gate on.
create or replace function public.is_platform_owner() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce(current_setting('cogniiq.test_is_owner', true), 'false') = 'true' $$;
create or replace function public.is_platform_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce(current_setting('cogniiq.test_is_admin', true), 'false') = 'true' $$;

/* ── LEGACY 1 — RLS OFF, anon + authenticated hold privileges (15 CRITICAL) ── */

do $$
declare t text;
begin
  foreach t in array array[
    'audit_log','bank_accounts','categories','categorization_rules','documents',
    'import_batches','loan_payments','loans','property_units',
    'renovation_project_invoices','renovation_projects','suppliers','tenants',
    'utility_accounts','utility_bills'
  ] loop
    execute format('create table if not exists public.%I (id bigserial primary key, label text, amount_cents bigint, created_at timestamptz default now())', t);
    execute format('insert into public.%I (label, amount_cents) values (%L, 4200)', t, 'legacy row for ' || t);
    -- exactly what the inventory found: RLS off, browser roles granted.
    execute format('alter table public.%I disable row level security', t);
    execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
  end loop;
end $$;

/* ── LEGACY 2 — RLS ON with permissive anon/public policies (3 HIGH) ──────── */

create table if not exists public.emails (
  id bigserial primary key, subject text, body text, from_address text, received_at timestamptz default now());
create table if not exists public.email_attachments (
  id bigserial primary key, email_id bigint references public.emails(id), filename text, storage_path text);
create table if not exists public.properties (
  id bigserial primary key, name text, address text, created_at timestamptz default now());

insert into public.emails (subject, body, from_address) values ('Rechnung 2026-04', 'body', 'buchhaltung@example.com');
insert into public.email_attachments (email_id, filename, storage_path) values (1, 'rechnung.pdf', 'invoices/rechnung.pdf');
insert into public.properties (name, address) values ('Schulstraße 1', 'Bayreuth');

alter table public.emails enable row level security;
alter table public.email_attachments enable row level security;
alter table public.properties enable row level security;

-- The exact policies the inventory reported, names included.
create policy "Allow anon read emails" on public.emails for select to anon using (true);
create policy "Authenticated users can manage emails" on public.emails for all to public using (auth.role() = 'authenticated');
create policy "Allow anon read email attachments" on public.email_attachments for select to anon using (true);
create policy "Authenticated users can manage email attachments" on public.email_attachments for all to public using (auth.role() = 'authenticated');
create policy "Authenticated users can read properties" on public.properties for select to public using (auth.role() = 'authenticated');
create policy "Authenticated users can modify properties" on public.properties for all to public using (auth.role() = 'authenticated');

grant select, insert, update, delete on table public.emails, public.email_attachments, public.properties to anon, authenticated;

/* ── LEGACY 3 — RLS ON, no policy, grants still held (2 MEDIUM) ───────────── */

create table if not exists public.invoices (
  id bigserial primary key, number text, total_cents bigint, storage_path text);
create table if not exists public.transactions (
  id bigserial primary key, booked_on date, amount_cents bigint, memo text);
insert into public.invoices (number, total_cents) values ('RE-2026-001', 119000);
insert into public.transactions (booked_on, amount_cents, memo) values (current_date, -4200, 'legacy');
alter table public.invoices enable row level security;
alter table public.transactions enable row level security;
grant select, insert, update, delete on table public.invoices, public.transactions to anon, authenticated;

/* ── COGNIIQ-GAP — owner_tax_adjustments, the sibling without a policy ────── */

create table if not exists public.owner_tax_adjustments (
  id bigserial primary key, tax_year integer, amount_cents bigint, note text);
insert into public.owner_tax_adjustments (tax_year, amount_cents, note) values (2026, -150000, 'Verlustvortrag');
alter table public.owner_tax_adjustments disable row level security;
grant select, insert, update, delete on table public.owner_tax_adjustments to authenticated;

/* ── COGNIIQ-SOUND — the control group. Must come out byte-identical. ─────── */

create table if not exists public.owner_tax_estimates (
  id bigserial primary key, tax_year integer, amount_cents bigint);
create table if not exists public.owner_invoices (
  id bigserial primary key, number text, total_cents bigint);
create table if not exists public.organization_members (
  id bigserial primary key, organization_id uuid, member_email text);
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(), display_name text);

insert into public.owner_tax_estimates (tax_year, amount_cents) values (2026, 900000);
insert into public.owner_invoices (number, total_cents) values ('CQ-2026-014', 476000);
insert into public.organization_members (organization_id, member_email) values (gen_random_uuid(), 'lazar@cogniiq.de');
insert into public.profiles (display_name) values ('Lazar');

alter table public.owner_tax_estimates enable row level security;
alter table public.owner_invoices enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;

create policy owner_tax_estimates_owner_select on public.owner_tax_estimates for select to authenticated using (is_platform_owner());
create policy owner_invoices_owner_all on public.owner_invoices for all to authenticated using (is_platform_owner()) with check (is_platform_owner());
create policy organization_members_select_same_org_or_platform_admin on public.organization_members for select to authenticated using (is_platform_admin());
create policy profiles_select_self_or_platform_admin on public.profiles for select to authenticated using ((id = auth.uid()) or is_platform_admin());

grant select, insert, update, delete on table public.owner_tax_estimates, public.owner_invoices, public.organization_members, public.profiles to authenticated;

/* ── The three flagged functions, with the exposure as found ──────────────── */

-- Cogniiq's execution planner. VOLATILE, SECURITY INVOKER, and anon can call
-- it — anon can never be a platform admin, so that grant does nothing but harm.
create table if not exists public.execution_days (
  id bigserial primary key, plan_on date unique, generated_at timestamptz default now());
alter table public.execution_days enable row level security;
create policy execution_days_admin_all on public.execution_days for all to authenticated using (is_platform_admin()) with check (is_platform_admin());
grant select, insert, update, delete on table public.execution_days to authenticated;

create or replace function public.generate_daily_execution_plan(p_on date)
returns bigint language plpgsql volatile as $$
declare v_id bigint;
begin
  insert into public.execution_days (plan_on) values (p_on)
    on conflict (plan_on) do update set generated_at = now()
    returning id into v_id;
  return v_id;
end $$;

-- The token-based public offer flow. A customer opens a link and never signs
-- in, so anon MUST be able to call these. SECURITY DEFINER, and — as found —
-- with no pinned search_path, which is the part that is not safe.
create table if not exists public.owner_offers (
  id bigserial primary key, offer_number text, access_token text unique,
  recipient_email text, total_cents bigint, status text default 'sent',
  expires_at timestamptz default now() + interval '30 days', responded_at timestamptz);
alter table public.owner_offers enable row level security;
create policy owner_offers_owner_all on public.owner_offers for all to authenticated using (is_platform_owner()) with check (is_platform_owner());
grant select, insert, update, delete on table public.owner_offers to authenticated;

insert into public.owner_offers (offer_number, access_token, recipient_email, total_cents)
values ('AN-2026-007', 'tok_live_demo_token_value', 'kunde@example.com', 238000);

create or replace function public.public_offer_by_token(p_token text, p_email text)
returns table (offer_number text, total_cents bigint, status text)
language plpgsql volatile security definer as $$
begin
  return query
    select o.offer_number, o.total_cents, o.status
      from public.owner_offers o
     where o.access_token = p_token
       and lower(o.recipient_email) = lower(p_email)
       and o.expires_at > now();
end $$;

create or replace function public.respond_offer_by_token(
  p_token text, p_email text, p_decision text, p_name text, p_company text,
  p_address text, p_note text, p_signature text)
returns boolean language plpgsql volatile security definer as $$
declare v_hit integer;
begin
  update public.owner_offers
     set status = case when p_decision = 'accept' then 'accepted' else 'declined' end,
         responded_at = now()
   where access_token = p_token
     and lower(recipient_email) = lower(p_email)
     and expires_at > now()
     and responded_at is null;
  get diagnostics v_hit = row_count;
  return v_hit > 0;
end $$;

-- As found: EXECUTE reaches these through the PUBLIC default grant.
grant execute on function public.generate_daily_execution_plan(date) to public;
grant execute on function public.public_offer_by_token(text, text) to public;
grant execute on function public.respond_offer_by_token(text, text, text, text, text, text, text, text) to public;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase's default privileges, which the inventory does not list but which
-- every real project has. Without these the fixture would prove the wrong
-- thing twice over: the server side would look broken before the hardening,
-- and a sequence left open after it would go unnoticed.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated;

select 'fixture: shared project reproduced as the 2026-09-20 inventory found it' as status;
