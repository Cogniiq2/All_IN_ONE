/**
 * ══════════════════════════════════════════════════════════════════════════
 * OPERATIONAL ALERTS — what a person should be told, and how loudly.
 *
 * Pure. Takes measured facts (queue counts, heartbeats, the attention list,
 * the configuration posture) and returns a deterministic list of alerts:
 *
 *   CRITICAL   money or inventory is in an inconsistent state right now
 *   HIGH       a subsystem is failing repeatedly, or a hold is stuck
 *   MEDIUM     something is late or stale; nothing is inconsistent yet
 *
 * ── Unknown is unknown ───────────────────────────────────────────────────
 * A subsystem that cannot be measured is reported under `notInstrumented`,
 * never as healthy. A scheduler that has NEVER run is not "overdue"; it is
 * unmeasured, and says so.
 *
 * The same function feeds the System page, the structured log line and the
 * signed internal health endpoint, so the three cannot disagree.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { AttentionItem, QueueCountDto } from '@/lib/admin/dto';
import type { SchedulerStatusRow } from '@/lib/admin/rows';
import type { EnvironmentFinding } from '@/lib/config/environment';

export type AlertLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface Alert {
  level: AlertLevel;
  code: string;
  title: string;
  /** One or two sentences an operator can act on. No PII. */
  detail: string;
  /** How many things this alert covers, when it aggregates. */
  count?: number;
  /** Booking references involved, when the alert is about specific bookings. Never guest data. */
  references?: string[];
}

export interface AlertInput {
  now: Date;
  /** Null when the database could not be reached at all. */
  queues: QueueCountDto[] | null;
  databaseReachable: boolean;
  schedulers: SchedulerStatusRow[];
  attention: AttentionItem[];
  configFindings: EnvironmentFinding[];
  /** Oldest inventory sync per unit; empty when nothing was ever synced. */
  inventory: Array<{ unitSlug: string; oldestSync: string | null }>;
}

export interface AlertReport {
  alerts: Alert[];
  /** Subsystems with nothing to measure. */
  notInstrumented: string[];
  counts: Record<AlertLevel, number>;
}

/** How long each job may go without a run before it is overdue. */
export const SCHEDULER_INTERVAL_MS: Readonly<Record<SchedulerStatusRow['job'], number>> = {
  reconcile: 15 * 60_000,
  operations: 15 * 60_000,
  inventory_sync: 2 * 60 * 60_000,
};

export const INVENTORY_STALE_MS = 6 * 60 * 60_000;
export const WEBHOOK_BACKLOG_MS = 15 * 60_000;
export const OUTBOX_LAG_MS = 30 * 60_000;
export const RELEASE_FAILED_CRITICAL_MS = 60 * 60_000;

const LEVEL_ORDER: Record<AlertLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

function sum(queues: QueueCountDto[], queue: string, states: string[]): number {
  return queues.filter((q) => q.queue === queue && states.includes(q.state)).reduce((n, q) => n + q.items, 0);
}

function oldest(queues: QueueCountDto[], queue: string, states: string[]): string | null {
  return queues
    .filter((q) => q.queue === queue && states.includes(q.state) && q.oldest)
    .reduce<string | null>((o, q) => (!o || (q.oldest as string) < o ? (q.oldest as string) : o), null);
}

function age(iso: string, now: Date): number {
  return now.getTime() - new Date(iso).getTime();
}

