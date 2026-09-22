/**
 * ══════════════════════════════════════════════════════════════════════════
 * BENEFIT RESOLUTION — every rule that could cost money.
 *
 * This is the file that decides how much of a booking BoLaGio gives away, so
 * it is tested adversarially: each rule gets a case that tries to break it,
 * and the arithmetic gets cases at the boundaries where an off-by-one turns
 * a courtesy into a refund.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import {
  campaignDiscountCents,
  normalizeEmail,
  resolveBenefits,
  type Campaign,
  type Grant,
  type Identity,
  type StayContext,
} from '@/lib/privileges/benefit';

const NOW = new Date('2026-06-01T12:00:00Z');

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    code: 'residence-privileges',
    name: 'Residence Privileges',
    active: true,
    unitId: null,
    discountPercentBp: 1000, // 10%
    discountFixedCents: 0,
    maxDiscountCents: null,
    minNights: 1,
    validFrom: null,
    validTo: null,
    usageLimitPerGuest: 1,
    stackable: false,
    priority: 100,
    ...over,
  };
}

function grant(over: Partial<Grant> = {}): Grant {
  return { id: 'g1', campaign: campaign(), expiresAt: null, revokedAt: null, redemptionsUsed: 0, ...over };
}

const VERIFIED: Identity = { id: 'i1', verifiedAt: '2026-01-01T00:00:00Z' };
const UNVERIFIED: Identity = { id: 'i1', verifiedAt: null };

function stay(over: Partial<StayContext> = {}): StayContext {
  return { unitId: 'unit-1', nights: 3, grossCents: 48000, checkIn: '2026-07-01', ...over };
}

describe('the verification gate', () => {
  it('gives an unverified identity nothing, whatever it holds', () => {
    const result = resolveBenefits(UNVERIFIED, [grant()], stay(), NOW);
    expect(result.discountCents).toBe(0);
    expect(result.applied).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('identity_unverified');
  });

  it('is the double opt-in and the security control at once', () => {
    // Typing a stranger's address earns nothing until the stranger clicks.
    // Same mechanism, both purposes.
    expect(resolveBenefits(UNVERIFIED, [grant(), grant({ id: 'g2' })], stay(), NOW).discountCents).toBe(0);
    expect(resolveBenefits(VERIFIED, [grant()], stay(), NOW).discountCents).toBeGreaterThan(0);
  });
});

describe('arithmetic', () => {
  it('takes a percentage in basis points and floors it', () => {
    // 10% of 48000 = 4800 exactly.
    expect(campaignDiscountCents(campaign(), 48000)).toBe(4800);
    // 10% of 4805 = 480.5 → 480, never 481. Flooring favours the house.
    expect(campaignDiscountCents(campaign(), 4805)).toBe(480);
  });

  it('caps the percentage with max_discount_cents, and caps AFTER applying it', () => {
    const capped = campaign({ discountPercentBp: 1000, maxDiscountCents: 5000 });
    // 10% of 200000 = 20000, capped to 5000.
    expect(campaignDiscountCents(capped, 200000)).toBe(5000);
    // Below the cap, the cap does nothing.
    expect(campaignDiscountCents(capped, 20000)).toBe(2000);
  });

  it('takes the SMALLER when both a percentage and a fixed amount are set', () => {
    // A campaign configured with both means "whichever courtesy is smaller".
    const both = campaign({ discountPercentBp: 1000, discountFixedCents: 2000 });
    expect(campaignDiscountCents(both, 48000)).toBe(2000); // 4800 vs 2000
    expect(campaignDiscountCents(both, 10000)).toBe(1000); // 1000 vs 2000
  });

  it('never exceeds the gross, even with an absurd fixed amount', () => {
    const silly = campaign({ discountPercentBp: 0, discountFixedCents: 100000 });
    expect(campaignDiscountCents(silly, 5000)).toBe(5000);
  });

  it('produces nothing from a zero or negative gross', () => {
    expect(campaignDiscountCents(campaign(), 0)).toBe(0);
    expect(campaignDiscountCents(campaign(), -100)).toBe(0);
  });
});

describe('the rules that refuse', () => {
  const cases: Array<[string, Grant, StayContext, string]> = [
    ['a revoked grant', grant({ revokedAt: '2026-05-01T00:00:00Z' }), stay(), 'grant_revoked'],
    ['an expired grant', grant({ expiresAt: '2026-05-01T00:00:00Z' }), stay(), 'grant_expired'],
    ['an inactive campaign', grant({ campaign: campaign({ active: false }) }), stay(), 'campaign_inactive'],
    ['a campaign scoped to another unit', grant({ campaign: campaign({ unitId: 'unit-2' }) }), stay(), 'campaign_other_unit'],
    ['a stay shorter than the minimum', grant({ campaign: campaign({ minNights: 5 }) }), stay({ nights: 4 }), 'stay_too_short'],
    ['a campaign that has not started', grant({ campaign: campaign({ validFrom: '2026-08-01' }) }), stay({ checkIn: '2026-07-01' }), 'campaign_not_started'],
    ['a campaign that has ended', grant({ campaign: campaign({ validTo: '2026-06-30' }) }), stay({ checkIn: '2026-07-01' }), 'campaign_ended'],
    ['a grant already used to its limit', grant({ redemptionsUsed: 1 }), stay(), 'usage_limit_reached'],
  ];

  for (const [label, g, s, reason] of cases) {
    it(`refuses ${label}`, () => {
      const result = resolveBenefits(VERIFIED, [g], s, NOW);
      expect(result.discountCents).toBe(0);
      expect(result.rejected).toEqual([{ grantId: g.id, campaignCode: g.campaign.code, reason }]);
    });
  }

  it('counts usage from the ledger, so a limit of two allows exactly two', () => {
    const c = campaign({ usageLimitPerGuest: 2 });
    expect(resolveBenefits(VERIFIED, [grant({ campaign: c, redemptionsUsed: 1 })], stay(), NOW).discountCents).toBe(4800);
    expect(resolveBenefits(VERIFIED, [grant({ campaign: c, redemptionsUsed: 2 })], stay(), NOW).discountCents).toBe(0);
  });

  it('treats the validity window as inclusive at both ends', () => {
    const c = campaign({ validFrom: '2026-07-01', validTo: '2026-07-31' });
    expect(resolveBenefits(VERIFIED, [grant({ campaign: c })], stay({ checkIn: '2026-07-01' }), NOW).discountCents).toBe(4800);
    expect(resolveBenefits(VERIFIED, [grant({ campaign: c })], stay({ checkIn: '2026-07-31' }), NOW).discountCents).toBe(4800);
    expect(resolveBenefits(VERIFIED, [grant({ campaign: c })], stay({ checkIn: '2026-08-01' }), NOW).discountCents).toBe(0);
  });

  it('expires a grant at the instant, not the day', () => {
    const justAlive = grant({ expiresAt: '2026-06-01T12:00:01Z' });
    const justDead = grant({ expiresAt: '2026-06-01T12:00:00Z' });
    expect(resolveBenefits(VERIFIED, [justAlive], stay(), NOW).discountCents).toBe(4800);
    expect(resolveBenefits(VERIFIED, [justDead], stay(), NOW).discountCents).toBe(0);
  });

  it('compares timestamps as instants, not as text', () => {
    /*
     * The bug this pins. Lexically, '2026-06-01T12:00:00Z' is GREATER than
     * '2026-06-01T12:00:00.000Z' because 'Z' sorts after '.', so a string
     * comparison reports an expired grant as alive. Postgres renders a
     * timestamptz with microseconds and a +00:00 offset while toISOString()
     * renders milliseconds and a Z, so both forms reach this code in
     * production.
     */
    for (const expired of [
      '2026-06-01T12:00:00Z',
      '2026-06-01T12:00:00.000Z',
      '2026-06-01T12:00:00+00:00',
      '2026-06-01T12:00:00.000000+00:00',
      '2026-05-31T23:59:59.999Z',
    ]) {
      expect(resolveBenefits(VERIFIED, [grant({ expiresAt: expired })], stay(), NOW).discountCents).toBe(0);
    }
    for (const alive of ['2026-06-01T12:00:01Z', '2026-06-01T14:00:00+00:00', '2026-06-01T13:00:01.500Z']) {
      expect(resolveBenefits(VERIFIED, [grant({ expiresAt: alive })], stay(), NOW).discountCents).toBe(4800);
    }
  });

  it('fails CLOSED on a timestamp it cannot read', () => {
    // A value the system cannot parse must not pay out. This is money.
    expect(resolveBenefits(VERIFIED, [grant({ expiresAt: 'not-a-date' })], stay(), NOW).discountCents).toBe(0);
    expect(resolveBenefits(VERIFIED, [grant({ expiresAt: '' })], stay(), NOW).rejected[0].reason).toBe('grant_expired');
  });

  it('refuses a stay with no nights or no value rather than dividing by it', () => {
    expect(resolveBenefits(VERIFIED, [grant()], stay({ nights: 0 }), NOW).discountCents).toBe(0);
    expect(resolveBenefits(VERIFIED, [grant()], stay({ grossCents: 0 }), NOW).discountCents).toBe(0);
  });
});

