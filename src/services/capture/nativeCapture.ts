import { requireOptionalNativeModule } from 'expo';
import type { CaptureCapabilities } from './types';

interface NativeCaptureModuleShape {
  getCapabilities(): CaptureCapabilities;
  getSharedContainerDirectory(): string | null;
  adoptImageAsset(assetRef: string, captureId: string): Promise<string>;
  discardCaptureAssets(captureId: string): Promise<void>;
  getPendingRouteCaptureId(): string | null;
  getPendingLaunchIngress(): 'android_quick_settings' | 'android_shortcut' | 'deep_link' | null;
  clearPendingRouteCaptureId(captureId: string): void;
  addListener?(eventName: string, listener: (event: { captureId: string }) => void): { remove(): void };
}

const module = requireOptionalNativeModule<NativeCaptureModuleShape>('AetherCapture');

export const unavailableCaptureCapabilities: CaptureCapabilities = {
  shareReceive: false,
  quickSettings: false,
  appShortcut: false,
  appIntent: false,
  shareExtension: false,
};

export function getCaptureCapabilities(): CaptureCapabilities {
  return module?.getCapabilities() ?? unavailableCaptureCapabilities;
}

export function getCaptureSharedDirectory(): string | null {
  return module?.getSharedContainerDirectory() ?? null;
}

export async function adoptNativeImageAsset(assetRef: string, captureId: string): Promise<string> {
  if (!module) return assetRef;
  return module.adoptImageAsset(assetRef, captureId);
}

export async function discardNativeCaptureAssets(captureId: string): Promise<void> {
  await module?.discardCaptureAssets(captureId);
}

export function getPendingNativeCaptureId(): string | null {
  return module?.getPendingRouteCaptureId() ?? null;
}

export function getPendingNativeLaunchIngress(): 'android_quick_settings' | 'android_shortcut' | 'deep_link' {
  return module?.getPendingLaunchIngress() ?? 'deep_link';
}

export function clearPendingNativeCaptureId(captureId: string): void {
  module?.clearPendingRouteCaptureId(captureId);
}

export function addNativeCaptureListener(listener: (captureId: string) => void): () => void {
  const subscription = module?.addListener?.('onCaptureReceived', ({ captureId }) => listener(captureId));
  return () => subscription?.remove();
}
