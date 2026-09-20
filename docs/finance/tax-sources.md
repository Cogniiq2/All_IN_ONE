# Tax sources and certainty register

Checked on **20 September 2026** from this build environment. The environment's egress proxy blocks
`gesetze-im-internet.de`, `bundesfinanzministerium.de`, `bayreuth.de` and most publishers, so most
items below were confirmed through **secondary sources found by web search**, not the primary text.
Every row says so. Categories:

- **LEGALLY CERTAIN** — statute or final court decision, confirmed by more than one consistent source.
- **CONFIGURABLE POLICY** — depends on the company's facts or elections; a policy value the adviser sets.
- **ESTIMATE** — a system computation from the above, always staged `system_estimate`.
- **ACCOUNTANT-REVIEW REQUIRED** — a treatment the system will not decide.
- **UNKNOWN / UNVERIFIED** — could not be confirmed from a primary source here.

| # | Rule | Value in the system | Effective | Legal basis | Certainty | Config dependency | Sources checked |
|---|---|---|---|---|---|---|---|
| 1 | Reduced rate for short-term accommodation | 7 % (`DE_ACCOMMODATION_REDUCED`) | since 1 Jan 2010 | § 12 Abs. 2 Nr. 11 S. 1 UStG | LEGALLY CERTAIN | — | Haufe, smartsteuer (secondary) |
| 2 | Aufteilungsgebot: services not directly serving the letting (breakfast, parking, wellness) at 19 % | ancillary components parked `DE_ANCILLARY_REVIEW` | — | § 12 Abs. 2 Nr. 11 S. 2 UStG; BFH referral of 10 Jan 2024; CJEU decided the German rule is compatible with Art. 98 MwStSystRL | LEGALLY CERTAIN that the rule stands; **ACCOUNTANT-REVIEW REQUIRED** whether BoLaGio's mandatory final-cleaning fee is a separate service | — | Haufe, PwC, Otto Schmidt, BFH decision page (secondary summaries) |
| 3 | Standard rate | 19 % | since 2007 | § 12 Abs. 1 UStG | LEGALLY CERTAIN | — | — |
| 4 | Restaurant and catering meals at 7 %, beverages 19 % | not used for BoLaGio's supplies; minibar snacks are deliveries under Anlage 2 (7 %), beverages 19 % | 1 Jan 2026 | § 12 Abs. 2 Nr. 15 UStG (Steueränderungsgesetz 2025) | LEGALLY CERTAIN (several IHK sources, Bundesregierung) | — | IHK Frankfurt, IHK Darmstadt, Bundesregierung |
| 5 | Reverse charge for services from foreign suppliers | `DE_REVERSE_CHARGE`, suggested never auto-verified | — | § 13b Abs. 1, Abs. 2 Nr. 1, Abs. 5 UStG; § 15 Abs. 1 Nr. 4 | LEGALLY CERTAIN as a rule; ACCOUNTANT-REVIEW REQUIRED per supplier (issuing entity, VAT id) | counterparty VAT id | — |
| 6 | Small business scheme thresholds | 25 000 € / 100 000 € | 1 Jan 2025 | § 19 UStG i.d.F. JStG 2024; BMF letter 18 Mar 2025 | LEGALLY CERTAIN; whether BoLaGio applies it is CONFIGURABLE POLICY (`small_business_scheme`) | `INVOICE_SMALL_BUSINESS` | IHK Stuttgart, IHK München, DATEV-Magazin, BMF PDF link |
| 7 | UStVA deadline | 10th day after the period | — | § 18 Abs. 1 UStG | LEGALLY CERTAIN | `vat_filing_frequency` | Finanzamt Hessen, NWB |
| 8 | Dauerfristverlängerung + Sondervorauszahlung 1/11 | + 1 month; SVZ due 10 Feb | — | § 18 Abs. 6 UStG; §§ 46–48 UStDV | LEGALLY CERTAIN; election is CONFIGURABLE POLICY (`dauerfristverlaengerung`) | policy | Berlin.de, Haufe, NWB |
| 9 | Filing frequency (monthly / quarterly / annual) | policy, default quarterly | — | § 18 Abs. 2, 2a UStG (previous-year VAT thresholds) | CONFIGURABLE POLICY — depends on last year's VAT | policy | — |
| 10 | Working-day shift of deadlines | next working day after Sat/Sun/Bavarian holiday | — | § 108 Abs. 3 AO; Bavarian holidays incl. Epiphany, Corpus Christi, Assumption (Bayreuth: yes), All Saints | LEGALLY CERTAIN; Assumption Day applies in predominantly Catholic municipalities — Bayreuth is listed as such in the system: **UNVERIFIED** here | — | — |
| 11 | KSt rate | 15 % | until 31 Dec 2027 | § 23 Abs. 1 KStG | LEGALLY CERTAIN | — | Haufe |
| 12 | KSt step-down 14/13/12/11/10 % | seeded, review-flagged | 2028–2032 | § 23 Abs. 1 KStG i.d.F. Gesetz für ein steuerliches Investitionssofortprogramm of 14 Jul 2025 (BGBl. 2025 I, published 18 Jul 2025) | LEGALLY CERTAIN that it is enacted (Haufe, EY, Dornbach); kept review-flagged because the exact BGBl citation was not read here and the horizon is 2028+ | — | Haufe, EY, Dornbach |
| 13 | Solidaritätszuschlag on KSt | 5.5 % | since 1998 | § 4 S. 1 SolzG 1995; BVerfG 26 Mar 2025, 2 BvR 1505/20 | LEGALLY CERTAIN | — | bundesverfassungsgericht.de (listing), BMF Monatsbericht 06/2025, ETL |
| 14 | GewSt Messzahl | 3.5 % | since 2008 | § 11 Abs. 2 GewStG | LEGALLY CERTAIN | — | — |
| 15 | GewSt Hebesatz Bayreuth | **390 % placeholder, review_required** | 2025 (390 %) per one source; 2026 quoted as 370 % and as 395 % by others | Hebesatzsatzung der Stadt Bayreuth | **UNKNOWN / UNVERIFIED** — conflicting secondary sources; official satzung not reachable | must be recorded in `tax_rates` with source | gewerbesteuer.de (390 %, 2025), papierkram.de (370 %, 2026), freelancer-werkzeuge-hub.de (395 %, May 2026), Nordbayerischer Kurier (increase from 1 Jan 2023) |
| 16 | No GewSt Freibetrag for a GmbH; Gewerbeertrag rounded down to 100 € | implemented | — | § 11 Abs. 1 S. 3 GewStG | LEGALLY CERTAIN | — | — |
| 17 | KSt advance payment dates | 10 Mar / Jun / Sep / Dec | — | § 31 Abs. 1 KStG i.V.m. § 37 Abs. 1 EStG | LEGALLY CERTAIN (statute); **not re-read here** | — | — |
| 18 | GewSt advance payment dates | 15 Feb / May / Aug / Nov | — | § 19 Abs. 1 GewStG | LEGALLY CERTAIN (statute); **not re-read here** | — | — |
| 19 | Return deadlines with adviser representation | planning date 31 Jul of the following year in the system; statutory date later | — | § 149 Abs. 3 AO (and the temporary extensions of recent years) | CONFIGURABLE POLICY — adviser sets the real date | policy | — |
| 20 | Invoice mandatory contents | 11 checks | — | § 14 Abs. 4 UStG; § 14b (copy) | LEGALLY CERTAIN | `INVOICE_*` | — |
| 21 | Retention: invoices and vouchers 8 years; books 10; letters 6 | implemented | 1 Jan 2025 | § 147 Abs. 1, 3, 4 AO; § 14b Abs. 1 UStG; § 257 HGB; BEG IV (BGBl. 2024 I Nr. 323) | LEGALLY CERTAIN | — | Haufe, Deloitte, NWB, bbh-blog |
| 22 | E-invoice: receive since 2025; issue from 2027 (> 800 000 € prior-year turnover) / 2028 (all) | gate off; model only | 1 Jan 2025 / 2027 / 2028 | § 14 Abs. 1, § 27 Abs. 38 UStG (Wachstumschancengesetz) | LEGALLY CERTAIN | `FINANCE_EINVOICE_*` | BMF FAQ, IHK Frankfurt, IHK Stuttgart, ETL |
| 23 | GoBD | procedural documentation = this doc set | 28 Nov 2019, amended 11 Mar 2024 and 14 Jul 2025 | BMF letters | LEGALLY CERTAIN as administrative guidance | — | BMF PDFs (links), NWB, KPMG, Deloitte |
| 24 | Municipal accommodation tax in Bayreuth | none; `local_levy_enabled=false` | since Mar 2023 (KAG amendment); BayVerfGH dismissed the cities' challenge in Nov 2025 | Art. 3 Abs. 3 KAG Bayern (as amended); BayVerfGH decision | LEGALLY CERTAIN that no municipal Übernachtungsteuer may be levied in Bavaria today; Bayreuth had only *discussed* a tourism levy | policy | bayern.de, StMI, NWB, Bayreuther Tagblatt |
| 25 | DATEV-Format Buchungsstapel | mapping proposals, version 700, category 21 | — | DATEV developer documentation | LEGALLY irrelevant / **technically UNVERIFIED** — the full field list was not read from developer.datev.de | `FINANCE_DATEV_*` | developer.datev.de (link), community write-ups |
| 26 | Depreciation, GWG, provisions, loss carry-forward, § 8b, § 4h | not computed | — | EStG / KStG | ACCOUNTANT-REVIEW REQUIRED (not modelled) | — | — |

Sources found by search (secondary): Haufe, EY, Dornbach, IHK Frankfurt / Darmstadt / Stuttgart /
München, Bundesregierung, BMF FAQ e-Rechnung, BMF Monatsbericht 06/2025, ETL, Deloitte Tax News, NWB,
KPMG, PwC, Otto Schmidt, bundesverfassungsgericht.de press release bvg25-030, bayern.de, StMI Bayern,
Bayreuther Tagblatt, Nordbayerischer Kurier, gewerbesteuer.de, papierkram.de.

**Action for the Steuerberater:** confirm rows 2, 9, 10, 12, 15, 19 and provide the DATEV account
map (row 25). Row 15 is the only one that changes an amount in the estimate today.
