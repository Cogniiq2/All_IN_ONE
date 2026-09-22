# Legal review required — BoLaGio GmbH

**This file is not legal advice and nothing in it is a legal conclusion.** It is
a register of questions the implementation cannot answer for itself, written by
the engineering side so that a lawyer or tax adviser can be asked something
specific rather than "please review the website".

Each item states: what the issue is, why it matters, where in the product it
lives, the **exact question** to put to the adviser, and whether it **blocks
public launch**.

Jurisdiction: Germany (Bavaria). Company: BoLaGio GmbH, Bayreuth.

| # | Issue | Blocks launch? |
|---|---|---|
| 1 | AGB written for enquiries, not concluded bookings | **Yes**, for direct booking |
| 2 | Cancellation policy may render empty | **Yes**, for direct booking |
| 3 | Total price completeness (Kurtaxe, deposits) | **Yes**, for direct booking |
| 4 | Button wording / Button­lösung | **Yes**, for direct booking |
| 5 | Widerrufsrecht exemption wording | **Yes**, for direct booking |
| 6 | VAT treatment and invoice content | **Yes**, for invoicing |
| 7 | Privacy notice: processors and the privileges data | **Yes** |
| 8 | Marketing consent and double opt-in evidence | **Yes**, for marketing only |
| 9 | Retention periods, including the privileges identity | No — documented, flagged |
| 10 | Meldeschein (guest registration) | No — outside the booking flow |
| 11 | Review attribution | No — but fix before promoting ratings |
| 12 | Kurtaxe / local accommodation tax in Bayreuth | **Yes**, if it applies |

Items 1–6 are pre-existing and already listed in
`docs/production-readiness.md` §3; they are restated here so one register
covers everything. Items 7–9 and 11 arise from work on this branch.

---

## 1. AGB cover enquiries, not a concluded booking — **blocks direct booking**

**Where** `/agb`, and the checkout flow in `components/enquiry/` and
`app/(site)/book-direct`.

**Why it matters** The current terms were written when the site took
*enquiries*. Direct booking concludes a contract on the website: money changes
hands, inventory is committed, and the terms that govern that contract are the
ones shown at the moment of conclusion. Terms describing an enquiry do not
govern a booking.

**Exact question** *"Do our AGB, as published, govern a distance contract for
accommodation concluded and paid for on our website — including the moment of
conclusion, our obligations, the guest's obligations, no-show, and late
arrival? If not, please supply terms that do."*

---

## 2. The cancellation policy can render as nothing — **blocks direct booking**

**Where** `BookingQuote.cancellationPolicy`, rendered in the quote step. The
value comes from whatever Beds24 returns for the offer.

**Why it matters** If Beds24 returns no policy text, **the booking flow shows
no cancellation terms at all** and the guest pays anyway. That is a
consumer-information problem that only appears in production, on the
reservations where the field happens to be empty.

**Engineering note** This should not be left to the provider. The safe design
is a BoLaGio-owned cancellation policy, shown always, with the provider's text
used only where it agrees. That change is not made here because the *content*
is a business and legal decision, not a technical one.

**Exact question** *"What is our cancellation policy, in the exact wording to
be shown to a guest before payment? Must it be displayed before the payment
step, and must the guest acknowledge it separately?"*

---

## 3. Is the displayed total actually the total? — **blocks direct booking**

**Where** The quote and payment steps.

**Why it matters** German price-indication rules require the price a consumer
must pay. Anything mandatory and payable on site — a local accommodation tax,
a cleaning fee, a deposit — must be visible before payment. Nothing in the
codebase computes such an amount; the quote renders what Beds24 returns.

**Exact question** *"Are there any mandatory charges for a stay at Schulstraße
that are not in the Beds24 rate — Kurtaxe, cleaning, deposit, pets, late
check-in? For each: is it included in the displayed total, or must it be shown
separately as payable on site, and in what wording?"* (See also item 12.)

---

## 4. Payment button wording (Buttonlösung) — **blocks direct booking**

