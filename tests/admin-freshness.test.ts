/**
 * ══════════════════════════════════════════════════════════════════════════
 * FRESHNESS — the owner is told how current the bookings are, and is warned
 * whenever they may not be. Old data must never look current.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { ago, bookingFreshness, payoutFreshness } from '@/lib/admin/freshness';

const NOW = new Date('2026-10-14T13:00:00Z');
const minus = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const base = { lastImport: { finishedAt: minus(20), ok: true }, lastWebhookAt: minus(4), staleUpcoming: 0, failedRefreshes: 0 };

describe('bookingFreshness', () => {
  it('current: the newest confirmation, webhook or import, in plain words', () => {
    const f = bookingFreshness(base, NOW);
    expect(f.state).toBe('current');
    expect(f.headline).toBe('Bookings updated 4 minutes ago');
    expect(f.warning).toBeNull();
    expect(bookingFreshness({ ...base, lastWebhookAt: minus(300) }, NOW).headline).toBe('Bookings updated 20 minutes ago');
  });
  it('a failed last import is a visible failure, and a failed import never counts as an update', () => {
    const f = bookingFreshness({ ...base, lastImport: { finishedAt: minus(10), ok: false }, lastWebhookAt: null }, NOW);
    expect(f.state).toBe('failing');
    expect(f.headline).toBe('Bookings not updated');
    expect(f.warning).toMatch(/failed/);
  });
  it('an overdue import fails visibly even when the last one succeeded', () => {
    const f = bookingFreshness({ ...base, lastImport: { finishedAt: minus(180), ok: true }, lastWebhookAt: minus(170) }, NOW);
    expect(f.state).toBe('failing');
    expect(f.warning).toMatch(/has not run since 3 hours ago/);
  });
  it('stale upcoming bookings or failed instant updates delay, never hide', () => {
    expect(bookingFreshness({ ...base, staleUpcoming: 2 }, NOW)).toMatchObject({ state: 'delayed', warning: expect.stringMatching(/2 upcoming bookings/) });
    expect(bookingFreshness({ ...base, failedRefreshes: 1 }, NOW)).toMatchObject({ state: 'delayed', warning: expect.stringMatching(/hourly update will catch it up/) });
  });
  it('never run, or unreadable, is never shown as current', () => {
    expect(bookingFreshness({ ...base, lastImport: null }, NOW).state).toBe('failing');
    expect(bookingFreshness(null, NOW)).toMatchObject({ state: 'unknown', warning: expect.any(String) });
  });
  it('uses no technical vocabulary', () => {
    const texts = [base, { ...base, lastImport: null }, { ...base, staleUpcoming: 1 }, { ...base, lastImport: { finishedAt: minus(500), ok: true } }]
      .map((x) => bookingFreshness(x, NOW))
      .flatMap((f) => [f.headline, f.warning ?? '']);
    for (const t of texts) expect(t).not.toMatch(/cron|webhook|api|beds24|supabase|scheduler/i);
  });
});

describe('payoutFreshness and ago', () => {
  it('says plainly when no payout data has arrived', () => {
    expect(payoutFreshness(null, 2, NOW)).toMatchObject({ updatedAt: null, headline: 'Booking.com payouts not yet imported', awaitingReview: 2 });
    expect(payoutFreshness(minus(60 * 26), 0, NOW).headline).toBe('Booking.com payouts last updated 26 hours ago');
  });
  it('reads naturally', () => {
    expect(ago(minus(0), NOW)).toBe('just now');
    expect(ago(minus(1), NOW)).toBe('1 minute ago');
    expect(ago(minus(60 * 24 * 3), NOW)).toBe('3 days ago');
  });
});
