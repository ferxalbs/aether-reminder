import { describe, expect, test } from 'bun:test';
import { AetherCommandExecutor } from '@/core/commands';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { applyPragmas, runMigrations } from '@/db/migrator';
import { createRepositories } from '@/db/repositories';
import { createDomainServicesFromRepos } from '@/domain/services';
import { CaptureInboxDrainer } from './drainer';
import { CaptureInboxRepository } from './inbox';
import { createCaptureEnvelope } from './normalization';
import { CaptureOrchestrator } from './orchestrator';
import { CaptureError } from './types';

async function ready() {
  const domainDb = createBunSqliteDatabase();
  await applyPragmas(domainDb);
  await runMigrations(domainDb);
  const repos = createRepositories(domainDb);
  const commands = new AetherCommandExecutor(createDomainServicesFromRepos(repos));
  const orchestrator = new CaptureOrchestrator(commands, repos.captureCommits);
  const inboxDb = createBunSqliteDatabase();
  const inbox = new CaptureInboxRepository(inboxDb);
  await inbox.initialize();
  return { inbox, inboxDb, orchestrator, repos };
}

describe('CaptureInboxDrainer', () => {
  test('converges after task commit succeeds but inbox acknowledgement crashes', async () => {
    const { inbox, inboxDb, orchestrator, repos } = await ready();
    const envelope = createCaptureEnvelope({
      id: 'capture-crash-window',
      ingress: 'ios_share_extension',
      parts: [{ kind: 'text', text: 'Call Daniel tomorrow at 4pm' }],
    });
    await inbox.accept(envelope);

    const originalMarkCommitted = inbox.markCommitted.bind(inbox);
    let crashOnce = true;
    inbox.markCommitted = async (...args) => {
      if (crashOnce) {
        crashOnce = false;
        throw new Error('temporary crash after domain commit');
      }
      return originalMarkCommitted(...args);
    };

    const first = await new CaptureInboxDrainer(inbox, orchestrator).drain(
      new Date('2026-08-12T12:00:00.000Z'),
    );
    expect(first.failedRetryable).toBe(1);
    expect((await repos.tasks.listAll())).toHaveLength(1);

    const restartedInbox = new CaptureInboxRepository(inboxDb);
    await restartedInbox.initialize();
    const second = await new CaptureInboxDrainer(restartedInbox, orchestrator).drain(
      new Date('2026-08-12T12:01:00.000Z'),
    );
    expect(second.committed).toBe(1);
    expect((await repos.tasks.listAll())).toHaveLength(1);
    expect((await restartedInbox.get(envelope.id))?.state).toBe('committed');
  });

  test('classifies failures and lets a later valid capture proceed', async () => {
    const { inbox } = await ready();
    for (const id of ['terminal', 'retryable', 'valid']) {
      await inbox.accept(createCaptureEnvelope({
        id,
        ingress: 'android_share',
        parts: [{ kind: 'text', text: id }],
      }));
    }
    const committed: string[] = [];
    const fakeOrchestrator = {
      async commit(envelope: { id: string }) {
        if (envelope.id === 'terminal') {
          throw new CaptureError('Unsupported payload.', 'unsupported_part', false);
        }
        if (envelope.id === 'retryable') throw new Error('database is temporarily busy');
        committed.push(envelope.id);
        return { task: { id: 'task-valid' } };
      },
    } as unknown as CaptureOrchestrator;

    const result = await new CaptureInboxDrainer(inbox, fakeOrchestrator).drain();
    expect(result).toEqual({
      processed: 3,
      committed: 1,
      failedRetryable: 1,
      failedTerminal: 1,
    });
    expect(committed).toEqual(['valid']);
    expect((await inbox.get('terminal'))?.state).toBe('failed_terminal');
    expect((await inbox.get('retryable'))?.state).toBe('failed_retryable');
  });
});
