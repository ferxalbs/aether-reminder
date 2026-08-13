import { describe, expect, test } from 'bun:test';
import { AetherCommandExecutor } from '@/core/commands';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
import { createDomainServicesFromRepos } from '@/domain/services';
import { createCaptureEnvelope } from './normalization';
import { CaptureOrchestrator, type CaptureAssetManager, type CaptureInvalidationSink } from './orchestrator';

async function ready() {
  const db = createBunSqliteDatabase();
  await applyPragmas(db);
  await runMigrations(db);
  const repos = createRepositories(db);
  const commands = new AetherCommandExecutor(createDomainServicesFromRepos(repos));
  return { db, repos, commands };
}

describe('CaptureOrchestrator', () => {
  test('uses the deterministic parser then commits exactly once', async () => {
    const { repos, commands } = await ready();
    let invalidated = 0;
    const sink: CaptureInvalidationSink = {
      async taskCommitted() { invalidated += 1; },
    };
    const orchestrator = new CaptureOrchestrator(commands, repos.captureCommits, undefined, undefined, sink);
    const envelope = createCaptureEnvelope({
      id: 'capture-exactly-once',
      ingress: 'android_share',
      parts: [{ kind: 'text', text: 'Call Daniel tomorrow at 4pm !high' }],
    });
    const draft = orchestrator.prepare(envelope, new Date(2026, 7, 12, 10, 0));
    expect(draft.title).toBe('Call Daniel');
    expect(draft.dueDate).toBe('2026-08-13');
    expect(draft.dueTime).toBe('16:00');
    expect(draft.priority).toBe('high');

    const first = await orchestrator.commit(envelope, draft);
    const replay = await orchestrator.commit(envelope, draft);
    expect(replay.task.id).toBe(first.task.id);
    expect(replay.duplicate).toBe(true);
    expect((await repos.tasks.listAll())).toHaveLength(1);
    expect((await repos.captureCommits.get(envelope.id))?.taskId).toBe(first.task.id);
    expect(invalidated).toBe(1);
  });

  test('preserves URL and adopts image sources without putting them in notes', async () => {
    const { repos, commands } = await ready();
    const adopted: string[] = [];
    const assets: CaptureAssetManager = {
      async adopt(source, captureId) {
        adopted.push(source.assetRef);
        return { ...source, assetRef: `task-source://${captureId}/image.png` };
      },
      async discardCapture() {},
    };
    const orchestrator = new CaptureOrchestrator(commands, repos.captureCommits, assets);
    const envelope = createCaptureEnvelope({
      id: 'capture-sources',
      ingress: 'ios_share_extension',
      parts: [
        { kind: 'text', text: 'Review design tomorrow' },
        { kind: 'url', url: 'https://example.com/private?q=1' },
        { kind: 'image', assetRef: 'capture://capture-sources/image.png', mimeType: 'image/png' },
      ],
    });
    const { task } = await orchestrator.commit(envelope, orchestrator.prepare(
      envelope,
      new Date(2026, 7, 12, 10, 0),
    ));
    expect(task.notes).toBeNull();
    expect(adopted).toEqual(['capture://capture-sources/image.png']);
    expect(await repos.captureCommits.listSources(task.id)).toEqual([
      expect.objectContaining({ kind: 'url', url: 'https://example.com/private?q=1' }),
      expect.objectContaining({ kind: 'image', assetRef: 'task-source://capture-sources/image.png' }),
    ]);
  });

  test('creates a dirty reliability projection for timed captured tasks', async () => {
    const { repos, commands } = await ready();
    const orchestrator = new CaptureOrchestrator(commands, repos.captureCommits);
    const envelope = createCaptureEnvelope({
      id: 'capture-reliability',
      ingress: 'voice',
      parts: [{ kind: 'text', text: 'Send proposal tomorrow at 9am' }],
    });
    const draft = orchestrator.prepare(envelope, new Date(2026, 7, 12, 10, 0));
    const { task } = await orchestrator.commit(envelope, draft);
    const reminders = await repos.reminders.listForTask(task.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.projectionDirty).toBe(true);
  });
});
