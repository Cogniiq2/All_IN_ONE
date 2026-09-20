/**
 * Operator roles and what each may do.
 *
 * Pure and small on purpose. Every server action and every protected query
 * asks `can(role, capability)` and nothing else; the answer never comes from
 * a client component, a cookie claim or a query string.
 *
 * Roles mirror the `role` check constraint on `bolagio_operators`.
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
  | 'manage_operators';

const GRANTS: Readonly<Record<OperatorRole, readonly Capability[]>> = {
  viewer: ['view'],
  operator: ['view', 'reconcile_booking', 'run_reconciliation_pass', 'cancel_unpaid_booking', 'manage_cleaning', 'requeue_automation'],
  admin: ['view', 'reconcile_booking', 'run_reconciliation_pass', 'cancel_unpaid_booking', 'cancel_paid_booking', 'manage_cleaning', 'requeue_automation', 'manage_operators'],
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
