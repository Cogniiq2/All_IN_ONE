/**
 * ══════════════════════════════════════════════════════════════════════════
 * AUTOMATIONS — pure derivations for the delivery ledger and the integration
 * signals the System page shows.
 *
 * ── Never false green ────────────────────────────────────────────────────
 * Each provider has a fixed set of signals it is expected to emit. A signal
 * with no observation is reported as `never`, with the words "never
 * observed", and nothing here turns that into "healthy". The only way a
 * signal becomes `observed` is a row written by the code path that actually
 * heard from the provider.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { IntegrationSignalDto, MessageDeliveryDto } from '@/lib/admin/dto';
import type { IntegrationHealthRow, MessageDeliveryRow } from '@/lib/admin/rows';

export function toDeliveryDto(row: MessageDeliveryRow): MessageDeliveryDto {
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    sequence: row.sequence,
    channel: row.channel,
    locale: row.locale,
    templateId: row.template_id,
    templateVersion: row.template_version,
    destinationMasked: row.destination_masked,
    status: row.status,
    retryable: row.retryable,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    lastError: row.last_error ? row.last_error.slice(0, 300) : null,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The signals each provider is expected to leave, and how an operator reads them. */
export const EXPECTED_SIGNALS: ReadonlyArray<{ provider: 'beds24' | 'paypal' | 'n8n'; signal: string; label: string }> = [
  { provider: 'beds24', signal: 'last_success', label: 'Beds24 · last successful call' },
  { provider: 'beds24', signal: 'last_failure', label: 'Beds24 · last failed call' },
  { provider: 'paypal', signal: 'last_success', label: 'PayPal · last successful call' },
  { provider: 'paypal', signal: 'last_failure', label: 'PayPal · last failed call' },
  { provider: 'paypal', signal: 'last_verified_webhook', label: 'PayPal · last verified webhook' },
  { provider: 'n8n', signal: 'last_claim', label: 'n8n · last outbox claim' },
  { provider: 'n8n', signal: 'last_ack', label: 'n8n · last acknowledgement' },
  { provider: 'n8n', signal: 'last_fail', label: 'n8n · last reported failure' },
  { provider: 'n8n', signal: 'last_message_prepare', label: 'n8n · last guest message prepared' },
  { provider: 'n8n', signal: 'last_message_complete', label: 'n8n · last guest message completed' },
];

/**
 * Every expected signal, observed or `never`. Rows the table holds for a
 * signal this list does not know are appended as observed, so a new signal
 * written by newer code is not hidden.
 */
export function integrationSignals(rows: IntegrationHealthRow[]): IntegrationSignalDto[] {
  const byKey = new Map(rows.map((r) => [`${r.provider}:${r.signal}`, r]));
  const out: IntegrationSignalDto[] = EXPECTED_SIGNALS.map((e) => {
    const row = byKey.get(`${e.provider}:${e.signal}`);
    return {
      provider: e.provider,
      signal: e.signal,
      label: e.label,
      status: row ? 'observed' : 'never',
      observedAt: row?.observed_at ?? null,
      detail: row?.detail ? row.detail.slice(0, 200) : null,
    };
  });
  for (const r of rows) {
    if (!EXPECTED_SIGNALS.some((e) => e.provider === r.provider && e.signal === r.signal)) {
      out.push({ provider: r.provider, signal: r.signal, label: `${r.provider} · ${r.signal.replace(/_/g, ' ')}`, status: 'observed', observedAt: r.observed_at, detail: r.detail });
    }
  }
  return out;
}

/** The n8n pump has claimed within this window, or it is considered silent. */
export const N8N_SILENT_MS = 30 * 60_000;

export interface AutomationsBoard {
  /** Deliveries that failed and will not be retried without an operator. */
  stuck: MessageDeliveryDto[];
  /** Deliveries failed but still inside their automatic retry budget. */
  retrying: MessageDeliveryDto[];
  /** Deliveries waiting for a pump to claim them, or mid-send. */
  waiting: MessageDeliveryDto[];
  /** Everything else recent, newest first. */
  recent: MessageDeliveryDto[];
  counts: { sent: number; stuck: number; retrying: number; waiting: number; suppressed: number; skipped: number };
}

export function buildAutomationsBoard(rows: MessageDeliveryRow[]): AutomationsBoard {
  const all = rows.map(toDeliveryDto);
  const stuck = all.filter((d) => d.status === 'failed' && (!d.retryable || d.attempts >= d.maxAttempts)).sort((a, b) => (a.failedAt ?? a.updatedAt).localeCompare(b.failedAt ?? b.updatedAt));
  const retrying = all.filter((d) => d.status === 'failed' && d.retryable && d.attempts < d.maxAttempts).sort((a, b) => (a.nextAttemptAt ?? '').localeCompare(b.nextAttemptAt ?? ''));
  const waiting = all.filter((d) => d.status === 'pending' || d.status === 'sending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const recent = all.filter((d) => d.status === 'sent' || d.status === 'skipped' || d.status === 'suppressed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
  return {
    stuck,
    retrying,
    waiting,
    recent,
    counts: {
      sent: all.filter((d) => d.status === 'sent').length,
      stuck: stuck.length,
      retrying: retrying.length,
      waiting: waiting.length,
      suppressed: all.filter((d) => d.status === 'suppressed').length,
      skipped: all.filter((d) => d.status === 'skipped').length,
    },
  };
}
