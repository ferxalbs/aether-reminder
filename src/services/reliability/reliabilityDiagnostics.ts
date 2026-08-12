import { getSchemaVersion } from '@/db/migrator';
import type { AppMetaRepository } from '@/db/repositories/appMetaRepository';
import type {
  ProjectionCounts,
  RemindersRepository,
} from '@/db/repositories/remindersRepository';
import type { SqlDatabase } from '@/db/types';
import { getDeviceTimeZone } from '@/temporal/localCalendar';
import type { NotificationCapabilities } from '@/services/notifications/notificationCapabilities';
import type {
  LocalNotificationAdapter,
  LocalNotificationProjection,
} from '@/services/notifications/localNotificationProjection';

export interface ReliabilityReconciliationSummary {
  mode: string | null;
  reason: string | null;
  inspected: number;
  dirtyProcessed: number;
  repaired: number;
  scheduled: number;
  cancelled: number;
  unchanged: number;
  blocked: number;
  missing: number;
  stale: number;
  failed: number;
  durationMs: number;
}

export interface ReliabilityDiagnostics {
  databaseReady: boolean;
  schemaVersion: number | null;
  quickCheck: 'ok' | 'failed' | 'unknown';
  foreignKeyCheck: 'ok' | 'failed' | 'unknown';
  reminderCounts: ProjectionCounts & { active: number };
  notificationCapabilities: NotificationCapabilities;
  nativeScheduledCount: number | null;
  deviceTimezone: string | null;
  lastReconciliationAt: string | null;
  lastReconciliationResult: ReliabilityReconciliationSummary | null;
  lastErrorCategory: string | null;
}

export interface ReliabilityAttentionState {
  degraded: boolean;
  activeReminderCount: number;
}

const EMPTY_COUNTS: ProjectionCounts = {
  dirty: 0,
  failed: 0,
  stale: 0,
  missing: 0,
  blocked: 0,
  scheduled: 0,
  notRequired: 0,
};

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseReconciliationResult(value: string | null): ReliabilityReconciliationSummary | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      mode: typeof parsed.mode === 'string' ? parsed.mode : null,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      inspected: asNumber(parsed.inspected),
      dirtyProcessed: asNumber(parsed.dirtyProcessed),
      repaired: asNumber(parsed.repaired),
      scheduled: asNumber(parsed.scheduled),
      cancelled: asNumber(parsed.cancelled),
      unchanged: asNumber(parsed.unchanged),
      blocked: asNumber(parsed.blocked),
      missing: asNumber(parsed.missing),
      stale: asNumber(parsed.stale),
      failed: asNumber(parsed.failed),
      durationMs: asNumber(parsed.durationMs),
    };
  } catch {
    return null;
  }
}

type IntegrityStatus = 'ok' | 'failed' | 'unknown';

async function quickCheckStatus(db: SqlDatabase): Promise<IntegrityStatus> {
  try {
    const row = await db.getFirstAsync<Record<string, unknown>>('PRAGMA quick_check');
    if (!row) return 'unknown';
    return Object.values(row).some((value) => value === 'ok') ? 'ok' : 'failed';
  } catch {
    return 'unknown';
  }
}

async function foreignKeyCheckStatus(db: SqlDatabase): Promise<IntegrityStatus> {
  try {
    const row = await db.getFirstAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    return row ? 'failed' : 'ok';
  } catch {
    return 'unknown';
  }
}

/** Operational-only local diagnostics. Never returns task titles, notes, or credentials. */
export class ReliabilityDiagnosticsService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly reminders: RemindersRepository,
    private readonly appMeta: AppMetaRepository,
    private readonly projection: LocalNotificationProjection,
    private readonly adapter: LocalNotificationAdapter,
  ) {}

  /**
   * Small read for NOW/NEXT. It intentionally avoids native notification
   * enumeration and full database integrity diagnostics on every Home refresh.
   */
  async collectAttentionState(): Promise<ReliabilityAttentionState> {
    const [activeReminderCount, projectionCounts, lastErrorCategory, capabilities] = await Promise.all([
      this.reminders.countActive().catch(() => 0),
      this.reminders.countActiveProjectionStates().catch(() => EMPTY_COUNTS),
      this.appMeta.get('reliability.last_error_category').catch(() => null),
      this.projection.getCapabilities().catch(() => ({
        permission: 'unknown' as const,
        channel: 'unknown' as const,
        exactTiming: 'unknown' as const,
      })),
    ]);
    const degraded = activeReminderCount > 0 && (
      projectionCounts.failed > 0
      || projectionCounts.blocked > 0
      || projectionCounts.missing > 0
      || capabilities.permission === 'denied'
      || capabilities.channel === 'unavailable'
      || Boolean(lastErrorCategory && lastErrorCategory !== 'NONE')
    );
    return { degraded, activeReminderCount };
  }

  async collect(): Promise<ReliabilityDiagnostics> {
    const [schemaVersion, quickCheck, foreignKeyCheck, reminderCounts, capabilities, nativeScheduledCount] =
      await Promise.all([
        getSchemaVersion(this.db).catch(() => null),
        quickCheckStatus(this.db),
        foreignKeyCheckStatus(this.db),
        Promise.all([
          this.reminders.countActive(),
          this.reminders.countProjectionStates(),
        ]).then(([active, counts]) => ({ active, ...counts })).catch(() => ({
          active: 0,
          ...EMPTY_COUNTS,
        })),
        this.projection.getCapabilities().catch(() => ({
          permission: 'unknown' as const,
          channel: 'unknown' as const,
          exactTiming: 'unknown' as const,
        })),
        this.adapter.list().then((items) => items.length).catch(() => null),
      ]);

    const [lastReconciliationAt, lastReconciliationResult, lastErrorCategory] = await Promise.all([
      this.appMeta.get('reliability.last_reconciliation_at').catch(() => null),
      this.appMeta.get('reliability.last_reconciliation_result').catch(() => null),
      this.appMeta.get('reliability.last_error_category').catch(() => null),
    ]);

    return {
      databaseReady: schemaVersion !== null && quickCheck === 'ok' && foreignKeyCheck === 'ok',
      schemaVersion,
      quickCheck,
      foreignKeyCheck,
      reminderCounts,
      notificationCapabilities: capabilities,
      nativeScheduledCount,
      deviceTimezone: getDeviceTimeZone() ?? null,
      lastReconciliationAt,
      lastReconciliationResult: parseReconciliationResult(lastReconciliationResult),
      lastErrorCategory,
    };
  }
}
