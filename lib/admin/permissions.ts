/**
 * Operator roles and what each may do.
 *
 * Pure and small on purpose. Every server action and every protected query
 * asks `can(role, capability)` and nothing else; the answer never comes from
 * a client component, a cookie claim or a query string.
 *
 * Roles mirror the `role` check constraint on `bolagio_operators`.
 *
 * Finance capabilities are a separate family. The role model is deliberately
 * NOT widened with a fourth role: `viewer` reads (operations and finance),
 * `operator` works the finance desk (post, classify, reconcile, export) and
 * `admin` additionally holds the accountant path (lock, filed/assessed
 * stages, policy). Should a real Steuerberater login be needed, the clean
 * step is a role `accountant` granted exactly the `finance.*` family — the
 * capability names are already the seam.
 */

export const OPERATOR_ROLES = ['viewer', 'operator', 'admin'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export type Capability =
  /** Read every operations surface. */
  | 'view'
  /** Queue and run the read-first reconciliation for one booking. */
  | 'reconcile_booking'
  /** Run one full reconciliation pass — the same one the scheduler runs. */
  | 'run_reconciliation_pass'
  /** Cancel a booking that carries NO payment evidence (the release the sweep already performs). */
  | 'cancel_unpaid_booking'
  /** Authorise the cancellation of a booking with payment evidence, recording a refund decision. Gated by configuration as well. */
  | 'cancel_paid_booking'
  /** Change a turnover's status or assignee. */
  | 'manage_cleaning'
  /** Requeue a failed guest-message delivery or a dead-lettered automation event. */
  | 'requeue_automation'
  /** Reserved: manage the operator allowlist. No UI exists for it yet. */
  | 'manage_operators'
  /* ── Finance (docs/finance/architecture.md §access) ─────────────────── */
  /** Read every finance screen (read-only, like `view`). Tighten by removing it from `viewer` if a read-only operations role must not see money. */
  | 'finance.view'
  /** Post expenses, upload documents, record minibar movements, run ingestion, import statements, link documents. */
  | 'finance.edit'
  /** Classify: tax code, category, input VAT, allocation, asset state; accept/reject reconciliation suggestions; move a period to review. */
  | 'finance.review'
  /** The accountant path: lock lines and periods, record reviewed/filed/assessed/paid tax stages, tax adjustments, unlock. */
  | 'finance.tax_review'
  /** Generate exports and management reports. */
  | 'finance.export'
  /** Change finance policy (filing frequency, Hebesatz rows, reserve policy, counterparty rules). */
  | 'finance.configure';

const GRANTS: Readonly<Record<OperatorRole, readonly Capability[]>> = {
  viewer: ['view', 'finance.view'],
  operator: ['view', 'reconcile_booking', 'run_reconciliation_pass', 'cancel_unpaid_booking', 'manage_cleaning', 'requeue_automation',
    'finance.view', 'finance.edit', 'finance.review', 'finance.export'],
  admin: ['view', 'reconcile_booking', 'run_reconciliation_pass', 'cancel_unpaid_booking', 'cancel_paid_booking', 'manage_cleaning', 'requeue_automation', 'manage_operators',
    'finance.view', 'finance.edit', 'finance.review', 'finance.tax_review', 'finance.export', 'finance.configure'],
};

export function isOperatorRole(value: unknown): value is OperatorRole {
  return typeof value === 'string' && (OPERATOR_ROLES as readonly string[]).includes(value);
}

/** Unknown roles can do nothing. A new role added in the database before this file learns it is read-only at most. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!isOperatorRole(role)) return false;
  return GRANTS[role].includes(capability);
}

export const ROLE_LABEL: Readonly<Record<OperatorRole, string>> = {
  viewer: 'Viewer',
  operator: 'Operator',
  admin: 'Administrator',
};
