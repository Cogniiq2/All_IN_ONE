'use client';

import { useState, useTransition } from 'react';
import { setBookingTesterAction, type BookingTesterResult } from '@/lib/admin/actions';

const REASON: Record<Exclude<BookingTesterResult, { ok: true }>['reason'], string> = {
  unauthenticated: 'Your session has ended. Sign in again.',
  forbidden: 'Only an administrator can unlock test bookings.',
  preview: 'Preview data is read-only.',
  not_applicable: 'Not needed here: this deployment is production or does not talk to the real Beds24.',
  gate_closed: 'Direct booking is shut on this deployment (flag, PayPal sandbox secrets or test terms missing) — see Alerts above.',
  failed: 'The test pass could not be issued. Check ADMIN_SESSION_SECRET.',
};

/**
 * Staging only: lets THIS browser make live test bookings against the real
 * Beds24 account (PayPal sandbox). Every other visitor keeps the enquiry flow.
 */
export function BookingTesterControl({ active }: { active: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(active);
  const [result, setResult] = useState<BookingTesterResult | null>(null);
  const toggle = () =>
    start(async () => {
      const next = await setBookingTesterAction(!on);
      setResult(next);
      if (next.ok) setOn(next.on);
    });

  return (
    <div className="grid gap-2">
      <button type="button" className="bc-btn" onClick={toggle} disabled={pending} data-pending={pending ? 'true' : undefined}>
        {on ? 'Stop test bookings in this browser' : 'Allow test bookings in this browser'}
      </button>
      <p className="bc-meta" style={{ fontSize: 12 }}>
        {on
          ? 'This browser can book on the public site: a real Beds24 booking, paid with PayPal sandbox. It closes the dates on Booking.com and Airbnb — use only the approved test dates, and cancel afterwards.'
          : 'Off: on this staging site every visitor, you included, sees the live calendar and sends a request. Nothing is written to Beds24.'}
      </p>
      {result && !result.ok && (
        <div className="bc-notice" data-tone="caution" role="status" aria-live="polite">
          <div>{REASON[result.reason]}</div>
        </div>
      )}
    </div>
  );
}
