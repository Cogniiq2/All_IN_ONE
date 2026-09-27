'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { contact } from '@/lib/content/brand';
import { getRentalUnit } from '@/lib/content/apartments';
import { greetingFor, SUCCESS_SCENES } from '@/lib/content/success';
import { fetchBookingStatus, formatMoney } from '@/lib/booking/client';
import { isBookingReference } from '@/lib/booking/reference';
import { stayEvent } from '@/lib/booking/calendar';
import { track } from '@/lib/booking/analytics';
import { isConfirmedStatus, type BookingIntentView } from '@/lib/booking/types';
import { readReceipt } from '@/lib/success/receipt';
import { AddToCalendar } from '@/components/booking/add-to-calendar';
import { SuccessExperience, SuccessStage } from '@/components/success/success-experience';
import { stayRows } from '@/components/success/ticket-rows';
import { CtaLink, label } from '@/components/ui-kit/cta';
import { nextBookingPage } from '@/components/success/booking-routing';

export default function BookingConfirmedClient() {
  const { locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const reference = params?.get('ref') ?? '';

  const [booking, setBooking] = useState<BookingIntentView | null>(null);
  const [firstName, setFirstName] = useState<string | undefined>();
  const tracked = useRef(false);

  useEffect(() => {
    if (!isBookingReference(reference)) {
      router.replace('/booking/return');
      return;
    }
    let active = true;
    fetchBookingStatus(reference)
      .then((view) => {
        if (!active) return;
        if (!isConfirmedStatus(view.status)) {
          router.replace(nextBookingPage(view));
          return;
        }
        const receipt = readReceipt('booking');
        // The name belongs to this booking only if the receipt says so.
        setFirstName(receipt?.reference === view.reference ? receipt.firstName : undefined);
        setBooking(view);
        if (!tracked.current) {
          tracked.current = true;
          track('booking_confirmed', {
            unitSlug: view.unitSlug,
            nights: view.nights,
            amountCents: view.totalCents ?? undefined,
            currency: view.currency,
          });
        }
      })
      .catch(() => {
        // The status could not be read: the return page has the honest
        // "we could not find this booking" state and a route to a person.
        if (active) router.replace(`/booking/return?ref=${encodeURIComponent(reference)}`);
      });
    return () => {
      active = false;
    };
  }, [reference, router]);

  if (!booking) return <SuccessStage tone="ink" />;

  const unit = getRentalUnit(booking.unitSlug);
  const unitName = unit?.name[locale];

  return (
    <SuccessExperience
      scene={SUCCESS_SCENES['booking-confirmed']}
      locale={locale}
      greeting={greetingFor(firstName, 'welcome', locale)}
      unit={unit}
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
        <>
          <CtaLink href="/bayreuth-2026" invert withArrow>
            {label('discoverBayreuth', locale)}
          </CtaLink>
          {unitName && (
            <AddToCalendar
              invert
              event={stayEvent({ arrival: booking.checkIn, departure: booking.checkOut }, unitName, locale)}
            />
          )}
        </>
      }
      aside={
        <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="link-quiet" style={{ color: 'hsl(var(--on-dark))' }}>
          {label('writeWhatsApp', locale)}
        </a>
      }
    />
  );
}
