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

  /* ── Finance foundation (2026-09-22). Accounting records: § 147 AO governs; nothing deletes. ── */
  ...financeClasses(),
];

/**
 * Finance tables. Two rules apply to all of them: they are accounting
 * records or their evidence (§ 147 AO / § 257 HGB — 8 years for vouchers and
 * invoices, 10 years for books and annual accounts, from the end of the
 * calendar year), and they hold NO guest personal data by design: a revenue
 * row carries the booking reference, an invoice carries the recipient the
 * law requires on it (§ 14 Abs. 4 Nr. 1 UStG), nothing else.
 */
function financeClasses(): RetentionClass[] {
  const voucher = `8 years from the end of the calendar year (§ 147 Abs. 1 Nr. 4, Abs. 3 AO as amended 2025); planning date — ${NEEDS}`;
  const books = `10 years from the end of the calendar year (§ 147 Abs. 1 Nr. 1, Abs. 3 AO; § 257 HGB) — ${NEEDS}`;
  const reference = 'Master/reference data; kept while in use, historic rows kept for reproducibility of past figures.';
  const c = (table: string, category: DataCategory, purpose: string, proposedRetention: string, personalColumns: string[] = [], legalBasisHint = 'Art. 6(1)(c) GDPR with § 147 AO'): RetentionClass => ({
    table, category, purpose, personalColumns, proposedRetention, legalBasisHint, mechanism: 'manual, documented',
  });
  return [
    c('bolagio_finance_tax_codes', 'configuration', 'Effective-dated VAT tax codes the ledger lines reference.', reference),
    c('bolagio_finance_categories', 'configuration', 'Management P&L categories and the proposed DATEV mapping.', reference),
    c('bolagio_finance_tax_rates', 'configuration', 'Effective-dated KSt/Soli/GewSt rates and the Bayreuth Hebesatz.', reference),
    c('bolagio_finance_policy', 'configuration', 'Effective-dated finance/tax policy (filing frequency, reserve policy).', reference),
    c('bolagio_finance_periods', 'transaction_evidence', 'Accounting periods and their lock state; part of the audit trail of the books.', books),
    c('bolagio_finance_counterparties', 'configuration', 'Suppliers, OTAs, providers, authorities and their classification defaults. Business entities, not persons.', `As long as the business relationship plus the retention of the vouchers that name them — ${NEEDS}`),
    c('bolagio_finance_accounts', 'configuration', 'Money accounts (bank, PayPal, cash); IBAN masked.', reference),
    c('bolagio_finance_import_batches', 'transaction_evidence', 'Provenance of imported statements: file name, hash, counts.', voucher),
    c('bolagio_finance_import_rows', 'transaction_evidence', 'Staged rows of an import, kept as the raw source of what was posted.', `${voucher}; raw rows of REJECTED batches may be removed after review — ${NEEDS}`),
    c('bolagio_finance_documents', 'transaction_evidence', 'Registry of invoices, statements, notices and contracts (hash, type, retention class).', `Per retention_class on the row: invoices/vouchers 8 years, annual accounts/notices/contracts 10 years, letters 6 years — ${NEEDS}`),
    c('bolagio_finance_document_links', 'transaction_evidence', 'Which document evidences which record.', voucher),
    c('bolagio_finance_transactions', 'transaction_evidence', 'The economic facts: revenue, expenses, refunds, commissions, with provenance to their source.', books),
    c('bolagio_finance_transaction_lines', 'transaction_evidence', 'Lines of the economic facts: category, tax code, net/VAT/gross, allocation.', books),
    c('bolagio_finance_overrides', 'security_audit', 'Every manual and accountant override: old value, new value, reason, actor.', books, ['actor'], 'Art. 6(1)(c) GDPR (GoBD traceability); the actor is an operator, not a guest'),
    c('bolagio_finance_payments', 'transaction_evidence', 'Cash facts: money that moved on an account, by provider reference.', books),
    c('bolagio_finance_reconciliations', 'transaction_evidence', 'Explicit matches between facts, with rule and reason.', books),
    c('bolagio_finance_invoices', 'transaction_evidence', 'Guest invoices and credit notes with the recipient the law requires on them.', `${voucher} (§ 14b Abs. 1 UStG: 8 years) — ${NEEDS}`, ['recipient_name', 'recipient_address', 'recipient_company', 'recipient_vat_id'], 'Art. 6(1)(c) GDPR with § 14b UStG'),
    c('bolagio_finance_invoice_lines', 'transaction_evidence', 'Lines of guest invoices.', voucher),
    c('bolagio_finance_tax_periods', 'transaction_evidence', 'One row per tax type and period with its status.', books),
    c('bolagio_finance_tax_estimates', 'transaction_evidence', 'Append-only stages of each tax figure with the calculation basis.', books),
    c('bolagio_finance_tax_adjustments', 'transaction_evidence', 'Accountant-entered adjustments to the tax basis.', books),
    c('bolagio_finance_tax_notices', 'transaction_evidence', 'Official tax notices and their assessed amounts.', books),
    c('bolagio_finance_tax_notice_dues', 'transaction_evidence', 'Due dates and amounts from tax notices.', books),
    c('bolagio_finance_tax_payments', 'transaction_evidence', 'Tax payments made, by type and period.', books),
    c('bolagio_finance_reserves', 'operational_telemetry', 'Cash declared as reserved by management, as of a date.', `Historic declarations kept for the management record; 3 years proposed — ${NEEDS}`),
    c('bolagio_finance_assets', 'transaction_evidence', 'Asset candidates and confirmed fixed assets.', `${books}; for the life of the asset plus 10 years — ${NEEDS}`),
    c('bolagio_finance_exports', 'security_audit', 'Audit of every export: kind, period, generator version, hash. No file content.', books),
    c('bolagio_minibar_products', 'configuration', 'Minibar product catalogue with tax code and prices.', reference),
    c('bolagio_minibar_movements', 'transaction_evidence', 'Stock movements; sales are the source of minibar revenue facts.', books),
    c('bolagio_finance_turnover_costs', 'operational_telemetry', 'Expected cleaning cost per turnover, linked to the actual invoice line when it arrives.', `As long as the turnover record (24 months proposed) — ${NEEDS}`),
  ];
}

export function retentionClassFor(table: string): RetentionClass | undefined {
  return RETENTION_CLASSES.find((c) => c.table === table);
}

/** The tables that hold data a subject-access request must cover. */
export function personalDataTables(): string[] {
  return RETENTION_CLASSES.filter((c) => c.personalColumns.length > 0).map((c) => c.table);
}
