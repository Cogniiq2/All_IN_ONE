/**
 * GET /api/internal/health
 *
 * The operational verdict, for a machine: the alert list the System page
 * shows, the scheduler heartbeats, the queue counts and the environment
 * findings. n8n's queue-health workflow, an uptime monitor with a header, or
 * a person with curl reads this to page someone.
 *
 * ── Authentication ───────────────────────────────────────────────────────
 * The n8n HMAC over the empty string, like `GET /api/internal/booking`. It
 * is not public: queue depths and booking references are operational data.
 *
 * ── What it carries ──────────────────────────────────────────────────────
 * Counts, codes, ages, references. No guest data, no secret, no value of any
 * environment variable — the findings name variables only. Since the
 * platform-completion phase it also carries every expected integration
 * signal (last success / failure / verified webhook / n8n claim and ack)
 * with `never` where nothing was ever observed, and the delivery-ledger and
 * turnover backlog.
 *
 * ── Status code ──────────────────────────────────────────────────────────
 * 200 whenever the verdict could be produced, INCLUDING when alerts are
 * critical: the body says so, and a monitor that only looks at the code
 * should watch `counts.CRITICAL`. 503 only when the verdict itself could not
 * be produced (database unreachable) — which is itself the alert.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { bookingErrorResponse, bookingJson, requireBackend } from '@/lib/booking/http';
import { verifyN8nSignature } from '@/lib/n8n/signing';
import { adminPosture } from '@/lib/admin/config';
import { loadAlerts, loadIntegrationSignals, loadQueues } from '@/lib/admin/queries';
import { rowSource } from '@/lib/admin/source';
import { loadFinanceHealth } from '@/lib/finance/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const logger = createLogger(request);

  const verified = await verifyN8nSignature(request.headers, '');
  if (!verified.ok) {
    logger.warn('n8n.request', { outcome: 'unauthorised', reason: verified.reason });
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();
    const now = new Date();
    const posture = adminPosture();
    const [alerts, queues, schedulers, signals, finance] = await Promise.all([
      loadAlerts(now),
      loadQueues(),
      rowSource().then((s) => s.schedulerStatus()).catch(() => null),
      loadIntegrationSignals(),
      loadFinanceHealth(now),
    ]);

    logger.info('health.read', {
      outcome: alerts.ok ? 'ok' : 'degraded',
      count: alerts.ok ? alerts.data.alerts.length : undefined,
    });

    const body = {
      generatedAt: now.toISOString(),
      environment: posture.environment,
      mode: posture.mode,
      directBooking: posture.directBookingEnabled ? (posture.directBookingPermitted ? 'enabled' : 'refused') : 'disabled',
      alerts: alerts.ok ? alerts.data.alerts : null,
      counts: alerts.ok ? alerts.data.counts : null,
      notInstrumented: alerts.ok ? alerts.data.notInstrumented : null,
      schedulers: schedulers?.map((s) => ({ job: s.job, finishedAt: s.finished_at, ok: s.ok, ageSeconds: Math.round((now.getTime() - new Date(s.finished_at).getTime()) / 1000) })) ?? null,
      queues: queues.ok ? queues.data : null,
      /** Every expected provider signal; `never` means never observed, and is never reported as healthy. */
      integrations: signals.ok
        ? signals.data.map((s) => ({ provider: s.provider, signal: s.signal, status: s.status, observedAt: s.observedAt, ageSeconds: s.observedAt ? Math.round((now.getTime() - new Date(s.observedAt).getTime()) / 1000) : null }))
        : null,
      /** Delivery-ledger and turnover backlog, from the same queue counts the System page shows. */
      backlog: queues.ok
        ? {
            messageDeliveriesFailed: queues.data.filter((q) => q.queue === 'message_deliveries' && q.state === 'failed').reduce((n, q) => n + q.items, 0),
            messageDeliveriesWaiting: queues.data.filter((q) => q.queue === 'message_deliveries' && (q.state === 'pending' || q.state === 'sending')).reduce((n, q) => n + q.items, 0),
            turnoversOpen: queues.data.filter((q) => q.queue === 'turnovers' && (q.state === 'required' || q.state === 'in_progress')).reduce((n, q) => n + q.items, 0),
          }
        : null,
      /** Whether the finance ledger is keeping up with the booking and payment facts: status, summary, facts. Counts only. */
      finance,
      configFindings: posture.configFindings,
    };

    return bookingJson(body, logger, alerts.ok ? 200 : 503);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
