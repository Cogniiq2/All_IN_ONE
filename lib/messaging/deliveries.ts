import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MESSAGE DELIVERIES — prepare and complete, for the automation platform.
 *
 * The backend renders; the automation platform transports. That split is
 * what keeps the template engine, the variable validation and the
 * exactly-once ledger in one tested place, and leaves n8n with one job:
 * hand a finished message to SMTP and report back.
 *
 *   prepare   context → still confirmed? → render → claim the ledger slot
 *             → the message, or a reason nothing should be sent
 *   complete  the transport's verdict → the ledger
 *
 * ── Exactly once ─────────────────────────────────────────────────────────
 * `bolagio_begin_message_delivery` hands out ONE claim per (booking, kind).
 * A redelivered outbox event, a second n8n worker or a re-run pump gets
 * `already_sent` or `in_progress` and must ack without sending. The ledger
 * row is written BEFORE the message leaves this server, so a crash between
 * the two leaves a lease that lapses, not a second email.
 *
 * ── PII ──────────────────────────────────────────────────────────────────
 * The rendered message carries the guest's name and email — it has to, to
 * be sent. It is returned once, on an authenticated request, and never
 * stored: the ledger keeps a masked address and a hash, no body.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beginMessageDelivery, completeMessageDelivery, type DeliveryClaim } from '@/lib/booking/commands';
import { messagingContact, testCompletionsAllowed } from '@/lib/booking/config';
import { formatDateOrDash } from '@/lib/booking/date-format';
import type { BookingLogger } from '@/lib/booking/logger';
import { findIntentByReference, findUnitBySlug } from '@/lib/booking/repository';
import { nightsBetween } from '@/lib/booking/stay-rules';
import { brand, contact, SITE_URL } from '@/lib/content/brand';
import { getRentalUnit } from '@/lib/content/apartments';
import { renderMessage, TemplateRenderError, type RenderedMessage } from '@/lib/messaging/render';
import { toMessageLocale, type MessageKind } from '@/lib/messaging/templates';

export interface PreparedMessage {
  channel: 'email';
  to: string;
  subject: string;
  text: string;
  locale: string;
  templateId: string;
  templateVersion: string;
}

export type PrepareOutcome =
  | { outcome: 'claimed'; deliveryId: string; attempt: number; message: PreparedMessage }
  | { outcome: 'already_sent'; deliveryId: string; status: string }
  | { outcome: 'in_progress'; deliveryId: string }
  | { outcome: 'backoff'; deliveryId: string; nextAttemptAt: string }
  | { outcome: 'not_retryable'; deliveryId: string; reason: string | null }
  | { outcome: 'suppressed'; deliveryId?: string; reason: string }
  | { outcome: 'unknown_reference' };

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.prototype.slice.call(new Uint8Array(digest)).map((b: number) => b.toString(16).padStart(2, '0')).join('');
}

function money(cents: number | null, currency: string, locale: 'de' | 'en'): string {
  if (cents === null) return '';
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: currency || 'EUR' }).format(cents / 100);
}

/**
 * Prepare a guest message: the rendered content and a claimed ledger slot,
 * or the reason nothing should be sent.
 *
 * `sequence` > 1 is a deliberate resend (an operator's decision), which gets
 * its own ledger row rather than overwriting the record of the first send.
 */
/** Whole days from the property's today to the arrival date; never negative. */
function daysUntil(checkIn: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  return Math.max(0, nightsBetween(today, checkIn) ?? 0);
}

