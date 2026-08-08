import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createDomainServices } from '@/domain/services';
import { resolveTomorrow } from '@/temporal/resolve';
import { createAgentRuntime } from './runtime';
import type { AgentEvent, ContextSnapshot } from './types';
import { ScriptedInferenceProvider } from './testSupport/scriptedProvider';
import { canRunAsAgent, unknownModelCapabilities } from '@/services/ai/inference';
import { ToolRegistry } from './tools/registry';
import type { AgentTool } from './tools/types';

async function readyDb() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  return db;
}

function baseContext(partial?: Partial<ContextSnapshot>): ContextSnapshot {
  return {
    surface: 'home',
    locale: 'en-US',
    timezone: 'America/Mexico_City',
    invocationSource: 'app',
    ...partial,
  };
}

async function collect(
  runtime: ReturnType<typeof createAgentRuntime>,
  input: Parameters<ReturnType<typeof createAgentRuntime>['run']>[0]
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of runtime.run(input)) {
    events.push(ev);
  }
  return events;
}

function types(events: AgentEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('agent runtime conformance', () => {
  test('preserves local storage details when a run cannot be initialized', async () => {
    const db = createBunSqliteDatabase();
    const provider = new ScriptedInferenceProvider();
    const runtime = createAgentRuntime({ db, provider });

    await expect(collect(runtime, {
      message: 'hello',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    })).rejects.toThrow(/could not initialize local run storage.*agent_sessions/i);

    await db.closeAsync?.();
  });

  test('"What do I have today?" → read tools only', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    await services.tasks.createTask({ title: 'Ship slice 3', priority: 'high' });

    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([
      { id: 'tc1', name: 'tasks.list', arguments: { scope: 'today' } },
    ]);
    provider.pushTextTurn('You have 1 task today: Ship slice 3.');

    const runtime = createAgentRuntime({ db, services, provider });
    const events = await collect(runtime, {
      message: 'What do I have today?',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    expect(types(events)).toContain('tool.completed');
    expect(types(events)).toContain('response.completed');
    expect(types(events)).not.toContain('tool.confirmation_required');

    const completed = events.filter((e) => e.type === 'tool.completed');
    expect(completed.every((e) => e.type === 'tool.completed' && e.toolId === 'tasks.list')).toBe(
      true
    );

    // No write receipts
    const writes = events.filter(
      (e) => e.type === 'tool.completed' && e.toolId.startsWith('tasks.create')
    );
    expect(writes).toHaveLength(0);
    expect(await db.getAllAsync(`SELECT * FROM tool_executions`)).toHaveLength(0);
    await db.closeAsync?.();
  });

  test('read lifecycle is observable while the tool is executing without durable read state', async () => {
    const db = await readyDb();
    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([{ id: 'slow-read', name: 'test.slow-read', arguments: {} }]);
    provider.pushTextTurn('Read complete.');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slowRead: AgentTool = {
      id: 'test.slow-read', version: '1', description: 'Gated read', risk: 'READ',
      inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
      async execute() { await gate; return { ok: true, data: { done: true } }; },
    };
    const runtime = createAgentRuntime({ db, provider, tools: new ToolRegistry([slowRead]) });
    const iterator = runtime.run({
      message: 'Run the gated read', context: baseContext(), modelId: 'scripted/full', apiKey: 'test-key',
    })[Symbol.asyncIterator]();
    const observed: AgentEvent[] = [];
    while (!observed.some((event) => event.type === 'tool.started')) {
      const next = await iterator.next();
      expect(next.done).toBe(false);
      if (!next.done) observed.push(next.value);
    }
    expect(types(observed)).toContain('tool.started');
    expect(types(observed)).not.toContain('tool.completed');
    expect(await db.getAllAsync(`SELECT * FROM tool_executions`)).toHaveLength(0);
    release();
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      observed.push(next.value);
    }
    expect(types(observed)).toContain('tool.completed');
    await db.closeAsync?.();
  });

  test('"Create Review PR tomorrow" → task creation', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const tomorrow = resolveTomorrow().date;

    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([
      {
        id: 'tc1',
        name: 'tasks.create',
        arguments: { title: 'Review PR', dueDate: tomorrow },
      },
    ]);
    provider.pushTextTurn('Created Review PR for tomorrow.');

    const runtime = createAgentRuntime({ db, services, provider });
    const events = await collect(runtime, {
      message: 'Create Review PR tomorrow',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    expect(types(events)).toContain('tool.completed');
    const createDone = events.find(
      (e) => e.type === 'tool.completed' && e.toolId === 'tasks.create'
    );
    expect(createDone).toBeTruthy();
    if (createDone?.type === 'tool.completed') {
      expect(createDone.receipt).toBeTruthy();
    }

    const listed = await services.tasks.listTasks({ scope: 'upcoming' });
    const all = await services.tasks.listTasks({ scope: 'active', limit: 20 });
    expect(all.some((t) => t.title === 'Review PR' && t.dueDate === tomorrow)).toBe(true);
    expect(provider.remainingTurns()).toBe(1);
    const persistedEvents = await db.getAllAsync(`SELECT * FROM agent_events`);
    expect(persistedEvents).toHaveLength(0);
    void listed;
    await db.closeAsync?.();
  });

  test('"Mark the first task complete" → resolve + mutation', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const { value: first } = await services.tasks.createTask({
      title: 'First task',
      priority: 'medium',
    });
    await services.tasks.createTask({ title: 'Second task', priority: 'low' });

    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([{ id: 'tc1', name: 'tasks.list', arguments: { scope: 'today' } }]);
    provider.pushToolTurn([
      { id: 'tc2', name: 'tasks.complete', arguments: { id: first.id } },
    ]);
    provider.pushTextTurn('Marked the first task complete.');

    const runtime = createAgentRuntime({ db, services, provider });
    const events = await collect(runtime, {
      message: 'Mark the first task complete',
      context: baseContext({ visibleTaskIds: [first.id] }),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    expect(types(events).filter((t) => t === 'tool.completed').length).toBeGreaterThanOrEqual(2);
    const updated = await services.tasks.getTask(first.id);
    expect(updated?.completed).toBe(true);
    await db.closeAsync?.();
  });

  test('"Delete everything" → confirmation required', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const a = await services.tasks.createTask({ title: 'A' });
    const b = await services.tasks.createTask({ title: 'B' });
    const c = await services.tasks.createTask({ title: 'C' });
    const d = await services.tasks.createTask({ title: 'D' });

    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([
      {
        id: 'tc1',
        name: 'tasks.delete',
        arguments: {
          ids: [a.value.id, b.value.id, c.value.id, d.value.id],
        },
      },
    ]);

    const runtime = createAgentRuntime({ db, services, provider });
    const events = await collect(runtime, {
      message: 'Delete everything',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
      // no confirmations
    });

    expect(types(events)).toContain('tool.confirmation_required');
    expect(types(events)).not.toContain('tool.completed');
    expect(await services.tasks.listTasks({ scope: 'active' })).toHaveLength(4);
    await db.closeAsync?.();
  });

  test('duplicate tool proposal → only one mutation', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const provider = new ScriptedInferenceProvider();

    // Same tool_call_id twice in one turn would be odd; simulate two turns replaying same call id
    const args = { title: 'Only once', dueDate: resolveTomorrow().date };
    provider.pushToolTurn([{ id: 'same-call', name: 'tasks.create', arguments: args }]);
    provider.pushToolTurn([{ id: 'same-call', name: 'tasks.create', arguments: args }]);
    provider.pushTextTurn('Created once.');

    const runtime = createAgentRuntime({ db, services, provider });
    await collect(runtime, {
      message: 'Create Only once twice',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    const tasks = await services.tasks.searchTasks('Only once');
    expect(tasks).toHaveLength(1);
    await db.closeAsync?.();
  });

  test('voice confirmation replay → exactly one mutation', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const provider = new ScriptedInferenceProvider();
    const created = await Promise.all([
      services.tasks.createTask({ title: 'Voice A' }),
      services.tasks.createTask({ title: 'Voice B' }),
      services.tasks.createTask({ title: 'Voice C' }),
      services.tasks.createTask({ title: 'Voice D' }),
    ]);
    const args = { ids: created.map((task) => task.value.id) };
    provider.pushToolTurn([{ id: 'voice-confirm', name: 'tasks.delete', arguments: args }]);
    provider.pushToolTurn([{ id: 'voice-confirm', name: 'tasks.delete', arguments: args }]);
    provider.pushTextTurn('Confirmed.');

    const runtime = createAgentRuntime({ db, services, provider });
    const first = await collect(runtime, {
      message: 'Delete everything I said by voice',
      context: baseContext({ invocationSource: 'voice' }),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });
    expect(types(first)).toContain('tool.confirmation_required');
    const pending = first.find((event) => event.type === 'tool.confirmation_required');
    expect(pending?.type).toBe('tool.confirmation_required');
    const second: AgentEvent[] = [];
    if (pending?.type === 'tool.confirmation_required') {
      // The UI-carried copy is not authoritative; confirmation reloads persisted args.
      const tampered = {
        ...pending.pendingAction,
        args: { ids: ['not-the-validated-action'] },
      };
      for await (const event of runtime.confirm(tampered, {
        context: baseContext({ invocationSource: 'voice' }),
      })) second.push(event);
    }
    expect(types(second)).toContain('tool.completed');
    if (pending?.type === 'tool.confirmation_required') {
      const replay: AgentEvent[] = [];
      for await (const event of runtime.confirm(pending.pendingAction, { context: baseContext() })) replay.push(event);
      expect(types(replay)).toContain('tool.completed');
    }
    expect(await services.tasks.listTasks({ scope: 'active' })).toHaveLength(0);
    await db.closeAsync?.();
  });

  test('OpenRouter timeout → run fails honestly', async () => {
    const db = await readyDb();
    const provider = new ScriptedInferenceProvider();
    provider.pushErrorTurn('NETWORK_ERROR', 'Could not reach OpenRouter.');

    const runtime = createAgentRuntime({ db, provider });
    const events = await collect(runtime, {
      message: 'hello',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    const failed = events.find((e) => e.type === 'run.failed');
    expect(failed).toBeTruthy();
    if (failed?.type === 'run.failed') {
      expect(failed.code).toBe('NETWORK_ERROR');
      expect(failed.message).toContain('OpenRouter');
    }
    // Must not invent success
    expect(types(events)).not.toContain('response.completed');
    await db.closeAsync?.();
  });

  test('cancel during streamed response → cancellation propagates', async () => {
    const db = await readyDb();
    const provider = new ScriptedInferenceProvider();
    provider.pushHangTurn();

    const runtime = createAgentRuntime({ db, provider });
    const events: AgentEvent[] = [];
    let runId: string | null = null;

    const iter = runtime.run({
      message: 'stream please',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    const consumer = (async () => {
      for await (const ev of iter) {
        events.push(ev);
        if (ev.type === 'run.started') runId = ev.runId;
        if (ev.type === 'response.delta' && runId) {
          await runtime.cancel(runId);
        }
      }
    })();

    await consumer;
    expect(types(events)).toContain('run.cancelled');
    expect(types(events)).not.toContain('response.completed');
    await db.closeAsync?.();
  });

  test('incompatible model → cannot operate as full agent', async () => {
    const db = await readyDb();
    const provider = new ScriptedInferenceProvider({
      capabilities: {
        textInput: true,
        textOutput: true,
        streaming: true,
        tools: false,
        toolChoice: false,
        structuredOutputs: false,
        compatibility: 'CONVERSATION_ONLY',
      },
    });
    provider.pushTextTurn('I would chat but should not run.');

    const runtime = createAgentRuntime({ db, provider });
    const events = await collect(runtime, {
      message: 'create a task',
      context: baseContext(),
      modelId: 'scripted/chat-only',
      apiKey: 'test-key',
    });

    const failed = events.find((e) => e.type === 'run.failed');
    expect(failed?.type === 'run.failed' && failed.code).toBe('INCOMPATIBLE_MODEL');
    expect(types(events)).not.toContain('tool.completed');
    expect(canRunAsAgent(unknownModelCapabilities())).toBe(false);
    await db.closeAsync?.();
  });

  test('malformed tool args → rejected', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([
      { id: 'tc1', name: 'tasks.create', arguments: '{not-json' },
    ]);
    provider.pushTextTurn('Could not create the task.');

    const runtime = createAgentRuntime({ db, services, provider });
    const events = await collect(runtime, {
      message: 'create something',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    expect(types(events)).toContain('tool.failed');
    const failed = events.find((e) => e.type === 'tool.failed');
    expect(failed?.type === 'tool.failed' && failed.error.length).toBeGreaterThan(0);
    expect(await services.tasks.listTasks({ scope: 'active' })).toHaveLength(0);
    await db.closeAsync?.();
  });

  test('tool execution fails → agent cannot claim success via tool.completed', async () => {
    const db = await readyDb();
    const services = createDomainServices(db);
    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([
      { id: 'tc1', name: 'tasks.complete', arguments: { id: 'nonexistent-id' } },
    ]);
    provider.pushTextTurn('I completed it.'); // model may lie; runtime still marks tool.failed

    const runtime = createAgentRuntime({ db, services, provider });
    const events = await collect(runtime, {
      message: 'complete missing',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    expect(types(events)).toContain('tool.failed');
    const completedMutations = events.filter(
      (e) => e.type === 'tool.completed' && e.toolId === 'tasks.complete'
    );
    expect(completedMutations).toHaveLength(0);
    await db.closeAsync?.();
  });

  test('semantic state transitions include thinking/executing/responding', async () => {
    const db = await readyDb();
    const provider = new ScriptedInferenceProvider();
    provider.pushToolTurn([{ id: 'tc1', name: 'analytics.workload', arguments: {} }]);
    provider.pushTextTurn('Workload ready.');

    const runtime = createAgentRuntime({ db, provider });
    const events = await collect(runtime, {
      message: 'workload?',
      context: baseContext(),
      modelId: 'scripted/full',
      apiKey: 'test-key',
    });

    const states = events
      .filter((e) => e.type === 'state.changed')
      .map((e) => (e.type === 'state.changed' ? e.state : ''));
    expect(states).toContain('thinking');
    expect(states).toContain('executing');
    expect(states).toContain('responding');
    await db.closeAsync?.();
  });

  test('tool registry exposes required tools', async () => {
    const { defaultToolRegistry } = await import('./tools/registry');
    const required = [
      'tasks.get',
      'tasks.list',
      'tasks.search',
      'tasks.create',
      'tasks.update',
      'tasks.complete',
      'tasks.reopen',
      'tasks.delete',
      'reminders.list',
      'reminders.schedule',
      'reminders.reschedule',
      'reminders.cancel',
      'analytics.workload',
      'app.navigate',
    ];
    for (const id of required) {
      expect(defaultToolRegistry.get(id)).toBeTruthy();
    }
  });
});
