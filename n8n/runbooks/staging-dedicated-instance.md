# Runbook — BoLaGio's own n8n instance (staging first, production later)

Decision (2026-11-06): the BoLaGio workflows do **not** run on the Cogniiq
n8n instance. They run on a small server of their own, so nothing about the
Cogniiq instance is restarted, reconfigured or shared. Supersedes
`staging-isolated-setup.md` §2–4 (the workflows themselves are the same).

## 1. The shape

```
Cloudflare worker bolagio-staging  ◀── signed HTTPS polls every 60 s ── BoLaGio n8n (own VPS, Docker)
  (renders, decides, ledger)        ── rendered message ──────────────▶   └─ SMTP ──▶ guest inbox
```

* Outbound only. No webhook, no public editor, no domain or certificate: the
  editor listens on `127.0.0.1` and is opened through an SSH tunnel.
* The website stays the source of truth; n8n cannot confirm, cancel or change
  a booking (its endpoints cannot), holds no Beds24 or PayPal credential, and
  the delivery ledger makes every e-mail exactly-once whatever n8n retries.
* If the server is down, nothing is lost: events wait in the outbox, the
  e-mail goes out when it is back, and BoLaGio Control raises `N8N_SILENT`.

## 2. Which workflows

| Workflow (`n8n/workflows-staging/`) | Role | Import | Active |
|---|---|---|---|
| Outbox Event Pump | claims events, routes them, acknowledges | yes | **yes** |
| Guest Message | prepare → SMTP → record | yes | called by the pump |
| Cleaning Routing | the pump hands `cleaning.*` events here; transport `disabled` → acknowledged as skipped | yes | called by the pump |
| Operational Alert | the pump hands alert events here; transport `disabled` → acknowledged | yes | called by the pump |
| Error Handler | records a failed execution; sends nothing while alerts are `disabled` | yes | yes |
| Health Poll | duplicate of what BoLaGio Control already shows | **no** | — |

Four are the minimum: the pump cannot settle a `cleaning.required` or
`payment.*` alert event without its sub-workflow, and the live test produces
both. The Error Handler is free and makes failures visible; the Health Poll
adds nothing until alert transports are switched on.

**Version.** The package was written for n8n 1.x. n8n 2.0 changed Code-node
defaults (task runners; `$env` blocked by default). The compose file sets the
two switches the package needs, but the exact version is pinned only after a
rehearsal: run the pinned image against the local test stack
(`./scripts/test-stack.sh up`) with the pump pointed at it, and see one
`booking.confirmed` become one ledger row `sent`. Record the version in
`.env` as `N8N_VERSION`.

## 3. Setup (owner, ~45 minutes)

1. **Server.** Hetzner Cloud Console → *New project* "BoLaGio" → *Add
   server*: location Falkenstein or Nuremberg; image Ubuntu 24.04; type
   CX22 (or the current smallest shared x86 type); *SSH key*: your public
   key; *Firewalls → Create*: inbound **TCP 22 only**, from your own IP if
   it is static; *Backups* on. In the account, accept Hetzner's data
   processing agreement (AVV) — guest names and e-mails pass through.
2. **Docker.** `ssh root@<ip>`, then
   `apt-get update && apt-get install -y docker.io docker-compose-v2 && systemctl enable --now docker`.
   `timedatectl` must show `System clock synchronized: yes` (the signatures
   allow ±5 minutes).
3. **Files.** `mkdir -p /opt/bolagio-n8n/workflows`; copy
   `n8n/hosting/docker-compose.yml` there, copy `n8n/hosting/env.example` to
   `/opt/bolagio-n8n/.env`, `chmod 600 .env`, fill it in; copy the five
   files from `n8n/workflows-staging/` (all except the health poll) into
   `/opt/bolagio-n8n/workflows/`.
4. **Secrets.** Cloudflare → Workers & Pages → `bolagio-staging` →
   Settings → Variables and Secrets → *Add* (type **Secret**):
   `N8N_INTERNAL_SECRET` = the same value as
   `BOLAGIO_STAGING_N8N_INTERNAL_SECRET`; `MESSAGING_CONTACT_EMAIL`. Deploy.
5. **Start** (not before the go-ahead): `cd /opt/bolagio-n8n && docker compose up -d`.
6. **Editor.** On your computer: `ssh -N -L 5678:127.0.0.1:5678 root@<ip>`,
   open `http://localhost:5678`, create the owner account (strong password,
   then enable 2FA in the user settings).
7. **Credential.** Credentials → Add → SMTP, name exactly
   `BoLaGio STAGING SMTP`: the sending mailbox's host, port 465 (SSL) or
   587, user, app password. The sender in `BOLAGIO_STAGING_MAIL_FROM` must be
   allowed by that account.
8. **Import** (inactive, ids kept):
   `docker compose exec n8n n8n import:workflow --separate --input=/import`.
   In the editor: five `BoLaGio STAGING · …` workflows, inactive; the
   Execute Workflow nodes show their targets by name; the Send Email node
   shows `BoLaGio STAGING SMTP`.
9. **Activate (with the go-ahead):** Error Handler, then Outbox Event Pump.
   Within two minutes the staging preflight shows *Staging n8n pump is
   polling the outbox* → Pass.
10. **For the live test:** set `BOLAGIO_STAGING_MESSAGING_TRANSPORT=smtp` in
    `.env`, `docker compose up -d` (restarts only this container).

## 4. Running it

* Updates: monthly, `apt-get upgrade` and — after reading the n8n release
  notes — bump `N8N_VERSION`, `docker compose pull && docker compose up -d`.
* Backups: Hetzner's daily server backups cover the SQLite volume. Keep
  `N8N_ENCRYPTION_KEY` in the password manager.
* Rollback / stop: deactivate the pump, or `docker compose stop`. Events
  wait in the outbox; nothing is lost or sent.
* Production later: import `n8n/workflows/` (the `BoLaGio · …` package) on
  the same instance with its own `BOLAGIO_*` variables, its own
  `BoLaGio SMTP` credential and the production worker's own
  `N8N_INTERNAL_SECRET`. The two packages share nothing.
