# Checkout wording BoLaGio must approve before direct booking

**This is not legal advice and none of the wording below is approved.** It sets
out, as options and templates, every text the direct-booking checkout needs.
BoLaGio decides the commercial terms and counsel approves the wording. Nothing
here is live. The checkout stays shut until each item is entered in code as an
approved, versioned record (§8).

Each item says where it appears, what the law requires, the decision BoLaGio
has to make, and a neutral template with `[placeholders]`.

---

## 1. Cancellation policy — `CANCELLATION_POLICIES`

**Shown:** checkout (above the button), in the confirmation email, in the AGB.

**Why:**
- The cancellation terms and the costs of cancelling are essential contract
  information. The guest must see them before paying (§ 312j Abs. 2 BGB,
  Art. 246a EGBGB).
- They also go into the confirmation on a durable medium (§ 312f Abs. 2 BGB).
- Without a contractual policy, § 537 BGB applies (a guest who does not stay
  still owes the price, less saved expenses and income from reletting). That
  is a legal fallback, not a text the checkout may leave out.

**BoLaGio decides:**

1. **Model.** Choose one:
   - (A) free cancellation until `[N]` days before arrival, then `[X] %`
   - (B) tiered: `[X] %` from `[N1]` days, `[Y] %` from `[N2]` days
   - (C) a non-refundable rate, if offered as a separate, clearly labelled and
     cheaper rate
2. **No-show.** What is owed, and whether saved costs (e.g. cleaning) are
   credited.
3. **Refunds.** How and when a refund is paid (same payment method, within
   `[14]` days).
4. **Reletting.** Whether an amount earned by reletting the nights is credited.
5. **Deadline.** The time zone and clock time (e.g. 23:59 Bayreuth time).
6. **Beds24.** Whether the policy configured on the Beds24 channel is the same
   one. It must be.

**Template:**

> **DE —** Sie können Ihre Buchung bis `[N]` Tage vor dem Anreisetag
> (`[Uhrzeit]` Uhr, Ortszeit Bayreuth) kostenfrei stornieren. Bei einer
> späteren Stornierung oder Nichtanreise berechnen wir `[X] %` des
> Gesamtpreises. `[Ersparte Aufwendungen / Einnahmen aus einer
> Weitervermietung rechnen wir an.]` Ihnen bleibt der Nachweis
> vorbehalten, dass uns kein oder ein geringerer Schaden entstanden ist.
> Erstattungen erfolgen innerhalb von `[14]` Tagen über das verwendete
> Zahlungsmittel. Stornierungen richten Sie bitte an `[E-Mail]`.
>
> **EN —** You may cancel free of charge until `[N]` days before the day of
> arrival (`[time]`, Bayreuth local time). For a later cancellation or a
> no-show we charge `[X] %` of the total price. `[We credit saved expenses and
> income from reletting.]` You remain free to show that we suffered no loss or
> a lower one. Refunds are made within `[14]` days to the payment method used.
> Please send cancellations to `[email]`.

**Counsel to confirm:**
- that the lump sum is reasonable (§ 309 Nr. 5 BGB)
- that the sentence allowing the guest to show a lower loss is sufficient
- the wording for a non-refundable rate, if one is offered

---

## 2. Right of withdrawal — `WITHDRAWAL_NOTICES` (with `maxNights`)

**Shown:** checkout, in the confirmation email, in the AGB.

**Why:**
- § 312g Abs. 2 Nr. 9 BGB: there is no right of withdrawal for
  accommodation "for other than residential purposes" when the contract fixes
  a specific date or period.
- Art. 246a § 1 Abs. 3 Nr. 1 EGBGB: the guest must be told that they cannot
  withdraw.
- Do **not** show a generic 14-day withdrawal notice. It would grant a right
  that does not exist.

**BoLaGio / counsel decides:**
- The wording.
- **`maxNights`**: the longest stay for which the exemption can safely be
  relied on. A long stay may be *Wohnzwecke*. The withdrawal right would then
  apply, and so would the withdrawal button of § 356a BGB (in force since
  19 June 2026) and tenancy law. Online booking refuses any longer stay, which
  goes to the enquiry flow instead.

**Template:**

> **DE —** Ein Widerrufsrecht besteht nicht. Nach § 312g Abs. 2 Nr. 9 BGB
> gilt das gesetzliche Widerrufsrecht nicht für Verträge über die Beherbergung
> zu anderen als Wohnzwecken, wenn — wie hier — ein bestimmter Zeitraum
> vereinbart ist. Es gelten unsere Stornierungsbedingungen.
>
> **EN —** There is no right of withdrawal. Under § 312g(2) no. 9 of the German
> Civil Code, the statutory right of withdrawal does not apply to contracts for
> accommodation for other than residential purposes where, as here, a specific
> period is agreed. Our cancellation terms apply.

**`maxNights` proposal to discuss:** `[28]`. Engineering is not recommending a
number; this is counsel's decision. The code currently caps any quote at 90
nights.

---

## 3. Price completeness — `PRICE_COMPLETENESS`

**Shown:** directly under the total in the checkout.

**Why:**
- § 3 PAngV: the total price must include VAT and every other unavoidable
  component.
