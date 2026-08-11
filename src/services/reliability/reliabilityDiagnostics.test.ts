import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
import {
  LocalNotificationProjection,
  type LocalNotificationAdapter,
} from '@/services/notifications/localNotificationProjection';
import { ReliabilityDiagnosticsService } from './reliabilityDiagnostics';

describe('reliability diagnostics', () => {
  test('returns operational counts without task content', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    const task = await repos.tasks.create({ title: 'Private title should not appear' });
    await repos.reminders.create({
      taskId: task.id,
      scheduledDate: '2030-01-02',
      scheduledTime: '09:00',
    });
    await repos.appMeta.set('reliability.last_reconciliation_at', '2030-01-01T00:00:00.000Z');
    await repos.appMeta.set('reliability.last_reconciliation_result', JSON.stringify({
      mode: 'incremental',
      reason: 'test',
      inspected: 1,
      dirtyProcessed: 1,
      repaired: 1,
      scheduled: 1,
      cancelled: 0,
      unchanged: 0,
      blocked: 0,
      missing: 0,
      stale: 0,
      failed: 0,
      durationMs: 3,
      privateNote: 'must not be returned',
    }));
    const adapter: LocalNotificationAdapter = {
      list: async () => [{ identifier: 'native-1', reminderId: 'reminder-1' }],
      schedule: async () => 'unused',
      cancel: async () => undefined,
      getCapabilities: async () => ({
        permission: 'granted',
        channel: 'available',
        exactTiming: 'unknown',
      }),
    };
    const projection = new LocalNotificationProjection(
      repos.reminders,
      repos.tasks,
      adapter,
    );
    const diagnostics = await new ReliabilityDiagnosticsService(
      db,
      repos.reminders,
      repos.appMeta,
      projection,
      adapter,
    ).collect();

    expect(diagnostics.databaseReady).toBe(true);
    expect(diagnostics.schemaVersion).toBe(7);
    expect(diagnostics.quickCheck).toBe('ok');
    expect(diagnostics.foreignKeyCheck).toBe('ok');
    expect(diagnostics.reminderCounts.active).toBe(1);
    expect(diagnostics.reminderCounts.dirty).toBe(1);
    expect(diagnostics.nativeScheduledCount).toBe(1);
    expect(diagnostics.notificationCapabilities.exactTiming).toBe('unknown');
    expect(diagnostics.lastReconciliationResult?.reason).toBe('test');
    expect(JSON.stringify(diagnostics)).not.toContain('Private title');
    expect(JSON.stringify(diagnostics)).not.toContain('must not be returned');
    await db.closeAsync?.();
  });
});
