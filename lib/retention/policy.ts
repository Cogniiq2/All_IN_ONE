/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATA RETENTION — the classification, not the deletion.
 *
 * Every BoLaGio table is assigned a class: what it holds, why it is kept,
 * which retention period is proposed and on which legal footing. The
 * periods are PROPOSALS for the company's records of processing (Art. 30
 * GDPR) and its tax adviser; nothing in this repository deletes, anonymises
 * or exports anything on a schedule. A retention rule that is wrong in the
 * deleting direction is unrecoverable, so the mechanism column of every
 * class says `manual, documented` until a decision is recorded here.
 *
 * `tests/retention.test.ts` proves two things: every `bolagio_*` table in
 * the migrations is classified, and no migration or scheduled code path
 * deletes guest data.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type DataCategory =
  | 'guest_personal_data'
  | 'transaction_evidence'
  | 'operational_telemetry'
  | 'security_audit'
  | 'configuration'
  | 'provider_identifiers';

export interface RetentionClass {
  table: string;
  category: DataCategory;
  /** What the rows are for; the purpose limitation the records of processing must state. */
  purpose: string;
  /** Columns that identify a person directly. Empty when none. */
  personalColumns: string[];
  /** Proposed period. Always flagged; a decision is recorded by replacing the flag. */
  proposedRetention: string;
  legalBasisHint: string;
  /** How rows would leave the system. Never automated in this version. */
  mechanism: 'manual, documented';
}

const NEEDS = 'NEEDS CONFIRMATION';

export const RETENTION_CLASSES: readonly RetentionClass[] = [
  {
    table: 'bolagio_booking_intents',
    category: 'guest_personal_data',
    purpose: 'Fulfil and evidence a reservation and its payment; the commercial record of the stay.',
    personalColumns: ['guest_first_name', 'guest_last_name', 'guest_email', 'guest_phone', 'country', 'locale'],
    proposedRetention: `10 years from the end of the calendar year of the stay for the commercial/tax record (§ 147 AO, § 257 HGB); personal contact columns pseudonymised after the retention of the contract record no longer requires them — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(b) GDPR (contract), Art. 6(1)(c) with § 147 AO for the retention',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_booking_intent_events',
    category: 'transaction_evidence',
    purpose: 'The lifecycle of each reservation, for reconciliation and dispute evidence.',
    personalColumns: [],
    proposedRetention: `As long as the parent intent — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR (evidence of the transaction); follows the parent record',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_payment_events',
    category: 'transaction_evidence',
    purpose: 'Verified provider webhooks; proof of what the payment provider said and when.',
    personalColumns: ['payload (may carry the payer name/email as sent by the provider)'],
    proposedRetention: `10 years (accounting record) — ${NEEDS}; the raw payload could be reduced to the verified fields earlier — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(c) GDPR with § 147 AO',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_external_operations',
    category: 'operational_telemetry',
    purpose: 'Idempotency ledger for every provider write; the record that prevents a blind retry.',
    personalColumns: [],
    proposedRetention: `As long as the parent intent, or 24 months for orphaned rows — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR (integrity of the booking system)',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_reconciliation_jobs',
    category: 'operational_telemetry',
    purpose: 'Queue of read-first repairs and their outcomes.',
    personalColumns: [],
    proposedRetention: `12 months after resolution — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_outbox_events',
    category: 'operational_telemetry',
    purpose: 'Events handed to the automation platform; carries references, never guest contact data.',
    personalColumns: [],
    proposedRetention: `12 months after acknowledgement — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_message_deliveries',
    category: 'guest_personal_data',
    purpose: 'One row per guest message attempted: proof of exactly-one send. Stores a masked destination and a hash, never the address or the body.',
    personalColumns: ['destination_masked', 'destination_hash'],
    proposedRetention: `As long as the parent intent — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(b) GDPR (communication required by the contract)',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_guest_events',
    category: 'operational_telemetry',
    purpose: 'Dedup ledger for scheduled guest events; intent id and kind only.',
    personalColumns: [],
    proposedRetention: `As long as the parent intent — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_turnovers',
    category: 'operational_telemetry',
    purpose: 'Cleaning turnovers derived from confirmed departures; assignee is a staff name, not guest data.',
    personalColumns: ['assigned_to (staff)', 'done_by (staff)'],
    proposedRetention: `24 months — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR; staff data under the employment relationship',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_turnover_events',
    category: 'operational_telemetry',
    purpose: 'Audit of turnover status changes.',
    personalColumns: ['actor (operator email or staff name)'],
    proposedRetention: `24 months — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_integration_events',
    category: 'operational_telemetry',
    purpose: 'Raw channel-manager webhooks, for diagnosis.',
    personalColumns: ['payload (may carry guest data as sent by the channel manager)'],
    proposedRetention: `90 days — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_integration_health',
    category: 'operational_telemetry',
    purpose: 'Last observation per provider signal; one row per signal, overwritten.',
    personalColumns: [],
    proposedRetention: 'Overwritten in place; nothing accumulates.',
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_scheduler_runs',
    category: 'operational_telemetry',
    purpose: 'Heartbeat per scheduled job.',
    personalColumns: [],
    proposedRetention: `90 days — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_admin_audit_log',
    category: 'security_audit',
    purpose: 'Who did what in BoLaGio Control. Operator identity, never guest data.',
    personalColumns: ['operator_email'],
    proposedRetention: `As long as the operator relationship plus the limitation period — ${NEEDS}`,
    legalBasisHint: 'Art. 6(1)(f) GDPR (security), Art. 32',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_operators',
    category: 'security_audit',
    purpose: 'The operator allowlist.',
    personalColumns: ['email', 'display_name'],
    proposedRetention: 'Until the operator is removed; deactivation before deletion so the audit log keeps its actor.',
    legalBasisHint: 'Art. 6(1)(b)/(f) GDPR (employment / access control)',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_units',
    category: 'configuration',
    purpose: 'The property registry and house rules.',
    personalColumns: [],
    proposedRetention: 'Master data; kept.',
    legalBasisHint: 'not personal data',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_unit_integrations',
    category: 'provider_identifiers',
    purpose: 'Channel-manager mapping per unit.',
    personalColumns: [],
    proposedRetention: 'Master data; kept.',
    legalBasisHint: 'not personal data',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_unit_inventory_days',
    category: 'configuration',
    purpose: 'Cached availability; regenerated from the channel manager.',
    personalColumns: [],
    proposedRetention: 'Rolling horizon; rows before today may be dropped by a future sync — not implemented.',
    legalBasisHint: 'not personal data',
    mechanism: 'manual, documented',
  },
  {
    table: 'bolagio_invoice_sequences',
    category: 'transaction_evidence',
    purpose: 'Gapless invoice numbering per series.',
    personalColumns: [],
    proposedRetention: '10 years with the invoices (§ 147 AO).',
    legalBasisHint: 'Art. 6(1)(c) GDPR',
    mechanism: 'manual, documented',
  },
];

export function retentionClassFor(table: string): RetentionClass | undefined {
  return RETENTION_CLASSES.find((c) => c.table === table);
}

/** The tables that hold data a subject-access request must cover. */
export function personalDataTables(): string[] {
  return RETENTION_CLASSES.filter((c) => c.personalColumns.length > 0).map((c) => c.table);
}
