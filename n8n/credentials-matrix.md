# BoLaGio n8n — credentials and variables matrix

Everything the package reads, where each value is set, and where it comes
from per environment. **No value appears in this file or in any workflow
JSON.** Values live in the n8n process environment or the n8n credential
store, and the BoLaGio side of each shared secret lives in Cloudflare
(`wrangler secret put`). A value in one store is not a value in the other.

"n8n env" means the environment of the n8n process (systemd unit, Docker
`environment:` / `env_file`, or the platform's secret manager) — never a Set
node, never a workflow. Every name is prefixed `BOLAGIO_` so it cannot
collide with a Cogniiq variable on the shared instance.

| Variable / credential | Used by | Staging value source | Production value source | Secret? | Where set |
|---|---|---|---|---|---|
| `BOLAGIO_SITE_URL` | all signed requests (pump, guest message, health) | the staging worker's public URL (`bolagio-staging`), no trailing slash | the production domain, no trailing slash | no | n8n env |
| `BOLAGIO_N8N_INTERNAL_SECRET` | signing block in every backend-calling Code node | the value of `N8N_INTERNAL_SECRET` on the **staging** worker (`wrangler secret put N8N_INTERNAL_SECRET --env staging`) | the value of `N8N_INTERNAL_SECRET` on the **production** worker; a different secret from staging | **yes** | n8n env |
| `BOLAGIO_ENVIRONMENT` | alert bodies, health poll fallback label | `staging` | `production` | no | n8n env |
| `BOLAGIO_MESSAGING_TRANSPORT` | Guest Message | `disabled` (default) or `test`; `smtp` only for the final staging rehearsal with a test inbox | `smtp` after the production runbook; **never** `test` (the backend refuses provider `test` on production) | no | n8n env |
| `BOLAGIO_MAIL_FROM` | Send Email nodes (guest mail, alert mail) | a staging sender on the transactional domain, e.g. a `staging` mailbox | the guest-facing sender address, SPF/DKIM aligned with the SMTP account | no | n8n env |
| `BOLAGIO_ALERT_TRANSPORT` | Operational Alert, Error Handler | `disabled` (default) or `webhook` to a staging channel | `webhook` or `email` to the on-call channel | no | n8n env |
| `BOLAGIO_ALERT_WEBHOOK_URL` | HTTP Request nodes in Operational Alert and Error Handler | incoming-webhook URL of the staging alerts channel (Slack / Teams / Discord) | incoming-webhook URL of the production on-call channel | **yes** (a webhook URL is a capability) | n8n env |
| `BOLAGIO_ALERT_EMAIL_TO` | Send alert e-mail nodes | an operator's mailbox or a staging distribution list | the on-call distribution list | no | n8n env |
| `BOLAGIO_CLEANING_TRANSPORT` | Cleaning Routing | `disabled` (default) or `webhook` to a sandbox of the cleaning tool | `webhook` once the cleaning tool's endpoint is agreed; otherwise `disabled` | no | n8n env |
| `BOLAGIO_CLEANING_WEBHOOK_URL` | HTTP Request node in Cleaning Routing | the cleaning tool's sandbox/test endpoint | the cleaning tool's production endpoint | **yes** | n8n env |
| **`BoLaGio SMTP`** (credential, type SMTP) | Send Email nodes in Guest Message, Operational Alert, Error Handler | the transactional mail provider's staging/sandbox SMTP account (host, port, user, password, TLS) | the production SMTP account for the sender domain | **yes** | n8n credential store (name must be exactly `BoLaGio SMTP`) |

Instance-level settings the package relies on (shared with Cogniiq, set once
by whoever operates the instance):

| Setting | Value | Why |
|---|---|---|
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` (n8n default) | Code nodes and expressions read `$env.BOLAGIO_*` |
| `NODE_FUNCTION_ALLOW_BUILTIN` | includes `crypto` | the HMAC signature is computed with Node's `crypto` |
| `GENERIC_TIMEZONE` | any; workflows set `Europe/Berlin` in their own settings | schedule triggers fire on the workflow timezone |

Counterpart on the BoLaGio side (for the same environment), per
`docs/environments.md` §3:

| Cloudflare secret / var | Must match | Purpose |
|---|---|---|
| `N8N_INTERNAL_SECRET` | `BOLAGIO_N8N_INTERNAL_SECRET` in n8n | verifies the HMAC |
| `N8N_REPLAY_WINDOW_SECONDS` | (default 300) | the n8n host clock must be within this of the worker's |
| `APP_ENV` | `BOLAGIO_ENVIRONMENT` label | the health endpoint reports it; alerts should agree |

Rotation: generate the new `N8N_INTERNAL_SECRET`, set it on the worker
(`wrangler secret put … --env <env>`), set `BOLAGIO_N8N_INTERNAL_SECRET` in
n8n, restart n8n. Between the two steps every signed request is a `401`;
the pump's execution errors (Error Handler alerts once per execution) and
events simply wait — nothing is lost. Keep the window short and do it in
the order above, worker first, so the first successful poll after the
restart proves the new pair.
