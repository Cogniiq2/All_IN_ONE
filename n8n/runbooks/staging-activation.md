# Runbook — staging activation of the BoLaGio n8n package

Goal: the six workflows running against the **staging** worker, proven
end-to-end with the `test` transport, then with real transports pointed at
places that may receive test traffic. Nothing here touches production.

## Preconditions

- [ ] Staging worker (`bolagio-staging`) deployed with the migrations applied
      and `pg_cron` jobs live (`docs/schedulers.md`); `/admin/system` shows
      three heartbeats.
- [ ] `N8N_INTERNAL_SECRET` set on the staging worker
      (`wrangler secret put N8N_INTERNAL_SECRET --env staging`).
- [ ] The same value set as `BOLAGIO_N8N_INTERNAL_SECRET` in the n8n
      environment, plus `BOLAGIO_SITE_URL` (staging), `BOLAGIO_ENVIRONMENT=staging`,
      all three `*_TRANSPORT` variables unset or `disabled`. n8n restarted.
- [ ] `N8N_BLOCK_ENV_ACCESS_IN_NODE` is not `true`; `NODE_FUNCTION_ALLOW_BUILTIN`
      includes `crypto`.
- [ ] The n8n host clock is within a minute of real time (the replay window
      is ±300 s).
- [ ] A signed `GET /api/internal/health` from the n8n host returns `200`
      (`test-mode.md` §2 step 3).
- [ ] Credential **BoLaGio SMTP** exists in n8n, pointing at the staging
      SMTP account (`credentials-matrix.md`). It is not used until step 7.
- [ ] `npx vitest run tests/n8n-workflows.test.ts` is green on the commit
      being imported.

## Steps

1. **Import** on the n8n host:
   `n8n import:workflow --separate --input=n8n/workflows`
   (or the UI route with the re-wiring in `README.md` §4b).
   Verify in the UI: six workflows named `BoLaGio · …`, tag `bolagio`,
   all inactive, Execute Workflow nodes showing target names.
2. **Error Handler first.** Activate *BoLaGio · Error Handler*. With
   `BOLAGIO_ALERT_TRANSPORT` unset it delivers nothing, but every later
   failure is now recorded as an execution you can read.
3. **Health, manually.** *BoLaGio · Health Poll → Test workflow*. The poll
   node runs without error and outputs zero or one item. Then activate it.
   After 10 minutes: executions every 5 minutes, all green.
4. **Pump, manually, test transport.** Set
   `BOLAGIO_MESSAGING_TRANSPORT=test`, restart n8n. Produce a
   `booking.confirmed` on staging (sandbox E2E) or requeue one. *BoLaGio ·
   Outbox Event Pump → Test workflow*. Assert `test-mode.md` §4: one
   `booking_confirmation` row, `provider='test'`, event acked once.
   Run it again: nothing claimed. Requeue the event, run again:
   `already_sent`, acked, still one row.
5. **Activate the pump.** Watch for 30 minutes: an execution every 60 s,
   green, most claiming nothing. Let the operations pass emit
   `cleaning.required` / `guest.*` events for the staging booking (they
   arrive on the property calendar; move `check_in` on the staging booking
   if you need them today) and confirm they are acked with
   `outcome:'skipped'` (cleaning, transport disabled) and `provider='test'`
   (guest messages).
6. **Alert transport.** Set `BOLAGIO_ALERT_TRANSPORT=webhook` and
   `BOLAGIO_ALERT_WEBHOOK_URL` to the **staging** alerts channel; restart.
   Requeue a `booking.manual_review_required` event (or any alert-routed
   event). One message appears in the channel with reference and code, no
   guest data. Deactivate and reactivate the Health Poll so its next run
   starts from empty state; with any CRITICAL/HIGH condition open on
   staging it posts `HEALTH_ALERTS` exactly once and then stays quiet.
7. **SMTP rehearsal.** Point the staging booking's guest e-mail at a
   mailbox you own. Set `BOLAGIO_MESSAGING_TRANSPORT=smtp`, restart.
   Requeue the `booking.confirmed` event: `prepare` answers `already_sent`
   (the `test` send counted). Use BoLaGio Control's resend (sequence 2) or
   a fresh staging booking. Exactly one e-mail arrives, in the guest's
   locale, from `BOLAGIO_MAIL_FROM`; the ledger row shows `provider='smtp'`
   and a `provider_message_id`.
8. **Cleaning transport** (only if a cleaning endpoint exists): set
   `BOLAGIO_CLEANING_TRANSPORT=webhook` and the sandbox URL; restart; requeue
   a `cleaning.required` event; confirm the tool received `action:'upsert'`
   with `key: bolagio:turnover:<reference>`; requeue it again and confirm
   the tool still holds **one** task.
9. Record the outcome (date, commit, transports used) in the deployment
   notes and leave staging running with `test` messaging and the staging
   alert channel.

## Verification queries

See `test-mode.md` §4. Additionally, after step 5:

```sql
select job, ok, finished_at from bolagio_scheduler_status;   -- three rows, recent
select status, count(*) from bolagio_outbox_events group by 1; -- nothing stuck in 'claimed' past 5 min
```

## Rollback

Deactivate **BoLaGio · Outbox Event Pump**. That is the whole rollback:
events accumulate in the outbox, nothing is lost, nothing is sent, and
leases already held lapse within five minutes. Deactivate the Health Poll
too if its channel is noisy. Workflows stay imported; re-activate when
fixed. To roll back a package version, check out the previous commit and
re-run the CLI import — same ids, in-place update.
