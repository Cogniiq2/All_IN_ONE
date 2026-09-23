# BoLaGio compliance register — website, direct booking, Bayreuth

**Status:** research of 23 Sep 2026. **This is not legal advice.** It records
what engineering found and implemented. Every open item has its question for
counsel, the tax adviser or the authority in `LEGAL_REVIEW_REQUIRED.md`.

**How far the sources were checked.** The research had to rely on web-search
results: from this environment the primary statute sites
(gesetze-im-internet.de, gesetze-bayern.de, eur-lex, bayreuth.de) refused the
connection. So:
- **(search)** means several independent, mostly official or chamber sources
  agreed.
- **UNVERIFIED** means it rests on background knowledge alone.

Before relying on any row, **check it against the primary text.**

Legend: **M** mandatory · **R** strongly recommended · **U** uncertain,
needs counsel, the tax adviser or the authority.

---

## A. Impressum (§ 5 DDG)

| Item | Class | State in code | Source |
|---|---|---|---|
| Name and legal form, address for service, all Geschäftsführer, register court and HRB, email plus a second fast channel, USt-IdNr. if issued | M | Read from `lib/legal/company.ts`; the gaps are shown visibly on the page. **Missing: address, directors, register, email** | § 5 DDG, in force since 14.05.2024 (search); IHK Nord Westfalen |
| Supervisory authority only if the activity needs a permit | U | not shown | § 5 Abs. 1 Nr. 3 DDG (search) |
| EU ODR platform link | — | **Removed.** Reg. (EU) 2024/3228 repealed Reg. 524/2013; the platform closed 20.07.2025 | IHK Osnabrück, IHK Düsseldorf (search) |
| § 36 VSBG statement (exempt if ≤ 10 employees on 31.12. of the previous year) | M/R | config field, pending | § 36 VSBG (search); BfJ |
| § 18 Abs. 2 MStV person responsible, because the site publishes a journal | U | config field, pending | § 18 MStV (UNVERIFIED how it applies to a company blog) |

## B. Online booking and consumer law

| Item | Class | State in code |
|---|---|---|
| Accepted payment methods stated at the **start** of ordering (§ 312j Abs. 1 BGB) | M | ✅ The dialog subtitle says "Bezahlung sicher per PayPal" |
| Essential characteristics, total price and additional costs **directly before** the button (§ 312j Abs. 2) | M | ✅ `CheckoutSummary`: apartment, dates, nights, guests, every line item, total, price statement, on-site charges |
| Button wording (§ 312j Abs. 3; CJEU C-249/21) | M | ✅ "Zahlungspflichtig buchen" / "Book and pay". "Verbindlich buchen" was removed. **Counsel to confirm** |
| Identity of the trader before the contract (Art. 246a § 1 Abs. 1 Nr. 2–3 EGBGB) | M | ✅ "Ihr Vertragspartner" line; **blocked** until the company data is complete |
| Cancellation terms before payment | M | ✅ Always rendered. **Fails closed** without an approved policy |
| No right of withdrawal (§ 312g Abs. 2 Nr. 9 BGB), and telling the guest so (Art. 246a § 1 Abs. 3 Nr. 1 EGBGB) | M | ✅ Approved notice rendered and stored. Online stays capped at `maxNights`. **Wording and `maxNights` pending** |
| Withdrawal button (§ 356a BGB, from 19.06.2026) | U | Not needed where no withdrawal right exists (search). Stays over `maxNights` go to the enquiry flow instead |
| AGB reachable before the contract (§ 305 Abs. 2 BGB); privacy notice linked | M | ✅ links in the checkout and the contact step |
| Booking AGB for concluded bookings | M | ❌ **Blocker.** `/agb` covers enquiries. Draft structure in `docs/legal/agb-booking-draft.md` |
| Confirmation on a durable medium with the contract terms (§ 312f Abs. 2) | M | ✅ The template requires the party, cancellation, withdrawal and AGB/privacy links, resolved **by the stored version**; it refuses to render without them |
| E-commerce duties (§ 312i, Art. 246c EGBGB): steps, correcting input errors, storage of the contract text, languages | M | Partly: a four-step rail, a back button at each step, DE/EN. **Counsel to confirm** whether the stored contract text needs its own statement |
| No pre-selected extras or pre-ticked boxes | M | ✅ none exist (tested) |
| Evidence of accepted terms | R | ✅ `terms_evidence` (versions, time, language) on each booking; the server refuses stale versions |
| Language consistency | R | ✅ Every checkout text is DE/EN from the same record |

