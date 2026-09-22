# BoLaGio Residence Privileges

The returning-guest system. A QR code in the apartment, one email field, and a
benefit that applies automatically on the guest's next **direct** booking.

The commercial point is narrow and worth stating plainly: every occupied night
BoLaGio has recorded came through an OTA. Commission on those nights is the
single largest controllable cost in the business, and the only durable way to
reduce it is to own the relationship with guests who have already stayed. This
is the mechanism for that, and it is deliberately not a coupon programme.

---

## 1. The URL in the QR code

```
https://bolagio.de/guest/privileges?property=schulstrasse-i&campaign=residence-privileges
```

| parameter | meaning | required |
|---|---|---|
| `property` | the unit slug, so a scoped campaign knows which apartment | no |
| `campaign` | the campaign `code` this code is printed for | no |

**Nothing in the URL is a secret and nothing in it grants anything.** A QR code
is printed on a wall where any guest, cleaner, neighbour or passer-by can
photograph it. Both parameters are re-validated server-side and are treated as
a *hint* about which apartment the guest is standing in — never as an
authority. An unknown slug or code still produces a working signup; it simply
earns the unscoped campaigns.

The page is `noindex, nofollow`. A residence privilege that Google can find is
a coupon, which is the positioning this exists to avoid.

---

## 2. The guest journey

```
scan → /guest/privileges → email + (optional) marketing tick → "check your inbox"
     → confirmation email → click → verified, grants created → "your benefits are on file"
     → next direct booking with the same email → benefit resolved server-side
```

Four screens, one field, one button. The page states the benefit once, calmly,
and then leaves the guest alone.

---

## 3. The data model

`supabase/migrations/20260924120000_guest_privileges.sql`

| table | job |
|---|---|
| `bolagio_guest_identities` | **who** — a normalised email, its opt-in state, consent evidence |
| `bolagio_privilege_campaigns` | **what** — the configurable benefit |
| `bolagio_privilege_grants` | **entitlement** — this identity, this campaign |
| `bolagio_privilege_redemptions` | **ledger** — spent once, on this booking |

Separating the entitlement from the redemption is what makes "one-time"
enforceable: a usage limit is a **count of ledger rows**, never a boolean
somebody forgot to flip.

Two unique indexes carry most of the anti-abuse weight:

* `unique (guest_identity_id, campaign_id)` on grants — signing up ten times
  from the same apartment produces **one** grant. A first-time benefit cannot
  be farmed by resubmitting the form.
* `unique (intent_id)` on redemptions — a retried checkout cannot spend one
  benefit twice, enforced by the database rather than by a code path.

All four tables: RLS on, **no policy**, `anon` and `authenticated` revoked —
the same posture as every other `bolagio_*` table. The campaigns table is
included even though it holds no personal data, because the discount
configuration is commercially sensitive.

---

## 4. Security: why there is no coupon code

**The browser never sends a discount, a campaign code, or a claim to be
eligible.** It sends the email the guest is booking with — which it already
collects — and the server resolves the benefit from the database. There is no
coupon string to guess, forge, share on a deal forum, or replay, because no
coupon string exists.

Every rule that could cost money lives in one pure function,
`lib/privileges/benefit.ts`, with a test each:

| rule | effect |
|---|---|
| identity not verified | **nothing**, whatever grants it holds |
| grant revoked or expired | nothing |
| campaign inactive, or outside its validity window | nothing |
| stay shorter than `min_nights` | nothing |
| campaign scoped to another unit | nothing |
| usage limit reached (counted from the ledger) | nothing |
| percentage | floored, then capped by `max_discount_cents` |
| both percentage and fixed set | the **smaller** applies |
| non-stackable campaigns | never combine |
| any total | never exceeds the gross, never negative |

### The verification gate does two jobs at once

An identity earns nothing until the address is verified by clicking the emailed
link. That single gate is **both** the GDPR double opt-in **and** the control
that stops someone claiming a stranger's benefit by typing their address. One
mechanism, not two bolted together.

Only the **SHA-256** of the verification token is stored. The raw token exists
in the email and in the link the guest clicks, and nowhere else — a database
read, a backup or a leaked dump is not enough to verify somebody else's
address. Tokens are 32 CSPRNG bytes, single-use, and expire after 72 hours.

### Residual risk, stated honestly

Eligibility is bound to a **verified email address**. Someone who controls a
guest's mailbox could therefore claim that guest's benefit — but they would
also receive the booking confirmation, so the attack is largely
self-defeating. If abuse ever appears, the next step is a signed eligibility
token issued at verification and presented at booking; the schema supports it
without a migration. It is not built now because it costs the guest a step and
buys little against a threat nobody has.

### Email normalisation

Trim and lower-case, and nothing more. Applying Gmail's dot-and-plus rules to
every provider would merge two genuinely different mailboxes at hosts that
treat them as different, and hand one person's benefit to another.
Address-level farming is bounded by the one-grant-per-campaign index instead,
which costs nothing and cannot be wrong.

### The signup endpoint reveals nothing

`POST /api/guest/privileges/signup` is public and unauthenticated, so it
answers **identically** — same status, same body — for a new address, a repeat,
an already-verified one, one that has exhausted its sends, and an internal
failure. A test compares whole responses across all five cases rather than
field by field, so a status code added one day fails the test instead of
quietly becoming an "is this person a BoLaGio guest?" oracle.

The one case that answers differently is a **malformed** address, which tells
the sender about nothing but their own typing — and without it a typo would
look like success while the guest waited for an email that was never coming.