describe('stacking', () => {
  const big = campaign({ id: 'c-big', code: 'big', discountPercentBp: 2000, stackable: false });
  const small = campaign({ id: 'c-small', code: 'small', discountPercentBp: 500, stackable: true });

  it('applies only the best when the campaigns do not stack', () => {
    const result = resolveBenefits(
      VERIFIED,
      [grant({ id: 'g-big', campaign: big }), grant({ id: 'g-small', campaign: small })],
      stay(),
      NOW
    );
    // 20% of 48000 = 9600, and the 5% does NOT join it.
    expect(result.discountCents).toBe(9600);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].campaignCode).toBe('big');
    expect(result.rejected.find((r) => r.campaignCode === 'small')?.reason).toBe('not_stackable');
  });

  it('combines two campaigns only when BOTH are stackable', () => {
    const a = campaign({ id: 'c-a', code: 'a', discountPercentBp: 1000, stackable: true });
    const b = campaign({ id: 'c-b', code: 'b', discountFixedCents: 1500, stackable: true });
    const result = resolveBenefits(
      VERIFIED,
      [grant({ id: 'ga', campaign: a }), grant({ id: 'gb', campaign: b })],
      stay(),
      NOW
    );
    expect(result.discountCents).toBe(4800 + 1500);
    expect(result.applied).toHaveLength(2);
  });

  it('never lets stacking exceed the gross or go negative', () => {
    const huge = (id: string) => campaign({ id, code: id, discountPercentBp: 0, discountFixedCents: 40000, stackable: true });
    const result = resolveBenefits(
      VERIFIED,
      [grant({ id: 'g1', campaign: huge('x') }), grant({ id: 'g2', campaign: huge('y') })],
      stay({ grossCents: 50000 }),
      NOW
    );
    expect(result.discountCents).toBe(50000);
    expect(result.discountCents).toBeLessThanOrEqual(50000);
    expect(result.applied.reduce((n, a) => n + a.discountCents, 0)).toBe(50000);
  });

  it('picks the better of two non-stacking grants regardless of input order', () => {
    const grants = [grant({ id: 'g-small', campaign: small }), grant({ id: 'g-big', campaign: big })];
    expect(resolveBenefits(VERIFIED, grants, stay(), NOW).applied[0].campaignCode).toBe('big');
    expect(resolveBenefits(VERIFIED, [...grants].reverse(), stay(), NOW).applied[0].campaignCode).toBe('big');
  });

  it('breaks an exact tie stably, so the discount does not change between reads', () => {
    const p1 = campaign({ id: 'c1', code: 'aaa', discountPercentBp: 1000, priority: 10 });
    const p2 = campaign({ id: 'c2', code: 'bbb', discountPercentBp: 1000, priority: 50 });
    const grants = [grant({ id: 'g2', campaign: p2 }), grant({ id: 'g1', campaign: p1 })];
    expect(resolveBenefits(VERIFIED, grants, stay(), NOW).applied[0].campaignCode).toBe('aaa');
    expect(resolveBenefits(VERIFIED, [...grants].reverse(), stay(), NOW).applied[0].campaignCode).toBe('aaa');
  });
});

