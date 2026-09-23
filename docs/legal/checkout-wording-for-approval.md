# Checkout wording BoLaGio must approve before direct booking

**This document records BoLaGio's commercial decisions and the legal wording that still requires final approval where explicitly stated.**

Nothing marked **Legal review: PENDING** may be treated as legally approved in `lib/legal/booking-terms.ts`.

The checkout remains blocked until every required legal text has been entered in code as an approved, versioned record.

---

## 1. Cancellation policy — `CANCELLATION_POLICIES`

**Status**

- BoLaGio commercial decision: **APPROVED**
- Legal review: **PENDING**
- Technical activation: **NOT YET**

**Shown:** checkout above the payment button, booking confirmation and booking AGB.

### BoLaGio commercial decision

BoLaGio will use the following standard direct-booking cancellation policy:

- Free cancellation until **7 days before arrival**
- Deadline: **23:59 Bayreuth local time**
- Later cancellation: **80% of the accommodation price**
- No-show without prior cancellation: **90% of the accommodation price**
- Saved expenses must be credited
- Income from re-letting the cancelled nights must be credited
- The guest may prove that BoLaGio suffered no loss or a substantially lower loss
- Refunds are returned through the original payment method
- Refund target: within **14 days**
- Cleaning costs or comparable costs which BoLaGio does not incur after cancellation are not included in the cancellation charge

### German wording for legal approval

> **Stornierungsbedingungen**
>
> Sie können Ihre Buchung bis 7 Tage vor dem Anreisetag um 23:59 Uhr
> (Ortszeit Bayreuth) kostenfrei stornieren.
>
> Bei einer späteren Stornierung berechnen wir 80 % des Beherbergungspreises.
>
> Bei Nichtanreise ohne vorherige Stornierung berechnen wir 90 % des
> Beherbergungspreises.
>
> Der Beherbergungspreis umfasst nicht solche Kosten, die uns infolge der
> Stornierung nicht entstehen, insbesondere nicht eine nicht durchgeführte
> Endreinigung oder vergleichbare ersparte Aufwendungen.
>
> Ersparte Aufwendungen sowie Einnahmen aus einer anderweitigen Vermietung
> der stornierten Übernachtungen werden angerechnet.
>
> Ihnen bleibt ausdrücklich der Nachweis vorbehalten, dass uns kein Schaden
> oder ein wesentlich geringerer Schaden entstanden ist.
>
> Erstattungen erfolgen innerhalb von 14 Tagen über das ursprünglich
> verwendete Zahlungsmittel.
>
> Stornierungen richten Sie bitte an die im Impressum angegebene
> Kontaktadresse.

### English wording for legal approval

> **Cancellation Policy**
>
> You may cancel your booking free of charge until 11:59 p.m.
> (Bayreuth local time) 7 days before the day of arrival.
>
> For a later cancellation, we charge 80% of the accommodation price.
>
> In the event of a no-show without prior cancellation, we charge 90% of the
> accommodation price.
>
> The accommodation price does not include costs which we do not incur as a
> result of the cancellation, in particular final cleaning that is not carried
> out or comparable saved expenses.
>
> Saved expenses and any income received from re-letting the cancelled nights
> will be credited.
>
> You expressly remain entitled to prove that we suffered no loss or a
> significantly lower loss.
>
> Refunds are made within 14 days to the payment method originally used.
>
> Please send cancellations to the contact address stated in our legal notice.

### Still to confirm before activation

Counsel should confirm:

1. whether the 80% late-cancellation lump sum is reasonable;
2. whether the 90% no-show lump sum is reasonable;
3. whether the lower-loss evidence wording is sufficient;
4. whether the treatment of cleaning and other saved expenses is sufficiently clear;
5. whether the policy should refer to the accommodation price or another defined contractual price basis;
6. whether the same rules can be used consistently across all BoLaGio direct-booking apartments.

### Beds24 / OTA consistency

The direct-booking policy must not accidentally conflict with the rate conditions configured in Beds24, Booking.com or Airbnb.

OTA rates may have different contractual cancellation rules where the platform booking itself clearly establishes those different terms.

---

## 2. Right of withdrawal — `WITHDRAWAL_NOTICES` with `maxNights`

**Status**

- Commercial decision: **PENDING**
- Legal review: **PENDING**
- Technical activation: **NOT YET**

**Shown:** checkout, booking confirmation and booking AGB.

### Legal issue

For accommodation for purposes other than residential use where a specific date or period is agreed, § 312g Abs. 2 Nr. 9 BGB may exclude the statutory right of withdrawal.

The checkout therefore must not automatically show a generic 14-day withdrawal notice for ordinary short-term accommodation if the statutory exception applies.

However, longer stays may raise the question whether the accommodation is being provided for residential purposes.

The software therefore requires a legally approved `maxNights` value.

Any stay exceeding this limit must go to the enquiry flow instead of direct online booking.

### Proposed wording for legal approval