- § 6 PAngV: for distance selling, say that prices include VAT and whether
  further costs apply.
- § 312j Abs. 2 BGB and Art. 246a § 1 Abs. 1 Nr. 4 EGBGB: the total, and any
  additional costs, directly before the order button.

**BoLaGio / tax adviser confirms, for each unit in Beds24:**

1. That the Beds24 offer total already contains:
   - the accommodation
   - the final cleaning fee, if it is mandatory
   - any per-person or per-stay fee
2. The VAT status. Standard VAT at 7 % on accommodation, or Kleinunternehmer
   (§ 19 UStG)?
3. Every mandatory charge **not** in the total and payable on site: local
   levy, pets, deposit. For each, the amount and its basis. **An empty list is
   itself a confirmation.**

**Template:**

> **DE —** Gesamtpreis inkl. `[7 %]` gesetzlicher Umsatzsteuer und
> Endreinigung. `[Keine weiteren Kosten vor Ort.]`
>
> **EN —** Total price incl. `[7 %]` statutory VAT and final cleaning.
> `[No further charges on site.]`

If BoLaGio is a Kleinunternehmer, the statement changes: no VAT is shown, and
a note refers to § 19 UStG.

---

## 4. Company identity — `lib/legal/company.ts`

**Why:**
- § 5 DDG (Impressum)
- Art. 246a § 1 Abs. 1 Nr. 2–3 EGBGB (the trader's identity in the checkout)
- Art. 13 GDPR (the controller)

Supply these from the Handelsregister extract:
- registered address with house number
- every Geschäftsführer
- register court and HRB number
- USt-IdNr. (if issued)
- a **monitored** email address

Also supply the person responsible under § 18 Abs. 2 MStV, if counsel treats
the journal as journalistic-editorial content.

---

## 5. Consumer dispute resolution (§ 36 VSBG) — `COMPANY.consumerDisputeStatement`

**Why:**
- A business with a website or AGB must say whether it takes part in
  consumer arbitration.
- It is exempt if it had **10 or fewer employees on 31 December of the
  previous year** (§ 36 Abs. 3 VSBG).
- The EU ODR platform link is no longer required. The platform closed on
  20 July 2025.

**Template (recommended even if exempt):**

> **DE —** Wir sind nicht bereit und nicht verpflichtet, an
> Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
> teilzunehmen.
>
> **EN —** We are neither willing nor obliged to take part in dispute
> resolution proceedings before a consumer arbitration board.

---

## 6. Marketing consent (Residence Privileges) — `MARKETING_CONSENT_APPROVAL`

**Current wording, version `2026-09-25.1`** (on `/guest/privileges`):

> **DE —** Ja, die BoLaGio GmbH darf mir gelegentlich per E-Mail Angebote und
> Neuigkeiten zu ihren Apartments in Bayreuth senden. Meine Einwilligung wird
> erst wirksam, wenn ich sie über den Link in der Bestätigungs-E-Mail
> bestätige, und ich kann sie jederzeit mit Wirkung für die Zukunft
> widerrufen — über den Abmeldelink in jeder E-Mail oder formlos per Nachricht
> an BoLaGio.

**Also to approve:**
1. **The confirmation email** (n8n template `guest_privileges_verify`). It is
   transactional: one sentence, one link, **no advertising**. It has two
   purposes, `verify_address` and `confirm_marketing_consent`.
2. **The footer of every marketing email.** Identity of the sender, the
   unsubscribe link, and the `List-Unsubscribe` / `List-Unsubscribe-Post`
   headers. These are provided by `unsubscribeLinks()`.

**To record the approval:** set `MARKETING_CONSENT_APPROVAL` with the approved
`versions`. Consents recorded under any other wording version are not
marketable.

---

## 7. Review / feedback emails — `REVIEW_REQUEST_BASIS`

**Why:**
- The BGH treats an email asking for feedback as advertising (VI ZR 225/17,
  10.07.2018).
- It then needs either prior consent, or the § 7 Abs. 3 UWG existing-customer
  exemption. The exemption requires, among other things, a notice of the
  right to object **when the address is collected**, and the checkout does
  not give one today.

**Decision:** choose one:
- keep review requests off (the current state)
- add an objection notice to the checkout (text for counsel), then record the
  basis
- ask for consent

---

## 8. How an approval enters the code

Append a record. Never edit or delete one: bookings store the version they
were shown.

```ts
// lib/legal/booking-terms.ts
export const CANCELLATION_POLICIES: readonly ApprovedText[] = [
  {
    version: '2026-10-15.1',
    approvedAt: '2026-10-15',
    approvedBy: 'Geschäftsführung nach anwaltlicher Prüfung (Kanzlei …)',
    text: { de: '…', en: '…' },
  },
];
```

Do the same for `WITHDRAWAL_NOTICES`, which also needs `maxNights`,
`BOOKING_TERMS_DOCUMENTS` (`path: '/agb'`), `PRIVACY_NOTICES`
(`path: '/datenschutz'`) and `PRICE_COMPLETENESS`.

The change goes through code review. `npm test` then shows the legal gaps
closing. `tests/legal-checkout.test.ts` asserts today's refusals and will need
updating in the same change, which is deliberate.