Rate limited per client. As everywhere else in this codebase, the in-isolate
limiter is a courtesy and **not** the security boundary; Cloudflare WAF is.

---

## 5. Configuring a campaign

There is no admin form yet — campaigns are configured directly in the
database, which is deliberate for now: the first campaign is a commercial
decision to be made once, not a screen to be maintained. Every field is
validated by a database constraint, so a mistake is refused rather than saved
and puzzled over.

```sql
insert into bolagio_privilege_campaigns
  (code, name, description_de, description_en, active,
   discount_percent_bp, max_discount_cents, min_nights,
   expiry_days, usage_limit_per_guest, stackable)
values
  ('residence-privileges', 'Residence Privileges',
   'Direktbucher-Vorteil für wiederkehrende Gäste.',
   'Direct-booking benefit for returning guests.',
   false,          -- activate deliberately, after reading §7
   1000,           -- 10.00%
   15000,          -- never more than €150.00 off
   2,              -- at least two nights
   540,            -- the grant expires 18 months after it is earned
   1,              -- once per guest
   false);         -- never stacks
```

| field | note |
|---|---|
| `discount_percent_bp` | basis points; 1000 = 10%. Max 5000 (50%). |
| `discount_fixed_cents` | set **either** this or the percentage; if both, the smaller applies |
| `max_discount_cents` | the cap that stops a long stay turning 10% into a four-figure gift |
| `unit_id` | `null` = every apartment |
| `valid_from` / `valid_to` | the **redemption** window, inclusive, measured against arrival |
| `expiry_days` | how long a grant lives after it is earned |
| `usage_limit_per_guest` | 1 is the classic returning-guest benefit |
| `stackable` | `false` by default — stacking is the bug that turns a discount into a refund |
| `priority` | lower sorts first when two campaigns tie exactly |

A campaign that discounts nothing is refused by a check constraint. So is a
`valid_to` before its `valid_from`.

---

## 6. Consent and privacy

* The marketing checkbox is **never pre-checked** and is **never required**.
  The benefit is granted either way; only marketing depends on the box, so
  consent is not bundled into the service transaction.
* Only a literal `true` counts as consent. `'true'`, `1`, `'yes'` and `'on'`
  are all recorded as **no** consent — asserted by a test.
* Consent is stored as **evidence**, not a boolean: when, from where
  (`qr_privileges`), and the **wording version** shown
  (`MARKETING_CONSENT_VERSION` in `lib/privileges/signup.ts`). Bump that
  constant whenever the sentence changes, so "what did this person agree to"
  stays a query rather than an argument.
* No email address appears in any log line, API response, or outbox payload.
* Retention is classified in `lib/retention/policy.ts` and the periods are
  **proposed, not decided** — see `LEGAL_REVIEW_REQUIRED.md` §8 and §9.

**Not implemented: unsubscribe.** No marketing email can be sent yet, so
nothing is unlawful today — but **the first marketing send requires a working
one-click withdrawal first.** `marketing_withdrawn_at` exists and is
constrained; the endpoint and the link are not built.

---

## 7. What is still required before this can go live

| # | Step | Why |
|---|---|---|
| 1 | Apply the migration to staging, then production | `docs/supabase-migration-runbook.md` |
| 2 | Build the `guest_privileges_verify` n8n template | **Without it the confirmation email never sends and nobody can verify.** See §8 |
| 3 | Decide and insert the first campaign, `active = false` | §5 |
| 4 | Answer `LEGAL_REVIEW_REQUIRED.md` §7 and §8 | privacy notice and consent wording |
| 5 | Wire benefit resolution into the quote path | §9 — deliberately not done yet |
| 6 | Activate the campaign | after 1–5 |
| 7 | Print the QR codes | last, so the URL is never live before the flow is |

---

## 8. The email hand-off

Signup writes one row to `bolagio_outbox_events`:

```
event_type     guest_privileges_verify
event_version  1
aggregate_type guest_identity
aggregate_id   <identity uuid>
payload        { token, locale, campaign? }
```

**The payload carries no email address.** The outbox is documented as holding
references and not guest PII, and this feature does not become the exception
that quietly makes that comment false — the delivery worker resolves the
recipient from the identity id, exactly as guest messaging already does.

The **token** is in the payload because the worker has to put it in the link
and the database holds only its hash, by design. The outbox is service-role
only, and the token is single-use and expires in 72 hours.

The link the email must contain:

```
https://bolagio.de/api/guest/privileges/verify?token=<token>
```

---

## 9. Redemption is not wired in yet, on purpose

`resolveBenefits()` is complete and tested, but nothing calls it from the quote
path. Direct booking is behind its launch gate
(`docs/direct-booking-production-readiness.md`) and a discount engine wired
into a disabled flow could only be tested by enabling the flow.

When it is wired in, the contract is:

1. The quote resolves the gross from Beds24, **unchanged**.
2. `loadGrantsForEmail(normalizeEmail(guestEmail))`, server-side.
3. `resolveBenefits(identity, grants, { unitId, nights, grossCents, checkIn })`.
4. The discount is applied to the quote and **written into the intent**, so the
   amount the guest is charged is the amount the server computed — never one
   the browser sent back.
5. On confirmation, one `bolagio_privilege_redemptions` row per applied grant,
   in the same transaction as the state change. `unique (intent_id)` makes a
   retry safe.

Step 4 is the important one. The existing booking core already refuses to take
an amount from the browser; a benefit must not become the exception.
