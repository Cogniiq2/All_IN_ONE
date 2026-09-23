# Legal review required — BoLaGio GmbH

**This file is not legal advice and none of it is a legal conclusion.** It
lists only the questions that are **still unresolved**. Each one is put so
that a lawyer, tax adviser or authority can answer something specific.

Updated 23 Sep 2026. Background and sources: `docs/legal/compliance-register.md`.
The wording to approve: `docs/legal/checkout-wording-for-approval.md`.
The booking AGB brief: `docs/legal/agb-booking-draft.md`.

> **Source caveat.** The primary statute sites could not be reached from the
> engineering environment. Citations were cross-checked through official and
> chamber sources found by search. Counsel should read each cited provision in
> its current version before relying on a row.

**Owners used below:**
- **GF** = BoLaGio Geschäftsführung
- **RA** = lawyer (consumer, tenancy, competition law)
- **DS** = data protection counsel
- **StB** = tax adviser
- **Stadt** = Stadt Bayreuth / Landratsamt Bayreuth

## Overview

| # | Issue | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | Company identity data (Impressum, checkout, privacy) | **Public launch** | GF | Open — shown as visible gaps |
| 2 | Privacy notice: entities, regions, retention, Art. 28 contracts | **Public launch** | GF + DS | Open — draft published with gaps |
| 3 | Art. 14 information for Booking.com / Airbnb guests | **Already applies today** | GF + DS | Open — operational |
| 4 | § 36 VSBG statement | Public launch, if > 10 employees | GF | Open |
| 5 | Cancellation policy wording | **Direct booking** | GF + RA | Open — code fails closed |
| 6 | No-withdrawal notice and the online stay limit (`maxNights`) | **Direct booking** | RA | Open — code fails closed |
| 7 | Booking AGB, and when the contract is concluded | **Direct booking** | RA | Open — code fails closed |
| 8 | Order-button wording and the PayPal step | **Direct booking** | RA | Implemented, to confirm |
| 9 | Price completeness, VAT statement, on-site charges | **Direct booking**, invoicing | GF + StB | Open — code fails closed |
| 10 | BFSG applicability (micro-enterprise?) | Direct booking, if not exempt | GF + StB | Open |
| 11 | Marketing-consent wording and confirmation email | **Marketing only** | RA + DS | Open — marketing blocked in code |
| 12 | Review / feedback emails | No — suppressed | GF + RA | Open |
| 13 | Retention periods | No — documented | DS + StB | Open |
| 14 | Displaying the Booking.com rating | No | RA | Open |
| 15 | § 18 Abs. 2 MStV for the journal | No | RA | Open |
| 16 | Zweckentfremdung in Bayreuth | **Operation** (not website) | Stadt | Open — sources contradict |
| 17 | Planning law / change of use per unit; Gewerbe | **Operation** | Stadt + RA | Open |
| 18 | Local tourism levy in Bayreuth | Direct booking, if adopted | Stadt / StB | Open |
| 19 | Guest registration (Meldeschein) process | **Operation** (already applies) | GF | Open |

---

## 1. Company identity data — blocks public launch

- **Issue.** `lib/legal/company.ts` has no registered address, Geschäftsführer,
  register court or HRB number, or monitored email. The Impressum shows them
  as "wird ergänzt".
- **Why it matters.** § 5 DDG requires these for any business website. The
  checkout needs the trader's identity (Art. 246a § 1 EGBGB), and the privacy
  notice needs the controller (Art. 13 GDPR). Direct booking is refused while
  any of them is missing (`LEGAL_COMPANY_IDENTITY_INCOMPLETE`).
- **Law.** § 5 DDG; Art. 246a EGBGB; Art. 13 Abs. 1 lit. a GDPR.
- **Question (GF).** *Supply from the Handelsregister extract: the full
  registered address, every Geschäftsführer, the register court and HRB
  number, the USt-IdNr. (if issued), and a monitored email address.*
- **Blocks launch.** Yes, the public website.
- **Status.** Open.

## 2. Privacy notice — blocks public launch

- **Issue.** `/datenschutz` was rewritten against the actual architecture on
  23 Sep 2026. Still missing:
  - the contracting entity and storage region / transfer basis for Cloudflare,
    Supabase, Beds24, the n8n host and the SMTP provider
  - the concrete retention periods
  - approval of the text
- **Why it matters.** Art. 13/14 GDPR require all of this. **The n8n instance
  runs at `n8n.cogniiq.co`, so Cogniiq processes BoLaGio's guest data and needs
  its own Art. 28 agreement with BoLaGio.**
