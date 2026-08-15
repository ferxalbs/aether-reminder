import { requireOptionalNativeModule } from 'expo';
import { MOTION_SNAPSHOT_INTERVAL_MS } from './thresholds';
import { parseNativeCapabilities, parseNativeSnapshot } from './snapshot';
import type { NativeMotionCapabilities, NativeMotionSnapshot } from './types';

interface NativeMotionModuleShape {
  getCapabilities(): unknown;
  getSnapshot(): unknown;
  addListener?(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove(): void };
}

const nativeModule = requireOptionalNativeModule<NativeMotionModuleShape>('AetherMotion');

export function isNativeMotionAvailable(): boolean {
  return nativeModule != null;
}

export function readNativeCapabilities(): NativeMotionCapabilities | null {
  if (!nativeModule) return null;
  try {
    return parseNativeCapabilities(nativeModule.getCapabilities());
  } catch {
    return null;
  }
}

export function readNativeSnapshot(): NativeMotionSnapshot | null {
  if (!nativeModule) return null;
  try {
    return parseNativeSnapshot(nativeModule.getSnapshot());
  } catch {
    return null;
  }
}

export function subscribeNativeSnapshots(
  listener: (snapshot: NativeMotionSnapshot) => void,
): () => void {
  if (!nativeModule?.addListener) return () => undefined;
  const subscription = nativeModule.addListener('onMotionSnapshot', (event) => {
    const snapshot = parseNativeSnapshot(event);
    if (snapshot) listener(snapshot);
  });
  return () => subscription.remove();
}

export { MOTION_SNAPSHOT_INTERVAL_MS };
