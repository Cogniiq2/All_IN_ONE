# Runbook — production activation of the BoLaGio n8n package

Goal: the package running against the **production** worker with real
transports, activated in an order that cannot send a guest a message the
backend did not intend, and that cannot silently consume a real booking's
confirmation. Do this after the staging runbook has been completed on the
same package commit and after the go/no-go in `docs/production-readiness.md`.

## Preconditions

- [ ] Production worker (`bolagio`, `--env production`) deployed with
      migrations applied, `pg_cron` jobs live, three heartbeats on
      `/admin/system`, WAF rules per `docs/cloudflare-deployment.md` §5.
- [ ] `N8N_INTERNAL_SECRET` set on the production worker — a **different**
      value from staging.
- [ ] n8n env for production: `BOLAGIO_SITE_URL=<production domain>`,
      `BOLAGIO_N8N_INTERNAL_SECRET=<that value>`, `BOLAGIO_ENVIRONMENT=production`,
      `BOLAGIO_MAIL_FROM=<guest-facing sender>`, `BOLAGIO_ALERT_TRANSPORT`
      and its URL / recipient for the **on-call** channel,
      `BOLAGIO_MESSAGING_TRANSPORT` **unset**, `BOLAGIO_CLEANING_TRANSPORT`
      unset (or `webhook` with the production endpoint if step 8 of the
      staging runbook was completed). n8n restarted.
- [ ] If the same n8n instance served staging: the staging values were
      replaced, not added alongside. One instance serves one BoLaGio
      environment; a second environment needs a second instance or a
      second package with distinct names.
- [ ] `N8N_BLOCK_ENV_ACCESS_IN_NODE` not `true`; `NODE_FUNCTION_ALLOW_BUILTIN`
      includes `crypto`; host clock correct.
- [ ] A signed `GET /api/internal/health` from the n8n host returns `200`
      and the body says `"environment": "production"`.
- [ ] Credential **BoLaGio SMTP** points at the production SMTP account;
      SPF/DKIM for the sender domain verified; a test message from that
      account to an external mailbox lands in the inbox.
- [ ] `DIRECT_BOOKING_ENABLED` is still off, or on for one unit per
      `docs/production-readiness.md` §1 step 10 — either way, **no real
      booking has been confirmed yet** at the moment step 4 runs.
- [ ] Two people present: one at n8n, one at BoLaGio Control → Operations.

## Steps

1. **Import** with the CLI on the production n8n host:
   `n8n import:workflow --separate --input=n8n/workflows`. Verify names,
   tag, targets, credential selection. All inactive.
2. **Error Handler.** Activate *BoLaGio · Error Handler*. Do not provoke
   an error to test it — never misconfigure production to test. The alert
   path is proven in step 3.
3. **Health Poll.** Activate it. Its first execution with any open
   CRITICAL/HIGH condition posts `HEALTH_ALERTS` to the on-call channel; a
   clean system posts nothing. If you need positive proof of the channel,
   run *BoLaGio · Operational Alert → Test workflow* with a pinned input
   `{ "alert": { "level": "MEDIUM", "code": "N8N_CHANNEL_CHECK", "title": "Production alert channel check", "detail": "manual" } }`
   and remove the pin afterwards.
4. **Pump with messaging disabled — only while no confirmed booking
   exists.** Activate *BoLaGio · Outbox Event Pump*. It drains whatever
   operational events exist (alerts route to on-call; silent types are
   acked). Watch 15 minutes: executions every 60 s, green.

   > If a `booking.confirmed` could already be in the outbox, **do not**
   > activate with messaging `disabled`: the confirmation would be completed
   > as `skipped` and never sent. Go to step 5 first.
5. **Enable SMTP.** Set `BOLAGIO_MESSAGING_TRANSPORT=smtp`, restart n8n
   (the pump keeps its activation state across the restart). From this
   point every `booking.confirmed` sends a real guest e-mail.
6. **First real booking** (`docs/production-readiness.md` §1 step 10): one
   low-value booking by a team member. Watch the pump execution for its
   `booking.confirmed`: Guest Message → `claimed` → SMTP → `sent`. The
   e-mail arrives once. Ledger: one `booking_confirmation` row,
   `provider='smtp'`. Requeue the event from BoLaGio Control: `already_sent`,
   no second e-mail.
7. **Cleaning** (if used): set `BOLAGIO_CLEANING_TRANSPORT=webhook` with the
   production endpoint, restart; the team booking's `cleaning.required`
   arrives on the property calendar and the tool shows one task keyed
   `bolagio:turnover:<reference>`.
8. Watch a full day. Then the second unit, per the readiness document.

## Verification queries (production database, read-only)

```sql
select kind, status, provider, count(*) from bolagio_message_deliveries group by 1,2,3;
-- expect provider in ('smtp') only; never 'test'; 'disabled' only for events drained in step 4 before any confirmation

select status, count(*), min(created_at) from bolagio_outbox_events group by 1;
-- expect no 'failed' rows older than their backoff, no dead letters without a ticket

select * from bolagio_scheduler_status;   -- three recent heartbeats
```

Health: `/admin/system` shows no `N8N_UNCONFIGURED` finding; the Health
Poll has posted nothing since the last change.

## Rollback

1. Deactivate **BoLaGio · Outbox Event Pump**. Events accumulate safely in
   the outbox; guest messages are simply not sent until it runs again; no
   booking state is affected (n8n has no authority over it).
2. Leave the Health Poll and Error Handler active — they are how you learn
   what is wrong.
3. If a wrong message was sent: it cannot be recalled; the ledger row
   records provider, message id and time for the guest communication that
   follows. Do not requeue events while investigating.
4. If the secret is suspected leaked: rotate per `credentials-matrix.md`
   (worker first, then n8n, restart). Every request in between is `401`;
   the pump errors, the Error Handler alerts, events wait.
5. To roll the package back: check out the previous commit, re-run the CLI
   import (same ids, in-place), re-activate the pump.
