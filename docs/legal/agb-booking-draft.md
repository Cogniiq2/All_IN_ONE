# Booking AGB — structure and intent for counsel (NOT a text)

**This is a brief, not terms and conditions.** It sets out what each clause of
the AGB for concluded bookings must do, as engineering understands the booking
flow, so that counsel drafts against the real process. The clauses are meant
to be balanced. Nothing here should be published as it stands.

Once approved, the text replaces `/agb` (or is published beside it), and its
version is entered in `BOOKING_TERMS_DOCUMENTS` in
`lib/legal/booking-terms.ts`.

---

## The process the AGB must describe (as implemented)

1. The guest chooses apartment, dates and party size. A **live** price comes
   from Beds24.
2. The guest enters name, email and phone, and sees the summary, the
   contracting party, the cancellation terms, the withdrawal notice and the
   links.
3. The guest presses **"Zahlungspflichtig buchen"**. BoLaGio then:
   - re-checks the price live,
   - holds the nights at Beds24 for a limited time (lease: minutes),
   - stores the term versions shown.
4. The PayPal button appears. The guest approves the payment and BoLaGio
   captures it.
5. After a successful capture BoLaGio confirms the reservation at Beds24. The
   guest receives the confirmation with the contract terms by email.
6. If the payment is not completed, the hold lapses and nothing is owed. If
   the payment succeeds but confirmation at Beds24 fails, the guest has paid
   and a person resolves it. The refund path exists.

**The question counsel must settle first:** at which of steps 3–5 is the
contract concluded? The button wording, the "paid but not yet confirmed"
state and the refund obligations all follow from that answer.

---

## Clauses

| § | Clause | Intent (balanced) | Flag |
|---|---|---|---|
| 1 | Scope; contracting party | BoLaGio GmbH (identity from `lib/legal/company.ts`). Covers direct bookings on bolagio.de. Bookings through a platform are governed by what the guest accepted there | **Counsel:** how these AGB relate to Booking.com and Airbnb bookings |
| 2 | Conclusion of contract | Mirrors the process above. The website presentation is not an offer. The guest's click is the offer; BoLaGio accepts by `[capture / confirmation]` | **Counsel** |
| 3 | Prices and payment | Total price as shown, including `[VAT, cleaning]`. Payment in full via PayPal at booking. No surcharge for the payment method (§ 270a BGB) | Tax adviser: VAT wording |
| 4 | Cancellation by the guest; no-show | Incorporates the approved `CANCELLATION_POLICIES` text verbatim. The guest may always show that the loss was lower | **Counsel:** § 309 Nr. 5 BGB |
| 5 | No right of withdrawal | Incorporates the approved `WITHDRAWAL_NOTICES` text. Longer stays are handled by enquiry | **Counsel:** the `maxNights` boundary |
| 6 | Arrival and departure | Check-in from `[15:00]`, check-out by `[11:00]` (from `bolagio_units` / house rules). Key handover procedure | Owners: times |
| 7 | Occupancy | Maximum number of guests per apartment (from the unit record). No sub-letting | — |
| 8 | House rules | Incorporated **before** the contract (linked in the checkout), not only sent afterwards. Quiet hours per the building's rules. No parties. Smoking `[…]`. Pets `[…]` | Owners: the actual rules. **Counsel:** incorporation |
| 9 | Care of the apartment; damage | The guest is liable for damage they are at fault for, under statute. No strict liability, no blanket flat fees. Deposit **only if** BoLaGio decides to take one; then amount, form and return deadline | Owners: deposit yes/no |
| 10 | Guest registration | Foreign guests complete the registration form on arrival (§ 29 BMG) | — |
| 11 | BoLaGio's liability | Unlimited for injury to life, body or health, and for intent or gross negligence. For slight negligence, only for breach of essential contractual duties, limited to the typical foreseeable damage (§ 309 Nr. 7 BGB) | **Counsel** |
| 12 | Unavailability, force majeure | If the apartment cannot be provided: BoLaGio informs the guest immediately, refunds in full, and offers an alternative where one exists. No clause that shifts risk to the guest beyond statute | **Counsel** |
| 13 | Data protection | Reference to `/datenschutz` | — |
| 14 | Dispute resolution | § 36 VSBG statement (see `checkout-wording-for-approval.md` §5) | Owners |
| 15 | Final provisions | German law, without the consumer protection of the guest's home country being removed (Art. 6 Rome I). No jurisdiction clause against consumers. Optional severability | **Counsel** |

**Deliberately avoided** — engineering flags these as aggressive and did not
propose them:
- cancellation fees that ignore saved expenses
- blanket cleaning or damage fees
- liability exclusions for personal injury
- "the guest accepts the house rules by arriving"
- a jurisdiction clause at BoLaGio's seat against consumers
