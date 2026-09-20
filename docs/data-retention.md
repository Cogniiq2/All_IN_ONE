# Data retention — classification

`lib/retention/policy.ts` classifies every `bolagio_*` table: what it holds,
the purpose, the personal-data columns, a proposed retention period and the
legal footing the records of processing should cite. `tests/retention.test.ts`
proves that every table in the migrations is classified and that no
migration or scheduled code path deletes guest data.

**Nothing deletes.** Every class has mechanism `manual, documented`. A
retention rule that is wrong in the deleting direction cannot be undone, and
the periods below are proposals for the company's adviser, not decisions.

## 1. Classes

| Table | Category | Personal columns | Proposed retention |
|---|---|---|---|
| `bolagio_booking_intents` | guest personal data | name, email, phone, country, locale | 10 years for the commercial record (§ 147 AO / § 257 HGB); contact columns pseudonymised once no longer needed — NEEDS CONFIRMATION |
| `bolagio_message_deliveries` | guest personal data | masked destination, hash | with the parent record — NEEDS CONFIRMATION |
| `bolagio_payment_events` | transaction evidence | provider payload | 10 years; payload reduction earlier — NEEDS CONFIRMATION |
| `bolagio_booking_intent_events`, `bolagio_external_operations`, `bolagio_guest_events` | transaction evidence / telemetry | none | with the parent record — NEEDS CONFIRMATION |
| `bolagio_reconciliation_jobs`, `bolagio_outbox_events` | telemetry | none | 12 months after resolution — NEEDS CONFIRMATION |
| `bolagio_turnovers`, `bolagio_turnover_events` | telemetry | staff names | 24 months — NEEDS CONFIRMATION |
| `bolagio_integration_events` | telemetry | provider payload | 90 days — NEEDS CONFIRMATION |
| `bolagio_scheduler_runs` | telemetry | none | 90 days — NEEDS CONFIRMATION |
| `bolagio_integration_health` | telemetry | none | overwritten in place |
| `bolagio_admin_audit_log` | security audit | operator email | operator relationship + limitation period — NEEDS CONFIRMATION |
| `bolagio_operators` | security audit | email, name | deactivate, keep for the audit trail |
| `bolagio_units`, `bolagio_unit_integrations`, `bolagio_unit_inventory_days` | configuration | none | master data / rolling cache |
| `bolagio_invoice_sequences` | transaction evidence | none | 10 years with the invoices |

## 2. Subject-access requests

`personalDataTables()` returns the tables a request must reach. Guest data
is keyed by the booking reference and the email on the intent; the message
ledger holds only a masked destination and a hash, so a request is answered
from `bolagio_booking_intents` and the provider payloads.

## 3. What is deliberately not built

- Scheduled deletion or anonymisation.
- A "delete guest" action in BoLaGio Control.
- Export of a guest's data as a file.

Each needs the periods above confirmed first; then the mechanism is a
migration adding a `pseudonymised_at` column and a scheduled function, with
its own runbook and rollback.