> **DE**
>
> Ein Widerrufsrecht besteht nicht. Nach § 312g Abs. 2 Nr. 9 BGB gilt das
> gesetzliche Widerrufsrecht nicht für Verträge über die Beherbergung zu
> anderen als Wohnzwecken, wenn – wie hier – ein bestimmter Zeitraum
> vereinbart ist. Es gelten unsere Stornierungsbedingungen.

> **EN**
>
> There is no right of withdrawal. Under § 312g(2) no. 9 of the German Civil
> Code, the statutory right of withdrawal does not apply to contracts for
> accommodation for purposes other than residential use where, as here, a
> specific period is agreed. Our cancellation terms apply.

### Decision still required

Counsel must determine:

- approved wording;
- longest permitted direct-booking stay;
- the `maxNights` value used by the software;
- whether longer stays require different consumer-law or tenancy-law treatment.

Current discussion value only:

`28 nights`

This is **not approved**.

Engineering must not turn this proposal into a legal rule without approval.

---

## 3. Price completeness — `PRICE_COMPLETENESS`

**Status**

- Commercial confirmation: **PENDING**
- Tax confirmation: **PENDING**
- Technical activation: **NOT YET**

**Shown:** immediately beneath the final total in checkout.

Before direct booking is activated, BoLaGio must confirm exactly what the Beds24 total contains.

### Required confirmation

For every BoLaGio unit confirm whether the returned price includes:

1. accommodation;
2. mandatory final cleaning;
3. mandatory per-person charges;
4. mandatory per-stay charges;
5. VAT;
6. any mandatory local charge.

Also identify every mandatory amount not included in the displayed total.

### VAT question

Tax adviser must confirm:

- whether BoLaGio charges VAT;
- the applicable VAT treatment of accommodation;
- VAT treatment of cleaning;
- VAT treatment of additional services;
- whether any Kleinunternehmer treatment applies.

### Draft price statement if VAT applies as expected

Not approved:

> **DE**
>
> Gesamtpreis inkl. gesetzlicher Umsatzsteuer und Endreinigung.
> Keine weiteren verpflichtenden Kosten vor Ort, sofern im Buchungsangebot
> nicht ausdrücklich anders angegeben.

> **EN**
>
> Total price including statutory VAT and final cleaning.
> No further mandatory charges are payable on site unless expressly stated
> otherwise in the booking offer.

Do not activate this text until the actual price composition is confirmed.

### On-site charges

`onSiteCharges` must contain every mandatory charge not already contained in the Beds24 total.

An empty array means BoLaGio has positively confirmed that there are no further mandatory on-site charges.

It must never be assumed automatically.

---

## 4. Company identity — `lib/legal/company.ts`

**Status**

Partially completed.

Current verified information supplied by BoLaGio:

- Legal name: **BoLaGio GmbH**
- Registered address:
  **Harburgerstraße 5, 95444 Bayreuth**
- Geschäftsführer:
  **Milica Popovic**

Still missing / to be verified:

- Register court
- HRB number
- USt-IdNr., if issued
- Wirtschafts-Identifikationsnummer, if issued and relevant
- Verification that the configured company email is actively monitored
- Verification that the configured phone number is correct

### IMPORTANT

Register court and HRB number must be copied exactly from the Handelsregister.

They must not be guessed merely from the company's location.

---

## 5. Consumer dispute resolution — § 36 VSBG

**Status**

- Applicability: **PENDING**
- Final wording: **PENDING**

BoLaGio must determine whether the information obligation applies.

The employee-count exemption must also be checked using the legally relevant headcount date.

### Candidate wording

Not approved:

> **DE**
>
> Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren
> vor einer Verbraucherschlichtungsstelle teilzunehmen.

> **EN**
>
> We are neither willing nor obliged to participate in dispute resolution
> proceedings before a consumer arbitration board.

Do not publish this statement until applicability and the underlying factual position have been confirmed.

The former EU Online Dispute Resolution platform must not be linked as an active dispute platform.

---

## 6. Marketing consent — Residence Privileges

**Status**

- Technical double opt-in: implemented
- Unsubscribe: implemented
- Marketing activation: **BLOCKED**
- Consent wording approval: **PENDING**

Current Residence Privileges consent wording:

> **DE**
>
> Ja, die BoLaGio GmbH darf mir gelegentlich per E-Mail Angebote und
> Neuigkeiten zu ihren Apartments in Bayreuth senden. Meine Einwilligung wird
> erst wirksam, wenn ich sie über den Link in der Bestätigungs-E-Mail
> bestätige, und ich kann sie jederzeit mit Wirkung für die Zukunft
> widerrufen – über den Abmeldelink in jeder E-Mail oder formlos per Nachricht
> an BoLaGio.

Before any marketing email is sent:

1. consent wording must be approved;
2. double opt-in must be functioning;
3. the confirmation email must remain transactional;
4. unsubscribe must function;
5. every marketing email must contain the required sender identity and unsubscribe option;
6. mailing-list access must remain technically blocked until the approval flag is configured.

Historical consent and withdrawal evidence must not be overwritten.

---

## 7. Review / feedback emails — `REVIEW_REQUEST_BASIS`

**Status**

Review-request emails: **OFF**

They must remain disabled until BoLaGio has established and documented a lawful basis for them.

Options to review later:

