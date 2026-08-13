import type { CaptureSource, TaskPriority, TemporalSemantics } from '@/domain/entities';

export type CaptureIngress =
  | 'in_app'
  | 'voice'
  | 'android_share'
  | 'android_quick_settings'
  | 'android_shortcut'
  | 'ios_share_extension'
  | 'ios_app_intent'
  | 'ios_app_shortcut'
  | 'deep_link';

export type CaptureState =
  | 'pending'
  | 'processing'
  | 'committed'
  | 'discarded'
  | 'failed_retryable'
  | 'failed_terminal';

export type CapturePart =
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string }
  | {
      kind: 'image';
      assetRef: string;
      mimeType: string;
      sizeBytes?: number;
      displayName?: string;
    };

export interface CaptureEnvelope {
  id: string;
  ingress: CaptureIngress;
  parts: CapturePart[];
  createdAt: string;
  idempotencyKey: string;
  state: CaptureState;
  reviewRequired: boolean;
  committedTaskId?: string;
}

export interface CaptureDraft {
  title: string;
  notes?: string;
  dueDate?: string;
  dueTime?: string | null;
  dueTimezone?: string | null;
  dueSemantics?: TemporalSemantics;
  priority?: TaskPriority;
  sources: CaptureSource[];
}

export type CaptureFailureCategory =
  | 'empty_payload'
  | 'unsupported_part'
  | 'unsupported_mime'
  | 'malformed_url'
  | 'oversized_payload'
  | 'invalid_envelope'
  | 'asset_unavailable'
  | 'database_busy'
  | 'domain_validation'
  | 'unknown';

export interface CaptureCapabilities {
  shareReceive: boolean;
  quickSettings: boolean;
  appShortcut: boolean;
  appIntent: boolean;
  shareExtension: boolean;
}

export interface CaptureDiagnostics {
  pendingCaptures: number;
  failedCaptures: number;
  lastCaptureIngress: CaptureIngress | null;
  lastCaptureFailureCategory: CaptureFailureCategory | null;
  lastSuccessfulDrainAt: string | null;
  orphanTemporaryAssets: number;
}

export type CaptureEventName =
  | 'capture_received'
  | 'capture_reviewed'
  | 'capture_committed'
  | 'capture_discarded'
  | 'capture_failed';

export class CaptureError extends Error {
  constructor(
    readonly category: CaptureFailureCategory,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CaptureError';
  }
}
