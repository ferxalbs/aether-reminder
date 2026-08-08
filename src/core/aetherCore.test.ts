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
});