- specific consent;
- an applicable existing-customer marketing basis with all required notices;
- no automated review-request emails.

No automatic review-request email should be enabled merely because the guest has completed a stay.

---

## 8. Booking AGB — `BOOKING_TERMS_DOCUMENTS`

**Status**

- Direct-booking AGB: **PENDING**
- Legal review: **PENDING**
- Technical activation: **BLOCKED**

The existing `/agb` page must not automatically be treated as the governing direct-booking contract terms unless it has been reviewed for this booking flow.

The final direct-booking AGB should consistently cover at least:

- contracting party;
- contract formation;
- accommodation/service scope;
- price;
- payment;
- PayPal flow;
- cancellation;
- no-show;
- re-letting;
- saved expenses;
- check-in/check-out;
- guest obligations;
- house rules;
- damage;
- liability;
- cancellation by BoLaGio where applicable;
- force-majeure issues where appropriate;
- withdrawal-right exception where applicable;
- applicable law;
- consumer dispute information where applicable.

The exact contract-formation point in the sequence

`hold → PayPal → confirmation`

must be reviewed before the AGB is approved.

---

## 9. Privacy notice — `PRIVACY_NOTICES`

**Status**

- Technical privacy-page structure: implemented
- Final controller information: partially complete
- Processor information: **PENDING**
- Legal approval: **PENDING**

The privacy notice must cover at least:

- direct-booking guests;
- enquiry-form users;
- Booking.com guests;
- Airbnb guests;
- Beds24 processing;
- Supabase;
- Cloudflare;
- n8n;
- SMTP/email provider;
- PayPal once used;
- Residence Privileges;
- legal retention requirements;
- data-subject rights;
- international transfers where applicable.

### Art. 14 GDPR operational issue

Where BoLaGio receives personal information indirectly through Booking.com,
Airbnb or another platform, the Art. 14 information process must be implemented
within the applicable deadline.

An operational owner must be assigned for this process.

---

## 10. Processor / hosting information

Still required from BoLaGio:

For each service identify:

- contracting company;
- DPA / AVV status;
- data-processing region;
- relevant international transfer mechanism where applicable.

Services currently requiring confirmation:

- Cloudflare
- Supabase
- Beds24
- n8n
- SMTP/email provider
- PayPal once activated
- any analytics provider later introduced

### n8n

If Cogniiq operates the n8n infrastructure as a separate company/service provider for BoLaGio, the processing relationship must be documented appropriately.

---

## 11. Cookies / tracking

**Current status**

The legal audit found no non-essential tracking requiring a consent banner in the current implementation.

A technical test checks that tracking has not silently been introduced.

### Rule

Do not add a cookie banner merely for appearance.

If analytics, advertising pixels, behavioural tracking or other non-essential storage/access is introduced later, reassess the consent requirement before deployment.

---

## 12. Accessibility / BFSG

**Status**

- Several technical accessibility fixes implemented
- BFSG applicability: **PENDING**

Already addressed technically:

- focus-ring visibility;
- small-text contrast;
- dynamic `<html lang>`.

Still required:

Determine whether and to what extent the Barrierefreiheitsstärkungsgesetz applies to BoLaGio's consumer-facing booking service and whether an exemption applies.

Do not treat implementation fixes as proof that all statutory accessibility obligations have been satisfied.

---

## 13. Bayreuth / Bavaria accommodation compliance

**Status**

Separate launch-compliance review required.

Items requiring confirmation include:

- Zweckentfremdungsrecht applicable in Bayreuth;
- building-law permitted use;
- possible Nutzungsänderung;
- fire-safety requirements;
- guest registration / Meldeschein process;
- foreign-guest documentation where applicable;
- any Bayreuth tourism or accommodation levy;
- operational responsibility for mandatory guest-registration records.

No rule from Munich, Berlin or another municipality may automatically be assumed to apply in Bayreuth.

---

## 14. Information currently still required from BoLaGio

### Company

Still needed:

- register court;
- HRB number;
- USt-IdNr. if issued;
- Wirtschafts-Identifikationsnummer if issued/relevant.

Already supplied:

- BoLaGio GmbH
- Harburgerstraße 5
- 95444 Bayreuth
- Geschäftsführer: Milica Popovic

### Tax / pricing

Still needed:

- VAT status;
- exact VAT treatment;
- whether Beds24 totals include cleaning;
- whether any mandatory amount is payable on site.

### Business size

Still needed:

- employee headcount on the legally relevant reference date;
- annual turnover where required for BFSG or other exemption analysis.

### Processors

Still needed:

- contracting entity and processing region for Cloudflare;
- Supabase;
- Beds24;
- n8n;
- SMTP provider;
- PayPal.

---

## 15. How approved wording enters the code

Approved legal texts must be entered as immutable versioned records.

Example:

```ts
export const CANCELLATION_POLICIES: readonly ApprovedText[] = [
  {
    version: '2026-10-15.1',
    approvedAt: '2026-10-15',
    approvedBy: 'Geschäftsführung nach anwaltlicher Prüfung',
    text: {
      de: '...',
      en: '...',
    },
  },
];
