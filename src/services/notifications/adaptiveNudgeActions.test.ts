import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
import { AetherCore } from '@/core/aetherCore';
import {
  handleNotificationActionResponse,
  NOTIFICATION_ACTION_SNOOZE,
} from './notificationActions';

function response() {
  return {
    actionIdentifier: NOTIFICATION_ACTION_SNOOZE,
    notification: {
      request: {
        identifier: 'native-adaptive-1',
        content: { data: { reminderId: 'adaptive-action-nudge', taskId: 'adaptive-action-task' } },
      },
    },
  };
}

describe('adaptive notification actions', () => {
  test('duplicate cold/action responses record one local behavior event', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const repos = createRepositories(db);
    await repos.tasks.create({
      id: 'adaptive-action-task',
      title: 'Action task',
      dueDate: '2030-01-02',
      dueTime: '09:00',
    });
    await repos.reminders.create({
      id: 'adaptive-action-nudge',
      taskId: 'adaptive-action-task',
      scheduledDate: '2030-01-02',
      scheduledTime: '09:20',
      kind: 'adaptive_followup',
      reason: 'baseline_followup',
      generationSource: 'adaptive_nudge_engine',
      policyVersion: 'adaptive-v1',
      idempotencyKey: 'adaptive-action-slot',
    });
    const core = new AetherCore({ db });
    await core.commands.setAdaptiveNudgesEnabled(true);
    const now = new Date('2030-01-02T09:20:00.000Z');

    expect(await handleNotificationActionResponse(response(), core, now)).toBe(true);
    expect(await handleNotificationActionResponse(response(), core, now)).toBe(false);
    expect((await repos.nudgeEvents.count()).deferrals).toBe(1);
    expect((await repos.reminders.getById('adaptive-action-nudge'))?.scheduledTime).toBe('09:30');
    await db.closeAsync?.();
  });
});

