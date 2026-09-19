import { describe, expect, it } from 'vitest';
import { STATE_GROUPS, filterToParams, hasActiveFilter, parseBookingFilter, statesFor } from '@/lib/admin/filters';
import { BOOKING_STATES } from '@/lib/booking/states';

describe('booking list filter', () => {
  it('parses a full, valid query', () => {
    const f = parseBookingFilter({ q: '  Müller ', unit: 'schulstrasse-i', status: 'confirmed', payment: 'paid', source: 'direct', from: '2026-09-01', to: '2026-10-01', attention: '1', sort: 'updated', dir: 'asc', page: '3' });
    expect(f).toMatchObject({ q: 'Müller', unit: 'schulstrasse-i', status: 'confirmed', payment: 'paid', source: 'direct', from: '2026-09-01', to: '2026-10-01', attention: true, sort: 'updated', dir: 'asc', page: 3 });
  });

  it('drops anything that is not in the closed vocabularies', () => {
    const f = parseBookingFilter({ status: "confirmed'; drop table", payment: 'PAID', source: 'expedia', from: '01.09.2026', to: '2026-13-40', sort: 'reference', dir: 'sideways', page: '-4' });
    expect(f.status).toBeNull();
    expect(f.payment).toBeNull();
    expect(f.source).toBeNull();
    expect(f.from).toBeNull();
    expect(f.to).toBeNull();
    expect(f.sort).toBe('arrival');
    expect(f.dir).toBe('asc');
    expect(f.page).toBe(1);
  });

  it('defaults the direction by sort and caps the page', () => {
    expect(parseBookingFilter({ sort: 'updated' }).dir).toBe('desc');
    expect(parseBookingFilter({ sort: 'departure' }).dir).toBe('asc');
    expect(parseBookingFilter({ page: '99999999' }).page).toBe(10_000);
    expect(parseBookingFilter({ q: 'x'.repeat(500) }).q.length).toBe(80);
  });

  it('takes the first value of a repeated key', () => {
    expect(parseBookingFilter({ status: ['paid', 'confirmed'] }).status).toBe('paid');
  });

  it('resolves groups to canonical states, and a status wins over a group', () => {
    for (const states of Object.values(STATE_GROUPS)) {
      for (const s of states) expect(BOOKING_STATES).toContain(s);
    }
    expect(statesFor({ status: null, group: 'exceptions' })).toEqual(STATE_GROUPS.exceptions);
    expect(statesFor({ status: 'paid', group: 'exceptions' })).toEqual(['paid']);
    expect(statesFor({ status: null, group: null })).toBeNull();
  });

  it('writes only non-default keys back to the URL', () => {
    const f = parseBookingFilter({});
    expect(filterToParams(f).toString()).toBe('dir=asc');
    expect(hasActiveFilter(f)).toBe(false);
    const g = parseBookingFilter({ attention: '1', page: '2', sort: 'amount' });
    expect(Object.fromEntries(filterToParams(g))).toEqual({ attention: '1', page: '2', sort: 'amount', dir: 'desc' });
    expect(hasActiveFilter(g)).toBe(true);
  });
});
