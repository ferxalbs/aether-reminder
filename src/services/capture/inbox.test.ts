import { describe, expect, test } from 'bun:test';
import { createBunSqliteDatabase } from '@/db/bunSqliteAdapter';
import { createCaptureEnvelope } from './normalization';
import { CaptureInboxRepository } from './inbox';

async function readyInbox() {
  const db = createBunSqliteDatabase();
  const inbox = new CaptureInboxRepository(db);
  await inbox.initialize();
  return { db, inbox };
}

describe('CaptureInboxRepository', () => {
  test('deduplicates repeated native callbacks by durable idempotency key', async () => {
    const { inbox } = await readyInbox();
    const first = createCaptureEnvelope({
      id: 'capture-a',
      idempotencyKey: 'callback-a',
      ingress: 'android_share',
      parts: [{ kind: 'text', text: 'Buy milk' }],
    });
    const duplicate = createCaptureEnvelope({
      id: 'capture-b',
      idempotencyKey: 'callback-a',
      ingress: 'android_share',
      parts: [{ kind: 'text', text: 'Changed callback text' }],
    });
    expect((await inbox.accept(first)).id).toBe('capture-a');
    expect((await inbox.accept(duplicate)).id).toBe('capture-a');
  });

  test('recovers a stale processing claim after restart', async () => {
    const { db, inbox } = await readyInbox();
    await inbox.accept(createCaptureEnvelope({
      id: 'capture-stale',
      ingress: 'ios_app_intent',
      parts: [{ kind: 'text', text: 'Call Daniel' }],
    }));
    const first = await inbox.claim('capture-stale', new Date('2026-08-12T12:00:00.000Z'), 60_000);
    expect(first).not.toBeNull();

    const afterRestart = new CaptureInboxRepository(db);
    await afterRestart.initialize();
    expect(await afterRestart.listDrainable(
      8,
      new Date('2026-08-12T12:02:00.000Z'),
      60_000,
    )).toEqual(['capture-stale']);
    const reclaimed = await afterRestart.claim(
      'capture-stale',
      new Date('2026-08-12T12:02:00.000Z'),
      60_000,
    );
    expect(reclaimed?.attempts).toBe(2);
  });

  test('does not drain captures that still require review', async () => {
    const { inbox } = await readyInbox();
    await inbox.accept(createCaptureEnvelope({
      id: 'capture-review',
      ingress: 'android_share',
      reviewRequired: true,
      parts: [{ kind: 'text', text: 'Review me' }],
    }));
    expect(await inbox.listDrainable(8)).toEqual([]);
    await inbox.markReviewed('capture-review');
    expect(await inbox.listDrainable(8)).toEqual(['capture-review']);
  });
});
