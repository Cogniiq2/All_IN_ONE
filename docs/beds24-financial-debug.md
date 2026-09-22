# The financial shape probe — a temporary, staging-only diagnostic

`POST /api/booking/reservations/financial-debug`

> **REMOVED on 2026-09-24.** The endpoint, `lib/integrations/beds24/financial-probe.ts`
> and their two test files no longer exist. It was scaffolding, it did its job,
> and leaving a route that reads a live guest's reservation in the tree — even
> a staging-gated one — is not a thing to do indefinitely.
>
> This page is kept for **§5, the answers**, which are the only record of what
> Beds24 actually reports about money. The sections before it describe how they
> were obtained. Nothing in the running system depends on any of it.

---

## 1. The question

The finance subledger has to attribute channel revenue correctly: BoLaGio's
share, Booking.com's commission, the city tax, the cleaning fee, what was paid
and what will be paid out. That requires knowing what Beds24 actually supplies
on a channel reservation — and the repository does not know:

* `docs/beds24-contract.md` records the booking read as **UNVERIFIED**;
  `beds24.com` and `api.beds24.com` are blocked by the egress proxy in the
  environment this code is built in, so the reference cannot be read.
* The canonical import (`docs/beds24-reservations.md`) deliberately requests
  `includeInvoiceItems=false` and stores exactly one money field,
  `total_amount_cents`, from `price`. **Whether `price` is gross or net of the
  channel commission is not established.** Building a tax engine on top of that
  guess is how a VAT return goes wrong.

So the shape is read off one real, already-imported Booking.com reservation,
once, deliberately, on staging.

---

## 2. What it does

1. Authenticates the caller against `BOOKING_SYNC_SECRET`
   (`x-bolagio-signature`), in constant time, **before** anything else.
2. Refuses to exist outside `APP_ENV=staging` — **404**, not 403.
3. Reads one row from `public.bolagio_reservations` (`provider = 'beds24'`,
   `source = 'booking_com'` by default, most recent arrival first) to learn
   *which* booking to ask about. The caller never names a booking the system has
   not already imported.
4. Issues **one** `GET /bookings?id=…&includeInvoiceItems=true` to Beds24.
5. Describes the financial **shape** of the answer and returns that.

The raw booking never leaves `lib/integrations/beds24/financial-probe.ts`. It is
not returned, not logged, not attached to an error.

### It changes nothing

No finance table is read or written. No migration accompanies this. No booking
intent, hold, payment, or reservation row is touched — the only database verb on
this path is `select`. Direct booking is neither read nor altered. Nothing is
written to Beds24: the request carries no `method`, no body and no idempotency
key, and `tests/reservation-financial-debug.test.ts` asserts it.

---

## 3. The privacy design

A diagnostic that reads a live guest's reservation into memory is exactly the
kind of endpoint that leaks. Three rules, in
`lib/integrations/beds24/financial-probe.ts`, make sure it does not.

| | rule | what it stops |
|---|---|---|
| 1 | **Allow list, not deny list.** A value is shown only when its key matches a financial pattern *and* the value is a shape money comes in — a number, a boolean, a numeric string, a three-letter currency code, or a single token of at most 32 characters with no spaces. | A sentence, an address, an email, an object or an array can never be printed as a value. |
| 2 | **Forbidden keys vanish.** A key naming a person, a contact, free text, a payment instrument or a credential is dropped entirely — not its value, not its name, not its type. Only a **count** of them is reported. | The answer cannot even confirm which personal fields exist. |
| 3 | **A final sweep.** The finished report is walked once more against every string the provider sent under a person-shaped key, and anything that matches — in a value *or* in a key — becomes `[redacted]`. | A guest's surname smuggled into a future field the first two rules happen to permit. |

Two refinements in rule 3 are worth knowing, because both are the difference
between a safe report and a useless one:

* **Identity fields contribute their words; free text contributes only its whole
  value.** An invoice line reading *"Room charge for Mustermann"* would otherwise
  make `room`, `charge` and `for` into needles, and the sweep would redact the
  field name `roomId`, the item type `charge`, and every key containing "for".
  The guest's name in that sentence is already a needle in its own right, from
  `lastName`.
* **A short bare number is never a needle.** A postcode of `8000` inside a payout
  of `18000.00` would redact the one number this endpoint exists to read. A
  needle must contain a letter, or be at least eight characters long — which
  still catches phone numbers, card numbers and channel references.

### What is never returned

A guest name, email, phone, address, country, note, comment, arrival-time
instruction, card or card-holder data, custom fields, info items, the channel
confirmation number, the BoLaGio reference, the raw reservation object, or the
Beds24 booking id. The selected reservation is identified by **channel and
state** only; `providerQuery.id` is echoed as `[selected]`.

`cityTax` and `cityFee` are deliberate exceptions to the `city` rule: they are
taxes and fees, not addresses.

---

## 4. Using it

```bash
curl -sS -X POST "https://<staging-host>/api/booking/reservations/financial-debug" \
  -H "x-bolagio-signature: $BOOKING_SYNC_SECRET" \
  -H "content-type: application/json" \
  -d '{}'
```

| body field | meaning |
|---|---|
| *(empty)* | the most recent imported **Booking.com** reservation |
| `source` | `booking_com` (default) or `airbnb`. Anything else is ignored rather than refused. |
| `externalBookingId` | pin one reservation (digits only). It must already exist in `bolagio_reservations` for the chosen channel, or the answer is `no_imported_reservation`. |