## C. AGB

The current AGB are written for **enquiries**. Findings:

| Clause | Finding |
|---|---|
| Formation | Fine for enquiries. A concluded online booking needs its own clause: when the contract comes into being, and the role of the payment |
| Payment | "No payments through this website." True today; it must change with direct booking |
| Cancellation, no-show | Now reads the approved policy; pending |
| House rules, guest duties, check-in/out, damage, deposit | Not in the AGB ("provided with the confirmation"). If they are to bind the guest, they must be incorporated **before** the contract |
| Liability | Pending. Must not exclude liability for injury to life, body or health, or for gross negligence (§ 309 Nr. 7 BGB) |
| Force majeure, impossibility | Absent. Statute applies (§§ 275, 326 BGB) |
| Platform vs direct | Absent. Bookings via Booking.com or Airbnb are governed by the platform terms **and** BoLaGio's, as accepted there. Counsel to state which apply |
| Severability | Absent. § 306 BGB applies anyway; a clause is optional |

## D. GDPR / privacy

| Item | Class | State |
|---|---|---|
| Notice matches the processing | M | ✅ Rewritten against the code. **Pending: contracting entities, regions, retention periods** |
| Art. 28 agreement with Cloudflare, Supabase, Beds24, the n8n host (Cogniiq) and the SMTP provider | M | ❌ Contracts, not code. **Note:** the n8n instance runs at `n8n.cogniiq.co`, so Cogniiq is a processor of BoLaGio |
| Booking.com / Airbnb guests (Art. 14 GDPR): tell them within a month, or at first contact | M | ✅ Section 7 of the notice. **Operational:** link the notice in the first message sent through the platform |
| Booking.com's role | R | Separate controller (search: Booking.com privacy statement) |
| Beds24 offers an Art. 28 DPA | M | Sign it (search: beds24.com/dataprocessingagreement) |
| Records of processing (Art. 30) | M | Not code. `lib/retention/policy.ts` feeds it |
| Logs contain no personal data | R | ✅ allow-listed logger |
| Admin area | — | Internal; staff session cookie only. Not public-facing |

## E. Cookies and device storage (§ 25 TDDDG)

| Item | Class | State |
|---|---|---|
| No non-essential storage before consent | M | ✅ No analytics, no tag manager, no ad cookies (tested) |
| `localStorage` language choice | U → leans exempt | § 25 Abs. 2 Nr. 2 — strictly necessary for a function the user asked for (DSK OH Digitale Dienste v1.2, via search) |
| PayPal SDK only at the payment step | U → leans exempt | Loaded only when the payment button mounts. Disclosed in the notice |
| Google Maps | M | ✅ click-to-load, consent per page view |
| Cookie banner | — | **Not needed and not added.** Nothing requires consent before interaction |

## F. Residence Privileges and marketing email

| Item | Class | State |
|---|---|---|
| Benefit does not depend on consent (Art. 7 Abs. 4 GDPR, coupling ban) | M | ✅ tested |
| Box optional and unticked | M | ✅ tested |
| Double opt-in confirms the **consent** | M (BGH I ZR 164/09) | ✅ Since 2026-09-25. Previously an already-verified address could be given consent by anyone |
| Confirmation email carries no advertising | M (lower-court case law, search) | Template not built yet. Rule documented |
| Unsubscribe before any marketing (Art. 7 Abs. 3 GDPR; § 7 Abs. 3 Nr. 4 UWG) | M | ✅ Signed link, RFC 8058 one-click, and an audience query that refuses without it |
| Evidence: version, source, time, confirmation, withdrawal and its source | M (Art. 7 Abs. 1) | ✅ |
| No enumeration | R | ✅ Neutral answers on signup, verify and unsubscribe |
| Booking email ≠ marketing consent | M | ✅ No marketing path reads booking tables |
| Retention | M | Proposed, **pending** (`docs/data-retention.md`) |
| Feedback / review emails are advertising (BGH VI ZR 225/17) | M | ✅ suppressed until a basis is recorded |

