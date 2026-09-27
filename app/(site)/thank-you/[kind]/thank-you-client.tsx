'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { contact } from '@/lib/content/brand';
import { getRentalUnit } from '@/lib/content/apartments';
import { greetingFor, resolveScene, SUCCESS_SCENES, type ThankYouKind } from '@/lib/content/success';
import { readReceipt, type Receipt } from '@/lib/success/receipt';
import { SuccessExperience, SuccessStage, type TicketRow } from '@/components/success/success-experience';
import { rentalRows, stayRows, waitlistRows } from '@/components/success/ticket-rows';
import { CtaLink, label } from '@/components/ui-kit/cta';

/**
 * The receipt is read after mount — sessionStorage does not exist on the
 * server — and the stage stays blank for that one frame, so the visitor never
 * sees a general page snap into a personal one.
 */
export default function ThankYouClient({ kind }: { kind: ThankYouKind }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const [receipt, setReceipt] = useState<Receipt | null | undefined>(undefined);

  useEffect(() => {
    setReceipt(readReceipt(kind));
    window.scrollTo(0, 0);
  }, [kind]);

  if (receipt === undefined) return <SuccessStage tone={SUCCESS_SCENES[kind].tone} />;

  const r = receipt ?? {};
  const unit = r.unitSlug ? getRentalUnit(r.unitSlug) : undefined;
  const scene = resolveScene(kind, variantOf(kind, r));

  let ticket: TicketRow[] = [];
  let ticketHeading: string | undefined;
  if (kind === 'booking-request' || kind === 'stay-enquiry') {
    ticket = stayRows({ arrival: r.arrival, departure: r.departure, guests: r.guests, reference: r.reference }, locale);
  } else if (kind === 'rental-enquiry' || kind === 'business-enquiry' || kind === 'appointment-request') {
    ticket = rentalRows({ request: r.request, party: r.party, interest: r.interest }, locale);
    ticketHeading = de ? 'Ihre Anfrage' : 'Your enquiry';
  } else if (kind === 'waitlist') {
    ticket = waitlistRows(unit, locale);
    ticketHeading = de ? 'Vorgemerkt für' : 'Noted for';
  }

  return (
    <SuccessExperience
      scene={scene}
      locale={locale}
      greeting={greetingFor(r.firstName, 'thanks', locale)}
      unit={unit}
      ticket={ticket}
      ticketHeading={ticketHeading}
      actions={<Actions kind={kind} />}
    />
  );
}

function variantOf(kind: ThankYouKind, r: Receipt): string | undefined {
  if (kind === 'rental-enquiry') return r.request;
  if (kind === 'appointment-request') return r.party;
  return undefined;
}

function Actions({ kind }: { kind: ThankYouKind }) {
  const { locale } = useI18n();
  const whatsapp = (
    <CtaLink href={contact.whatsapp} external variant="secondary">
      {label('writeWhatsApp', locale)}
    </CtaLink>
  );

  switch (kind) {
    case 'booking-request':
    case 'stay-enquiry':
      return (
        <>
          <CtaLink href="/bayreuth-2026" withArrow>{label('discoverBayreuth', locale)}</CtaLink>
          {whatsapp}
        </>
      );
    case 'rental-enquiry':
    case 'business-enquiry':
    case 'appointment-request':
      return (
        <>
          <CtaLink href="/mieten" withArrow>{label('exploreRentals', locale)}</CtaLink>
          {whatsapp}
        </>
      );
    case 'waitlist':
      return (
        <>
          <CtaLink href="/apartments" withArrow>{label('exploreApartments', locale)}</CtaLink>
          {whatsapp}
        </>
      );
    case 'message':
      return (
        <>
          <CtaLink href="/journal" withArrow>{label('readJournal', locale)}</CtaLink>
          <CtaLink href="/" variant="secondary">{label('toHomepage', locale)}</CtaLink>
        </>
      );
  }
}