- **Law.** Art. 13, 14, 28, 30, 44 ff. GDPR.
- **Question (DS).** *Please approve or correct `/datenschutz`. Confirm, for
  each service in `lib/legal/processors.ts`, its role (processor or
  independent controller), the contracting entity, the storage region and the
  transfer basis. Confirm that an Art. 28 agreement exists with Cloudflare,
  Supabase, Beds24, Cogniiq (n8n) and the SMTP provider.*
- **Blocks launch.** Yes. Direct booking is also refused
  (`LEGAL_PRIVACY_NOTICE_UNAPPROVED`) until a version is recorded in
  `PRIVACY_NOTICES`.
- **Status.** Open.

## 3. Art. 14 information for platform guests — applies today

- **Issue.** Guests who booked through Booking.com or Airbnb never entered
  data on bolagio.de. BoLaGio receives their data through Beds24.
  `/datenschutz` §7 now describes this processing. **The guests themselves are
  not yet pointed to it.**
- **Why it matters.** Art. 14 Abs. 3 GDPR: the information is due at the
  latest one month after receipt, or at the first communication, whichever is
  earlier. This already applies to current reservations.
- **Question (DS).** *Is a link to `/datenschutz` in our first message through
  the platform sufficient under Art. 14 Abs. 3 lit. b? Does Art. 14 Abs. 5
  lit. a apply to anything the platform has already told the guest?*
- **Owner and action (GF).** Add the link to the first message template on
  each platform.
- **Blocks launch.** It is not a website blocker, but it is **live today**.
- **Status.** Open.

## 4. § 36 VSBG statement

- **Issue.** The EU ODR link was **removed**: the platform closed on
  20 July 2025. The separate § 36 VSBG statement is still owed if BoLaGio had
  more than 10 employees on 31 December of the previous year.
- **Question (GF/RA).** *How many employees did BoLaGio have on 31.12.2025?
  Whether or not we are exempt, do we publish "Wir sind nicht bereit und nicht
  verpflichtet, an Streitbeilegungsverfahren vor einer
  Verbraucherschlichtungsstelle teilzunehmen"?*
- **Blocks launch.** Only if more than 10 employees.
- **Status.** Open. Config field `COMPANY.consumerDisputeStatement`.

## 5. Cancellation policy wording — blocks direct booking

- **Issue.** The technical defect is **fixed**. The checkout no longer shows
  Beds24's text, always renders BoLaGio's approved policy or the stated gap,
  refuses payment without one, stores the version shown, and puts the same
  version in the confirmation email. **No policy has been approved**, so the
  gate stays shut (`LEGAL_CANCELLATION_POLICY_UNAPPROVED`).
- **Law.** § 312j Abs. 2, § 312f Abs. 2 BGB; Art. 246a EGBGB; § 309 Nr. 5 BGB
  (lump-sum damages); § 537 BGB (fallback).
- **Question (GF, then RA).** *Choose the model: free until N days, tiered, or
  non-refundable. Choose the no-show rule and the refund timing. Approve the
  wording in `checkout-wording-for-approval.md` §1. Is the lump sum
  reasonable, and is the counter-proof sentence sufficient?* Also align the
  policy configured in Beds24 with it.
- **Blocks launch.** Yes, direct booking.
- **Status.** Open.

## 6. No-withdrawal notice and the online stay limit — blocks direct booking

- **Issue.** No right of withdrawal is assumed only for accommodation "zu
  anderen als Wohnzwecken" with fixed dates (§ 312g Abs. 2 Nr. 9 BGB). The
  flow currently quotes up to **90 nights**. A monthly stay may be
  *Wohnzwecke*. In that case:
  - a withdrawal right applies, subject to § 312 Abs. 4 BGB for residential
    leases
  - so does the withdrawal button of § 356a BGB (in force since 19.06.2026)
  - and so does tenancy law
  
  The code now caps online stays at the `maxNights` recorded with the
  approved notice. Longer stays go to the enquiry flow.
- **Question (RA).** *Up to how many nights may we rely on § 312g Abs. 2 Nr. 9
  for furnished apartments booked online? Approve the notice wording in
  `checkout-wording-for-approval.md` §2. For longer stays, confirm that
  enquiry plus an individually concluded contract is the right path, and what
  that contract needs (withdrawal information, § 356a).*
- **Blocks launch.** Yes, direct booking.
- **Status.** Open.

## 7. Booking AGB and conclusion of contract — blocks direct booking