export async function prepareGuestMessage(
  input: { kind: MessageKind; reference: string; outboxEventId?: string | null; sequence?: number },
  logger: BookingLogger
): Promise<PrepareOutcome> {
  const intent = await findIntentByReference(input.reference);
  if (!intent) return { outcome: 'unknown_reference' };

  // The stay must still be a stay. An event emitted before a cancellation is
  // not a reason to write to a guest whose booking has ended.
  if (intent.status !== 'confirmed') {
    logger.info('message.delivery', { reference: input.reference, eventType: input.kind, outcome: 'suppressed', status: intent.status });
    return { outcome: 'suppressed', reason: `booking is ${intent.status}` };
  }
  if (!intent.guest?.email) {
    return { outcome: 'suppressed', reason: 'booking has no guest email' };
  }

  const unit = await findUnitBySlug(intent.unitSlug);
  const content = getRentalUnit(intent.unitSlug);
  const locale = toMessageLocale(intent.guest.locale);

  let rendered: RenderedMessage;
  try {
    rendered = renderMessage(input.kind, locale, {
      firstName: intent.guest.firstName,
      lastName: intent.guest.lastName,
      reference: intent.reference,
      unitName: content?.name[locale] ?? unit?.displayName ?? intent.unitSlug,
      checkInDate: formatDateOrDash(intent.checkIn),
      checkOutDate: formatDateOrDash(intent.checkOut),
      checkInTime: unit?.checkInTime,
      checkOutTime: unit?.checkOutTime,
      nights: nightsBetween(intent.checkIn, intent.checkOut),
      adults: intent.adults,
      children: intent.children,
      totalAmount: money(intent.paidAmountCents ?? intent.quotedTotalCents, intent.paidCurrency ?? intent.currency, locale),
      brandName: brand.name,
      // From configuration, never invented: `contact.email` is null in the
      // brand file until a real address is verified, and a template that
      // needs one refuses to render rather than sending a placeholder.
      contactEmail: messagingContact().email ?? contact.email ?? undefined,
      contactPhone: messagingContact().phone ?? contact.phone,
      siteUrl: SITE_URL,
      daysUntilArrival: daysUntil(intent.checkIn, unit?.timezone ?? 'Europe/Berlin'),
    });
  } catch (cause) {
    // A template that cannot be rendered is a configuration fault, not a
    // reason to send something else. The ledger records the refusal so an
    // operator sees it; nothing leaves.
    const reason = cause instanceof TemplateRenderError ? cause.message : 'render failed';
    logger.error('message.delivery', cause, { reference: input.reference, eventType: input.kind, outcome: 'render_failed' });
    const claim = await beginMessageDelivery({
      reference: intent.reference, kind: input.kind, channel: 'email', locale,
      templateId: `${input.kind}.${locale}`, templateVersion: 'unrendered',
      destinationMasked: maskEmail(intent.guest.email), destinationHash: await sha256Hex(intent.guest.email),
      outboxEventId: input.outboxEventId ?? null, sequence: input.sequence,
    });
    if (claim.outcome === 'claimed') {
      await completeMessageDelivery({ id: claim.id, outcome: 'failed', provider: 'renderer', error: reason, retryable: false });
      return { outcome: 'not_retryable', deliveryId: claim.id, reason };
    }
    return toOutcome(claim);
  }

  const claim = await beginMessageDelivery({
    reference: intent.reference,
    kind: input.kind,
    channel: 'email',
    locale,
    templateId: rendered.templateId,
    templateVersion: rendered.templateVersion,
    destinationMasked: maskEmail(intent.guest.email),
    destinationHash: await sha256Hex(intent.guest.email),
    outboxEventId: input.outboxEventId ?? null,
    sequence: input.sequence,
  });

  if (claim.outcome !== 'claimed') return toOutcome(claim);

  logger.info('message.delivery', { reference: input.reference, eventType: input.kind, outcome: 'claimed', attempt: claim.attempt });
  return {
    outcome: 'claimed',
    deliveryId: claim.id,
    attempt: claim.attempt,
    message: {
      channel: 'email',
      to: intent.guest.email,
      subject: rendered.subject,
      text: rendered.text,
      locale,
      templateId: rendered.templateId,
      templateVersion: rendered.templateVersion,
    },
  };
}

function toOutcome(claim: Exclude<DeliveryClaim, { outcome: 'claimed' }>): PrepareOutcome {
  switch (claim.outcome) {
    case 'already_sent':
      return { outcome: 'already_sent', deliveryId: claim.id, status: claim.status };
    case 'in_progress':
      return { outcome: 'in_progress', deliveryId: claim.id };
    case 'backoff':
      return { outcome: 'backoff', deliveryId: claim.id, nextAttemptAt: claim.nextAttemptAt };
    case 'not_retryable':
      return { outcome: 'not_retryable', deliveryId: claim.id, reason: claim.lastError };
    default:
      return { outcome: 'unknown_reference' };
  }
}

export interface CompleteInput {
  deliveryId: string;
  outcome: 'sent' | 'failed' | 'skipped';
  provider: string;
  providerMessageId?: string;
  error?: string;
  retryable?: boolean;
}

/**
 * Record the transport's verdict.
 *
 * A `sent` from provider `test` is only believed where no real guest exists
 * (`testCompletionsAllowed`); elsewhere it is recorded as a non-retryable
 * failure, so a mis-set transport cannot make the ledger claim a
 * confirmation went out when it did not.
 */
export async function completeGuestMessage(input: CompleteInput, logger: BookingLogger): Promise<{ recorded: boolean; refused?: string }> {
  const provider = input.provider.trim().toLowerCase().slice(0, 60);
  if (input.outcome === 'sent' && provider === 'test' && !testCompletionsAllowed()) {
    await completeMessageDelivery({
      id: input.deliveryId, outcome: 'failed', provider: 'test',
      error: 'a test transport may not report a delivery as sent on this deployment', retryable: false,
    });
    logger.warn('message.delivery', { jobId: input.deliveryId, outcome: 'test_completion_refused' });
    return { recorded: true, refused: 'test_completion_refused' };
  }
  const recorded = await completeMessageDelivery({
    id: input.deliveryId,
    outcome: input.outcome,
    provider,
    providerMessageId: input.providerMessageId,
    error: input.error,
    retryable: input.retryable,
  });
  logger.info('message.delivery', { jobId: input.deliveryId, outcome: recorded ? input.outcome : 'stale_completion', provider });
  return { recorded };
}