export function deriveAlerts(input: AlertInput): AlertReport {
  const alerts: Alert[] = [];
  const notInstrumented: string[] = [];
  const { now, queues, attention } = input;

  /* ── CRITICAL ─────────────────────────────────────────────────────────── */

  if (!input.databaseReachable) {
    alerts.push({
      level: 'CRITICAL',
      code: 'DATABASE_UNAVAILABLE',
      title: 'Database unavailable',
      detail: 'Supabase did not answer. No booking can be created, paid, finalized or released while this holds.',
    });
  }

  const unfinalized = attention.filter((i) => i.category === 'booking' && (i.code === 'PAID_BOOKING_UNFINALIZED' || i.code === 'BEDS24_FINALIZATION_FAILED' || i.code === 'BEDS24_FINALIZATION_UNVERIFIED' || i.id.endsWith(':unfinalized')));
  if (unfinalized.length > 0) {
    alerts.push({
      level: 'CRITICAL',
      code: 'PAID_UNFINALIZED',
      title: 'Payment captured, reservation not finalized',
      detail: 'The guest has paid and the channel manager has not confirmed the reservation. The hold protects the nights; the guest has no confirmation. Reconciliation retries against the same booking id.',
      count: unfinalized.length,
      references: unfinalized.map((i) => i.reference).filter((r): r is string => Boolean(r)),
    });
  }

  const manualReview = attention.filter((i) => i.category === 'booking' && i.id.endsWith(':manual_review'));
  if (manualReview.length > 0) {
    alerts.push({
      level: 'CRITICAL',
      code: 'MANUAL_REVIEW',
      title: 'Bookings need a person',
      detail: 'Automation stopped because the system could not establish what is true. Nothing is released, refunded or confirmed without a decision.',
      count: manualReview.length,
      references: manualReview.map((i) => i.reference).filter((r): r is string => Boolean(r)),
    });
  }

  const unknownOps = attention.filter((i) => i.category === 'external_operation' && i.level === 'critical');
  if (unknownOps.length > 0) {
    alerts.push({
      level: 'CRITICAL',
      code: 'EXTERNAL_OUTCOME_UNKNOWN',
      title: 'External write with unknown outcome',
      detail: 'A request to the channel manager or the payment provider did not return an answer and may have taken effect. Retrying blind could double-book or double-charge; reconciliation reads the provider.',
      count: unknownOps.length,
      references: unknownOps.map((i) => i.reference).filter((r): r is string => Boolean(r)),
    });
  }

  const releaseFailed = attention.filter((i) => i.category === 'booking' && i.id.endsWith(':release_failed'));
  const oldRelease = releaseFailed.filter((i) => age(i.since, now) > RELEASE_FAILED_CRITICAL_MS);
  if (oldRelease.length > 0) {
    alerts.push({
      level: 'CRITICAL',
      code: 'RELEASE_FAILED_PERSISTENT',
      title: 'Release unverified for over an hour',
      detail: 'Nights are treated as taken locally while the channel manager may already have them open, or the reverse. Check the booking at the channel manager.',
      count: oldRelease.length,
      references: oldRelease.map((i) => i.reference).filter((r): r is string => Boolean(r)),
    });
  } else if (releaseFailed.length > 0) {
    alerts.push({
      level: 'HIGH',
      code: 'RELEASE_FAILED',
      title: 'Release could not be verified',
      detail: 'The channel manager was asked to cancel a hold and the nights are not provably open. Reconciliation re-checks; the local range stays reserved.',
      count: releaseFailed.length,
      references: releaseFailed.map((i) => i.reference).filter((r): r is string => Boolean(r)),
    });
  }

  if (queues) {
    const exhaustedEvents = sum(queues, 'payment_events', ['exhausted']);
    if (exhaustedEvents > 0) {
      alerts.push({
        level: 'CRITICAL',
        code: 'PAYMENT_EVENT_UNPROCESSABLE',
        title: 'Verified payment event cannot be processed',
        detail: 'A verified provider event failed every processing attempt. A payment fact may be unapplied. Read the last error, then run reconciliation.',
        count: exhaustedEvents,
      });
    }
  } else {
    notInstrumented.push('queues');
  }

  /* ── HIGH ─────────────────────────────────────────────────────────────── */

  if (queues) {
    const exhaustedJobs = sum(queues, 'reconciliation', ['exhausted']);
    if (exhaustedJobs > 0) {
      alerts.push({
        level: 'HIGH',
        code: 'RECONCILIATION_EXHAUSTED',
        title: 'Reconciliation gave up on jobs',
        detail: 'Jobs exhausted every automatic attempt. The underlying condition is still open and needs a person.',
        count: exhaustedJobs,
      });
    }
    const deadLetters = sum(queues, 'outbox', ['exhausted']);
    if (deadLetters > 0) {
      alerts.push({
        level: 'HIGH',
        code: 'OUTBOX_DEAD_LETTER',
        title: 'Automation events dead-lettered',
        detail: 'Events failed every delivery attempt. Bookings are unaffected; whatever those events trigger (a guest message, an invoice) did not happen.',
        count: deadLetters,
      });
    }
    const failedEvents = sum(queues, 'payment_events', ['failed']);
    const pendingEvents = sum(queues, 'payment_events', ['pending', 'claimed']);
    const oldestPending = oldest(queues, 'payment_events', ['pending', 'claimed']);
    if (failedEvents > 0 || (oldestPending && age(oldestPending, now) > WEBHOOK_BACKLOG_MS)) {
      alerts.push({
        level: 'HIGH',
        code: 'WEBHOOK_BACKLOG',
        title: 'Payment webhooks not being processed',
        detail:
          failedEvents > 0
            ? 'Verified events are failing processing and will be retried with backoff.'
            : 'A verified event has waited longer than a reconciliation cycle. Either the schedule is not running or the pass fails before the inbox.',
        count: failedEvents + pendingEvents,
      });
    }
  }

  const staleHolds = attention.filter((i) => i.category === 'booking' && i.code === 'BOOKING_HOLD_STALE');
  const expiredHolds = attention.filter((i) => i.category === 'reconciliation' && i.code === 'BOOKING_HOLD_STALE');
  if (staleHolds.length + expiredHolds.length > 0) {
    alerts.push({
      level: 'HIGH',
      code: 'STALE_HOLD',
      title: 'Holds beyond their lease',
      detail: 'Unpaid holds are still blocking nights past their lease. The sweep releases only where no payment evidence exists; the rest are escalated.',
      count: staleHolds.length + expiredHolds.length,
    });
  }

  const sync = input.schedulers.find((s) => s.job === 'inventory_sync');
  if (sync && !sync.ok) {
    alerts.push({
      level: 'HIGH',
      code: 'INVENTORY_SYNC_FAILING',
      title: 'Inventory sync failing',
      detail: 'The last scheduled sync did not complete for every unit. The calendar serves the previous cache until it succeeds.',
    });
  }

  /* ── MEDIUM ───────────────────────────────────────────────────────────── */

  const staleUnits = input.inventory.filter((u) => u.oldestSync && age(u.oldestSync, now) > INVENTORY_STALE_MS);
  if (input.inventory.length === 0) {
    notInstrumented.push('inventory cache freshness');
  } else if (staleUnits.length > 0) {
    alerts.push({
      level: 'MEDIUM',
      code: 'CACHE_STALE',
      title: 'Availability cache stale',
      detail: `The cached calendar for ${staleUnits.length} unit${staleUnits.length === 1 ? '' : 's'} is older than six hours. Quotes still ask the channel manager live; browsing may show stale nights.`,
      count: staleUnits.length,
    });
  }

  for (const job of ['reconcile', 'inventory_sync', 'operations'] as const) {
    const last = input.schedulers.find((s) => s.job === job);
    if (!last) {
      notInstrumented.push(`scheduler:${job} (no run recorded)`);
      continue;
    }
    const lateBy = age(last.finished_at, now) - SCHEDULER_INTERVAL_MS[job];
    if (lateBy > 0) {
      alerts.push({
        level: job === 'operations' ? 'MEDIUM' : 'HIGH',
        code: 'SCHEDULER_OVERDUE',
        title: `Scheduled ${job.replace('_', ' ')} overdue`,
        detail: `The last run finished ${Math.round(age(last.finished_at, now) / 60_000)} minutes ago; the expected interval is ${Math.round(SCHEDULER_INTERVAL_MS[job] / 60_000)} minutes. Check the scheduler.`,
      });
    } else if (!last.ok && job !== 'inventory_sync') {
      alerts.push({
        level: 'MEDIUM',
        code: 'SCHEDULER_LAST_RUN_FAILED',
        title: `Last ${job.replace('_', ' ')} run failed`,
        detail: 'The most recent scheduled run recorded an error. If the next one succeeds this clears itself.',
      });
    }
  }

  if (queues) {
    const oldestOutbox = oldest(queues, 'outbox', ['pending', 'claimed']);
    if (oldestOutbox && age(oldestOutbox, now) > OUTBOX_LAG_MS) {
      alerts.push({
        level: 'MEDIUM',
        code: 'AUTOMATION_LAG',
        title: 'Automation consumer lagging',
        detail: 'Outbox events have waited longer than thirty minutes. The automation platform is not claiming; nothing is lost while it waits.',
        count: sum(queues, 'outbox', ['pending', 'claimed']),
      });
    }
  }

  const refusals = input.configFindings.filter((f) => f.severity === 'refuse');
  if (refusals.length > 0) {
    alerts.push({
      level: 'HIGH',
      code: 'CONFIGURATION_CONTRADICTION',
      title: 'Configuration contradicts itself',
      detail: `Direct booking is refused until corrected: ${refusals.map((f) => f.code).join(', ')}.`,
      count: refusals.length,
    });
  }

  alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.code.localeCompare(b.code));
  const counts: Record<AlertLevel, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const a of alerts) counts[a.level] += 1;
  return { alerts, notInstrumented, counts };
}
