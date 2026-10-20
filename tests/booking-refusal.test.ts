/**
 * The two guards that turn a Beds24 "no" into a clean answer:
 *
 *   • a 4xx from Beds24 is a definite refusal (`rejected`) — the guest is told
 *     the dates are gone and offered others — while a timeout, 409, 429 or 5xx
 *     stays uncertain, because Beds24 may have acted;
 *   • a hold that was cancelled, moved or re-roomed in Beds24 before payment
 *     completed is never confirmed: confirming it would bring back nights that
 *     may already be sold on Booking.com.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/integrations/beds24/auth', () => ({
  getAccessToken: vi.fn(async () => 'token'),
  invalidateAccessToken: vi.fn(),
}));
vi.mock('@/lib/booking/commands', () => ({ observeIntegration: vi.fn() }));

import { beds24Request } from '@/lib/integrations/beds24/client';
import { holdLostReason } from '@/lib/booking/finalization';
import { ProviderError } from '@/lib/integrations/provider';

describe('Beds24 client: refusal vs. uncertainty', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number) => fetchMock.mockResolvedValue(new Response('{}', { status }));

  it.each([400, 403, 404, 422])('%i is a definite refusal', async (status) => {
    answer(status);
    await expect(beds24Request({ path: '/bookings', method: 'POST', body: [{}], quiet: true })).rejects.toMatchObject({ code: 'rejected' });
  });

  it.each([408, 409, 429, 500, 502, 503])('%i stays uncertain', async (status) => {
    answer(status);
    const error: unknown = await beds24Request({ path: '/bookings', method: 'POST', body: [{}], quiet: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).not.toBe('rejected');
  });
});

describe('hold lost before confirm', () => {
  const intent = { checkIn: '2027-03-10', checkOut: '2027-03-13', beds24RoomId: '731147' };
  const hold = { externalBookingId: '1', snapshot: {}, status: 'new', externalRoomId: '731147', checkIn: '2027-03-10', checkOut: '2027-03-13' };

  it('an intact hold may be confirmed', () => {
    expect(holdLostReason(hold, intent)).toBeNull();
  });

  it.each(['cancelled', 'Cancelled', 'black', 'declined', 'inquiry'])('a hold now "%s" is lost', (status) => {
    expect(holdLostReason({ ...hold, status }, intent)).toMatch(/hold is/);
  });

  it('a hold moved to other dates or another room is lost', () => {
    expect(holdLostReason({ ...hold, checkIn: '2027-03-11' }, intent)).toMatch(/starts/);
    expect(holdLostReason({ ...hold, checkOut: '2027-03-14' }, intent)).toMatch(/ends/);
    expect(holdLostReason({ ...hold, externalRoomId: '731146' }, intent)).toMatch(/another room/);
  });
});