## G. Pricing

| Item | Class | State |
|---|---|---|
| Total including VAT and all unavoidable components (§ 3 PAngV) | M | The Beds24 total, itemised. **Owners to confirm** it is complete (gated) |
| "inkl. MwSt." statement in distance selling (§ 6 PAngV) | M (search) | Via the approved price statement. Pending |
| Local levies | M if any | Bayreuth has no Kurbeitrag, and Bavaria bans overnight-stay tax (below). A tourism levy was proposed in 2025; **adoption unverified** |
| "ab" prices | M | Cannot render without a note on mandatory fees; none set today |
| Strike-through prices, 30-day lowest price (§ 11 PAngV) | — | § 11 applies to **goods** (search); none shown anyway |
| Review badge | R | "verified" wording removed (§ 5b Abs. 3 UWG) |

## H. Accessibility (BFSG)

| Item | Class | State |
|---|---|---|
| BFSG applies from 28.06.2025 to B2C e-commerce services, including online booking with payment | M **unless** micro-enterprise | Search: Bundesfachstelle Barrierefreiheit FAQ; the MLBF is the authority |
| Micro-enterprise exemption for services: fewer than 10 employees **and** turnover or balance sheet ≤ €2m (§ 3 Abs. 3 BFSG) | U | **BoLaGio to confirm** headcount and turnover |
| Fixed now | R | Focus ring contrast, progress-label contrast, `lang` attribute, phone "required" labelling and error, privacy link at collection, live region for the guest count. Existing: Radix focus trap, labelled fields, `aria-invalid` / `aria-describedby`, calendar day labels |
| Not audited here | — | A full WCAG 2.1 AA audit, including screen-reader testing of the calendar. Recommended even if exempt |

## I. Bayreuth and Bavaria

| Topic | Finding | Class | Source |
|---|---|---|---|
| **Zweckentfremdung** | The Bayreuth statute (2019) was declared **void** by the BayVGH (12 N 20.1726, 2021). Official portals (BayernPortal) still describe an 8-week rule. **Contradictory — current status unverified** | U | gesetze-bayern.de BayVGH decision; bayernportal.de; local press (search) |
| **Kurbeitrag** | Bayreuth is not a Kurort; none found | U | search |
| **Übernachtungsteuer** | Banned in Bavaria by the KAG amendment of 2023. The BayVerfGH rejected the challenge by Munich, Bamberg and Günzburg (reported Nov 2025). A BVerfG complaint was announced | M (awareness) | stadt.muenchen.de; beck-aktuell (search) |
| **Fremdenverkehrsbeitrag / tourism levy** | Proposed in Bayreuth in 2025; adoption not found | U | bayreuther-tagblatt.de (search) |
| **Meldeschein** | Since 01.01.2025 only **foreign** guests fill it in, on the day of arrival. Kept 12 months, then destroyed within 3 months. Applies to holiday flats | M | §§ 29, 30 BMG after BEG IV (search; IHA FAQ) |
| **Gewerbeanmeldung** | Likely required for a GmbH operating furnished short-term lets | U | search |
| **Change of use / building permit** | A holiday-flat use may need a Nutzungsänderung (§ 13a BauNVO). Building applications in Bayreuth are reported to go to the **Landratsamt** since 2025 | U | search |
| **Fire safety** | BayBStättV reportedly applies above **30 guest beds** and excludes Ferienwohnungen. General BayBO rules still apply | U | search |
| **VAT** | 7 % on short-term accommodation (§ 12 Abs. 2 Nr. 11 UStG). Breakfast and minibar 19 %. Cleaning usually 7 % as serving the letting — **tax adviser to confirm**. Kleinunternehmer thresholds from 2025: €25k / €100k | M / U | search; IHK München |
| **Retention of records** | Buchungsbelege **8 years** from 2025 (BEG IV). Books 10 years. Business letters 6 years | M | § 147 AO, § 257 HGB (search) |

**Rules from Munich, Berlin or Hamburg were not assumed to apply to Bayreuth.**
