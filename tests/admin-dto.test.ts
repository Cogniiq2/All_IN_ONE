/**
 * DTO sanitation and PII minimisation: the fields that must never reach a
 * screen do not, and the list-level guest label is not a directory entry.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeDetail, trimError } from '@/lib/admin/dto';
import { guestListLabel, maskEmail, maskPhone, formatMoney, formatRelative, propertyTodayIso } from '@/lib/admin/format';
import { fixtureRowSource } from '@/lib/admin/dev/fixtures';

describe('lifecycle detail sanitisation', () => {
  it('keeps only allowlisted, scalar keys', () => {
    const out = sanitizeDetail({
      beds24_booking_id: '123',
      payment_status: 'paid',
      paid_amount_cents: 4500,
      guest_email: 'leak@example.com',
      provider_snapshot: { anything: true },
      quote_components: [{ code: 'x' }],
      idempotency_key: 'abc',
      nested: { a: 1 },
      last_failure_reason: 'x'.repeat(400),
    });
    expect(out).toEqual({ beds24_booking_id: '123', payment_status: 'paid', paid_amount_cents: 4500, last_failure_reason: 'x'.repeat(200) });
    expect(out && 'guest_email' in out).toBe(false);
  });

  it('returns null for empty, non-object or array input', () => {
    expect(sanitizeDetail(null)).toBeNull();
    expect(sanitizeDetail('str')).toBeNull();
    expect(sanitizeDetail([1])).toBeNull();
    expect(sanitizeDetail({ irrelevant: 1 })).toBeNull();
  });

  it('trims error text to a line', () => {
    expect(trimError('  a\n\n  b  ')).toBe('a b');
    expect(trimError('x'.repeat(1000))?.length).toBe(240);
    expect(trimError(null)).toBeNull();
    expect(trimError('   ')).toBeNull();
  });
});

describe('guest minimisation', () => {
  it('reduces a name to surname and initial for lists', () => {
    expect(guestListLabel('Anna', 'Mustermann')).toBe('Mustermann, A.');
    expect(guestListLabel('', 'Mustermann')).toBe('Mustermann');
    expect(guestListLabel('Anna', '')).toBe('Anna');
    expect(guestListLabel(null, null)).toBeNull();
  });

  it('masks contact details', () => {
    expect(maskEmail('anna.mustermann@example.com')).toBe('a•••@example.com');
    expect(maskEmail('bad')).toBe('•••');
    expect(maskPhone('+49 170 1234567')).toBe('+49 ••• 67');
    expect(maskPhone('12')).toBe('•••');
  });
});

describe('formatting', () => {
  it('formats money in minor units with the right currency', () => {
    expect(formatMoney(45000, 'EUR')).toMatch(/450,00\s?€/);
    expect(formatMoney(null, 'EUR')).toBe('—');
  });

  it('describes relative time in both directions', () => {
    const now = new Date('2026-09-19T12:00:00Z');
    expect(formatRelative('2026-09-19T11:57:00Z', now)).toBe('3 min ago');
    expect(formatRelative('2026-09-19T14:00:00Z', now)).toBe('in 2 h');
    expect(formatRelative('2026-09-10T12:00:00Z', now)).toBe('9 d ago');
    expect(formatRelative('garbage', now)).toBe('—');
  });

  it('computes the property day in Europe/Berlin', () => {
    expect(propertyTodayIso(new Date('2026-09-19T22:30:00Z'))).toBe('2026-09-20');
    expect(propertyTodayIso(new Date('2026-01-19T23:30:00Z'))).toBe('2026-01-20');
  });
});

describe('fixture row source', () => {
  it('filters like the production source and never hands back a secret-shaped column', async () => {
    const source = fixtureRowSource();
    const all = await source.intents({});
    expect(all.total).toBeGreaterThan(5);
    const attention = await source.intents({ attentionOnly: true });
    expect(attention.rows.every((r) => ['locking', 'paid', 'paid_unfinalized', 'finalization_failed', 'releasing', 'release_failed', 'manual_review'].includes(r.status) || r.payment_status === 'unknown' || r.reconciliation_state !== 'ok')).toBe(true);
    const search = await source.intents({ search: 'beispiel' });
    expect(search.rows.length).toBeGreaterThan(0);
    const row = all.rows[0] as unknown as Record<string, unknown>;
    expect('idempotency_key' in row).toBe(false);
    expect('provider_snapshot' in row).toBe(false);
    const paged = await source.intents({ limit: 3, offset: 3 });
    expect(paged.rows.length).toBe(3);
    expect(paged.total).toBe(all.total);
  });
});
