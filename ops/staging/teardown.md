# Staging — teardown (stop the activity, keep the data)

"Teardown" here means **stopping every automated actor** so nothing on
staging calls Beds24, PayPal, n8n or a guest mailbox, while every row stays
in place for the next rehearsal and for the change record. Nothing is
deleted. Staging shares the Supabase project with Cogniiq
(`docs/supabase-shared-project.md`); half of what follows is therefore a
list of what must **not** be touched.

Order matters: gates first (no new work), then the actors (no more passes),
then confirm quiet. Do not disable the schedule while a booking is still in
a reserving or paid-unfinalized state — let it reach rest first
(`docs/schedulers.md`: "disable booking, keep the schedule").

## 1. Close the gates

```bash
# no new direct bookings from the staging site
npx wrangler secret put DIRECT_BOOKING_ENABLED --env staging    # value: false
# (or edit env.staging.vars in wrangler.jsonc and redeploy — it is a plain var)
```

```sql
-- no unit is bookable, whatever the flag says (the second gate)
update bolagio_units set is_bookable = false where is_bookable;
select slug, is_bookable from bolagio_units order by slug;   -- all false
```

Confirm: `ops/staging/health-check.sh` → `/api/booking/payment/config` is `403`.

Let in-flight work finish (check with the operator queue, or):

```sql
-- rows still holding inventory that are not confirmed stays: the sweep and the
-- reconcile pass bring them to rest; expect no rows before the schedule is stopped
select status, count(*) from bolagio_booking_intents
 where bolagio_status_reserves(status) and status <> 'confirmed'
 group by 1;
select count(*) from bolagio_message_deliveries where status in ('pending','sending');   -- 0
select count(*) from bolagio_external_operations where outcome in ('in_flight','outcome_unknown');   -- 0
select count(*) from bolagio_booking_intents
 where refund_state in ('required','pending','unknown','failed')
    or (cancellation_requested_at is not null and cancellation_completed_at is null);   -- 0
```

If a row is stuck, resolve it through BoLaGio Control (`docs/incident-runbooks.md`)
before going on; disabling the schedule under it freezes it in that state.

## 2. Stop the scheduler (pg_cron)

```sql
-- unschedule by name; cron.unschedule raises on an unknown name, hence the lookup
select cron.unschedule(jobid) from cron.job where jobname in ('bolagio-reconcile', 'bolagio-inventory-sync');
select jobid, jobname, active from cron.job where jobname like 'bolagio-%';   -- expect no rows
```

Leave the extensions (`pg_cron`, `pg_net`) installed and leave the database
settings `app.booking_sync_secret` / `app.site_url` in place, unless the
secret is being rotated (then `ops/staging/cron.sql` rewrites both when the
schedule comes back). To re-enable: re-run `ops/staging/cron.sql`.

Do **not** unschedule any job whose name does not start with `bolagio-`:
`cron.job` is shared with Cogniiq.

## 3. Deactivate the n8n workflows

In the n8n UI, deactivate the six `BoLaGio · …` workflows (tag `bolagio`),
in this order so the last thing running is the one that records errors:

1. `BoLaGio · Outbox Event Pump` (the only one that acks events)
2. `BoLaGio · Health Poll`
3. `BoLaGio · Guest Message`, `BoLaGio · Cleaning Routing`, `BoLaGio · Operational Alert` (sub-workflows; inert once the pump is off)
4. `BoLaGio · Error Handler`

Or from the host: `n8n update:workflow --id=<id> --active=false` per workflow.
Do **not** delete them, do not remove the `BoLaGio SMTP` credential, and do
not touch any workflow without the `bolagio` tag — the instance is shared.
Outbox events produced while the pump is off simply wait (`pending`); they are
claimed when it is reactivated (`n8n/runbooks/staging-activation.md` step 4).

Optionally set `BOLAGIO_MESSAGING_TRANSPORT=disabled` and
`BOLAGIO_ALERT_TRANSPORT=disabled` in the n8n environment and restart, so a
reactivation by mistake sends nothing.

## 4. The worker and the Edge Function — leave them

* The worker `bolagio-staging` stays deployed with the gate closed. It serves
  the site, the admin and the availability calendar; none of that writes to a
  provider. Do not `wrangler delete`.
* The Edge Function `paypal-webhook` stays deployed. PayPal's sandbox webhook
  keeps delivering to it; verified events land in the inbox and wait — with
  the schedule off nothing processes them, which is correct. Deleting the
  function would make PayPal retry for three days and then drop events.
* Leave every secret in place (`ops/staging/secrets-checklist.md`). Set
  `MESSAGING_TEST_COMPLETIONS_ALLOWED` back to unset if a rehearsal left it.

## 5. What is kept, deliberately

| Keep | Why |
|---|---|
| every `bolagio_*` table and its rows | the rehearsal record; the sandbox E2E results are read from them; the next rehearsal starts from them |
| the migrations (do not run `rollback_2026092*.sql`) | rollback is for a worker revert, not a teardown; it refuses while state is in flight anyway |
| `bolagio_operators`, `bolagio_admin_audit_log` | who did what on staging |
| `bolagio_units` rows (with `is_bookable = false`) | the Beds24 mapping was established by enumeration; re-seeding is cheap but re-confirming is not |
| the `bolagio_app` role and its policies, if installed | re-installing means re-minting a JWT |
| `pg_cron`, `pg_net`, `btree_gist` | shared extensions; `btree_gist` backs the no-overlap constraint |
| `app.booking_sync_secret`, `app.site_url` | database settings; rewritten by `cron.sql` when the schedule returns |

To reset **booking data only** for a fresh rehearsal (schema kept): the
truncate list in `scripts/test-stack.sh` `cmd_reset` is the reference —
booking intents (cascade), outbox, inbox, external operations,
reconciliation jobs, scheduler runs, integration events, audit log,
inventory days, message deliveries, integration health. Run it by hand, in
one transaction, only on staging, only with the schedule off.

## 6. What must NOT be deleted — ever, from staging

* **Any object that is not `bolagio_*`.** `invoices`, `emails`,
  `email_attachments`, `properties`, `property_units`, every storage bucket,
  every non-`bolagio-` cron job, every Supabase Auth user: Cogniiq's. The
  BoLaGio scripts never touch them and neither does a teardown.
* **The Supabase project itself**, its JWT secret, its database password, its
  backups. Rotating the JWT secret rotates Cogniiq's keys too.
* **The `service_role`, `anon`, `authenticated`, `authenticator` roles** or
  their memberships.
* **The n8n instance, its other workflows, its credentials.**
* **The PayPal sandbox app and webhook** — recreating them means new ids in
  both stores and a fresh deploy.
* **The Beds24 account's properties and rooms.** A staging hold that was not
  released by the flow is released by hand in Beds24, never by deleting
  anything.

## 7. Confirm quiet

After ten minutes:

```sql
select job, ok, finished_at from bolagio_scheduler_status order by job;   -- finished_at stops advancing
select count(*) from bolagio_scheduler_runs where started_at > now() - interval '10 minutes';   -- 0
```

`ops/staging/health-check.sh` still returns `200` on `/api/internal/health`
and reports every scheduler as overdue — expected while torn down. Record
the date and the reason in the deployment notes.
