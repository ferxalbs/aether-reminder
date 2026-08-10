import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { ScriptedInferenceProvider } from '@/services/agent/testSupport/scriptedProvider';
import { AetherCore } from './aetherCore';

describe('AETHER Core execution boundary', () => {
  test('manual and agent mutations use the same command executor', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([
      { id: 'agent-create', name: 'tasks.create', arguments: { title: 'Agent path' } },
    ]);
    const core = new AetherCore({ db, provider });
    const original = core.commands.createTask.bind(core.commands);
    let executions = 0;
    core.commands.createTask = (...args) => {
      executions += 1;
      return original(...args);
    };

    await core.commands.createTask({ title: 'Manual path', source: 'manual' });
    const events = [];
    for await (const event of core.agent.run({
      message: 'Create Agent path',
      context: {
        surface: 'home',
        locale: 'en-US',
        timezone: 'UTC',
        invocationSource: 'assistant',
      },
      modelId: 'scripted/full',
      apiKey: 'test-key',
    })) {
      events.push(event);
    }

    expect(executions).toBe(2);
    expect(events.some((event) => event.type === 'tool.completed')).toBe(true);
    expect(await core.services.tasks.searchTasks('path')).toHaveLength(2);
    expect(provider.remainingTurns()).toBe(0);
    await db.closeAsync?.();
  });

  test('recurring completion creates exactly one next occurrence and undo restores the previous one', async () => {
    const db = createBunSqliteDatabase();
    await applyPragmas(db);
    await runMigrations(db);
    const core = new AetherCore({ db });

    const created = await core.commands.createRecurringTask({
      task: {
        title: 'Daily review',
        dueDate: '2026-08-09',
        dueTime: '09:00',
        dueTimezone: 'America/Lima',
        dueSemantics: 'floating',
      },
      recurrence: {
        id: 'daily-review-rule',
        frequency: 'daily',
        interval: 1,
        startDate: '2026-08-09',
        timezone: 'America/Lima',
      },
    });

    const completed = await core.commands.completeTask(created.task.id);
    expect(completed.value.completed).toBe(true);
    expect(completed.receipt.undo?.kind).toBe('task.reopen');

    const ruleAfter = await core.services.recurrence.getRuleForTask('recurrence_daily-review-rule_2');
    expect(ruleAfter?.occurrenceCount).toBe(2);
    const next = await core.services.tasks.getTask('recurrence_daily-review-rule_2');
    expect(next?.dueDate).toBe('2026-08-10');
    expect(next?.completed).toBe(false);

    // A duplicate completion call for the old occurrence cannot advance the rule again.
    await core.commands.completeTask(created.task.id);
    expect(await core.services.tasks.getTask('recurrence_daily-review-rule_3')).toBeNull();

    await core.commands.reopenTask(created.task.id, 'undo');
    const reopened = await core.services.tasks.getTask(created.task.id);
    expect(reopened?.completed).toBe(false);
    expect(await core.services.tasks.getTask('recurrence_daily-review-rule_2')).toBeNull();
    const restoredRule = await core.services.recurrence.getRuleForTask(created.task.id);
    expect(restoredRule?.occurrenceCount).toBe(1);

    await db.closeAsync?.();
  });
});
