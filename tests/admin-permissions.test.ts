import { describe, expect, it } from 'vitest';
import { OPERATOR_ROLES, can, isOperatorRole } from '@/lib/admin/permissions';

describe('operator permissions', () => {
  it('lets every role view', () => {
    for (const role of OPERATOR_ROLES) expect(can(role, 'view')).toBe(true);
  });

  it('keeps writes away from viewers', () => {
    expect(can('viewer', 'reconcile_booking')).toBe(false);
    expect(can('viewer', 'run_reconciliation_pass')).toBe(false);
    expect(can('operator', 'reconcile_booking')).toBe(true);
    expect(can('operator', 'manage_operators')).toBe(false);
    expect(can('admin', 'manage_operators')).toBe(true);
  });

  it('gives an unknown or missing role nothing at all', () => {
    expect(can('superuser', 'view')).toBe(false);
    expect(can(undefined, 'view')).toBe(false);
    expect(can(null, 'reconcile_booking')).toBe(false);
    expect(isOperatorRole('root')).toBe(false);
  });
});
