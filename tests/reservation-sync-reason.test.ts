import { describe, expect, it } from 'vitest';
import { syncFailureReason } from '@/lib/booking/reservation-sync';

describe('sync failure reasons', () => {
  it('names the cause in a few safe words and never carries a token', () => {
    expect(syncFailureReason({ status: 429, message: 'Too Many Requests' })).toBe('Beds24 rate limit (HTTP 429)');
    expect(syncFailureReason(new Error('Beds24 GET /bookings failed: 503'))).toBe('Beds24 server error (HTTP 503)');
    expect(syncFailureReason(new Error('The operation was aborted'))).toBe('Beds24 did not answer in time');
    expect(syncFailureReason(new Error('refused token eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop'))).not.toContain('eyJhbGci');
  });
});