describe('what it reports', () => {
  it('names the grant and campaign so a redemption can be written against it', () => {
    const result = resolveBenefits(VERIFIED, [grant()], stay(), NOW);
    expect(result.applied[0]).toEqual({
      grantId: 'g1',
      campaignId: 'c1',
      campaignCode: 'residence-privileges',
      campaignName: 'Residence Privileges',
      discountCents: 4800,
    });
  });

  it('gives no benefit at all when the guest holds no grants', () => {
    expect(resolveBenefits(VERIFIED, [], stay(), NOW)).toEqual({ discountCents: 0, applied: [], rejected: [] });
  });
});

describe('email normalisation', () => {
  it('trims and lower-cases, and nothing more', () => {
    expect(normalizeEmail('  Erika.Mustermann@Example.COM ')).toBe('erika.mustermann@example.com');
  });

  it('does NOT apply one provider’s aliasing rules to every provider', () => {
    // Merging these would hand one person's benefit to another at any host
    // that treats them as different mailboxes — which most do.
    expect(normalizeEmail('a.b@fastmail.com')).toBe('a.b@fastmail.com');
    expect(normalizeEmail('a+tag@fastmail.com')).toBe('a+tag@fastmail.com');
    expect(normalizeEmail('a.b@fastmail.com')).not.toBe(normalizeEmail('ab@fastmail.com'));
  });

  it('refuses what is not plausibly an address', () => {
    for (const bad of ['', 'nope', 'a@b', 'a@@b.com', 'a b@c.com', '@example.com', 'a@.com', 'a@b.', null, 42, {}, 'x'.repeat(250) + '@example.com']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it('accepts ordinary real addresses', () => {
    for (const good of ['a@b.de', 'first.last@sub.example.co.uk', "o'brien@example.ie".replace("'", ''), 'user_name-1@example-host.com']) {
      expect(normalizeEmail(good)).toBe(good.toLowerCase());
    }
  });
});