- **Issue.** `/agb` covers enquiries. The online flow is: button, hold, PayPal
  approval, capture, then confirmation at Beds24.
- **Question (RA).** *When is the contract concluded in this flow? Please
  draft the booking AGB against `docs/legal/agb-booking-draft.md`, including:*
  - *house rules incorporated before the contract*
  - *whether we take a deposit*
  - *liability under § 309 Nr. 7*
  - *unavailability*
  - *how these AGB relate to Booking.com and Airbnb bookings*
- **Blocks launch.** Yes, direct booking (`LEGAL_BOOKING_TERMS_UNAPPROVED`).
- **Status.** Open.

## 8. Order button and the PayPal step

- **Issue.** The button that places the booking now reads **"Zahlungspflichtig
  buchen"** (EN "Book and pay"); it used to say "Verbindlich buchen". The
  PayPal button follows. It carries PayPal's own label.
- **Law.** § 312j Abs. 3, 4 BGB; CJEU C-249/21 (only the words on the button
  count).
- **Question (RA).** *Is "Zahlungspflichtig buchen" on our button, followed by
  PayPal's button, compliant, given that our button already holds the nights
  and the obligation to pay arises from it? Is "Book and pay" acceptable
  wording in English?*
- **Blocks launch.** Yes, direct booking. The code is in place and awaits
  confirmation.
- **Status.** Implemented; to confirm.

## 9. Price completeness, VAT and on-site charges — blocks direct booking and invoicing

- **Issue.** The checkout shows the Beds24 total, itemised. Nobody has
  confirmed that it contains every mandatory component, what the VAT
  statement is, or that nothing is payable on site
  (`LEGAL_PRICE_COMPLETENESS_UNCONFIRMED`).
- **Law.** § 3, § 6 PAngV; § 312j Abs. 2 BGB; § 12 Abs. 2 Nr. 11 UStG;
  § 14 UStG; § 19 UStG.
- **Question (StB).** *Is BoLaGio GmbH subject to standard VAT (7 % on
  accommodation) or a Kleinunternehmer? What rate applies to a separately
  shown final-cleaning fee, and to extras (parking, pets, laundry)? What must
  our guest invoices contain?*
- **Question (GF).** *Confirm, for each unit, that the Beds24 total includes
  cleaning and every mandatory fee, and list anything payable on site (or
  confirm there is nothing).*
- **Blocks launch.** Yes.
- **Status.** Open.

## 10. BFSG applicability

- **Issue.** Since 28.06.2025 the BFSG covers B2C e-commerce services,
  including online booking with payment. Micro-enterprises providing services
  are exempt: fewer than 10 employees **and** turnover or balance sheet total
  ≤ €2m (§ 3 Abs. 3 BFSG). Major defects found in the audit were fixed; a full
  WCAG audit has not been done.
- **Question (GF/StB).** *Does BoLaGio GmbH meet both micro-enterprise
  criteria? If not, we need a full WCAG 2.1 AA audit and an accessibility
  statement before direct booking.*
- **Blocks launch.** Direct booking, if not exempt.
- **Status.** Open.

## 11. Marketing consent wording and confirmation email — blocks marketing only

- **What is implemented.**
  - The box is optional and unticked.
  - The benefit is independent of it.
  - Double opt-in now confirms the **consent** itself.
  - Evidence is stored: version, source, time, confirmation, withdrawal and
    its source.
  - A signed unsubscribe link with RFC 8058 one-click exists.
  - No audience can be read until `PRIVILEGES_UNSUBSCRIBE_SECRET` is set and
    `MARKETING_CONSENT_APPROVAL` is recorded.
- **Law.** § 7 Abs. 2 Nr. 2, Abs. 3 UWG; Art. 7 GDPR; BGH I ZR 164/09.
- **Question (RA/DS).** *Approve the consent sentence (version 2026-09-25.1)
  and the confirmation email (transactional, no advertising). What must the
  footer of each marketing email contain?*
- **Blocks launch.** Marketing only.
- **Status.** Open.

## 12. Review and feedback emails

- **Issue.** The messaging system can send `review_request`. The BGH treats
  this as advertising (VI ZR 225/17). It is **suppressed** in code
  (`REVIEW_REQUEST_BASIS = null`).
- **Question (RA).** *Consent, or § 7 Abs. 3 UWG? If § 7 Abs. 3: what exact
  objection notice must the checkout show when the email address is collected,
  and what must every such email say?*
- **Blocks launch.** No.
- **Status.** Open.

