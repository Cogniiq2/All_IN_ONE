import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isThankYouKind, THANK_YOU_KINDS } from '@/lib/content/success';
import { successMetadata } from '@/components/success/success-metadata';
import ThankYouClient from './thank-you-client';

/**
 * /thank-you/<kind> — the confirmation after every enquiry-style journey.
 *
 *   booking-request       booking dialog, residence not bookable online
 *   stay-enquiry          the general "Buchung anfragen" form
 *   rental-enquiry        long-term, private residential
 *   business-enquiry      long-term, company or commercial
 *   appointment-request   the rental appointment dialog
 *   waitlist              "Informiert werden" for a residence in preparation
 *   message               a general question from /contact
 *
 * Statically generated, one page per kind; any other segment is a 404. The
 * page is the same for everybody — the personal details are read in the
 * browser from the receipt the form left (lib/success/receipt.ts), so nothing
 * personal is ever in the URL or on the server.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return THANK_YOU_KINDS.map((kind) => ({ kind }));
}

export function generateMetadata({ params }: { params: { kind: string } }): Metadata {
  return isThankYouKind(params.kind) ? successMetadata(params.kind) : {};
}

export default function ThankYouPage({ params }: { params: { kind: string } }) {
  if (!isThankYouKind(params.kind)) notFound();
  return <ThankYouClient kind={params.kind} />;
}