The import must have run at least once (`POST /api/booking/reservations/sync`),
otherwise there is nothing to probe and the endpoint says so — it never searches
the provider for a booking of its own choosing.

### The answer

```jsonc
{
  "environment": "staging",
  "reservation": { "source": "booking_com", "statusClass": "active",
                   "providerStatus": "confirmed", "pinned": false },
  "providerQuery": { "path": "/bookings", "method": "GET",
                     "id": "[selected]", "includeInvoiceItems": "true" },
  "found": true,
  "financial": {
    "fieldNames": ["arrival", "commission", "currency", "price", "..."],
    "financialFields": [
      { "field": "price", "type": "string", "category": "price", "value": "480.00" },
      { "field": "commission", "type": "string", "category": "commission", "value": "72.00" }
    ],
    "otherFields": [{ "field": "arrival", "type": "string" }],
    "withheldFieldCount": 13,
    "invoiceItems": { "present": true, "count": 2,
                      "fields": [{ "field": "amount", "type": "string",
                                   "category": "price", "value": "480.00" }] },
    "sourceIdentifiers": { "apiSourceId": 19, "apiSource": "booking",
                           "hasApiReference": true, "hasChannelReference": false,
                           "hasReference": false },
    "providerStatus": "confirmed",
    "currency": "EUR"
  }
}
```

* `financialFields` — the categorised money fields: `price`, `commission`,
  `tax`, `fee`, `payment`, `payout`, `currency`, `discount`. A field whose value
  could not safely be shown carries `withheld: true` and its type instead.
* `otherFields` — everything else that was present, by **name and type only**.
  This is the discovery surface: a financial field Beds24 names in a way the
  categoriser has not met will show up here, and the categoriser can then be
  taught it.
* `withheldFieldCount` — how many keys rule 2 dropped. A count, never a name.

---

## 5. The answers  ·  RECORDED 2026-09-24  ·  ENDPOINT REMOVED

Run on staging against a real Booking.com reservation. The endpoint, the
probe module and their tests were removed in the same change that recorded
this; the section is kept because it is the only place these answers exist.

Observed on one confirmed Booking.com reservation:

```
price                 1595.49
invoiceItems          present
invoiceItems.amount   1595.49
invoiceItems.lineTotal 1595.49
commission            0
tax                   0
deposit               0
apiSourceId           19
channel               booking
providerStatus        confirmed
```

| question | answer |
|---|---|
| Is `price` gross (guest-paid) or net of the channel commission? | **Gross, as far as can be told.** `price`, `invoiceItems.amount` and `invoiceItems.lineTotal` all agree at 1595.49, so there is no second figure anywhere that could be the net. Treated as gross booking value, and nothing is derived from it as net. |
| Is a commission field present at all? | Present, and **zero** — which is the important finding. See the warning below. |
| Are taxes broken out? | No. `tax` is 0 and no VAT or Kurtaxe breakdown appears anywhere in the payload. Nothing computes a tax figure from this source. |
| Are fees separate fields, invoice items, or neither? | **Neither, on this reservation.** No fee field carried a value and the invoice items reproduce the room charge only. |
| What does `invoiceItems` contain? | One line matching the total, with `amount` and `lineTotal`. It is not a settlement breakdown. |
| Is there a payout-side field? | **No.** Nothing in the reservation describes a payout, its status or its date. |
| Observed `paymentStatus` values | None reported on this reservation. |
| Does `apiSourceId = 19` hold on a real Booking.com booking? | **Yes — confirmed live.** The normalisation in `lib/integrations/beds24/reservations.ts` is correct as written. |

### The warning that matters more than any row above

> **`commission: 0` is not evidence that Booking.com charged zero commission.**
> It is evidence that **Beds24 was not told**. Booking.com's commission is
> agreed in the Booking.com extranet and deducted at settlement; it is not part
> of the reservation object that reaches Beds24.
>
> Anything that subtracted this zero and called the result "net revenue" would
> overstate earnings by the entire commission — on the order of 15% of gross.
> Nothing in this repository does. `/admin/performance` reports **gross booking
> value** and renders commission, net payout, payout status and tax as
> **"Not yet reconciled"**, and `lib/admin/performance.ts` carries no
> `netCents` or `commissionCents` field at all so that the mistake cannot be
> made by accident. A test asserts their absence.

### What is still needed for real net revenue

The reservation is the wrong source and no amount of reading it harder will
help. The missing facts live in the **Booking.com payout / statement data**:
commission actually charged, the payout amount, the payout date, its status,
and any adjustments. Two candidate sources, neither built:

1. The monthly Booking.com statement, imported through the existing finance
   import pipeline (`docs/finance/imports.md`) — the same road every other
   reconciled figure already travels.
2. The Booking.com Partner API, if BoLaGio has access, as a scheduled read.

Until one exists, the split holds: `/admin/performance` is gross and
operational, `/admin/finance` is reconciled and authoritative, and the two
are never added together.

## 6. Legal note

Reading a guest's reservation is processing personal data under the GDPR, even
transiently. Three things keep that proportionate, and all three are load-bearing:

* it happens on **staging only**, against the real Beds24 account but never on
  the production deployment;
* **nothing is persisted** — no database write, no log line carrying a guest
  fact (the logger's allow list would drop one anyway), no provider body in an
  error;
* the endpoint is **temporary** and is removed once §5 is filled in.

If it is ever proposed that this run on production, that is a different decision
and needs a different answer than this document gives.