## 13. Retention periods

- **Issue.** `lib/retention/policy.ts` proposes a period per table.
  Buchungsbelege are 8 years since 2025 (BEG IV). The privileges identity and
  withdrawn consents need a decision.
- **Question (DS/StB).** *Confirm or correct each proposed period in
  `docs/data-retention.md`, in particular: how long do we keep evidence of a
  withdrawn marketing consent, and how long do we keep enquiries that did not
  lead to a booking?*
- **Blocks launch.** No. The periods also go into `/datenschutz` §14.
- **Status.** Open.

## 14. Displaying the Booking.com rating

- **Issue.** The site shows "8,9 · 72 Bewertungen auf Booking.com ·
  Schulstraße" (owner-verified). The word "verifiziert" was removed, because
  § 5b Abs. 3 UWG would then require explaining how the reviews are checked.
- **Question (RA).** *May we show our Booking.com score on our own site? With
  this attribution, is any § 5b Abs. 3 UWG statement required?*
- **Blocks launch.** No.
- **Status.** Open.

## 15. § 18 Abs. 2 MStV and the journal

- **Question (RA).** *Is our journal "journalistisch-redaktionell" within
  § 18 Abs. 2 MStV, so that a responsible person must be named with address?*
  Config field: `COMPANY.editorialResponsible`.
- **Blocks launch.** No.
- **Status.** Open.

## 16. Zweckentfremdung in Bayreuth — operational

- **Issue.** Bayreuth adopted a Zweckentfremdungssatzung in 2019, requiring a
  permit for more than 8 weeks a year of letting to visitors. The BayVGH
  declared it void (12 N 20.1726, 2021). The BayernPortal still describes the
  rule. **Engineering could not establish the current status.**
- **Question (Stadt).** *Is a Zweckentfremdungssatzung under the ZwEWG in
  force in Bayreuth today? If so, from when and with which exemptions, and do
  our units at Schulstraße and Opernstraße need a permit for short-term
  letting?*
- **Blocks launch.** It is not a website blocker, but a **precondition for
  the business**.
- **Status.** Open.

## 17. Planning law and business registration — operational

- **Question (Stadt/RA).**
  - *Does short-term letting of each unit need a Nutzungsänderung or building
    permit (§ 13a BauNVO; permit authority reportedly the Landratsamt since
    2025)?*
  - *Are there fire-safety requirements for our units (BayBO;
    BayBStättV — reportedly only above 30 beds)?*
  - *Is a Gewerbeanmeldung for the letting in place?*
- **Blocks launch.** Operation.
- **Status.** Open.

## 18. Local tourism levy

- **Issue.** No Kurbeitrag was found. Bavaria bans an overnight-stay tax (the
  BayVerfGH upheld the ban in 2025). A Bayreuth tourism levy was proposed in
  2025, and whether it was adopted is **unknown**.
- **Question (Stadt/StB).** *Has Bayreuth adopted a Fremdenverkehrsbeitrag or
  a comparable levy that we owe or must pass on to guests?*
- **Blocks launch.** Only if adopted. It would change the total price (§ 3
  PAngV).
- **Status.** Open.

## 19. Guest registration (Meldeschein) — operational

- **Issue.** Since 01.01.2025 only foreign guests must complete the form, on
  arrival. It is kept for 12 months, then destroyed within 3 months (§§ 29,
  30 BMG). This is deliberately handled outside the website.
- **Question (GF).** *Who completes and keeps the forms for foreign guests,
  on paper or digitally (§ 29 Abs. 5 BMG), and who deletes them on time?*
- **Blocks launch.** It is not a website blocker, but it is **live today**.
- **Status.** Open.

---

## Resolved in code on 23–25 Sep 2026 (no longer questions)

- The checkout can no longer omit the cancellation terms. It fails closed.
- The provider's cancellation text is no longer shown.
- The terms evidence of each booking is stored.
- The confirmation email requires the contract terms.
- The order button states the payment obligation.
- The payment method is stated at the start of the flow.
- The dead EU-ODR reference was removed.
- Privacy links appear at every point of collection.
- The DOI confirms consent. Unsubscribe was built before any marketing.
- Review emails are suppressed.
- There is no tracking or non-essential storage, so **no cookie banner is
  needed** (tested).
- An "ab" price cannot render without its fee note.
- The contrast and `lang` accessibility defects were fixed.
- **`DIRECT_BOOKING_ENABLED` remains `false` on every environment.** It
  cannot open while any `LEGAL_*` refusal exists.
