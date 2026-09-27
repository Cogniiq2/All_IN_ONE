'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { contact } from '@/lib/content/brand';
import { getRentalUnit } from '@/lib/content/apartments';
import { greetingFor, resolveScene } from '@/lib/content/success';
import { fetchBookingStatus, formatMoney } from '@/lib/booking/client';
import { isBookingReference } from '@/lib/booking/reference';
import type { BookingIntentView } from '@/lib/booking/types';
import { readReceipt } from '@/lib/success/receipt';
import { SuccessExperience, SuccessStage } from '@/components/success/success-experience';
import { stayRows } from '@/components/success/ticket-rows';
import { nextBookingPage } from '@/components/success/booking-routing';
import { CtaLink, label } from '@/components/ui-kit/cta';

/**
 * Five-second polls for two minutes. Finalisation normally lands within
 * seconds; after two minutes the page stops asking and leaves it to the
 * e-mail, which arrives regardless of whether this tab is still open.
 */
const POLL_MS = 5_000;
const MAX_POLLS = 24;

export default function PaymentReceivedClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const router = useRouter();
  const params = useSearchParams();
  const reference = params?.get('ref') ?? '';

  const [booking, setBooking] = useState<BookingIntentView | null>(null);
  const [watching, setWatching] = useState(true);
  const [firstName, setFirstName] = useState<string | undefined>();

  useEffect(() => {
    if (!isBookingReference(reference)) {
      router.replace('/booking/return');
      return;
    }
    let active = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = async () => {
      try {
        const view = await fetchBookingStatus(reference);
        if (!active) return;
        const next = nextBookingPage(view);
        if (!next.startsWith('/booking/payment-received')) {
          router.replace(next);
          return;
        }
        setBooking(view);
      } catch {
        // A failed read is not news about the booking. Keep what is on
        // screen; if nothing is, the return page explains.
        if (!active) return;
        if (polls === 0) {
          router.replace(`/booking/return?ref=${encodeURIComponent(reference)}`);
          return;
        }
      }
      polls += 1;
      if (polls < MAX_POLLS) timer = setTimeout(read, POLL_MS);
      else setWatching(false);
    };

    const receipt = readReceipt('booking');
    setFirstName(receipt?.reference === reference ? receipt.firstName : undefined);
    read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reference, router]);

  if (!booking) return <SuccessStage tone="ink" />;

  const pending = booking.paymentStatus === 'capture_pending';
  const unit = getRentalUnit(booking.unitSlug);

  return (
    <SuccessExperience
      scene={resolveScene('payment-received', pending ? 'pending' : undefined)}
      locale={locale}
      greeting={greetingFor(firstName, 'thanks', locale)}
      unit={unit}
      live={
        watching
          ? de ? 'Wir warten auf die Bestätigung — diese Seite aktualisiert sich selbst.' : 'Waiting for the confirmation — this page updates itself.'
          : de ? 'Die Bestätigung erreicht Sie per E-Mail.' : 'The confirmation will reach you by email.'
      }
      ticket={stayRows(
        {
          reference: booking.reference,
          arrival: booking.checkIn,
          departure: booking.checkOut,
          nights: booking.nights,
          guests: booking.adults + booking.children,
          total: booking.totalCents !== null ? formatMoney(booking.totalCents, booking.currency, locale) : undefined,
        },
        locale
      )}
      actions={
        <CtaLink href={contact.whatsapp} external invert>
          {label('writeWhatsApp', locale)}
        </CtaLink>
      }
    />
  );
}
