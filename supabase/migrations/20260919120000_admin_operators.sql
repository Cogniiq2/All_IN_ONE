-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio Control — operators and the operator audit log.
--
-- The operations interface (`/admin`) needs two things the booking core does
-- not have: WHO is allowed in, and a record of WHAT they did. Both live here.
--
-- ── Identity vs. authorisation ─────────────────────────────────────────────
-- Identity is Supabase Auth: an operator signs in with an email and password
-- that Supabase verifies. Authorisation is THIS table: a Supabase user who is
-- not listed here, or is listed but not active, is refused. "Anyone who can
-- register" is therefore never an operator — the allowlist is the boundary,
-- and it is checked server-side on every request, not once at sign-in.
--
-- ── What this deliberately is not ──────────────────────────────────────────
-- Not a permissions engine. Three coarse roles, applied server-side, are all
-- an interface with one write action needs. Not a browser-readable table:
-- RLS is on with no policy, and anon/authenticated are revoked, so the only
-- reader is the service role held by the route handlers and server actions.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_operators (
  id             uuid primary key default gen_random_uuid(),
  -- Bound on first successful sign-in, so an operator can be allowlisted
  -- before their Supabase user exists. Once bound, a different Supabase user
  -- with the same email is refused — the binding is what the session trusts.
  auth_user_id   uuid unique,
  email          text not null unique check (email = lower(email) and email <> ''),
  display_name   text not null default '',
  -- viewer    read everything, change nothing
  -- operator  viewer + the safe manual commands (reconcile)
  -- admin     operator + operator administration (no UI for it yet)
  role           text not null default 'viewer' check (role in ('viewer', 'operator', 'admin')),
  active         boolean not null default true,
  -- Sessions issued before this instant are refused: the "sign out everywhere"
  -- lever, and the one used when an operator is deactivated.
  sessions_invalidated_before timestamptz,
  last_sign_in_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table bolagio_operators is
  'BoLaGio Control allowlist. A Supabase Auth user is an operator only while a row here says so and is active.';

do $$ begin
  create trigger bolagio_operators_touch before update on bolagio_operators
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

-- ── The audit log ──────────────────────────────────────────────────────────
--
-- Append-only. Every sign-in, sign-out, refused sign-in and manual command is
-- a row. `detail` carries operational facts — a reference, an outcome, a
-- reconciliation report — and never a password, a token or guest personal
-- data, on the same rule as `bolagio_booking_intent_events`.

create table if not exists bolagio_admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  operator_id    uuid references bolagio_operators(id) on delete set null,
  -- Denormalised so the log stays readable after an operator row is removed.
  operator_email text,
  action         text not null,
  target_type    text,
  target_ref     text,
  outcome        text not null default 'ok',
  detail         jsonb,
  correlation_id text,
  created_at     timestamptz not null default now()
);

create index if not exists bolagio_admin_audit_log_created_idx
  on bolagio_admin_audit_log (created_at desc);
create index if not exists bolagio_admin_audit_log_target_idx
  on bolagio_admin_audit_log (target_ref) where target_ref is not null;

comment on table bolagio_admin_audit_log is
  'Append-only record of operator actions in BoLaGio Control. No secrets, no guest PII.';

-- ── Row level security: deny everything ────────────────────────────────────
alter table bolagio_operators       enable row level security;
alter table bolagio_admin_audit_log enable row level security;

revoke all on bolagio_operators, bolagio_admin_audit_log from anon, authenticated;

-- ── Adding the first operator ──────────────────────────────────────────────
--
-- Not done here: which people operate BoLaGio is data, not schema. After
-- creating the person's user in Supabase Auth (Dashboard → Authentication),
-- run, by hand:
--
--   insert into bolagio_operators (email, display_name, role)
--   values ('name@example.com', 'Name', 'operator');
--
-- The `auth_user_id` binds itself on their first successful sign-in.
