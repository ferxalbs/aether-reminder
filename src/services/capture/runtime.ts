import { getAetherCore } from '@/core';
import { getDatabase } from '@/db/client';
import type { CaptureSource } from '@/domain/entities';
import { initializeCaptureInbox } from './client';
import { CaptureInboxDrainer } from './drainer';
import { adoptNativeImageAsset, discardNativeCaptureAssets } from './nativeCapture';
import {
  CaptureOrchestrator,
  type CaptureEventSink,
  type CaptureInvalidationSink,
} from './orchestrator';

const assets = {
  async adopt(source: Extract<CaptureSource, { kind: 'image' }>, captureId: string) {
    return { ...source, assetRef: await adoptNativeImageAsset(source.assetRef, captureId) };
  },
  discardCapture: discardNativeCaptureAssets,
};

export async function createCaptureOrchestrator(options: {
  persistEvents?: boolean;
  invalidations?: CaptureInvalidationSink;
} = {}): Promise<CaptureOrchestrator> {
  const core = getAetherCore(getDatabase());
  let events: CaptureEventSink | undefined;
  if (options.persistEvents) {
    const inbox = await initializeCaptureInbox();
    events = { record: (name, envelope, metadata) => inbox.recordEvent(name, envelope, metadata) };
  }
  return new CaptureOrchestrator(
    core.commands,
    core.services.repos.captureCommits,
    assets,
    events,
    options.invalidations,
  );
}

export async function drainCaptureInbox(options: {
  invalidations?: CaptureInvalidationSink;
  batchSize?: number;
} = {}) {
  const inbox = await initializeCaptureInbox();
  const orchestrator = await createCaptureOrchestrator({
    persistEvents: true,
    invalidations: options.invalidations,
  });
  return new CaptureInboxDrainer(inbox, orchestrator, {
    batchSize: options.batchSize,
    onTerminalFailure: discardNativeCaptureAssets,
  }).drain();
}