**Where** The payment step. The PayPal button is rendered by PayPal's SDK; the
surrounding copy is BoLaGio's.

**Why it matters** § 312j Abs. 3 BGB requires the button that concludes a
paid consumer contract to be labelled unambiguously ("zahlungspflichtig
bestellen" or equivalent). Where a third-party payment button carries its own
label, whether the requirement is satisfied — and what the surrounding copy
must say — is a legal judgement.

**Exact question** *"Does the PayPal button as rendered satisfy § 312j Abs. 3
BGB for our flow, or must we place our own labelled confirmation step before
it? If the latter, what exact label?"*

---

## 5. Widerrufsrecht exemption wording — **blocks direct booking**

**Where** `/agb`, and the checkout.

**Why it matters** Accommodation for a specified date is normally exempt from
the distance-selling right of withdrawal (§ 312g Abs. 2 Nr. 9 BGB). The
exemption is widely relied on, but the **wording of the notice** telling the
guest the right does not apply, and the conditions under which it holds, need
confirmation. This has been flagged, never assumed, anywhere in the code.

**Exact question** *"Please confirm that § 312g Abs. 2 Nr. 9 BGB applies to our
bookings, and supply the exact notice wording to display, and where."*

---

## 6. VAT treatment and invoice content — **blocks invoicing**

**Where** `lib/finance/tax/*`, `docs/invoicing.md` §5, `docs/finance/vat.md`.

**Why it matters** The finance layer computes VAT from configured tax codes.
Which rate applies to short-term accommodation, how a separately-charged
cleaning fee is treated, and whether any Kleinunternehmer or reverse-charge
situation applies are tax determinations, not engineering ones. An invoice
stating a rate nobody decided is a tax problem.

**Exact question** *"For short-term furnished accommodation let by BoLaGio GmbH
in Bayreuth: which VAT rate applies to the accommodation, and which to any
separately-itemised cleaning fee, breakfast or minibar item? Please confirm the
mandatory content of our guest invoices under § 14 UStG."*

---

## 7. Privacy notice: processors and the privileges data — **blocks launch**

**Where** `/datenschutz`.

**Why it matters** The notice must name the processors and describe the
processing. The current deployment involves **Cloudflare** (hosting/edge),
**Supabase** (database), **Beds24** (channel manager), **PayPal** (payments,
once enabled) and **n8n** plus an SMTP provider (transactional email). The
Residence Privileges system added on this branch processes an **email address
and consent evidence** for a purpose the notice does not yet describe.

Whether international transfers arise (and on what basis) depends on where each
processor actually hosts BoLaGio's data — a fact only BoLaGio can confirm from
its contracts.

**Exact question** *"Please update our privacy notice to cover: (a) each
processor we use, with an AV-Vertrag in place for each; (b) the region each
one stores data in and the transfer basis if outside the EU/EEA; (c) the
Residence Privileges processing — email address, double opt-in state, and
marketing consent evidence — with its legal basis and retention; and (d) the
data subject rights contact."*

**Also needed, not code:** an **AV-Vertrag (Art. 28 GDPR)** with each
processor, and a **Verzeichnis von Verarbeitungstätigkeiten** entry per
purpose. `lib/retention/policy.ts` is written to feed the latter.

---

## 8. Marketing consent and double opt-in — **blocks marketing only**

**Where** `/guest/privileges`, `lib/privileges/*`,
`bolagio_guest_identities`.

**What the implementation does** — so the adviser is reviewing facts:

* The marketing checkbox is **not pre-checked** and is **not required** to
  receive the benefit. The benefit is granted either way; only marketing
  depends on the box. Consent is therefore not bundled into the service.
* Consent is stored as **evidence**: timestamp, source (`qr_privileges`) and
  the **wording version** shown at the time (`MARKETING_CONSENT_VERSION`).
* The address is confirmed by a **double opt-in**: a link is emailed and the
  identity is not verified — and earns nothing — until it is clicked. The link
  expires after 72 hours, is single-use, and only its SHA-256 is stored.
* A withdrawal column exists (`marketing_withdrawn_at`) and cannot predate the
  consent it withdraws (database constraint).

**What is NOT implemented** An unsubscribe link and a withdrawal endpoint. No
marketing email can be sent yet, so nothing is unlawful today — but **sending
the first marketing email without a working one-click withdrawal would be.**

**Exact question** *"Does the described flow meet the requirements for
consent-based email marketing in Germany (§ 7 UWG, Art. 7 GDPR)? Please
confirm (a) the exact consent sentence to display, (b) the required content of
the confirmation email, and (c) the required unsubscribe mechanism."*

---

## 9. Retention periods, including the privileges identity — does not block

**Where** `lib/retention/policy.ts`, `docs/data-retention.md`.

Every `bolagio_*` table is classified with a purpose, its personal columns and
a **proposed** period marked `NEEDS CONFIRMATION`. Nothing is automated; no row
is deleted by any scheduler.

One tension is worth the adviser's attention rather than a rubber stamp:

> A privileges identity is **not** a booking record, so the commercial-document
> retention under § 147 AO that protects booking data does not reach it.
> Art. 7(1) GDPR requires the controller to be able to **demonstrate** consent,
> which argues for keeping a consent record; Art. 5(1)(e) argues for deleting
> personal data once it is no longer necessary. The proposal in the code is 36
> months after the last interaction, 12 months for an unverified signup, and
> retention of a **withdrawn** consent for the limitation period as evidence
> that the withdrawal was honoured.

**Exact question** *"Please confirm or correct each proposed retention period,
and in particular how long we should keep a withdrawn marketing consent as
evidence."*

---

## 10. Meldeschein — does not block this release

Guest registration is a legal obligation handled **outside** the checkout, on
purpose: identity-document details do not belong in a payment flow and are
deliberately absent from every table. It still needs an answer.

**Exact question** *"What is our obligation for guest registration in Bayreuth
for short-term lets, and what is the compliant process — paper on arrival, or a
digital form? If digital, we will scope it as a separate system."*

---

## 11. Review attribution — fix before promoting any rating

**Where** Anywhere a rating or review count is shown, and any `AggregateRating`
structured data.

**Why it matters** A rating earned on Booking.com is a **Booking.com** rating.
Presenting it as an all-platform, Google or BoLaGio rating is misleading, and
`AggregateRating` markup that does not reflect reviews collected on the site is
a structured-data policy problem as well as a fairness one.

**Engineering note** No fake reviews or ratings were created on this branch and
none exist in the codebase.

**Exact question** *"May we display our Booking.com rating on our own site, and
with what attribution wording?"*

---

## 12. Kurtaxe / local accommodation tax — blocks if it applies

**Where** Nothing implements it. The quote shows what Beds24 returns.

**Exact question** *"Does the City of Bayreuth levy a Kurtaxe, Bettensteuer or
comparable local accommodation tax on our lettings? If so: what is the rate,
who owes it, must it be collected from the guest, and must it appear in the
displayed price or as a charge payable on site?"*

---

## What engineering has already done, so it need not be re-asked

* **No cookies or tracking** are set by the site or the booking flow. No
  analytics script is loaded. The PayPal SDK loads only when a guest reaches
  the payment step. Fonts are self-hosted (`next/font`) — no external font
  request, so no visitor IP reaches a third party before consent.
* **Direct booking is OFF** behind a server-side gate that fails closed
  (`DIRECT_BOOKING_ENABLED`, plus `bolagio_units.is_bookable` per unit).
* **No guest personal data** appears in any log line, API response or webhook
  response; this is enforced by an allow-list in `lib/booking/logger.ts` and
  asserted by tests rather than left as a convention.
* **Every `bolagio_*` table** has RLS on with no policy and browser roles
  revoked. The only access is the service role held by the server.
* **Nothing invents a fact.** Unverified property details are `undefined` and
  the UI omits the section; unavailable financial data reads "Not yet
  reconciled" and never `0`.
